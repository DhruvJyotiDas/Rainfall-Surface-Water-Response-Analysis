"""Phase 0 step 3: build the candidate tank inventory.

Pipeline:
1. Water mask = JRC max_extent (ever water 1984-2021) OR Dynamic World water
   probability >= 0.5 (multi-year max over the study period). Union, not just
   JRC alone, so tanks that appeared/changed since 2021 aren't missed.
2. Vectorize at 30m (matches JRC's native resolution; keeps compute tractable
   for a 3500+ km2 AOI). Pull everything >=1ha from GEE once, filter locally.
3. Locally (geopandas, projected to UTM 44N which covers this AOI): compute
   true area_ha and an elongation index (minimum-rotated-rectangle long/short
   side ratio) to drop river/canal shapes.
4. Apply min/max area filter from config (report sensitivity at the two
   alternate min_area_ha values too, not just the primary one).
5. Re-query GEE, but only for the surviving few hundred polygons, to attach:
   HydroSHEDS L12 basin id (+ cascade proxy n_other_tanks_in_basin), mean
   slope, and dominant land-cover in a 200m buffer (paddy/flooded-veg flag).

Every fetch is cached to disk; reruns after the first don't re-hit GEE unless
the cache is deleted.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils import (
    cache_path,
    ee_init,
    load_config,
    retry_with_backoff,
    write_json_cache,
)

UTM_EPSG = "EPSG:32644"  # UTM zone 44N - covers the Rayalaseema draft AOI (77-78E)


def fetch_raw_candidates(ee, aoi_geom, period_start, period_end, scale=30, min_ha_floor=1.0):
    """Vectorize the union water mask and pull every candidate >= min_ha_floor.

    Filtering to the *real* min_area_ha happens locally after true area is
    computed in a projected CRS - the pixel-count threshold here is only a
    coarse floor to keep the GEE-side payload small.
    """
    raw_path = cache_path("tank_candidates_raw", "geojson")
    if raw_path.exists():
        print(f"[cache] using existing {raw_path}")
        with open(raw_path, "r", encoding="utf-8") as f:
            return json.load(f)

    jrc = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("max_extent")
    dw = (
        ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
        .filterBounds(aoi_geom)
        .filterDate(period_start, period_end)
        .select("water")
    )
    water = jrc.unmask(0).gt(0).Or(dw.max().gte(0.5)).rename("water").clip(aoi_geom)

    vectors = water.selfMask().reduceToVectors(
        geometry=aoi_geom,
        scale=scale,
        geometryType="polygon",
        eightConnected=True,
        reducer=ee.Reducer.countEvery(),
        maxPixels=1e9,
        tileScale=4,
    )
    px_area_m2 = scale * scale
    min_px = int(min_ha_floor * 10000 / px_area_m2)
    filtered = vectors.filter(ee.Filter.gte("count", min_px))

    n = retry_with_backoff(lambda: filtered.size().getInfo(), label="candidate count")
    print(f"Fetching {n} raw candidate polygons (>= {min_ha_floor} ha floor) from GEE...")
    data = retry_with_backoff(lambda: filtered.getInfo(), label="candidate geometries")

    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"[cache] wrote {raw_path} ({raw_path.stat().st_size} bytes)")
    return data


def to_geodataframe(raw_geojson: dict) -> gpd.GeoDataFrame:
    feats = raw_geojson["features"]
    geoms = [shape(f["geometry"]) for f in feats]
    props = [f["properties"] for f in feats]
    gdf = gpd.GeoDataFrame(props, geometry=geoms, crs="EPSG:4326")
    return gdf


def compute_geometry_attrs(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    gdf = gdf.copy()
    gdf_utm = gdf.to_crs(UTM_EPSG)
    gdf["area_ha"] = gdf_utm.geometry.area / 10000.0

    elongation = []
    for geom in gdf_utm.geometry:
        mrr = geom.minimum_rotated_rectangle
        coords = list(mrr.exterior.coords)
        if len(coords) < 4:
            elongation.append(1.0)
            continue
        side_lengths = [
            ((coords[i][0] - coords[i + 1][0]) ** 2 + (coords[i][1] - coords[i + 1][1]) ** 2) ** 0.5
            for i in range(4)
        ]
        long_side = max(side_lengths[0], side_lengths[1])
        short_side = min(side_lengths[0], side_lengths[1])
        elongation.append(long_side / short_side if short_side > 0 else 999.0)
    gdf["elongation_index"] = elongation

    centroids_4326 = gdf_utm.geometry.centroid.to_crs("EPSG:4326")
    gdf["centroid_lon"] = centroids_4326.x
    gdf["centroid_lat"] = centroids_4326.y
    gdf["tank_id"] = ["tank_" + str(i).zfill(4) for i in range(len(gdf))]
    return gdf


def apply_filters(gdf: gpd.GeoDataFrame, cfg: dict) -> tuple[gpd.GeoDataFrame, dict]:
    tf = cfg["tank_filter"]
    min_ha, max_ha = tf["min_area_ha"], tf["max_area_ha"]
    elong_max = tf["elongation_index_max"]

    sensitivity = {}
    for alt_min in tf["sensitivity_min_area_ha"] + [min_ha]:
        n = ((gdf["area_ha"] >= alt_min) & (gdf["area_ha"] <= max_ha) & (gdf["elongation_index"] <= elong_max)).sum()
        sensitivity[f"min_area_ha={alt_min}"] = int(n)

    n_before = len(gdf)
    kept = gdf[(gdf["area_ha"] >= min_ha) & (gdf["area_ha"] <= max_ha)].copy()
    n_after_area = len(kept)
    dropped_elongated = kept[kept["elongation_index"] > elong_max]
    kept = kept[kept["elongation_index"] <= elong_max].copy()
    n_after_elongation = len(kept)

    stats = {
        "n_raw_candidates": n_before,
        "n_after_area_filter": n_after_area,
        "n_dropped_as_elongated_river_canal": len(dropped_elongated),
        "n_final": n_after_elongation,
        "sensitivity_by_min_area_ha": sensitivity,
    }
    return kept, stats


def enrich_with_gee_attrs(ee, gdf: gpd.GeoDataFrame, cfg: dict) -> gpd.GeoDataFrame:
    """Attach basin id, cascade proxy, slope, and land-cover flags. Only run
    against the already-filtered (few hundred) candidates to keep this cheap.
    """
    enrich_path = cache_path("tank_candidates_enriched", "geojson")
    if enrich_path.exists():
        print(f"[cache] using existing {enrich_path}")
        cached = gpd.read_file(enrich_path)
        return cached

    features = []
    for _, row in gdf.iterrows():
        geom = json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"]
        features.append(ee.Feature(ee.Geometry(geom), {"tank_id": row["tank_id"]}))
    fc = ee.FeatureCollection(features)

    # HydroSHEDS L12 basin id via point-in-polygon on the centroid
    hybas = ee.FeatureCollection("WWF/HydroSHEDS/v1/Basins/hybas_12")
    centroids_fc = fc.map(lambda f: ee.Feature(f.geometry().centroid(1), {"tank_id": f.get("tank_id")}))
    joined = ee.Join.saveFirst("basin").apply(
        centroids_fc, hybas, ee.Filter.intersects(leftField=".geo", rightField=".geo")
    )

    def extract_basin(f):
        basin_feat = ee.Feature(f.get("basin"))
        return f.set("HYBAS_ID", basin_feat.get("HYBAS_ID"))

    joined = joined.map(extract_basin)
    basin_info = retry_with_backoff(
        lambda: joined.reduceColumns(ee.Reducer.toList(2), ["tank_id", "HYBAS_ID"]).get("list").getInfo(),
        label="basin join",
    )
    basin_map = {tid: bid for tid, bid in basin_info}

    # DEM slope, mean over each tank polygon. ee.Terrain.slope() computes a
    # finite-difference gradient in the image's OWN projection; the DEM's
    # native projection is EPSG:4326 (degrees), which silently produces
    # near-constant, wrong slope values (caught: first run gave identical
    # slope_deg for all 480 tanks). Reproject to a meter-based CRS first.
    dem = ee.ImageCollection("COPERNICUS/DEM/GLO30_2024_1").select("DEM").mosaic()
    dem_utm = dem.reproject(crs=UTM_EPSG, scale=30)
    slope_img = ee.Terrain.slope(dem_utm)
    slope_reduced = retry_with_backoff(
        lambda: slope_img.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=30).getInfo(),
        label="slope reduceRegions",
    )
    slope_map = {f["properties"]["tank_id"]: f["properties"].get("mean") for f in slope_reduced["features"]}

    # Dominant land-cover in a 200m buffer AROUND the tank (ring, excluding the tank itself)
    def buffer_ring(f):
        buffered = f.geometry().buffer(200)
        ring = buffered.difference(f.geometry())
        return ee.Feature(ring, {"tank_id": f.get("tank_id")})

    ring_fc = fc.map(buffer_ring)
    worldcover = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
    lc_reduced = retry_with_backoff(
        lambda: worldcover.reduceRegions(collection=ring_fc, reducer=ee.Reducer.mode(), scale=10).getInfo(),
        label="land-cover reduceRegions",
    )
    lc_map = {f["properties"]["tank_id"]: f["properties"].get("mode") for f in lc_reduced["features"]}

    gdf = gdf.copy()
    gdf["hybas_id"] = gdf["tank_id"].map(basin_map)
    gdf["slope_deg"] = gdf["tank_id"].map(slope_map)
    gdf["worldcover_buffer_mode"] = gdf["tank_id"].map(lc_map)

    basin_counts = gdf["hybas_id"].value_counts()
    gdf["n_other_tanks_in_basin"] = gdf["hybas_id"].map(lambda b: int(basin_counts.get(b, 1) - 1))

    # ESA WorldCover codes: 40 = Cropland, 90 = Herbaceous wetland (proxy for
    # flooded vegetation/paddy risk in the buffer)
    gdf["paddy_flag"] = gdf["worldcover_buffer_mode"].isin([40, 90])

    gdf.to_file(enrich_path, driver="GeoJSON")
    print(f"[cache] wrote {enrich_path}")
    return gdf


def main() -> int:
    ee = ee_init()
    cfg = load_config()
    bbox = cfg["aoi"]["bbox"]
    aoi_geom = ee.Geometry.Rectangle([bbox["min_lon"], bbox["min_lat"], bbox["max_lon"], bbox["max_lat"]])

    raw = fetch_raw_candidates(ee, aoi_geom, cfg["period"]["start"], cfg["period"]["end"])
    gdf = to_geodataframe(raw)
    gdf = compute_geometry_attrs(gdf)
    kept, stats = apply_filters(gdf, cfg)
    print(json.dumps(stats, indent=2))

    enriched = enrich_with_gee_attrs(ee, kept, cfg)

    final_path = cache_path("tank_inventory", "geojson")
    enriched.to_file(final_path, driver="GeoJSON")
    print(f"Wrote final tank inventory: {final_path} ({len(enriched)} tanks)")

    write_json_cache("tank_inventory_stats", stats)

    n_final = stats["n_final"]
    required_min = cfg["aoi"]["min_candidate_tanks_required"]
    if n_final < required_min:
        print(f"WARNING: final tank count {n_final} < required minimum {required_min}. AOI may need revision.")
        return 1
    print(f"OK: {n_final} candidate tanks >= required minimum {required_min}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
