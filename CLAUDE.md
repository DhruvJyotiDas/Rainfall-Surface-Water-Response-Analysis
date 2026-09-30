# CLAUDE.md — working notes for this build

Project: GEOIMPATHON 1.0, Problem 2.4 (Rainfall–Surface Water Response Analysis).
Full spec lives in the original prompt; this file tracks state, decisions, and
open questions across the session so work can resume without re-deriving context.

## Ground rules (do not relitigate)
- Never fabricate numbers; every figure in README/dashboard traces to pipeline output.
- Cache all GEE results to disk (parquet/csv); reruns must be free.
- Verify every GEE asset ID with `ee.data.getAsset` before use.
- Deployed site (docs/) makes NO live GEE/API calls — fully static, <15 MB payload.
- Stop and ask at every CHECKPOINT in the spec. Do not self-approve past one.
- If something isn't run yet, say so — don't claim it works.

## Environment (as found 2026-09-30)
- OS: Windows 11. Shell: bash (git-bash) + PowerShell both available.
- Python: 3.11 requested by spec, NOT installed. Available: 3.12.x, 3.14.x (default).
  DECISION NEEDED: proceed on 3.14 (current default) or install 3.12/3.11?
  Currently using whatever `python`/`pip` resolve to (3.14) — flagged, unconfirmed.
- git 2.53 present, identity configured (DhruvJyotiDas / dhruvjyoti100@gmail.com).
- `gh` CLI: NOT installed. No automated way yet to create the GitHub repo / push
  Pages. DECISION NEEDED: install+auth gh, or user creates an empty public repo
  and hands over the remote URL / a PAT.
- Earth Engine: `earthengine-api` installed (1.7.46) but **NOT AUTHENTICATED**.
  `ee.Initialize()` raises EEException asking for `earthengine authenticate`.
  This blocks all of Phase 0 step 2 onward (asset verification, tank inventory,
  everything downstream). HARD STOP per spec — do not mock data.
  Exact fix: run `earthengine authenticate` in a terminal (opens browser OAuth),
  or in Python: `import ee; ee.Authenticate()`. Modern EE also requires a
  registered Google Cloud project passed to `ee.Initialize(project="...")`.
- Installed via pip this session: earthengine-api, pyyaml, geopandas 1.2.0,
  statsmodels 0.15.0, scikit-learn 1.8.0 (versions recorded in requirements.txt
  as actually resolved, not guessed).

## Repo layout (created)
```
config/config.yaml   — all tunables, draft AOI, unvalidated pending EE access
pipeline/             — numbered scripts 01..07 (not yet written)
tests/                — pytest suite for stats functions (not yet written)
docs/                 — GitHub Pages site root; docs/index.html placeholder pushed
docs/data/            — precomputed JSON/CSV for the static dashboard (empty)
docs/vendor/          — vendored Leaflet/Chart.js (not yet fetched)
cache/                — GEE result cache, parquet/csv (gitignored, kept locally)
requirements.txt      — pinned as actually installed
```

## AOI status
Draft only, NOT validated: bbox lon[77.20,77.80] lat[14.10,14.60] in Anantapur
district, Rayalaseema, AP (~3550 km2, within 2500-5000 km2 target). Chosen
because Anantapur is a well-documented rain-shadow tank-cascade region and is
explicitly not Chennai. Tank count >= 300 is UNVERIFIED — needs EE access
(JRC occurrence + Dynamic World water) to confirm before CHECKPOINT 0 closes.

## Status log (append, don't rewrite history)
- 2026-09-30: Phase 0 started. Repo skeleton + config/requirements committed.
  Blocked on EE auth (hard stop per spec) and GitHub repo creation (no gh CLI).
  Reported to user, awaiting decisions before continuing to asset verification
  and tank inventory.
- 2026-09-30: Decisions received —
  (1) EE auth: user will run `earthengine authenticate` themselves and report
      back when done (+ GCP project ID if one is required). Do not retry
      ee.Initialize() in a loop; wait for explicit confirmation.
  (2) GitHub repo: user will create an empty public repo on github.com and
      hand over the URL; I add it as `origin` and push (no gh CLI needed for
      this path — plain git push works fine once a remote exists).
  (3) Python: staying on the machine default (3.14.x), no separate venv pin.
      requirements.txt versions already match what's installed under 3.14.
  Currently idle on both EE and GitHub blockers — nothing to do until user
  returns with EE confirmation and/or the repo URL.
