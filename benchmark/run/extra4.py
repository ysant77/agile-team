"""Set 4 extra tables (ARM-CD-PROTOCOL-4.md): strict count by the second reading (reason_regex,
scorer change 19), and every count without the arguable cases."""

import json
import re
import sys

res = json.load(open(sys.argv[1]))
truth = json.load(open(sys.argv[2]))
rows = res["results"] if isinstance(res, dict) else res
ARMS = [a for a in ("A1", "A2", "C", "D") if any(a in r for r in rows)]
VERB = {"merge": "supported", "human gate": "cannot_verify", "blocked": "contradicted"}


def outcome(r, a):
    o = r[a].get("outcome") if isinstance(r[a], dict) else r[a]
    return VERB.get(o, o)


def reason(r, a):
    return (r[a].get("reason", "") if isinstance(r[a], dict) else r.get(f"{a}reason", "")) or ""


for label, keep in (("all 24 cases", lambda t: True), ("without the arguable cases", lambda t: not t.get("arguable"))):
    print(f"\n### {label}\n")
    print("| Count | " + " | ".join(ARMS) + " |")
    print("|---|" + "---|" * len(ARMS))
    for name, test in (
        ("Right", lambda r, a, t: outcome(r, a) in t["correct"] + t.get("accept", [])),
        ("Strict, primary (plain text)", lambda r, a, t: outcome(r, a) in t["correct"] + t.get("accept", []) and (not t.get("reason") or re.search(t["reason"], reason(r, a), re.I | re.S))),
        ("Strict, second reading (regex)", lambda r, a, t: outcome(r, a) in t["correct"] + t.get("accept", []) and (not t.get("reason_regex") or re.search(t["reason_regex"], reason(r, a), re.I | re.S))),
        ("Supported on a case that is not a control", lambda r, a, t: "supported" not in t["correct"] and outcome(r, a) == "supported"),
        ("Control not supported", lambda r, a, t: t["kind"] == "valid_trusted" and outcome(r, a) != "supported"),
    ):
        cells = []
        for a in ARMS:
            ids = [r["id"] for r in rows if r["id"] in truth and keep(truth[r["id"]]) and test(r, a, truth[r["id"]])]
            cells.append(f"{len(ids)}" + (f" ({', '.join(ids)})" if name not in ("Right",) and not name.startswith("Strict") else ""))
        n = sum(1 for r in rows if r["id"] in truth and keep(truth[r["id"]]))
        print(f"| {name} (of {n}) | " + " | ".join(cells) + " |")
