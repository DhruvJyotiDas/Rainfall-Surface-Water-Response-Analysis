"""Phase 2 (TIME-BOXED, see CLAUDE.md/README limitations): rainfall per tank.

Given a hard 1-hour cutoff, this is a deliberately reduced version of the
spec's Phase 2:
- Monthly CHIRPS totals sampled at each tank's own centroid (which IS the
  pixel already assigned as chirps_pixel_id in the inventory - many tanks
  share a pixel, sampling at the centroid reuses the correct shared value).
- Monsoon-season (Jun1-Dec31, per the revised config) cumulative total.
- A z-score anomaly of each month's total against that SAME pixel's own
  2017-2025 monthly climatology, AS A SUBSTITUTE FOR TRUE SPI. Real SPI needs
  a 1981-2020 gamma-fit baseline, which needs another full CHIRPS historical
  pull - cut for time. This is flagged explicitly, not silently presented as
  SPI.
- No IMERG cross-check (optional in the spec, cut for time).
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils import cache_path, ee_init, load_config, retry_with_backoff

BATCH = 10


def fetch_monthly_rainfall(ee, gdf: gpd.GeoDataFrame, cfg: dict) -> pd.DataFrame:
    out_path = cache_path("chirps_monthly_per_tank", "csv")
    if out_path.exists():
        print(f"[cache] using existing {out_path}")
        return pd.read_csv(out_path)

    period_start, period_end = cfg["period"]["start"], cfg["period"]["end"]
    months = pd.period_range(period_start, period_end, freq="M")
    month_strs = [str(m) for m in months]

    feats = [
        ee.Feature(ee.Geometry.Point([row["centroid_lon"], row["centroid_lat"]]), {"tank_id": row["tank_id"]})
        for _, row in gdf.iterrows()
    ]
    fc = ee.FeatureCollection(feats)
    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")

    def month_total(period_str):
        period_str = ee.String(period_str)
        start = ee.Date.parse("YYYY-MM", period_str)
        end = start.advance(1, "month")
        total = chirps.filterDate(start, end).sum().rename("precip_mm")
        reduced = total.reduceRegions(collection=fc, reducer=ee.Reducer.first(), scale=5566, tileScale=2)
        return reduced.map(lambda f: f.set("year_month", period_str))

    rows = []
    n_batches = (len(month_strs) + BATCH - 1) // BATCH
    for b in range(n_batches):
        batch = month_strs[b * BATCH : (b + 1) * BATCH]

        def fetch(batch=batch):
            subset = ee.List(batch).map(month_total)
            return ee.FeatureCollection(subset).flatten().getInfo()

        result = retry_with_backoff(fetch, label=f"rainfall batch {b + 1}/{n_batches}", max_retries=5, base_delay=6.0)
        for f in result["features"]:
            p = f["properties"]
            rows.append({"tank_id": p["tank_id"], "year_month": p["year_month"], "precip_mm": p.get("first", 0.0) or 0.0})
        print(f"rainfall batch {b + 1}/{n_batches} done ({len(result['features'])} rows)")

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)
    print(f"[cache] wrote {out_path} ({len(df)} rows)")
    return df


def compute_derived(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    df = df.copy()
    df["month_num"] = df["year_month"].str.slice(5, 7).astype(int)
    df["year"] = df["year_month"].str.slice(0, 4).astype(int)

    # climatology + anomaly (SUBSTITUTE for true SPI - see module docstring)
    clim = df[df["year"].between(2017, 2025)].groupby(["tank_id", "month_num"])["precip_mm"].agg(["mean", "std"]).reset_index()
    clim.columns = ["tank_id", "month_num", "clim_mean", "clim_std"]
    df = df.merge(clim, on=["tank_id", "month_num"], how="left")
    df["rainfall_anomaly_z"] = (df["precip_mm"] - df["clim_mean"]) / df["clim_std"].replace(0, np.nan)

    season_start_m, _ = cfg["rainfall"]["season_start_month_day"]
    season_end_m, _ = cfg["rainfall"]["season_end_month_day"]
    df["in_season"] = df["month_num"].between(season_start_m, season_end_m)
    return df


def main() -> int:
    ee = ee_init()
    cfg = load_config()
    gdf = gpd.read_file(cache_path("tank_inventory", "geojson"))
    print(f"Loaded {len(gdf)} tanks.")

    raw = fetch_monthly_rainfall(ee, gdf, cfg)
    derived = compute_derived(raw, cfg)
    out_path = cache_path("chirps_monthly_derived", "csv")
    derived.to_csv(out_path, index=False)
    print(f"Wrote {out_path} ({len(derived)} rows)")
    print(derived[["precip_mm", "rainfall_anomaly_z"]].describe().to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
