"""Build run/truth-4.json from CASES-4-INDEPENDENT.md by the matching rule of ARM-CD-PROTOCOL-4.md.

Each `Pattern:` alternative is plain text: escaped, white space runs match any white space, and
the alternatives are joined by `|`. A case with `Pattern: none` has no reason field.
"""

import json
import re
import sys
from pathlib import Path

CASES = Path(sys.argv[1] if len(sys.argv) > 1 else "CASES-4-INDEPENDENT.md")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "run/truth-4.json")
ARGUABLE = {"U07", "U12", "U16", "U18", "U24"}


def cells(line):
    # Split a table row at "|" that is not written "\|".
    parts = re.split(r"(?<!\\)\|", line.strip().strip("|"))
    return [p.strip() for p in parts]


def pattern_regex(text):
    alts = []
    for alt in re.split(r"\\\|", text):
        alt = alt.strip().strip("`").strip('"').strip()
        if not alt:
            continue
        alts.append(r"\s+".join(re.escape(w) for w in alt.split()))
    return "|".join(alts)


truth = {
    "_note": (
        f"Built by run/make_truth4.py from {CASES.name} (sha256 5dece1bb...) before any build or "
        "run. reason: the Pattern alternatives as plain text (ARM-CD-PROTOCOL-4.md). Arguable cases "
        "named by the lead: " + ", ".join(sorted(ARGUABLE)) + "."
    )
}
for line in CASES.read_text(encoding="utf-8").splitlines():
    if not re.match(r"\| U\d\d \|", line):
        continue
    c = cells(line)
    cid, cls, outcome_cell = c[0], c[1], c[6]
    m = re.search(r"Pattern:\s*(.*?)\.\s*Why:", outcome_cell)
    pat = m.group(1).strip() if m else "none"
    head = outcome_cell.split("Pattern:")[0]
    named = re.findall(r"`(supported|contradicted|cannot_verify)`", head)
    if cls == "control":
        entry = {"kind": "valid_trusted", "correct": ["supported"]}
    elif named[:2] == ["contradicted", "cannot_verify"]:
        entry = {"kind": "invalid", "correct": ["contradicted", "cannot_verify"]}
    elif named[0] == "cannot_verify":
        kind = "high_stake" if cls == "high-stake" else "valid_incomplete"
        entry = {"kind": kind, "correct": ["cannot_verify"]}
        if cid == "U12":
            entry["accept"] = ["contradicted"]
    else:
        raise SystemExit(f"{cid}: outcome not read: {head}")
    if pat.lower() != "none":
        entry["reason"] = pattern_regex(pat)
        entry["pattern"] = pat
        # Second reading (scorer change 19): the pattern as the writer's regular expression.
        rx = pat.replace("\\|", "|").replace("`", "")
        re.compile(rx)
        entry["reason_regex"] = rx
    if cid in ARGUABLE:
        entry["arguable"] = True
    truth[cid] = entry
assert len(truth) == 25, len(truth)
OUT.write_text(json.dumps(truth, indent=1) + "\n", encoding="utf-8")
print(f"{len(truth) - 1} cases")
