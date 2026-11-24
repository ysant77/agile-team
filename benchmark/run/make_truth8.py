"""Build run/truth-8.json from CASES-8-INDEPENDENT.md by the rules of PROTOCOL-5.md.

- Correct outcome: the outcome that the row names first. Accepted alternatives: an outcome that
  the row states as accepted ("`contradicted` is accepted").
- Each `Pattern:` alternative is plain text, as in set 4: escaped, white space runs match any
  white space, alternatives joined by `|`. A case with `Pattern: none` has no reason field.
- The class is read from the row (its first word), never set by the builder.
- Arguable cases: those the author names in the case file.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

CASES = Path(sys.argv[1] if len(sys.argv) > 1 else "CASES-8-INDEPENDENT.md")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "run/truth-8.json")
SHA256 = "c91973e3752dd48f82bcb680ef0bab684527b2f8bc10d838bad68a6df605b75b"
ARGUABLE = {"Y21", "Y22", "Y23"}  # "Cases that the author states as arguable"

text = CASES.read_bytes()
if hashlib.sha256(text).hexdigest() != SHA256:
    raise SystemExit("the case file is not the frozen one")


def cells(line):
    # Split a table row at "|" that is not written "\|".
    parts = re.split(r"(?<!\\)\|", line.strip().strip("|"))
    return [p.strip() for p in parts]


def pattern_regex(pattern):
    alts = []
    for alt in re.split(r"\\\|", pattern):
        alt = alt.strip().strip("`").strip('"').strip()
        if alt:
            alts.append(r"\s+".join(re.escape(w) for w in alt.split()))
    return "|".join(alts)


truth = {
    "_note": (
        f"Built by run/make_truth8.py from {CASES.name} (sha256 {SHA256[:8]}...{SHA256[-4:]}) before "
        "any build or run. reason: the Pattern alternatives as plain text (PROTOCOL-5.md, as set 4). "
        "class: the first word of the Class column. No second (regex) reading: the case file states plain text. Arguable cases named by the author: "
        + ", ".join(sorted(ARGUABLE)) + "."
    )
}
for line in text.decode("utf-8").splitlines():
    if not re.match(r"\| Y\d\d \|", line):
        continue
    c = cells(line)
    cid, cls_cell, outcome_cell = c[0], c[1], c[6]
    cls = cls_cell.split()[0]
    m = re.search(r"Pattern:\s*(.*?)\.\s*Why:", outcome_cell)
    pat = m.group(1).strip() if m else "none"
    head = outcome_cell.split("Pattern:")[0]
    named = re.findall(r"`(supported|contradicted|cannot_verify)`", head)
    accepted = re.findall(r"`(supported|contradicted|cannot_verify)` is accepted", head)
    if cls == "control":
        entry = {"kind": "valid_trusted", "correct": ["supported"]}
    elif named[0] == "supported":
        # A row whose class is not control but whose correct outcome is supported is a control by
        # the definition of PROTOCOL-5 ("Scoring"). Set 8 has no such row.
        entry = {"kind": "valid_trusted", "correct": ["supported"]}
    elif named[:2] == ["contradicted", "cannot_verify"]:
        entry = {"kind": "invalid", "correct": ["contradicted", "cannot_verify"]}
    elif named[0] == "cannot_verify":
        kind = "high_stake" if cls == "high-stake" else "valid_incomplete"
        entry = {"kind": kind, "correct": ["cannot_verify"]}
        if accepted:
            entry["accept"] = sorted(set(accepted))
    else:
        raise SystemExit(f"{cid}: outcome not read: {head}")
    entry["class"] = cls
    if pat.lower() != "none":
        entry["reason"] = pattern_regex(pat)
        entry["pattern"] = pat
        # No second reading (scorer change 19): the set 8 file states that each alternative is
        # plain text, and one alternative ("display(") is not a valid regular expression.
    if cid in ARGUABLE:
        entry["arguable"] = True
    truth[cid] = entry
assert len(truth) == 25, len(truth)
OUT.write_text(json.dumps(truth, indent=1) + "\n", encoding="utf-8")
print(f"{len(truth) - 1} cases")
