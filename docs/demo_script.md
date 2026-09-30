# Demo script (2-3 minutes)

**Note**: this build was completed under a hard 1-hour deadline (see
README limitations). The demo is honest about what's real vs. cut.

---

**0:00-0:15 — Problem**
"Small rain-fed irrigation tanks across semi-arid India are the backbone of
local water security, but nobody tracks which ones are actually vulnerable
to failing in a dry year. We built a pipeline that watches 470 tanks in
Anantapur, Andhra Pradesh, from space over 10 years, and asks: does this
tank fill in a simple straight line with rainfall, or does it need a
threshold amount before it spills — and which tanks are close to that edge?"

**0:15-0:45 — Method**
"We fused JRC surface water history, Dynamic World, and OpenStreetMap to
find 470 candidate tanks, then pulled Sentinel-1 radar imagery — 303 images,
2017 to 2026 — through a per-tank calibrated water classifier to build a
water-area time series for every tank. We paired that with CHIRPS rainfall
at each tank's own location. For each tank we fit two models — does area
respond linearly to rainfall, or is there a hinge, a threshold it needs to
cross before it fills — and picked the better one by AIC."

**0:45-1:30 — One tank's story**
[Open the dashboard, click a `threshold_limited_fragile` tank]
"This tank sits at about [X] hectares. Its fill-frequency is only [Y]% —
in less than half the monsoon seasons since 2017 did it fill to even half
its historical max. Its hinge model shows it needs roughly [threshold_mm]mm
of seasonal rain before area really responds — below that, adding rain does
almost nothing. That's the fill-and-spill signature the thesis predicted."

**1:30-2:00 — Honesty**
"We caught two real bugs while building this — a DEM projection bug that
gave every tank an identical slope value, and a Sentinel-1 frame-boundary
bug that made tanks near a scene edge falsely read as bone-dry. Both are
documented and fixed in the repo, not glossed over. And because we had one
hour, not six, we cut real things: no bootstrap confidence intervals, a
rainfall anomaly instead of true SPI, and our significance tests don't yet
correct for the fact that many tanks share the same 5km CHIRPS rainfall
pixel. That's in the README, not hidden."

**2:00-2:30 — Decision use**
"The ranked table sorts by fill-frequency — the tanks most often failing to
fill are the ones a desilting or feeder-channel repair program should look
at first. This is explicitly a screening tool, not a verdict — every number
traces back to a cached pipeline run you can re-check yourself."

---

## Numbers to have on screen (pull from `cache/phase3_hypothesis_results.json`)
- Total tanks: 470
- H1 (rainfall lag significance): see `H1_frac_significant_lag_0_2`
- H2 (hinge beats linear): see `H2_frac_hinge_wins`
- Classification counts: see `classification_counts`
