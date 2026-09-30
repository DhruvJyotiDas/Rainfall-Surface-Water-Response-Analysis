"""Phase 0 step 2: verify every candidate GEE asset ID with ee.data.getAsset.

Never assume an asset exists or guess its date range — call the API and
report exactly what comes back, including failures. Caches the result table
to disk so this doesn't need to be re-run against the API on every rerun.
"""
from __future__ import annotations

import datetime
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils import (
    ee_init,
    load_config,
    retry_with_backoff,
    write_json_cache,
)

CANDIDATE_ASSETS = [
    {"id": "COPERNICUS/S1_GRD", "label": "Sentinel-1 GRD (water extent)", "required": True, "time_series": True},
    {"id": "COPERNICUS/S2_SR_HARMONIZED", "label": "Sentinel-2 SR (S1 calibration)", "required": True, "time_series": True},
    {"id": "UCSB-CHG/CHIRPS/DAILY", "label": "CHIRPS daily rainfall", "required": True, "time_series": True},
    {"id": "JRC/GSW1_4/GlobalSurfaceWater", "label": "JRC surface water occurrence/max extent", "required": True, "time_series": False},
    {"id": "JRC/GSW1_4/MonthlyHistory", "label": "JRC monthly history (ends 2021-12)", "required": True, "time_series": True},
    {"id": "projects/JRC/GSW1_5/MonthlyHistory_2022_2024", "label": "JRC monthly history 2022-2024 (access may fail)", "required": False, "time_series": True, "no_time_start_property": True},
    {"id": "WWF/HydroSHEDS/v1/Basins/hybas_12", "label": "HydroSHEDS L12 basins", "required": True, "time_series": False},
    {"id": "GOOGLE/DYNAMICWORLD/V1", "label": "Dynamic World (water class, land-cover)", "required": True, "time_series": True},
    {"id": "ESA/WorldCover/v200", "label": "ESA WorldCover (land-cover flags)", "required": True, "time_series": True},
    {"id": "COPERNICUS/DEM/GLO30_2024_1", "label": "Copernicus GLO-30 DEM, non-deprecated (slope masking)", "required": True, "time_series": False},
    {"id": "ECMWF/ERA5_LAND/MONTHLY_AGGR", "label": "ERA5-Land monthly (optional)", "required": False, "time_series": True},
    {"id": "NASA/GPM_L3/IMERG_V07", "label": "IMERG (optional rainfall cross-check)", "required": False, "time_series": True},
]


def verify_asset(ee, asset_id: str) -> dict:
    try:
        info = retry_with_backoff(lambda: ee.data.getAsset(asset_id), label=f"getAsset({asset_id})")
    except Exception as e:  # noqa: BLE001 - we want to record the exact failure
        return {"exists": False, "type": None, "start": None, "end": None, "error": str(e)}

    asset_type = info.get("type")
    start = info.get("startTime")
    end = info.get("endTime")
    return {"exists": True, "type": asset_type, "start": start, "end": end, "error": None}


def _ms_to_date(ms: float) -> str:
    return datetime.datetime.fromtimestamp(ms / 1000, tz=datetime.timezone.utc).date().isoformat()


def scoped_coverage(ee, asset: dict, asset_type: str, aoi_geom, period_start: str, period_end: str) -> dict:
    """Find first/last image date *within our AOI and period*, without
    fabricating a number for assets that don't fit the standard pattern.
    """
    asset_id = asset["id"]
    out = {"n_images_in_scope": None, "first_in_scope": None, "last_in_scope": None, "scope_error": None, "scope_method": None}
    if asset_type != "IMAGE_COLLECTION":
        return out

    try:
        base = ee.ImageCollection(asset_id).filterBounds(aoi_geom)

        if not asset.get("time_series", True):
            # Static/single-epoch product (e.g. DEM): date filtering is meaningless.
            n = retry_with_backoff(lambda: base.size().getInfo(), label=f"{asset_id} bounds-only count")
            out.update(n_images_in_scope=n, scope_method="bounds_only_static")
            return out

        col = base.filterDate(period_start, period_end)
        n = retry_with_backoff(lambda: col.size().getInfo(), label=f"{asset_id} scoped count")

        if n == 0 and asset.get("no_time_start_property"):
            # Known case: no system:time_start on this asset's images. Fall back
            # to parsing the date out of each image's own id/system:index
            # (e.g. ".../2022_01" -> 2022-01), which is reading real metadata,
            # not guessing.
            ids = retry_with_backoff(
                lambda: base.aggregate_array("system:index").getInfo(), label=f"{asset_id} id list"
            )
            dates = []
            for iid in ids:
                m = re.search(r"(\d{4})_(\d{2})$", iid)
                if m:
                    dates.append(f"{m.group(1)}-{m.group(2)}-01")
            in_period = [d for d in dates if period_start[:7] <= d[:7] <= period_end[:7]]
            out.update(
                n_images_in_scope=len(in_period),
                first_in_scope=min(in_period) if in_period else None,
                last_in_scope=max(in_period) if in_period else None,
                scope_method="parsed_from_system_index (no system:time_start on this asset)",
            )
            return out

        if n == 0:
            out.update(n_images_in_scope=0, scope_method="filterDate")
            return out

        first_ms = retry_with_backoff(
            lambda: col.sort("system:time_start", True).first().get("system:time_start").getInfo(),
            label=f"{asset_id} first date",
        )
        last_ms = retry_with_backoff(
            lambda: col.sort("system:time_start", False).first().get("system:time_start").getInfo(),
            label=f"{asset_id} last date",
        )
        out.update(
            n_images_in_scope=n,
            first_in_scope=_ms_to_date(first_ms),
            last_in_scope=_ms_to_date(last_ms),
            scope_method="filterDate",
        )
        return out
    except Exception as e:  # noqa: BLE001
        out["scope_error"] = str(e)
        return out


def main() -> int:
    ee = ee_init()
    cfg = load_config()
    bbox = cfg["aoi"]["bbox"]
    aoi_geom = ee.Geometry.Rectangle(
        [bbox["min_lon"], bbox["min_lat"], bbox["max_lon"], bbox["max_lat"]]
    )
    period_start = cfg["period"]["start"]
    period_end = cfg["period"]["end"]

    results = []
    for asset in CANDIDATE_ASSETS:
        r = verify_asset(ee, asset["id"])
        if r["exists"]:
            scoped = scoped_coverage(ee, asset, r["type"], aoi_geom, period_start, period_end)
            r.update(scoped)
        results.append({**asset, **r})

    write_json_cache(
        "asset_verification",
        {"aoi_bbox": bbox, "period": [period_start, period_end], "assets": results},
    )

    # console table
    col_w = max(len(a["id"]) for a in results) + 2
    header = f"{'asset'.ljust(col_w)}{'req?'.ljust(6)}{'exists'.ljust(8)}{'type'.ljust(18)}{'n_in_AOI/period':<16}{'first_in_scope':<16}{'last_in_scope':<16}"
    print(f"AOI bbox: {bbox}  period: {period_start} .. {period_end}")
    print(header)
    print("-" * len(header))
    n_required_missing = 0
    n_required_empty_in_scope = 0
    for r in results:
        req = "yes" if r["required"] else "no"
        exists = "OK" if r["exists"] else "FAIL"
        typ = (r["type"] or "-")[:17]
        n_scope = "-" if r.get("n_images_in_scope") is None else str(r["n_images_in_scope"])
        first_scope = r.get("first_in_scope") or "-"
        last_scope = r.get("last_in_scope") or "-"
        print(f"{r['id'].ljust(col_w)}{req.ljust(6)}{exists.ljust(8)}{typ.ljust(18)}{n_scope:<16}{first_scope:<16}{last_scope:<16}")
        if r.get("scope_method"):
            print(f"    (method: {r['scope_method']})")
        if r["required"] and not r["exists"]:
            n_required_missing += 1
            print(f"    -> error: {r['error']}")
        if r.get("scope_error"):
            print(f"    -> scope query error: {r['scope_error']}")
        if r["required"] and r.get("time_series", True) and r.get("n_images_in_scope") == 0:
            n_required_empty_in_scope += 1
            print("    -> WARNING: 0 images found in configured AOI/period")

    print()
    if n_required_missing:
        print(f"FAILED: {n_required_missing} required asset(s) not accessible. Fix before proceeding.")
        return 1
    if n_required_empty_in_scope:
        print(f"WARNING: {n_required_empty_in_scope} required asset(s) have zero coverage in the draft AOI/period.")
    print("All required assets verified accessible.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
