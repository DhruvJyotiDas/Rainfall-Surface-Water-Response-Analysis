"""Regression test for the slope bug caught during Phase 0 step 3.

First run of pipeline/02_tank_inventory.py computed ee.Terrain.slope() on the
DEM's native EPSG:4326 (degree) projection and got an IDENTICAL slope value
for all 480 tanks - silently wrong, not an error. Fixed by reprojecting the
DEM to a meter-based CRS (UTM 44N) before computing slope.

This test has two parts:
1. A pure unit test (no network) on a small synthetic "sane" slope series,
   proving the validator itself catches a constant series and an in-range
   series correctly - this is what would have caught the original bug.
2. An integration check against the actual generated tank_inventory.geojson,
   if it exists on disk (skipped otherwise - this is a data QC assertion,
   not something that should block CI when no inventory has been built yet).
   Real data check: not constant, and no more than a small flagged minority
   fall outside [0, slope_outlier_max_deg] - 11/470 tanks (2.3%) exceeded
   10 deg on the real run, all small (~3-14ha), consistent with DEM edge
   effects at small polygons, not a repeat of the constant-value bug. Those
   are flagged via slope_outlier in the inventory, not silently dropped.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from utils import cache_path, load_config


def slope_qc(slope_values: np.ndarray, low: float = 0.0, high: float = 10.0) -> dict:
    """Pure validator: not constant, mostly within [low, high]. Returns a
    report dict rather than asserting directly, so callers can decide
    pass/fail policy (hard-fail for synthetic fixtures, flag-and-report for
    real remote-sensing data where a small outlier tail is expected).
    """
    arr = np.asarray(slope_values, dtype=float)
    arr = arr[~np.isnan(arr)]
    is_constant = bool(np.nanstd(arr) == 0) if len(arr) > 0 else True
    n_outside = int(((arr < low) | (arr > high)).sum())
    return {
        "n": len(arr),
        "is_constant": is_constant,
        "std": float(np.nanstd(arr)) if len(arr) else 0.0,
        "n_outside_range": n_outside,
        "frac_outside_range": n_outside / len(arr) if len(arr) else 1.0,
    }


def test_slope_qc_catches_constant_series():
    """This is exactly the shape of the original bug: every tank got the
    same slope value. The validator must flag it as constant.
    """
    constant_series = np.full(480, 0.131966)
    report = slope_qc(constant_series)
    assert report["is_constant"] is True
    assert report["std"] == 0.0


def test_slope_qc_passes_realistic_varying_series():
    rng = np.random.default_rng(42)
    realistic = np.clip(rng.gamma(shape=2.0, scale=0.8, size=480), 0, 9.9)
    report = slope_qc(realistic)
    assert report["is_constant"] is False
    assert report["std"] > 0
    assert report["frac_outside_range"] == 0.0


def test_slope_qc_flags_out_of_range_values():
    mixed = np.concatenate([np.full(469, 1.5), np.full(11, 20.0)])
    report = slope_qc(mixed)
    assert report["is_constant"] is False
    assert report["n_outside_range"] == 11


@pytest.mark.skipif(
    not cache_path("tank_inventory", "geojson").exists(),
    reason="tank_inventory.geojson not built yet - run pipeline/02_tank_inventory.py first",
)
def test_real_tank_inventory_slope_is_sane():
    import geopandas as gpd

    gdf = gpd.read_file(cache_path("tank_inventory", "geojson"))
    cfg = load_config()
    max_deg = cfg["tank_filter"]["slope_outlier_max_deg"]

    report = slope_qc(gdf["slope_deg"].to_numpy(), low=0.0, high=max_deg)
    assert report["is_constant"] is False, "slope_deg is constant across tanks - repeat of the DEM-projection bug"

    # a small flagged minority is expected and handled via slope_outlier;
    # this guards against a much larger fraction going bad silently.
    assert report["frac_outside_range"] < 0.10, (
        f"{report['n_outside_range']}/{report['n']} tanks ({report['frac_outside_range']:.1%}) "
        f"exceed the {max_deg} deg sanity bound - investigate before trusting slope_deg"
    )
    # every out-of-range tank must be flagged, not silently included in clean stats
    outliers = gdf[gdf["slope_deg"] > max_deg]
    assert outliers["slope_outlier"].all(), "some slope>threshold tanks are missing the slope_outlier flag"
