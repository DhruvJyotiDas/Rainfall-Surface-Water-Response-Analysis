# Rainfall–Surface Water Response Analysis

GEOIMPATHON 1.0, Problem 2.4. **Status: Phase 0, blocked on Earth Engine
authentication — no pipeline has run yet, nothing below is a result.**

This README will be filled in as each phase produces real output (see
`CLAUDE.md` for the live status log). Placeholder sections below will be
replaced with actual figures, tables, and equations — never fabricated ahead
of the pipeline run.

## Problem & thesis

Small rain-fed tanks in semi-arid India fill in a threshold (fill-and-spill)
manner rather than linearly with rainfall. This project estimates, per tank:
the rainfall needed to fill it, the probability of fill-failure in a deficit
year, the post-monsoon recession rate, and the rainfall-to-area response lag
— then classifies and ranks tanks by vulnerability, with uncertainty.

## Pre-registered hypotheses

- **H1**: ≥50% of tanks show significant positive response at lag 0–2 months
  after deseasonalization/prewhitening. *(not yet tested)*
- **H2**: a hinge (piecewise-linear) model beats a linear model by AIC in most
  tanks. *(not yet tested)*
- **H3**: placebo tests (shuffled years, negative lags) show no significant
  response. *(not yet tested)*

## Data sources

| Asset | Purpose | Status |
|---|---|---|
| COPERNICUS/S1_GRD | Water extent (VV backscatter) | not verified — EE auth pending |
| COPERNICUS/S2_SR_HARMONIZED | S1 calibration (MNDWI) | not verified |
| UCSB-CHG/CHIRPS/DAILY | Rainfall | not verified |
| JRC/GSW1_4/GlobalSurfaceWater, MonthlyHistory | Tank inventory seed, validation | not verified |
| WWF/HydroSHEDS/v1/Basins/hybas_12 | Basin clustering (pseudo-replication) | not verified |
| GOOGLE/DYNAMICWORLD/V1 | Water class, land-cover flags | not verified |
| ESA/WorldCover/v200 | Land-cover flags | not verified |
| COPERNICUS/DEM/GLO30 | Slope masking | not verified |

## Assumptions (running list)

- AOI draft: ~3550 km2 window in Anantapur district, Rayalaseema, AP —
  **unvalidated tank count**, pending EE access.
- Python 3.11 requested by original spec; environment has 3.12/3.14, not 3.11
  — unresolved, see CLAUDE.md.

## Limitations (mandatory, will expand)

- CHIRPS is ~5 km resolution; small tanks share pixels (pseudo-replication —
  handled via pixel-clustered resampling, not yet implemented).
- Sentinel-1 sensitive to wind roughening (underestimates area) and aquatic
  vegetation (either direction).
- S1B ended Dec 2021 — sampling density drops after that; robustness check
  planned, not yet run.
- No in-situ tank gauge data — validation is satellite-vs-satellite only
  (JRC, Global Water Watch overlap).
- No pipeline has executed yet as of this commit.

## Reproduction

Not yet runnable end-to-end — see CLAUDE.md status log for current blockers.
