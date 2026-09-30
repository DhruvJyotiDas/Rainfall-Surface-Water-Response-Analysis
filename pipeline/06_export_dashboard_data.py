"""Phase 5 data prep: compact JSON for the static dashboard.

One file, docs/data/tanks.json: {tanks: [...], monthly: {tank_id: [...]}}.
Geometries simplified/rounded per config.dashboard.geometry_coordinate_precision
to keep the payload under the 15MB budget.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils import cache_path, load_config

REPO_ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    cfg = load_config()
    precision = cfg["dashboard"]["geometry_coordinate_precision"]

    gdf = gpd.read_file(cache_path("tank_inventory", "geojson"))
    metrics = pd.read_csv(cache_path("response_metrics", "csv"))
    monthly = pd.read_csv(cache_path("s1_water_area_monthly", "csv"))
    rainfall = pd.read_csv(cache_path("chirps_monthly_derived", "csv"))

    merged = gdf.merge(metrics, on="tank_id", suffixes=("", "_m"), how="left")

    tanks = []
    for _, row in merged.iterrows():
        geom = row.geometry.simplify(0.00005)
        coords = [[round(x, precision), round(y, precision)] for x, y in geom.exterior.coords] if geom.geom_type == "Polygon" else []
        tanks.append(
            {
                "id": row["tank_id"],
                "area_ha": round(float(row["area_ha"]), 2),
                "lat": round(float(row["centroid_lat"]), precision),
                "lon": round(float(row["centroid_lon"]), precision),
                "coords": coords,
                "classification": row.get("classification", "insufficient_data"),
                "fill_frequency": None if pd.isna(row.get("fill_frequency")) else round(float(row["fill_frequency"]), 3),
                "recession_k": None if pd.isna(row.get("recession_k_per_month")) else round(float(row["recession_k_per_month"]), 4),
                "peak_lag_months": None if pd.isna(row.get("peak_lag_months")) else int(row["peak_lag_months"]),
                "peak_lag_r": None if pd.isna(row.get("peak_lag_r")) else round(float(row["peak_lag_r"]), 3),
                "threshold_mm": None if pd.isna(row.get("threshold_mm")) else round(float(row["threshold_mm"]), 1),
                "n_seasons": None if pd.isna(row.get("n_seasons")) else int(row["n_seasons"]),
                "low_confidence": bool(row.get("low_confidence", True)),
                "regulated_likely": bool(row.get("regulated_likely", False)),
                "slope_outlier": bool(row.get("slope_outlier", False)),
                "near_osm_canal": bool(row.get("near_osm_canal", False)),
                "n_other_tanks_in_basin": int(row["n_other_tanks_in_basin"]) if "n_other_tanks_in_basin" in row and not pd.isna(row["n_other_tanks_in_basin"]) else None,
            }
        )

    monthly_by_tank = {}
    rain_by_tank = dict(list(rainfall.groupby("tank_id")))
    for tid, grp in monthly.groupby("tank_id"):
        grp = grp.sort_values("year_month")
        r = rain_by_tank.get(tid)
        rain_map = dict(zip(r["year_month"], r["precip_mm"], strict=False)) if r is not None else {}
        monthly_by_tank[tid] = [
            {"m": ym, "area_ha": round(float(a), 3), "n_obs": int(n), "rain_mm": round(float(rain_map.get(ym, 0)), 1)}
            for ym, a, n in zip(grp["year_month"], grp["area_ha_median"], grp["n_obs"], strict=False)
        ]

    payload = {"tanks": tanks, "monthly": monthly_by_tank}
    out_path = REPO_ROOT / "docs" / "data" / "tanks.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"Wrote {out_path} ({size_mb:.2f} MB, {len(tanks)} tanks)")
    if size_mb > cfg["dashboard"]["max_payload_mb"]:
        print(f"WARNING: payload {size_mb:.2f}MB exceeds budget {cfg['dashboard']['max_payload_mb']}MB")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
