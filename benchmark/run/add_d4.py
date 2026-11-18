"""Add arm D of set 4 to the results file (ARM-CD-PROTOCOL-4.md).

D is the worst-of-three outcome that arm_d.mjs gives. Its reason is the text of the model's
blocking findings of the runs that gave cannot_verify, or the reason of C when D equals C.

Usage: python run/add_d4.py <results-acd.json> <arm-d dir> <out.json>
"""

import json
import sys
from pathlib import Path

res = json.load(open(sys.argv[1]))
rows = res["results"] if isinstance(res, dict) else res
ddir = Path(sys.argv[2])
armd = {r["id"]: r for r in json.load(open(ddir / "arm-d.json"))["results"]}

for row in rows:
    d = armd[row["id"]]
    texts = []
    for run in d["runs"]:
        rec = json.load(open(ddir / f"{row['id']}-run{run['run']}.json"))
        if rec["D"] == "cannot_verify":
            for f in rec["blocking"]:
                t = f"{f['ac']} {f['file']}:{f['line']}: {f['text']}"
                if t not in texts:
                    texts.append(t)
    if d["D"] == row["C"]["outcome"]:
        reason = row["C"].get("reason", "")
    else:
        reason = "reviewer: " + " | ".join(texts)
    row["D"] = {"outcome": d["D"], "reason": reason,
                "runs": [{"run": r["run"], "D": r["D"], "review": r["review"], "guard": r["guard"]} for r in d["runs"]]}

json.dump(res, open(sys.argv[3], "w"), indent=1)
open(sys.argv[3], "a").write("\n")
