# Tanks in the Rain — live demo script

**Length:** approximately 4 minutes. **Local website:** http://127.0.0.1:4173/

The local production preview is already running during this session. Open the
URL and start at the top of the page. This is a presentation walkthrough;
the optional terminal commands at the end restart the website later.

## Before presenting

- Use a desktop browser at 100% zoom. Close unrelated tabs if graphics feel slow.
- Start with Peak storm and the complete 470-tank inventory.
- All monthly curves and rainfall scenarios are demonstrations; tank locations,
  classifications, profile metrics, and study findings come from recorded outputs.
- If your system uses reduced motion, the atmosphere stays static while controls
  still work. The footer also offers a motion toggle and low graphics mode.

## 0:00–0:25 · Introduce the landscape

**Do:** Show the hero, then click **Enter the observatory**.

**Say:** “This is Tanks in the Rain. It explores a simple question: when the
monsoon arrives, which irrigation tanks answer? We study 470 rain-fed tanks in
Anantapur, using satellite radar and rainfall records across nine fitted
monsoon seasons.”

## 0:25–0:55 · Let the weather tell the story

**Do:** Switch **Dry → Peak storm**. Point to the rain, map, filling count,
and water-response gauge.

**Say:** “The atmosphere responds to the dashboard's rainfall context. As I
change the weather, the rain and the simulated tank water levels respond
together. The landscape is also an interactive view of the data.”

## 0:55–1:45 · Demonstrate the threshold

**Do:** Click the **Threshold fragile** summary card. Search for `tank_0002`
and click its single map dot. Move **Scenario rainfall** from **0 → 100 →
400 mm/month**. Watch the inspector gauge and amber scenario marker.

**Say:** “Here is one tank from the fragile group. In this educational model,
a little rain produces very little filling. As rainfall crosses the demo
threshold, its water area rises. This makes the fill-and-spill idea tangible.
The curve illustrates the hypothesis; it is not a forecast for this real tank.”

## 1:45–2:25 · Sweep through the monsoon

**Do:** Clear the search, press **Reset** beneath the map, and return to
**district aggregate**. Select **AUTO**. Scrub through April, June, September,
and November of one year. Press **Play**, let a few months advance, then **Pause**.

**Say:** “AUTO ties the weather to the selected month. We move from a dry
landscape through monsoon onset and peak rainfall, then into recession.
The timeline spans January 2017 to December 2026, using reproducible demo
curves. The fitted research results use 2017–2025; 2026 is held out.”

## 2:25–2:55 · Inspect and export

**Do:** Switch to **Table** view, sort by **Area (ha)**, and select a row.
Optionally bookmark it. Click **Export data**.

**Say:** “We can move from the district view to a single tank, inspect its
recorded fill frequency, lag, and recession metric, and export the current
selection. The CSV keeps recorded metrics and simulated scenario values
explicitly labeled.”

## 2:55–3:25 · Explain the mechanism

**Do:** Scroll to **Beneath the surface**. Toggle **Hinge / Linear** and move
**Test the idea** from low to high rainfall.

**Say:** “A linear model assumes a steady response. A hinge model allows a
threshold before filling accelerates. This conceptual visualizer explains
the mechanism the study investigated. Below it is the reproducible pipeline
from inventory and radar measurements to classification.”

## 3:25–4:00 · Close with constructive findings

**Do:** Scroll to **Early signals. A foundation to build on.** Briefly open
**Limitations, stated plainly** if the audience asks about validation.

**Say:** “The initial study identifies 72 tanks with rainfall-response signals
and 91 candidates where a threshold model fits better. Fifty validation
shuffles also reveal how the next analysis can improve its statistical
controls. These are useful starting points for deeper investigation.

“The goal of this demo is to turn satellite hydrology into something people
can see, explore, and question — one tank, one monsoon, and one shared sky.”

## Common audience questions

| Question | Suggested answer |
|---|---|
| Is this live satellite data? | The demo runs locally from bundled data. Tank profiles and findings are recorded; monthly curves and scenarios are synthetic. |
| Did the initial hypotheses pass? | H1/H2 did not meet their pre-registered expectations. The site highlights observed signals and follow-up candidates, with the criteria available in the details. |
| Does the slider predict a real tank? | It illustrates response behavior. It is not a calibrated operational forecast. |
| Why 9 seasons but a 2017–2026 timeline? | Fitting uses the nine seasons from 2017–2025. The demo also includes a simulated 2026 context. |
| Does it need a backend or Earth Engine login? | The website runs entirely from static files. Earth Engine access is needed only to rerun the scientific extraction pipeline. |

## Restart locally later

From the cloned repository, run these commands only if the preview has stopped:

```sh
npm ci
npm run build
npm run preview -- --port 4173 --strictPort
```

Open http://127.0.0.1:4173/. Keep the terminal running. On Windows, use
`npm.cmd` in place of `npm` if PowerShell blocks the npm script.

For development with automatic reloads, use `npm run dev` and open
http://127.0.0.1:5173/ instead.
