# Frontend verification — 30 September 2026

- Production TypeScript check and Vite build: passed.
- Playwright: all 12 desktop/mobile tests passed against the production preview.
- Production smoke test: 470 tanks, WebGL initialization, tank selection,
  scenario fill, and bundled font loading passed. No external requests,
  failed assets, JavaScript errors, or graphics shader errors were reported.
- Responsive layout checked at widths 320, 390, 768, and 1440 pixels.
- Desktop and mobile screenshots reviewed for hero, dashboard, science,
  and findings. Gauge percentage wrapping was corrected and rechecked.
- Reduced motion, keyboard tank navigation, offline interactions, empty
  search, export contents, and WebGL context-loss fallback were exercised.
- Weather presets, AUTO seasonal transitions, playback wraparound,
  scenario reset, class filters, bookmarks, table sorting/pagination,
  fragile thresholds, and non-responsive tanks were exercised.
- `git diff --check`: passed (Git emitted only its LF/CRLF conversion notices).
- No changes to `pipeline/`, `config/`, `cache/`, or `docs/data/`.
- Static ZIP checked for its entry point, compiled assets, font licenses,
  and the retained scientific dataset.
- Findings reframed around recorded counts (72 response signals, 91 model
  candidates, 50 validation shuffles). Rebuilt successfully; affected desktop
  and mobile checks and the production smoke test passed again, and revised
  findings screenshots were reviewed. Scientific caveats remain expandable.

The build emits an informational size warning for the separately loaded
Three.js bundle (~538 KB minified / 133 KB gzip). A sustained 60 FPS rate
has not been certified across hardware. Tests used installed Chrome and
mobile Chromium emulation, not physical iOS/Android devices.

The frontend remains a clearly labeled demo. No backend or live-data service
was added. Source and compiled assets are included together for repository publishing.

## Reproduce

```sh
npm ci
npm run build
npm test
```

For the separate production smoke test, keep `npm run preview` running and run:

```sh
node scripts/verify-production.mjs
```

See [FRONTEND.md](FRONTEND.md) for data provenance and deployment instructions.
