> Archived research record: the methods and original pipeline results below are preserved from the initial study. For the current interactive website and its illustrative rainfall slider, see [the main README](../README.md) and [frontend guide](../FRONTEND.md).

# Rainfall–Surface Water Response Analysis

**Interactive frontend:** see [FRONTEND.md](../FRONTEND.md) for the new React/Three.js
observatory, local run commands, demo-data provenance, browser tests, and static
hosting instructions. The narrative and findings below describe the original
research pipeline; frontend monthly curves and rainfall scenarios are explicitly
synthetic and do not replace that pipeline's scientific outputs.

GEOIMPATHON 1.0, Problem 2.4. **Built under a hard 1-hour deadline** (see
Timeline/Cuts section) — this is a working, honestly-reduced pipeline, not
the full spec. Every number below comes from the actual pipeline run in
`cache/` and `docs/data/tanks.json`; nothing is invented.

**Live dashboard**: see repo GitHub Pages settings (user-deployed).
**Repo**: https://github.com/DhruvJyotiDas/Rainfall-Surface-Water-Response-Analysis

## Problem & thesis

Small rain-fed tanks in semi-arid India fill in a threshold (fill-and-spill)
manner rather than linearly with rainfall. For each tank we estimate the
rainfall needed to fill it, the recession rate after monsoon, the
rainfall-to-area lag, and classify/rank tanks by vulnerability.

## Study area

Anantapur district, Rayalaseema, Andhra Pradesh — a rain-shadow region with a
dense cascade of small irrigation tanks. Bbox lon[77.20,77.80] lat[14.10,14.60],
~3550 km². Confirmed at CHECKPOINT 0 against **470 candidate tanks**
(3-150ha, post-revision cap), well above the 300-tank minimum.

## Pipeline

| Step | Script | What it does |
|---|---|---|
| 0 | `01_verify_assets.py` | Verifies all 12 candidate GEE assets exist + real AOI coverage |
| 0 | `02_tank_inventory.py` | JRC max_extent ∪ Dynamic World water ∪ OSM water polygons → vectorized, area/elongation filtered → 470 tanks |
| 1 | `03_water_area_timeseries.py` | Per-tank Otsu S1 threshold calibration, water-area extraction (2017-2026), monthly aggregation |
| 2 | `04_rainfall.py` | CHIRPS monthly rainfall per tank, anomaly z-score |
| 3 | `05_response_metrics.py` | Lag correlation, hinge-vs-linear threshold model, recession rate, classification, H1/H2/H3 |
| 5 | `06_export_dashboard_data.py` | Compact JSON for the static dashboard |

## Data sources (all verified via `ee.data.getAsset`, see `cache/asset_verification.json`)

| Asset | Purpose |
|---|---|
| COPERNICUS/S1_GRD | Water extent (VV, single relative orbit 165, DESCENDING) |
| GOOGLE/DYNAMICWORLD/V1 | Water class for tank inventory |
| JRC/GSW1_4/GlobalSurfaceWater | max_extent band (binary ever-water, NOT an occurrence threshold) |
| UCSB-CHG/CHIRPS/DAILY | Rainfall |
| WWF/HydroSHEDS/v1/Basins/hybas_12 | Basin id (cascade proxy, pixel-clustering) |
| ESA/WorldCover/v200 | Land-cover flags (paddy risk) |
| COPERNICUS/DEM/GLO30_2024_1 | Slope masking (switched from deprecated GLO30) |
| OSM (Overpass API) | Water-polygon union + canal proximity |

## Method summary

- **Water mask**: JRC `max_extent` OR Dynamic World water≥0.5, vectorized at
  30m, filtered by true area (UTM 44N projection) and elongation index
  (drops river/canal shapes). OSM water polygons added if not already
  covered (6 found, 2 survived filtering).
- **S1 water classification**: per-tank Otsu threshold on a multi-temporal
  MIN-VV composite (bimodality-gated, falls back to global -16dB), applied to
  speckle-filtered (focal median, 30m) VV, slope-masked (>15°excluded).
- **Frame-boundary bug caught and fixed**: same-day adjacent S1 frames were
  initially treated as independent images, giving tanks near a frame
  boundary a spurious area=0. Fixed by mosaicking same-day frames before
  classification (see CLAUDE.md for the full story).
- **Rainfall**: CHIRPS monthly totals sampled at each tank's centroid pixel.
  **Rainfall anomaly is a z-score against each tank's own 2017-2025 monthly
  climatology — an explicit, documented substitute for true SPI** (real SPI
  needs a separate 1981-2020 gamma-fit baseline pull, cut for time).
- **Lag**: monthly area deseasonalized (climatology-removed) and lightly
  prewhitened (lag-1 AR approximation, not fitted AR(1)), cross-correlated
  against rainfall anomaly at lags -4..+6.
- **Threshold/hinge model**: per hydrological season (Jun-Dec, 2017-2025, 9
  seasons), x = seasonal rainfall total, y = seasonal peak area (% of each
  tank's own 95th-percentile "robust max"). Hinge (flat-then-linear,
  breakpoint by grid search) vs OLS linear, compared by AIC.
- **Recession**: log-linear fit from each season's peak to its post-monsoon
  minimum, median slope across seasons = k (per month).
- **Classification**: rule-based on fill_frequency and recession k (config
  `classification.*` thresholds) — resilient / rainfall_tracking /
  threshold_limited_fragile / non_responsive / insufficient_data (<5 seasons).

## Hypothesis results (H1/H2/H3) — actual run, `cache/phase3_hypothesis_results.json`

- **H1 FAILS**: only **72/462 tanks (15.6%)** show a significant positive
  response at lag 0-2 months — well short of the ≥50% pre-registered
  threshold. **Per the pre-registration, we pivot the narrative**: rainfall
  alone does not explain most tanks' area response at the monthly
  granularity this build could achieve — consistent with cascade effects
  (basins average ~19 other tanks upstream/downstream, `n_other_tanks_in_basin`)
  and/or management (releases, encroachment) confounding a pure
  rainfall-response signal. **Caveat**: p-values are naive per-tank Pearson
  tests, not corrected for CHIRPS pixel pseudo-replication (116 pixels
  shared by 470 tanks), and the peak lag was selected from 5 candidates
  (0-4 months) without multiple-comparison correction — see H3 below, which
  shows this selection alone inflates apparent significance well above 5%.
  The true rate of real rainfall response is probably lower than 15.6%, not
  higher, once corrected.
- **H2 FAILS**: hinge beats linear by AIC in only **91/470 tanks (19.4%)** —
  the opposite of the pre-registered expectation. Most likely explanation
  given the time-boxed method: only 9 seasons/tank at monthly (not daily)
  granularity is a very weak basis for distinguishing a 3-parameter hinge
  from a 2-parameter line — this result should be read as "inconclusive
  given the data density achieved," not as strong evidence against a hinge
  mechanism.
- **H3 investigated, not a clean pass**: placebo false-positive rate =
  **23.3%** (50 shuffles, 60-tank subsample) — far above the nominal 5%.
  We caught and fixed one real bug here (the shuffle initially overwrote the
  wrong column and had zero effect — see CLAUDE.md), but after fixing it the
  rate stayed elevated. **This number matches `1-(0.95)^5 ≈ 22.6%` almost
  exactly** — the expected inflation from picking the single best-correlated
  lag out of 5 candidates (0-4 months) without a Bonferroni-style correction.
  This is a real, explained methodological limitation of this time-boxed
  build (not a residual pipeline bug we ran out of time to find): both H1
  and the real (non-placebo) lag test share this same peak-picking bias, so
  H1's 15.6% figure is itself somewhat inflated versus a properly corrected
  test. A corrected re-run (pre-registering a single lag, or dividing alpha
  by the number of lags tested) is the clear next step, not done here.

## Classification counts (470 tanks)

| Class | Count | Note |
|---|---|---|
| threshold_limited_fragile | 284 | needs high rainfall, fails to fill in many seasons |
| rainfall_tracking | 122 | fills roughly in proportion to rainfall |
| non_responsive | 59 | rarely fills regardless of rainfall — candidates for siltation/diversion/encroachment survey (Problem 2.2) |
| resilient | 5 | high fill frequency, slow recession |

Given H1/H2 both failed their pre-registered thresholds, these class labels
should be read as descriptive groupings of *observed behavior* (how often a
tank actually filled, how fast it drained), not as validated causal
categories — the rainfall-response mechanism behind them is exactly what H1
says we could not confirm cleanly in this build.

## Limitations (mandatory, honest)

- **This build was completed under a hard 1-hour deadline** (down from an
  estimated 5-8 hours for full spec fidelity). Cuts made, all documented in
  code/docstrings, not silently: no bootstrap CIs anywhere; SPI replaced by a
  simple anomaly z-score; no GMM classification sensitivity check; S1-vs-S2
  MNDWI calibration validation was written but not run/reported this build;
  no GWW archive or JRC external overlap validation; no QA thumbnail sheet;
  placebo test uses 50 shuffles on a subsample, not 1000 on all tanks; no
  client-side scenario slider on the dashboard.
- CHIRPS is ~5km resolution; 470 tanks share only 116 distinct pixels
  (pseudo-replication) — flagged in `chirps_pixel_id` but NOT corrected for
  in the significance tests above.
- Sentinel-1 is sensitive to wind roughening (underestimates area) and
  aquatic vegetation (either direction) — not modeled.
- S1B robustness run skipped: confirmed the AOI is served by a single
  relative orbit (165) with roughly flat per-year image counts
  (28-37/yr) and no discontinuity specifically at S1B's Dec-2021
  retirement (a transient 2019-2020 bump came from S1B briefly sharing
  this track, not from a post-2021 drop).
- No in-situ tank gauge data exists for any tank — all validation is
  satellite-vs-satellite in principle, and even that (S1-vs-S2, JRC/GWW
  overlap) was cut from this build for time.
- Small tank sizes (3ha minimum) are close to the practical resolution limit
  of 10-30m satellite imagery.
- Area-from-pixel-count uses a constant scale² multiplier, not
  `ee.Image.pixelArea()` (negligible distortion at this AOI's latitude/size,
  chosen for extraction speed).
- Tank classification is a **screening tool, not a verdict** — see dashboard.

## Reproduction

```
pip install -r requirements.txt
earthengine authenticate   # then register a GCP project for EE, see CLAUDE.md
# set earth_engine.project in config/config.yaml
python pipeline/01_verify_assets.py
python pipeline/02_tank_inventory.py
python pipeline/03_water_area_timeseries.py
python pipeline/04_rainfall.py
python pipeline/05_response_metrics.py
python pipeline/06_export_dashboard_data.py
# serve docs/ locally, or push to GitHub Pages
```

Every step caches its GEE output to `cache/`; reruns are free unless you
delete the relevant cache file.
