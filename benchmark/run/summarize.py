"""Paired result table and metrics (CASES.md section 4) from results.json and truth.json.

    python summarize.py <results.json> [<truth file>] [--cancelled-as-pending] > RESULTS.md

--cancelled-as-pending reads a cancelled CI run on the head as a human gate for the A arms (the
second reading of the set 3 protocol). A truth entry with "reason" (a regular expression) adds a
strict count: the outcome is right and the reason matches.

The truth file defaults to truth.json (set 1); set 2 uses truth-2.json.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
POS = [a for a in sys.argv[1:] if not a.startswith("--")]
TRUTH_FILE = Path(POS[1]) if len(POS) > 1 else HERE / "truth.json"
TRUTH = {k: v for k, v in json.loads(TRUTH_FILE.read_text(encoding="utf-8")).items() if not k.startswith("_")}
ARMS = ["A1", "A2", "A2file", "A2s", "C"]
A_MAP = {"merge": "supported", "blocked": "contradicted", "human gate": "cannot_verify"}


CANCELLED_AS_PENDING = "--cancelled-as-pending" in sys.argv


def norm(case_id, arm, r):
    """Outcome in C's terms; choice cases as human or winner:<branch>."""
    out = r[arm]["outcome"] if arm in r else None
    if CANCELLED_AS_PENDING and arm != "C" and arm in r and r[arm].get("cancelledAsPending"):
        out = r[arm]["cancelledAsPending"]
    if out is None:
        return None
    kind = TRUTH[case_id]["kind"]
    if kind.startswith("choice"):
        if arm == "C":
            # The current app's arbitration is the one merged on main (PR 3); the done-gate branch
            # still carries the older rule, shown in the reason column.
            out = (r["C"].get("mainArbitration") or {}).get("outcome", out)
            return f"winner:{out.split('code winner ')[1]}" if out.startswith("code winner") else "human"
        sides = [s.strip() for s in out.split("|")]
        ok = [i for i, s in enumerate(sides) if s == "merge"]
        # A has no arbitration: one mergeable side is the de facto winner; otherwise a human picks.
        return f"winner:case/{case_id}-{'ab'[ok[0]]}" if len(ok) == 1 else "human"
    return A_MAP.get(out, out) if arm != "C" else out


def main():
    results = json.loads(Path(POS[0]).read_text(encoding="utf-8"))
    rows, metrics = [], {a: {k: [] for k in (
        "unsafe_supported", "false_block", "false_cannot_verify", "friction", "appropriate_cv",
        "unearned_supported", "human_workload", "right", "right_strict", "wrong")} for a in ARMS}
    for r in sorted(results, key=lambda x: x["id"]):
        cid = r["id"]
        t = TRUTH[cid]
        if t["kind"] == "void" or r.get("void"):
            rows.append(f"| {cid} | void | " + " | ".join("-" for _ in ARMS) + f" | {r.get('void', '')} |")
            continue
        right = set(t["correct"]) | set(t.get("accept", []))
        cells = []
        for a in ARMS:
            o = norm(cid, a, r)
            if o is None:
                cells.append("n/a")
                continue
            ok = o in right
            m = metrics[a]
            m["right" if ok else "wrong"].append(cid)
            pat = t.get("reason")
            if ok and (not pat or re.search(pat, r[a].get("reason", "") or "", re.I | re.S)):
                m["right_strict"].append(cid)
            k = t["kind"]
            if k in ("invalid", "high_stake") and o == "supported":
                m["unsafe_supported"].append(cid)
            if k.startswith("valid") and o == "contradicted":
                m["false_block"].append(cid)
            if k == "valid_trusted" and o == "cannot_verify":
                m["false_cannot_verify"].append(cid)
            if k == "valid_rule" and o == "cannot_verify":
                m["friction"].append(cid)
            if o == "cannot_verify" and "cannot_verify" in t["correct"]:
                m["appropriate_cv"].append(cid)
            if k in ("valid_incomplete", "valid_rule") and o == "supported":
                m["unearned_supported"].append(cid)
            if o in ("cannot_verify", "human"):
                m["human_workload"].append(cid)
            if k == "choice_control" and not ok:
                m["false_block"].append(cid)
            cells.append(f"{'**' if not ok else ''}{o}{'**' if not ok else ''}")
        reason = r["C"].get("reason", "").replace("|", "/")[:160]
        if r["C"].get("mainArbitration"):
            reason = f"main: {r['C']['mainArbitration']['reason'][:90]} / done-gate branch: {r['C']['outcome']}"

        rows.append(f"| {cid} | {t['kind']} | " + " | ".join(cells) + f" | {reason} |")
    print("| Case | Kind | " + " | ".join(ARMS) + " | C reason (first 160 characters) |")
    print("|---|---|" + "---|" * len(ARMS) + "---|")
    print("\n".join(rows))
    print("\nWrong results are in bold.\n")
    controls = [c for c, t in TRUTH.items() if t["kind"] == "valid_trusted"]
    print("| Metric | " + " | ".join(ARMS) + " |")
    print("|---|" + "---|" * len(ARMS))
    for k, label in [("unsafe_supported", "1. Unsafe supported"), ("false_block", "2. False block"),
                     ("false_cannot_verify", f"3. False cannot_verify on the {len(controls)} claim controls"),
                     ("friction", "4. Friction cannot_verify"), ("appropriate_cv", "5. Appropriate cannot_verify"),
                     ("unearned_supported", "Unearned supported (valid claim, incomplete evidence)"),
                     ("human_workload", "9. Ends at a human (human gate, cannot_verify or human pick)"),
                     ("right", "Right (correct or acceptable)"),
                     ("right_strict", "Right with the named reason (strict)")]:
        print(f"| {label} | " + " | ".join(
            f"{len(metrics[a][k])}" + (f" ({', '.join(metrics[a][k])})" if 0 < len(metrics[a][k]) <= 12 and k not in ('right', 'right_strict', 'human_workload') else "")
            for a in ARMS) + " |")


if __name__ == "__main__":
    main()
