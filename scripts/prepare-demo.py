"""Copy compact, recorded tank profiles into the offline frontend fixture.

Monthly curves and scenario responses are synthetic and generated deterministically
in src/data/demo.ts. This script never changes the scientific pipeline export.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
snapshot = json.loads((ROOT / "docs/data/tanks.json").read_text())
metrics = {row["tank_id"]: row for row in csv.DictReader((ROOT / "cache/response_metrics.csv").open())}
inventory = json.loads((ROOT / "cache/tank_inventory.geojson").read_text())
basins = {f["properties"]["tank_id"]: f["properties"]["hybas_id"] for f in inventory["features"]}
profiles = []
for tank in snapshot["tanks"]:
    row = metrics[tank["id"]]
    profiles.append({
        "id": tank["id"], "lat": tank["lat"], "lon": tank["lon"],
        "area": tank["area_ha"], "classification": tank["classification"],
        "frequency": tank["fill_frequency"], "recession": tank["recession_k"],
        "lag": tank["peak_lag_months"], "basin": str(basins[tank["id"]]),
        "hingeWins": row["hinge_wins"] == "True",
        "seasonalThreshold": tank["threshold_mm"],
        "regulated": tank["regulated_likely"], "slope": tank["slope_outlier"],
        "canal": tank["near_osm_canal"], "lowConfidence": tank["low_confidence"],
        "neighbors": tank["n_other_tanks_in_basin"],
    })
out = ROOT / "src/data"
out.mkdir(parents=True, exist_ok=True)
(out / "tank-seeds.json").write_text(json.dumps(profiles, separators=(",", ":")), encoding="utf-8")
(out / "study-summary.json").write_text((ROOT / "cache/phase3_hypothesis_results.json").read_text(), encoding="utf-8")
print(f"Prepared {len(profiles)} recorded profiles; demo series remain explicitly synthetic.")
