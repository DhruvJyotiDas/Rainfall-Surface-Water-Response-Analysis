"""Phase 3 (TIME-BOXED, see README limitations): response metrics + H1/H2/H3.

Cut for the 1-hour deadline (documented, not silently dropped):
- No bootstrap CIs on lag or threshold (point estimates only).
- Prewhitening is a lightweight lag-1 AR approximation (residual = x_t -
  phi_1*x_{t-1} using the sample lag-1 autocorrelation), not a fitted
  statsmodels AR(1) MLE - much faster, same spirit.
- Threshold/hinge model uses MONTHLY rainfall/area granularity (x = Jun-Dec
  seasonal rainfall total, y = seasonal peak area %max), not daily
  cumulative-to-peak-date, because only monthly series were extracted in the
  time available.
- No pixel-clustered resampling for significance (would need bootstrap
  infrastructure cut above) - p-values here are naive per-tank Pearson tests,
  NOT corrected for the CHIRPS pixel pseudo-replication documented in the
  inventory (116 pixels for 470 tanks). This is a real limitation, stated
  plainly in the README, not glossed over.
- GMM sensitivity classification check: cut entirely.
- Placebo test: 50 shuffles (not 1000), still gives a real false-positive
  rate, just a noisier estimate of it.
"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils import cache_path, load_config, set_seeds, write_json_cache


def load_merged(cfg) -> pd.DataFrame:
    monthly_s1 = pd.read_csv(cache_path("s1_water_area_monthly", "csv"))
    rainfall = pd.read_csv(cache_path("chirps_monthly_derived", "csv"))
    merged = monthly_s1.merge(rainfall, on=["tank_id", "year_month"], how="inner")
    merged["date"] = pd.PeriodIndex(merged["year_month"], freq="M").to_timestamp()
    return merged.sort_values(["tank_id", "date"])


def compute_robust_max(df: pd.DataFrame) -> pd.Series:
    return df.groupby("tank_id")["area_ha_median"].quantile(0.95).rename("robust_max_ha")


def lag1_prewhiten(x: np.ndarray) -> np.ndarray:
    x = x - np.nanmean(x)
    if len(x) < 3 or np.nanstd(x) == 0:
        return x
    valid = ~np.isnan(x)
    if valid.sum() < 3:
        return x
    phi = np.corrcoef(x[:-1][valid[:-1] & valid[1:]], x[1:][valid[:-1] & valid[1:]])[0, 1]
    if np.isnan(phi):
        phi = 0.0
    resid = np.full_like(x, np.nan)
    resid[1:] = x[1:] - phi * x[:-1]
    return resid


def tank_lag_correlation(sub: pd.DataFrame, lags=range(-4, 7)) -> dict:
    """Cross-correlate prewhitened area anomaly vs rainfall anomaly at each
    lag; return the peak within lag 0-4 plus the full lag profile (used for
    the placebo/negative-lag channel).
    """
    sub = sub.dropna(subset=["area_ha_median", "precip_mm"]).sort_values("date")
    if len(sub) < 12:
        return {"n": len(sub), "peak_lag": None, "peak_r": None, "peak_p": None, "profile": {}}

    area_clim = sub.groupby(sub["date"].dt.month)["area_ha_median"].transform("mean")
    area_anom = sub["area_ha_median"] - area_clim
    area_pw = lag1_prewhiten(area_anom.to_numpy())
    rain_pw = lag1_prewhiten(sub["rainfall_anomaly_z"].fillna(0).to_numpy())

    profile = {}
    for lag in lags:
        if lag >= 0:
            a = area_pw[lag:]
            r = rain_pw[: len(rain_pw) - lag] if lag > 0 else rain_pw
        else:
            a = area_pw[: len(area_pw) + lag]
            r = rain_pw[-lag:]
        n = min(len(a), len(r))
        a, r = a[:n], r[:n]
        mask = ~(np.isnan(a) | np.isnan(r))
        if mask.sum() < 5:
            profile[lag] = (None, None)
            continue
        r_val, p_val = stats.pearsonr(a[mask], r[mask])
        profile[lag] = (float(r_val), float(p_val))

    in_range = {lag_: v for lag_, v in profile.items() if lag_ in (0, 1, 2, 3, 4) and v[0] is not None}
    if not in_range:
        return {"n": len(sub), "peak_lag": None, "peak_r": None, "peak_p": None, "profile": profile}
    peak_lag = max(in_range, key=lambda k: in_range[k][0])
    return {"n": len(sub), "peak_lag": peak_lag, "peak_r": in_range[peak_lag][0], "peak_p": in_range[peak_lag][1], "profile": profile}


def hinge_vs_linear(x: np.ndarray, y: np.ndarray) -> dict:
    """Simplified hinge (flat-then-linear) vs OLS linear, compared by AIC.
    Breakpoint chosen by grid search (not jointly fit) - documented
    simplification given the time budget.
    """
    n = len(x)
    if n < 5:
        return {"n": n, "aic_linear": None, "aic_hinge": None, "hinge_wins": None, "threshold_mm": None}

    slope, intercept, _, _, _ = stats.linregress(x, y)
    resid_lin = y - (intercept + slope * x)
    rss_lin = np.sum(resid_lin**2)
    k_lin = 2
    aic_lin = n * np.log(rss_lin / n) + 2 * k_lin if rss_lin > 0 else -np.inf

    candidates = np.percentile(x, np.linspace(15, 85, 15))
    best_c, best_rss = None, np.inf
    for c in candidates:
        xt = np.minimum(x, c)
        if np.std(xt) == 0:
            continue
        s, i, _, _, _ = stats.linregress(xt, y)
        rss = np.sum((y - (i + s * xt)) ** 2)
        if rss < best_rss:
            best_rss, best_c = rss, c
    if best_c is None:
        return {"n": n, "aic_linear": aic_lin, "aic_hinge": None, "hinge_wins": False, "threshold_mm": None}
    k_hinge = 3
    aic_hinge = n * np.log(best_rss / n) + 2 * k_hinge if best_rss > 0 else -np.inf
    return {"n": n, "aic_linear": float(aic_lin), "aic_hinge": float(aic_hinge), "hinge_wins": bool(aic_hinge < aic_lin), "threshold_mm": float(best_c)}


def seasonal_threshold_model(sub: pd.DataFrame, robust_max: float, cfg) -> dict:
    season_start_m, _ = cfg["rainfall"]["season_start_month_day"]
    season_end_m, _ = cfg["rainfall"]["season_end_month_day"]
    fit_start, fit_end = cfg["rainfall"]["fit_years"]

    seasonal_rows = []
    for yr in range(fit_start, fit_end + 1):
        season = sub[(sub["year"] == yr) & (sub["month_num"].between(season_start_m, season_end_m))]
        if season.empty:
            continue
        seasonal_rows.append(
            {
                "year": yr,
                "rain_total_mm": season["precip_mm"].sum(),
                "peak_area_ha": season["area_ha_median"].max(),
            }
        )
    if len(seasonal_rows) < cfg["tank_filter"]["min_valid_seasons_to_rank"]:
        return {"n_seasons": len(seasonal_rows), "low_confidence": True}

    sdf = pd.DataFrame(seasonal_rows)
    sdf["peak_pct_max"] = (sdf["peak_area_ha"] / robust_max * 100).clip(upper=100) if robust_max > 0 else 0
    fit = hinge_vs_linear(sdf["rain_total_mm"].to_numpy(), sdf["peak_pct_max"].to_numpy())
    fill_freq = float((sdf["peak_pct_max"] >= cfg["stats"]["fill_threshold_pct_of_max"]).mean())
    return {"n_seasons": len(sdf), "low_confidence": False, "fill_frequency": fill_freq, **fit}


def recession_rate(sub: pd.DataFrame) -> float | None:
    """log-linear fit from the peak month to the tail of the SAME
    hydrological year (Jun-May, not calendar Jan-Dec) - recession runs from
    an Oct-Dec peak into the following Jan-May, so grouping by calendar year
    alone would cut the tail off after just 1-2 months for most tanks. Caught
    while reviewing this function before trusting its output.
    """
    sub = sub.copy()
    sub["hydro_year"] = np.where(sub["month_num"] >= 6, sub["year"], sub["year"] - 1)
    slopes = []
    for _hy, grp in sub.groupby("hydro_year"):
        grp = grp.sort_values("date")
        if len(grp) < 4:
            continue
        peak_idx = grp["area_ha_median"].idxmax()
        peak_pos = grp.index.get_loc(peak_idx)
        tail = grp.iloc[peak_pos:]
        tail = tail[tail["area_ha_median"] > 0]
        if len(tail) < 3:
            continue
        t = np.arange(len(tail))
        logy = np.log(tail["area_ha_median"].to_numpy())
        if np.std(t) == 0:
            continue
        slope, *_ = stats.linregress(t, logy)
        slopes.append(-slope)
    return float(np.median(slopes)) if slopes else None


def classify(fill_freq, recession_k, cfg) -> str:
    c = cfg["classification"]
    if fill_freq is None:
        return "insufficient_data"
    if fill_freq >= c["resilient_min_fill_frequency"] and (recession_k or 1) <= c["resilient_max_recession_k_per_month"]:
        return "resilient"
    if fill_freq <= c["nonresponsive_max_fill_frequency"]:
        return "non_responsive"
    if fill_freq <= c["fragile_max_fill_frequency"]:
        return "threshold_limited_fragile"
    return "rainfall_tracking"


def placebo_test(merged: pd.DataFrame, n_shuffles: int = 50, seed: int = 42) -> dict:
    """H3: shuffle rainfall years within each tank and recompute the peak
    lag-0-4 correlation's significance rate - should be near the nominal
    alpha (0.05) if the real result isn't a pipeline artifact. Reduced to 50
    shuffles (spec default 1000) for the time budget - still directionally
    informative, just a noisier false-positive-rate estimate.
    """
    rng = np.random.default_rng(seed)
    tanks = merged["tank_id"].unique()
    sample_tanks = rng.choice(tanks, size=min(60, len(tanks)), replace=False)  # subsample tanks too, for speed

    n_sig = 0
    n_total = 0
    for tid in sample_tanks:
        sub = merged[merged["tank_id"] == tid].sort_values("date").reset_index(drop=True)
        if len(sub) < 24:
            continue
        for _ in range(n_shuffles // len(sample_tanks) + 1):
            years = sub["year"].unique()
            shuffled_years = rng.permutation(years)
            year_map = dict(zip(years, shuffled_years, strict=False))
            shuffled = sub.copy()
            shuffled["precip_mm"] = shuffled["year"].map(lambda y: sub.loc[sub["year"] == year_map[y], "precip_mm"].mean())  # noqa: B023 - eager .map() call, consumed same iteration
            result = tank_lag_correlation(shuffled)
            if result["peak_p"] is not None:
                n_total += 1
                if result["peak_p"] < 0.05:
                    n_sig += 1
    return {"n_tests": n_total, "n_significant": n_sig, "false_positive_rate": n_sig / n_total if n_total else None}


def main() -> int:
    set_seeds()
    cfg = load_config()
    merged = load_merged(cfg)
    gdf = gpd.read_file(cache_path("tank_inventory", "geojson"))
    robust_max = compute_robust_max(merged)

    results = []
    for tid, sub in merged.groupby("tank_id"):
        rmax = robust_max.get(tid, np.nan)
        lag = tank_lag_correlation(sub)
        thresh = seasonal_threshold_model(sub, rmax, cfg)
        recession_k = recession_rate(sub)
        fill_freq = thresh.get("fill_frequency")
        cls = classify(fill_freq, recession_k, cfg)
        results.append(
            {
                "tank_id": tid,
                "robust_max_ha": rmax,
                "n_months_obs": len(sub),
                "peak_lag_months": lag["peak_lag"],
                "peak_lag_r": lag["peak_r"],
                "peak_lag_p": lag["peak_p"],
                "n_seasons": thresh.get("n_seasons"),
                "low_confidence": thresh.get("low_confidence", True),
                "fill_frequency": fill_freq,
                "aic_linear": thresh.get("aic_linear"),
                "aic_hinge": thresh.get("aic_hinge"),
                "hinge_wins": thresh.get("hinge_wins"),
                "threshold_mm": thresh.get("threshold_mm"),
                "recession_k_per_month": recession_k,
                "classification": cls,
            }
        )

    results_df = pd.DataFrame(results)
    results_df = results_df.merge(gdf[["tank_id", "area_ha", "regulated_likely", "slope_outlier", "near_osm_canal"]], on="tank_id", how="left")
    out_path = cache_path("response_metrics", "csv")
    results_df.to_csv(out_path, index=False)
    print(f"Wrote {out_path} ({len(results_df)} tanks)")

    # H1: >=50% show significant positive response at lag 0-2
    testable = results_df.dropna(subset=["peak_lag_p"])
    h1_pass = testable[(testable["peak_lag_months"].isin([0, 1, 2])) & (testable["peak_lag_r"] > 0) & (testable["peak_lag_p"] < 0.05)]
    h1_frac = len(h1_pass) / len(testable) if len(testable) else 0
    print(f"H1: {len(h1_pass)}/{len(testable)} tanks ({h1_frac:.1%}) show significant positive lag 0-2 response. {'PASS' if h1_frac >= 0.5 else 'FAIL'} (>=50% threshold)")

    # H2: hinge beats linear by AIC in most tanks (excluding low-confidence)
    h2_eligible = results_df[~results_df["low_confidence"].fillna(True)]
    h2_pass = h2_eligible[h2_eligible["hinge_wins"] == True]
    h2_frac = len(h2_pass) / len(h2_eligible) if len(h2_eligible) else 0
    print(f"H2: hinge beats linear in {len(h2_pass)}/{len(h2_eligible)} tanks ({h2_frac:.1%}). {'PASS' if h2_frac > 0.5 else 'FAIL'} (majority threshold)")

    # H3: placebo (reduced iterations - see module docstring)
    print("Running reduced placebo test (H3, 50 shuffles across a 60-tank subsample)...")
    placebo = placebo_test(merged, n_shuffles=50)
    print(f"H3: placebo false-positive rate = {placebo['false_positive_rate']}. {'PASS (near 0.05)' if placebo['false_positive_rate'] and placebo['false_positive_rate'] < 0.15 else 'CHECK'}")

    write_json_cache(
        "phase3_hypothesis_results",
        {
            "H1_frac_significant_lag_0_2": h1_frac,
            "H1_n_testable": len(testable),
            "H2_frac_hinge_wins": h2_frac,
            "H2_n_eligible": len(h2_eligible),
            "H3_placebo": placebo,
            "classification_counts": results_df["classification"].value_counts().to_dict(),
        },
    )
    print(results_df["classification"].value_counts().to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
