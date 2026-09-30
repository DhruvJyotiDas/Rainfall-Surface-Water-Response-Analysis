# CLAUDE.md — working notes for this build

Project: GEOIMPATHON 1.0, Problem 2.4 (Rainfall–Surface Water Response Analysis).
Full spec lives in the original prompt; this file tracks state, decisions, and
open questions across the session so work can resume without re-deriving context.
**Read this whole file before touching the pipeline again — it's the source of
truth on what's actually done vs. still pending, not the git log alone.**

## Ground rules (do not relitigate)
- Never fabricate numbers; every figure in README/dashboard traces to pipeline output.
- Cache all GEE results to disk (csv/geojson/json); reruns must be free. Every
  `pipeline/0N_*.py` script checks `cache/` first and skips re-hitting GEE if
  a cache file already exists — delete the specific cache file to force a redo.
- Verify every GEE asset ID with `ee.data.getAsset` before use.
- Deployed site (docs/) makes NO live GEE/API calls — fully static, <15 MB payload.
- Stop and ask at every CHECKPOINT in the spec. Do not self-approve past one.
- If something isn't run yet, say so — don't claim it works.
- Flag-don't-drop philosophy for QC issues (slope outliers, regulated-likely
  tanks, canal-proximity): keep the row, add a boolean column, exclude from
  headline stats where the spec says to, but never silently delete data.

## Environment (resolved, do not re-ask)
- OS: Windows 11. Shell: bash (git-bash) + PowerShell both available.
- Python: machine default (3.14.x) — NOT 3.11 as the original spec wanted (no
  3.11 available, only 3.12/3.14). User decided: stay on 3.14, no venv pin.
  `requirements.txt` records actually-installed versions (verified via `pip
  show`, not guessed) — geopandas 1.2.0, statsmodels 0.15.0, scikit-learn 1.8.0,
  earthengine-api 1.7.46, plus numpy/pandas/scipy/shapely/rasterio/pytest/ruff.
- git identity configured (DhruvJyotiDas / dhruvjyoti100@gmail.com). Repo is
  live: https://github.com/DhruvJyotiDas/Rainfall-Surface-Water-Response-Analysis
  (`main` branch, pushed after every phase). `gh` CLI is NOT installed — repo
  creation/pushes go through plain `git push` to an already-existing remote;
  user creates repos manually via github.com when a new one is needed.
- Earth Engine: **AUTHENTICATED AND WORKING.** GCP project `rainfall-tank-analysis`
  is created, has the Earth Engine API enabled, AND is registered for EE use
  (noncommercial). `pipeline/utils.py:ee_init()` calls
  `ee.Initialize(project="rainfall-tank-analysis")` — this project ID is also
  recorded in `config/config.yaml:earth_engine.project`. Do not re-run the
  authenticate/register flow; it's done.
- GitHub Pages: user is enabling this themselves (Settings -> Pages -> main
  branch /docs folder). Do NOT wait or poll for it — check the live URL only
  when Phase 5 (dashboard) is ready to deploy, per user's explicit instruction.

## Repo layout (as of Phase 1)
```
config/config.yaml    — all tunables; AOI confirmed at CHECKPOINT 0, since
                         revised (max_area_ha 500->150, season/fit-year changes)
pipeline/
  utils.py             — shared: load_config, ee_init, retry_with_backoff, cache helpers
  01_verify_assets.py  — Phase 0 step 2, DONE. All 12 GEE assets verified.
  02_tank_inventory.py — Phase 0 step 3 + revision, DONE. 470 tanks.
  03_water_area_timeseries.py — Phase 1, IN PROGRESS (see below).
  (04-07 not yet written: rainfall/drivers, response metrics, validation, dashboard export)
tests/
  test_slope_qc.py     — regression test for the slope bug (see "bugs caught" below)
docs/                  — GitHub Pages site root; docs/index.html placeholder only so far
docs/data/, docs/vendor/ — empty, Phase 5 work
cache/                 — ALL GEE/OSM results cached here, committed to git (small
                         enough: geojson/csv/json, not raw imagery). Key files:
  asset_verification.json
  tank_candidates_raw.geojson, tank_candidates_enriched.geojson, tank_inventory.geojson
  tank_inventory_stats.json, checkpoint0_map.png, checkpoint1_map.png
  osm_water_canal_raw.json
  s1_tank_thresholds.csv           — per-tank Otsu threshold calibration
  s1_threshold_calibration_summary.json
  s1_water_area_<year>.csv         — one file per year, Phase 1 raw extraction
  s1_water_area_raw_all_years.csv  — concatenated, written when extraction finishes
  phase1_extraction.log            — stdout/stderr of the background extraction run
requirements.txt      — pinned as actually installed under Python 3.14
```

## AOI: CONFIRMED at CHECKPOINT 0
bbox lon[77.20,77.80] lat[14.10,14.60], Anantapur district, Rayalaseema, AP
(~3550 km2). User confirmed this AOI explicitly. Do not re-litigate or re-pick.

## Tank inventory: 470 tanks (final, current)
Built by `pipeline/02_tank_inventory.py`. Pipeline: JRC `max_extent` (explicitly
NOT the occurrence-percentage band — user asked this be confirmed) OR Dynamic
World water>=0.5, vectorized at 30m, filtered locally in UTM 44N by true area
and elongation index, plus OSM (Overpass) water polygons unioned in (6 new
candidates found, 2 survived filtering). Columns include: area_ha,
elongation_index, hybas_id, n_other_tanks_in_basin, slope_deg, slope_outlier
(>10 deg, 11 tanks), worldcover_buffer_mode, paddy_flag (98 tanks),
regulated_likely (>100ha, 8 tanks — flagged, excluded from headline stats, not
dropped), chirps_pixel_id (116 distinct pixels for 470 tanks — real pseudo-
replication, use pixel-clustered resampling in Phase 3), near_osm_canal (10
tanks — this is the PARTIAL non_rain_inflow flag; the other half, Jan-May area
gain without antecedent rain, needs Phase 1+2 output and is NOT done yet).

Config values that changed post-CHECKPOINT-0 (user directive, all in
config.yaml with comments): max_area_ha 500->150; regulated_likely_min_area_ha
100 added; season_start/end = Jun1/Dec31; hydrological_year_start_month=6;
fit_years=[2017,2025] (9 seasons); out_of_sample_nowcast_year=2026 (2026 is
NEVER used to fit/validate H1/H2/H3, nowcast only); slope_outlier_max_deg=10.

Sensitivity (before the 150ha cap, still valid as the min_area_ha sensitivity
report): 1378 tanks at 1ha floor, 307 at 5ha, 480 at 3ha (pre-cap). Post-150ha-cap
final count is 470 at min_area_ha=3.

S1 orbit: confirmed a SINGLE relative orbit (165, DESCENDING) covers the whole
AOI — no per-tank orbit selection needed (this was a possible complication the
user flagged; turned out not to apply here). Per-year image counts 2017-2026:
33,28,37,37,31,28,31,29,31,18(partial 2026) — roughly flat ~28-37/yr. A closer
look (platform_number A/B/D) showed S1B transiently flew this same track in
2019 (+2020 briefly), causing the 37/37 bump those two years; 2021 onward is
S1A-only at steady ~29-31/yr, i.e. NO discontinuity specifically at S1B's
Dec-2021 retirement for this AOI. Decision (per user's stated rule): SKIP the
S1B-cadence subsampling robustness run; this reasoning goes in the README
limitations section verbatim when written.

CHIRPS: 3529 images for 2017-01-01..2026-08-31 (not 3530) because 2026-08-31
isn't published yet (data latency) — confirmed via exact missing-date check,
NOT a bug. Last 2 months should be flagged provisional in any output
(config: rainfall.provisional_last_n_months=2).

## Phase 1: Sentinel-1 water-area extraction — IN PROGRESS
`pipeline/03_water_area_timeseries.py`. Two stages:

1. **Per-tank Otsu threshold calibration** (DONE, cached in
   `cache/s1_tank_thresholds.csv`): multi-temporal MIN of speckle-filtered VV
   (dB) over a 100m-buffered tank polygon -> histogram -> Otsu in Python
   (`otsu_threshold()`) -> bimodality gate (`bimodality_variance_ratio() >=
   0.6`) -> per-tank threshold if bimodal, else fallback to global -16dB.
   Result: 438/470 tanks got a real per-tank Otsu threshold; 32 fell back.
   Threshold distribution is sane (median -17.3dB, within the -14..-19 sweep
   range from the spec).

2. **Per-image water-area extraction, chunked** (first full run COMPLETED:
   all 10 years, 303 images, 142,410 tank-image rows, zero errors/retries
   needed — see `cache/phase1_extraction.log`. Then a real bug was found in
   that output, see below, and the whole extraction is being redone with a
   fix — check `cache/phase1_run3_fixed.log` and whether
   `cache/s1_water_area_raw_all_years.csv` exists with a fresh timestamp to
   see if the corrected run finished).

   **BUG FOUND AND FIXED (frame-boundary false zeros)**: spot-checking
   individual tank series after the first full run, `tank_0944` showed
   physically backwards behavior (high area Jan-Feb, near-zero during the
   Jun-Oct monsoon) alternating with a same-day duplicate reading of exactly
   0.0. Root cause: 11 of 292 distinct S1 dates (across all years) have TWO
   S1 frames from the same pass (adjacent swaths, ~25s apart) covering the
   AOI; treating each frame as an independent image meant a tank sitting
   just outside one frame's footprint got a spurious area=0 from that frame
   (correctly masked/no-data pixels, but the WHOLE tank polygon outside that
   footprint), which reads indistinguishably from "genuinely dry" in the
   output. Fix in `extract_water_area_for_year()`: group images by calendar
   date, `.mosaic()` same-day frames into one composite BEFORE classification
   (mosaic takes the first valid/unmasked pixel per location, so a
   boundary tank now gets whichever frame actually covers it). This is
   NOT a GPU/compute issue — it's a data-modeling bug (independent-image
   assumption breaking near frame edges), caught only by actually looking at
   individual tank output before trusting it. All affected caches
   (`s1_water_area_<year>.csv`, `_raw_all_years`, `_monthly`,
   `s1_s2_calibration_pairs`) were deleted and the pipeline re-run from
   scratch with the fix. Only ~3.8% of dates were affected, but the fix
   changes the "unit of extraction" from image to distinct-date, so
   everything downstream needed a clean rebuild rather than a patch.

   IMPORTANT PERFORMANCE FINDING (still valid): a naive one-`reduceRegions()`-call-per-image
   loop took ~30s/image (303 images -> ~2.5 hours) and is NOT compute-bound —
   almost all of that time is GEE server-side work plus one Python<->GEE round
   trip per image. A GPU or more local CPU does NOT help this bottleneck (the
   actual pixel processing runs on Google's servers, not locally). Fix: batch
   multiple images' processing into ONE server-side expression via
   `ee.List.map()` + `ee.FeatureCollection(...).flatten()`, so one `getInfo()`
   fetches a whole batch. Empirically tested against this project's live GEE
   quota: batch size 10 works reliably (~6.5s/image, i.e. ~33 min for the full
   303-image series); batch sizes 15 and 20 BOTH hit a hard
   `"Too many concurrent aggregations"` quota error (a GEE server-side
   concurrency cap, not something more compute raises). This is why
   `AGGREGATION_BATCH_SIZE = 10` is hardcoded at the top of
   `03_water_area_timeseries.py` with this reasoning in a comment — don't
   raise it without re-testing, and don't assume a beefier VM changes this.
   Extraction caches one CSV per year (`s1_water_area_<year>.csv`), so a crash
   partway through only loses the in-progress year, not everything.

   Water classification per image: VV (dB) -> linear -> focalMedian(30m) ->
   back to dB -> compare against the per-tank threshold image (built once via
   `fc.reduceToImage(['threshold_db'], ee.Reducer.first())`) -> AND slope<15deg
   mask (DEM reprojected to UTM 44N first — same fix as the tank-inventory
   slope bug, see below) -> `reduceRegions(reducer=sum, scale=20)` per tank ->
   pixel count. Area conversion uses a constant `scale^2` multiplier rather
   than `ee.Image.pixelArea()` (deliberate simplification for speed; negligible
   distortion at 14N and this AOI's size — note this as an assumption in the
   README, not a silently-made choice).

   STILL TO DO after extraction finishes: monthly aggregation (median across
   images in month, record n_obs, drop n_obs=0 months, never silently
   interpolate), S2 MNDWI calibration (per-tank or per-size-class ratio, R2/
   MAPE/bias by size class), the CHECKPOINT 1 report (S1 orbit + CHIRPS outputs
   already have their numbers above, ready to paste in; need the size
   histogram at the new 150ha cap — already generated as
   `cache/checkpoint1_map.png` — plus the S1-vs-S2 validation table and 10
   random tank series, which need the extraction + calibration done first).

## Bugs caught and fixed during this build (keep this list — evidence of
verification, referenced from the eventual README "we tested our own pipeline"
section)
1. **Constant slope bug**: first tank-inventory run computed `ee.Terrain.slope()`
   directly on the DEM in its native EPSG:4326 (degree) projection, producing
   an IDENTICAL slope value (0.131966 deg) for all 480 tanks — silently wrong,
   not an error. Fix: reproject DEM to UTM 44N before computing slope. Caught
   by manually inspecting `.describe()` output before trusting it; now also
   guarded by `tests/test_slope_qc.py` (regression test using a synthetic
   constant series, plus a real-data check on the actual inventory).
2. **DEM date-filter false alarm**: `COPERNICUS/DEM/GLO30` (later switched to
   the non-deprecated `GLO30_2024_1`) showed "0 images in AOI/period" in the
   asset-verification table because DEM tiles have no meaningful acquisition
   date and got wrongly date-filtered. Fixed by treating it as a static asset
   (bounds-only check, no date filter) — see `01_verify_assets.py`'s
   `time_series` flag per asset.
3. **JRC 2022-2024 false alarm**: `projects/JRC/GSW1_5/MonthlyHistory_2022_2024`
   showed 0 images in the date-filtered scope query because its images lack a
   `system:time_start` property (community/project asset, not standard
   EE-catalog metadata). Fixed by parsing the date from `system:index`
   (e.g. `..._2022_01` -> 2022-01) instead of guessing or giving up.
4. **CHIRPS "missing" day**: 3529 vs expected 3530 for the full period — turned
   out to be exactly one real missing day, 2026-08-31 (not yet published),
   confirmed by an exact missing-date diff, not assumed.
5. **"Too many concurrent aggregations"**: see Phase 1 section above — a real
   GEE quota wall discovered by testing, not a bug in our code, but changes
   how the extraction script is structured (batch size 10, hardcoded with
   justification).
6. **Frame-boundary false zeros**: see Phase 1 section above — treating each
   raw S1 image independently gave a spurious area=0 for tanks sitting just
   outside one of two same-day adjacent frames (11/292 distinct dates
   affected). Caught by spot-checking an individual tank's series (physically
   backwards seasonal pattern) BEFORE trusting the extraction, not by an
   automated test - a reminder that summary stats (e.g. "median=0 across all
   observations") can look plausible in aggregate while hiding a real bug in
   individual series. Fixed by mosaicking same-calendar-day images before
   classification. Whole Phase 1 output was regenerated from scratch after
   this fix, not patched in place.

## Open decisions / things NOT yet done (don't assume these are finished)
- non_rain_inflow flag is only half-built (canal-proximity done; the
  antecedent-rainfall-vs-area-gain half needs Phase 1 (done once extraction
  finishes) + Phase 2 (not started) data).
- OSM water-canal fetch (`cache/osm_water_canal_raw.json`) used Overpass API
  directly (`requests`, not a GEE asset) — needed a `User-Agent` header or
  Overpass returns 406; retries with backoff on 504s (Overpass's public
  instance is somewhat flaky under load, unrelated to our code).
- Phase 2 (rainfall/CHIRPS/SPI), Phase 3 (response metrics/H1-H3), Phase 4
  (validation), Phase 5 (dashboard), Phase 6 (docs/demo) are NOT started.
- GitHub Pages live-URL check is deliberately deferred to Phase 5 start, per
  user instruction — don't check/report on it before then unless asked.
- If this project moves to a different machine/VM: the ONLY blocking
  dependency to re-establish is Earth Engine auth (`earthengine authenticate`
  + the registered `rainfall-tank-analysis` GCP project must be accessible
  under whatever Google account runs there) and `pip install -r
  requirements.txt`. Everything else (git remote, cache/, config) travels with
  the repo. A GPU is NOT needed and doesn't speed up any step so far — every
  heavy computation runs server-side on Earth Engine, not locally.
