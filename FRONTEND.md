# Tanks in the Rain — frontend

A standalone, offline-capable React + TypeScript + Vite observatory for the
Anantapur rainfall–surface water study. The WebGL atmosphere is built with
Three.js; charts and the interactive map use SVG. No backend, credentials,
remote tiles, live API calls, or external font service are required at runtime.

## Run locally

Use Node.js 22.12+ (or another version supported by the installed Vite release).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. For a production preview:

```sh
npm run build
npm run preview
```

The build writes to `docs/`, preserving `docs/data/`, the original scientific
export, and other research artifacts. Relative asset paths support hosting
under the repository's GitHub Pages path. Serve the folder over HTTP rather
than opening `index.html` with `file://` (ES modules require HTTP).

## Interactions

- Five weather presets and AUTO, driven by the 120-month 2017–2026 scrubber.
- Play/pause cycles the timeline; playback wraps December 2026 to January 2017.
- A 0–500 mm/month scenario drives rain intensity, water area, map symbols,
  3D tank size/brightness, filling counts, anomaly, and inspector gauge.
- Moving the timeline or selecting AUTO clears the scenario. “Reset to month”
  restores that month's illustrative series without changing the selected tank.
- Four class chips allow multi-selection. Summary cards isolate one class.
- The map supports tank hover, selection, drag, zoom, reset and locate.
  Keyboard users can focus the first/selected dot, press Enter, and navigate
  with arrow keys. An accessible table provides sorting and pagination.
- Search by ID, choose a random visible tank, bookmark tanks for the current
  session, filter bookmarks, and return to the filtered district aggregate.
- Chart tooltips and a 24-month/full-record toggle; an amber point denotes the
  current scenario while cyan remains the underlying monthly demo series.
- CSV export contains only the visible cohort, its selected month, scenario
  flag, simulated rainfall/area, and recorded study metrics.
- The conceptual hinge/linear response lab and limitations accordion work
  entirely locally.

## Data provenance

`src/data/demo.ts` is the frontend data/model entry point. It combines the
470 recorded profiles in `tank-seeds.json` with deterministic synthetic
monthly curves. `study-summary.json` contains actual pipeline findings.
`scripts/prepare-demo.py` can regenerate the compact profile fixture from
the repository's original outputs; it does not rerun Earth Engine.

**Recorded:** tank IDs, coordinates, inventory area, classification, basin,
fill frequency, recession, lag, AIC winner, and QC flags. Classification
counts remain 284 fragile / 122 tracking / 59 non-responsive / 5 resilient.
H1 = 72/462, H2 = 91/470, and H3 placebo = 14/60 are preserved.
The findings section highlights 72 initial response signals, 91 threshold-model
candidates, and 50 validation shuffles as constructive next steps for this brief
study. Pre-registered expectations and statistical caveats remain in its
expandable study-scope details; these counts are not confirmation of H1/H2.

**Synthetic:** all 120 monthly curves, current area/filling counts, monthly
climatology and anomaly, demonstration robust maximum, scenario response,
and the conceptual hinge threshold. Monthly illustrative thresholds are
not the recorded seasonal thresholds and are not forecasts. Negative
recorded recession estimates remain in profile metrics; synthetic retention
uses a positive floor to avoid unphysical demo growth during drain-down.

The cohort's median recorded lag is calculated from its profiles (the full
inventory is 2 months), instead of hardcoding the prompt's illustrative
1-month value. Inventory counts and recorded metrics do not change when
rainfall is adjusted. They are not rainfall-dependent quantities.

2026 is held out of the study's fitted results. Its frontend curves, including
future months, are explicitly simulated. The original research's one-hour
deadline applies to the pipeline, not a claim about frontend build time.

## Graphics and accessibility

The scene uses one instanced tank mesh, GPU shader rain (14,000 streaks on
desktop, 3,000 on mobile/low), instanced ripples, terrain, colored glow and
camera movement. Pixel ratio is capped and drops on sustained slow frames.
Three.js loads separately from the interface. Motion can be paused in the
footer, low graphics can be selected, and OS reduced-motion preferences are
respected. Reduced motion redraws only when data or the viewport changes.
WebGL failure or context loss falls back to a CSS atmosphere; every dashboard
interaction continues to work. Exact frame rate depends on hardware.

Fonts are bundled from Fontsource with their package licenses. The site has
no runtime network dependency beyond its own static assets. GitHub links
are explicit outbound navigation.

## Verification

```sh
npm run build
npm test
```

The Playwright suite runs desktop Chrome and mobile Chromium emulation against
the production preview on port 4173, building and starting it when necessary.
If a preview is already running, run `npm run build` first to refresh it.
It uses the installed Chrome channel; install Chrome or change `channel`
in `playwright.config.ts` to use a locally installed Playwright browser.
Tests cover filtering, search, map and keyboard selection, table sorting,
bookmarks, threshold/non-response scenarios, weather/AUTO, timeline wrap,
CSV content, chart controls, science controls, responsive widths,
reduced-motion behavior, offline interactions, and WebGL context loss.

## Publish

The production output is ready for static hosting. For GitHub Pages, commit
the source and generated `docs/` output and use branch `main`, folder `/docs`
in repository Pages settings. This build does not push or publish changes
automatically.
