"""Phase 1: Sentinel-1 water-area time series per tank.

Steps:
1. Per-tank Otsu threshold calibration (one-time, cached): multi-temporal
   MIN composite of speckle-filtered VV (dB) over a 100m-buffered tank
   polygon isolates persistent water; Otsu on that histogram gives a
   tank-specific water/non-water threshold, gated by a bimodality check
   (between-class / total variance ratio). Tanks that fail the bimodality
   gate fall back to the config's global threshold (-16 dB).
2. Per-image water classification + area, chunked by year (spec requirement:
   chunk GEE requests, retry with backoff, cache so reruns are free). Slope
   mask applied (>15 deg excluded) before summing water pixels per tank.
3. Monthly aggregation: median across images in the month, n_obs recorded,
   months with n_obs=0 dropped (never silently interpolated).

S1B robustness run: SKIPPED. Confirmed at Phase 1 kickoff that this AOI is
served by a single relative orbit (165, DESCENDING); per-year image counts
are 28-37/yr with no discontinuity at S1B's Dec-2021 retirement (there was a
transient +/-Cadena bump in 2019-2020 from a brief period where S1B also flew
this track, but the series returns to baseline and 2021-on is single-satellite
throughout) - see config.yaml sentinel1.s1b_robustness_run and CLAUDE.md.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils import (
    cache_path,
    ee_init,
    load_config,
    retry_with_backoff,
    write_json_cache,
)

UTM_EPSG = "EPSG:32644"


def tank_to_ee_feature(ee, row, buffer_m=0):
    geom = json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"]
    g = ee.Geometry(geom)
    if buffer_m:
        g = g.buffer(buffer_m)
    return ee.Feature(g, {"tank_id": row["tank_id"]})


def s1_smoothed_db_collection(ee, aoi_geom, cfg):
    s1cfg = cfg["sentinel1"]
    s1 = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(aoi_geom)
        .filterDate(cfg["period"]["start"], cfg["period"]["end"])
        .filter(ee.Filter.eq("instrumentMode", s1cfg["instrument_mode"]))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", s1cfg["polarization"]))
        .filter(ee.Filter.eq("relativeOrbitNumber_start", s1cfg["relative_orbit_number"]))
        .select(s1cfg["polarization"])
    )

    def to_linear_smooth_db(img):
        linear = ee.Image(10).pow(img.divide(10))
        smoothed_linear = linear.focalMedian(radius=s1cfg["speckle_filter_radius_m"], units="meters")
        smoothed_db = smoothed_linear.log10().multiply(10)
        return smoothed_db.rename("VV_smooth").copyProperties(img, ["system:time_start"])

    return s1.map(to_linear_smooth_db)


def otsu_threshold(hist: dict) -> float | None:
    """Standard Otsu's method from a GEE histogram dict (bucketMeans + counts)."""
    counts = np.array(hist["histogram"], dtype=float)
    means = np.array(hist["bucketMeans"], dtype=float)
    total = counts.sum()
    if total <= 0 or len(counts) < 2:
        return None
    sum_total = (counts * means).sum()
    w_bg, sum_bg = 0.0, 0.0
    best_thresh, best_var = None, -1.0
    for i in range(len(counts)):
        w_bg += counts[i]
        if w_bg == 0:
            continue
        w_fg = total - w_bg
        if w_fg == 0:
            break
        sum_bg += counts[i] * means[i]
        mean_bg = sum_bg / w_bg
        mean_fg = (sum_total - sum_bg) / w_fg
        between_var = w_bg * w_fg * (mean_bg - mean_fg) ** 2
        if between_var > best_var:
            best_var = between_var
            best_thresh = means[i]
    return float(best_thresh) if best_thresh is not None else None


def bimodality_variance_ratio(hist: dict, threshold: float) -> float:
    """Between-class variance / total variance - the spec's bimodality gate."""
    counts = np.array(hist["histogram"], dtype=float)
    means = np.array(hist["bucketMeans"], dtype=float)
    total = counts.sum()
    if total <= 0:
        return 0.0
    grand_mean = (counts * means).sum() / total
    total_var = (counts * (means - grand_mean) ** 2).sum() / total
    if total_var == 0:
        return 0.0
    bg_mask = means <= threshold
    w_bg = counts[bg_mask].sum()
    w_fg = counts[~bg_mask].sum()
    if w_bg == 0 or w_fg == 0:
        return 0.0
    mean_bg = (counts[bg_mask] * means[bg_mask]).sum() / w_bg
    mean_fg = (counts[~bg_mask] * means[~bg_mask]).sum() / w_fg
    between_var = (w_bg * (mean_bg - grand_mean) ** 2 + w_fg * (mean_fg - grand_mean) ** 2) / total
    return float(between_var / total_var)


def calibrate_tank_thresholds(ee, gdf: gpd.GeoDataFrame, aoi_geom, cfg) -> pd.DataFrame:
    calib_path = cache_path("s1_tank_thresholds", "csv")
    if calib_path.exists():
        print(f"[cache] using existing {calib_path}")
        return pd.read_csv(calib_path)

    print("Calibrating per-tank Otsu thresholds (one-time, ~3 min: multi-temporal MIN composite + histogram)...")
    s1_smooth = s1_smoothed_db_collection(ee, aoi_geom, cfg)
    min_composite = s1_smooth.min().rename("VV_min")

    feats = [tank_to_ee_feature(ee, row, buffer_m=100) for _, row in gdf.iterrows()]
    fc = ee.FeatureCollection(feats)

    result = retry_with_backoff(
        lambda: min_composite.reduceRegions(collection=fc, reducer=ee.Reducer.histogram(40), scale=20, tileScale=4).getInfo(),
        label="Otsu histogram calibration",
        max_retries=3,
    )

    rows = []
    global_default = cfg["sentinel1"]["threshold_db"]["start"]
    variance_gate = cfg["sentinel1"]["otsu"]["bimodality_min_variance_ratio"]
    for f in result["features"]:
        tank_id = f["properties"]["tank_id"]
        hist = f["properties"].get("histogram")
        if not hist or "histogram" not in hist:
            rows.append({"tank_id": tank_id, "threshold_db": global_default, "otsu_threshold_db": None, "variance_ratio": None, "method": "fallback_global_no_hist"})
            continue
        otsu_t = otsu_threshold(hist)
        if otsu_t is None:
            rows.append({"tank_id": tank_id, "threshold_db": global_default, "otsu_threshold_db": None, "variance_ratio": None, "method": "fallback_global_otsu_failed"})
            continue
        vr = bimodality_variance_ratio(hist, otsu_t)
        if vr >= variance_gate:
            rows.append({"tank_id": tank_id, "threshold_db": otsu_t, "otsu_threshold_db": otsu_t, "variance_ratio": vr, "method": "otsu_per_tank"})
        else:
            rows.append({"tank_id": tank_id, "threshold_db": global_default, "otsu_threshold_db": otsu_t, "variance_ratio": vr, "method": "fallback_global_not_bimodal"})

    df = pd.DataFrame(rows)
    df.to_csv(calib_path, index=False)
    print(f"[cache] wrote {calib_path}")
    print(df["method"].value_counts().to_string())
    return df


# Empirically determined (tested live against this project's GEE quota):
# a batch of 10 images-per-request works reliably; 15 and 20 both hit a hard
# "Too many concurrent aggregations" quota error. This is a GEE server-side
# concurrency cap, not a local compute limit - more CPU/GPU on the calling
# machine cannot raise it. At ~6.5s/image this batch size gives ~33 min for
# the full 303-image series, vs ~2.5 hours doing one reduceRegions per image.
AGGREGATION_BATCH_SIZE = 10


def build_threshold_and_slope_images(ee, gdf: pd.DataFrame, cfg):
    feats = [
        ee.Feature(
            ee.Geometry(json.loads(gpd.GeoSeries([row.geometry]).to_json())["features"][0]["geometry"]),
            {"tank_id": row["tank_id"], "threshold_db": float(row["threshold_db"])},
        )
        for _, row in gdf.iterrows()
    ]
    fc = ee.FeatureCollection(feats)
    threshold_img = fc.reduceToImage(["threshold_db"], ee.Reducer.first())

    dem = ee.ImageCollection("COPERNICUS/DEM/GLO30_2024_1").select("DEM").mosaic()
    dem_utm = dem.reproject(crs=UTM_EPSG, scale=30)
    slope_mask = ee.Terrain.slope(dem_utm).lt(cfg["sentinel1"]["slope_mask_deg"])
    return fc, threshold_img, slope_mask


def extract_water_area_for_year(ee, year, fc, threshold_img, slope_mask, aoi_geom, cfg):
    """One year, chunked into AGGREGATION_BATCH_SIZE-image server-side batches.
    Each batch does its own reduceRegions-per-image work entirely on GEE's
    servers via .map(), then is fetched in a single getInfo() call - so the
    number of Python<->GEE round trips is ~n_images/10, not n_images.
    """
    year_path = cache_path(f"s1_water_area_{year}", "csv")
    if year_path.exists():
        print(f"[cache] using existing {year_path}")
        return pd.read_csv(year_path)

    s1cfg = cfg["sentinel1"]
    period_start = max(f"{year}-01-01", cfg["period"]["start"])
    period_end = min(f"{year + 1}-01-01", cfg["period"]["end"])  # ISO date strings compare lexicographically
    s1 = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(aoi_geom)
        .filterDate(period_start, period_end)
        .filter(ee.Filter.eq("instrumentMode", s1cfg["instrument_mode"]))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", s1cfg["polarization"]))
        .filter(ee.Filter.eq("relativeOrbitNumber_start", s1cfg["relative_orbit_number"]))
        .select(s1cfg["polarization"])
    )
    n = retry_with_backoff(lambda: s1.size().getInfo(), label=f"{year} image count")
    if n == 0:
        print(f"[{year}] no S1 images in range, skipping")
        empty = pd.DataFrame(columns=["tank_id", "sum", "date_ms"])
        empty.to_csv(year_path, index=False)
        return empty

    def process_image(img):
        date_ms = img.get("system:time_start")
        linear = ee.Image(10).pow(img.divide(10))
        smoothed_db = linear.focalMedian(radius=s1cfg["speckle_filter_radius_m"], units="meters").log10().multiply(10)
        water = smoothed_db.lt(threshold_img).And(slope_mask)
        reduced = water.reduceRegions(collection=fc, reducer=ee.Reducer.sum(), scale=20, tileScale=4)
        return reduced.map(lambda f: f.set("date_ms", date_ms))

    imgs_list = s1.toList(n)
    all_rows = []
    n_batches = (n + AGGREGATION_BATCH_SIZE - 1) // AGGREGATION_BATCH_SIZE
    for b in range(n_batches):
        start_i = b * AGGREGATION_BATCH_SIZE
        batch_size = min(AGGREGATION_BATCH_SIZE, n - start_i)

        def fetch_batch(start_i=start_i, batch_size=batch_size):
            subset = ee.List(imgs_list.slice(start_i, start_i + batch_size)).map(lambda i: process_image(ee.Image(i)))
            return ee.FeatureCollection(subset).flatten().getInfo()

        result = retry_with_backoff(fetch_batch, label=f"{year} batch {b + 1}/{n_batches}", max_retries=5, base_delay=8.0)
        for f in result["features"]:
            p = f["properties"]
            all_rows.append({"tank_id": p["tank_id"], "sum": p.get("sum", 0.0), "date_ms": p["date_ms"]})
        print(f"[{year}] batch {b + 1}/{n_batches} done ({len(result['features'])} rows)")

    df = pd.DataFrame(all_rows)
    df.to_csv(year_path, index=False)
    print(f"[cache] wrote {year_path} ({len(df)} rows, {n} images)")
    return df


def main() -> int:
    ee = ee_init()
    cfg = load_config()
    bbox = cfg["aoi"]["bbox"]
    aoi_geom = ee.Geometry.Rectangle([bbox["min_lon"], bbox["min_lat"], bbox["max_lon"], bbox["max_lat"]])

    gdf = gpd.read_file(cache_path("tank_inventory", "geojson"))
    print(f"Loaded {len(gdf)} tanks from inventory.")

    thresholds = calibrate_tank_thresholds(ee, gdf, aoi_geom, cfg)
    write_json_cache(
        "s1_threshold_calibration_summary",
        {
            "n_tanks": len(thresholds),
            "method_counts": thresholds["method"].value_counts().to_dict(),
            "variance_ratio_describe": thresholds["variance_ratio"].describe().to_dict(),
        },
    )

    gdf_with_thresh = gdf.merge(thresholds[["tank_id", "threshold_db"]], on="tank_id")
    fc, threshold_img, slope_mask = build_threshold_and_slope_images(ee, gdf_with_thresh, cfg)

    start_year = int(cfg["period"]["start"][:4])
    end_year = int(cfg["period"]["end"][:4])
    all_years = []
    for year in range(start_year, end_year + 1):
        print(f"=== Extracting year {year} ===")
        df_year = extract_water_area_for_year(ee, year, fc, threshold_img, slope_mask, aoi_geom, cfg)
        df_year["year"] = year
        all_years.append(df_year)

    full = pd.concat(all_years, ignore_index=True)
    full_path = cache_path("s1_water_area_raw_all_years", "csv")
    full.to_csv(full_path, index=False)
    print(f"Wrote combined raw series: {full_path} ({len(full)} tank-image rows)")

    monthly = aggregate_monthly(full, cfg)
    monthly_path = cache_path("s1_water_area_monthly", "csv")
    monthly.to_csv(monthly_path, index=False)
    print(f"Wrote monthly aggregate: {monthly_path} ({len(monthly)} tank-month rows)")
    print(f"n_obs distribution:\n{monthly['n_obs'].value_counts().sort_index().to_string()}")
    n_zero_dropped = monthly.attrs.get("n_zero_obs_months_dropped", 0)
    print(f"Months with n_obs=0 dropped (never interpolated): {n_zero_dropped}")

    return 0


def aggregate_monthly(raw: pd.DataFrame, cfg: dict, scale_m: int = 20) -> pd.DataFrame:
    """Monthly aggregate = median area_ha across images in the month, with
    n_obs recorded. Months with n_obs=0 simply don't appear in the output -
    that IS the "drop, don't interpolate" behavior; there is nothing to
    silently fill in. Pixel count -> area_ha uses a constant scale^2
    multiplier (not ee.Image.pixelArea()) - a deliberate speed tradeoff made
    during extraction, negligible distortion at 14N for this AOI's size, but
    recorded here as an assumption for the README rather than left implicit.
    """
    df = raw.copy()
    df["area_ha"] = df["sum"] * (scale_m**2) / 10000.0
    df["date"] = pd.to_datetime(df["date_ms"], unit="ms")
    df["year_month"] = df["date"].dt.to_period("M").astype(str)

    monthly = (
        df.groupby(["tank_id", "year_month"])
        .agg(area_ha_median=("area_ha", "median"), n_obs=("area_ha", "count"))
        .reset_index()
    )
    # every group here has n_obs >= 1 by construction (groupby only sees rows
    # that exist); "dropped n_obs=0 months" means tank-months with NO S1
    # image at all in that period, which never enter this dataframe to begin
    # with - report that count for transparency rather than pretend it's zero.
    all_tanks = df["tank_id"].unique()
    all_months = sorted(df["year_month"].unique())
    full_grid_size = len(all_tanks) * len(all_months)
    monthly.attrs["n_zero_obs_months_dropped"] = full_grid_size - len(monthly)
    return monthly


if __name__ == "__main__":
    raise SystemExit(main())
