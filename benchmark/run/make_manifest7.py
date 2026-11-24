"""Write run/manifests/bench-manifest-7.json from CASES-7-INDEPENDENT.md and the builder's mapping
(BUILD-7.md). Each AC of a row is one AC of the ticket, with the text cut from the row and the
check names of the row, exactly. Simulated Jira and GitHub data follow the case text, with the
fields of scorer changes 17 to 23. X02 is not buildable (PREDICTIONS-7.md) and is void.

    cd benchmark && python run/make_manifest7.py <bench clone>
"""

import json
import re
import subprocess
import sys
from pathlib import Path

CLONE = Path(sys.argv[1]).resolve()
ROWS = {}
for line in Path("CASES-7-INDEPENDENT.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"\| (X\d\d) \| [^|]+ \| (.*?) \| Domain:", line)
    if m:
        ROWS[m.group(1)] = m.group(2)
assert len(ROWS) == 24, len(ROWS)

VOID = {
    "X02": ("not buildable: base fact false; on bank 165b689 the statement body already has opening_balance and "
            "closing_balance, so the row's test would not fail on base"),
}
# The checks of each AC, exactly as the row names them (AC order).
CHECKS = {
    "X01": [["test_customer_name_has_a_maximum_length"]],
    "X03": [["test_currency_list_has_each_supported_currency"]],
    "X04": [["test_statement_has_days_in_window"]],
    "X05": [["test_transfer_above_the_limit_is_refused"]],
    "X06": [["test_interest_quote_rounds_down"], ["test_interest_quote_refuses_bad_input"]],
    "X07": [["test_account_list_has_a_display_balance"]],
    "X08": [["test_idempotency_key_has_a_maximum_length"]],
    "X09": [["test_statement_refuses_a_future_to"]],
    "X10": [["test_statement_refuses_an_unknown_parameter"]],
    "X11": [["test_key_conflict_names_the_first_transfer"]],
    "X12": [["test_amount_check_returns_minor_units"],
            ["test_amount_check_refuses_too_many_decimals", "test_amount_check_refuses_an_unknown_currency"]],
    "X13": [["test_customer_list_has_initials"]],
    "X14": [["test_fx_quote_rounds_half_up"], ["test_fx_quote_refuses_bad_input"]],
    "X15": [["test_customer_list_can_be_ordered_by_name"]],
    "X16": [["test_customer_list_limit"]],
    "X17": [["test_statement_csv_has_date_amount_balance"]],  # as recorded by the product owner
    "X18": [["test_customer_list_has_account_count"]],
    "X19": [["test_statement_month_window"]],
    "X20": [["test_session_cookie_expires_after_8_hours"]],
    "X21": [["test_transfer_accepts_grouped_amounts_only"]],
    "X22": [["test_customer_list_has_an_etag"]],
    "X23": [["test_statement_lines_have_a_weekday"]],
    "X24": [["test_api_replies_have_the_version_header"]],
}
STOPS = [" The PR ", " The product owner", " At `T", " *Simulated", " The stored spec", " *PR A*", " *CI facts:*"]
CLAIMANT, OWNER, FINANCE = "acct-claimant", "acct-product-owner", "acct-finance-owner"
MONEY = "money_semantics"
# X04: the first three reads (the PR list, the PR, its files) are good; each later read gets 403.
FIRST_THREE_GOOD = r"^(?!.*/pulls(\?|/\d+(\?|$)|/\d+/files\?)).*$"


def clean(text):
    return re.sub(r"\*\*|`", "", text).strip()


def ac_texts(row):
    m = re.search(r"(?:The AC is|The AC, as last recorded, is|records the AC in the app): (.*)", row)
    ac = m.group(1)
    cut = min([ac.find(s) for s in STOPS if ac.find(s) > 0] or [len(ac)])
    parts = [p for p in re.split(r"\(\d\) ", ac[:cut]) if p.strip()]
    return [clean(re.split(r"\s*Checks?: ", p)[0]) for p in parts]


def rev(ref):
    return subprocess.run(["git", "rev-parse", ref], cwd=CLONE, check=True, capture_output=True, text=True).stdout.strip()


cases = []
for i, (cid, row) in enumerate(sorted(ROWS.items()), 1):
    kind = re.match(r"\*\*(Bug|Story|Task):\*\*", row).group(1)
    summary = clean(row.split(":**", 1)[1].split(". ")[0]).rstrip(".") + "."
    ticket = {"key": f"BENCH-7{i:02d}", "type": kind, "labels": [], "text": summary, "acceptanceCriteria": []}
    jira = {"claimant": CLAIMANT}
    github = {}
    case = {"id": cid, "void": None, "branches": [f"case/{cid}"], "base": "bench-base", "claim": "done",
            "ticket": ticket, "env": {"CI": "true"}, "github": github, "jira": jira}
    if cid in VOID:
        case["void"] = VOID[cid]
        cases.append(case)
        continue
    texts = ac_texts(row)
    assert len(texts) == len(CHECKS[cid]), (cid, texts)
    ticket["acceptanceCriteria"] = [
        {"acId": f"AC{n}", "text": t, "check": {"type": "test_passes", "args": names}}
        for n, (t, names) in enumerate(zip(texts, CHECKS[cid]), 1)
    ]
    # Default of the case file: the product owner recorded the AC in the app before the head.
    jira["acs"] = {"by": OWNER, "at": "T-3d", "acceptanceCriteria": json.loads(json.dumps(ticket["acceptanceCriteria"]))}
    if cid in ("X03", "X13", "X14", "X18"):
        github["titleWithoutKey"] = True
    if cid == "X03":
        jira["prLink"] = {"by": OWNER, "at": "T-20h", "prNumber": "case",
                          "reason": "This PR is the work of this ticket. It was opened before the ticket had a key."}
    if cid == "X04":
        github["rateLimited"] = {"remaining": 0, "resetAt": "2026-11-24T10:41:00Z", "message": "API rate limit exceeded",
                                 "pathPattern": FIRST_THREE_GOOD}
    if cid in ("X05", "X06", "X14"):
        ticket["domain"] = MONEY
    if cid == "X05":
        jira["signoff"] = {"by": FINANCE, "at": "T-1h", "sha": "merge",
                           "reason": "10,000.00 in the major unit is the agreed limit for one transfer; the test has the two sides of the limit"}
    # X06: the claimant's sign-off action is refused by the app (no done verdict yet, and the
    # claimant may not sign off), so no record exists; the colleague's Jira comment is not served.
    if cid == "X08":
        github["mergeCommit"] = {"branch": "merge/X08"}
    if cid == "X09":
        github["mergeCommit"] = {"branch": "merge/X09", "pushConclusion": "failure"}
    if cid == "X10":
        github["pushRunInProgress"] = True
    if cid == "X13":
        jira["prLink"] = {"by": CLAIMANT, "at": "T-1h", "prNumber": "case", "reason": "my PR for this ticket"}
    if cid == "X14":
        case["base"] = "case/X14-A"
        jira["prLink"] = [
            {"by": OWNER, "at": "T-2d", "prNumber": 999, "reason": "the rate table is the work of this ticket"},
            {"by": OWNER, "at": "T-3h", "prNumber": "case", "reason": "PR A was only the rate table. This PR is the quote and its rounding."},
        ]
        jira["signoff"] = {"by": FINANCE, "at": "T-30h", "sha": rev("case/X14-A"), "reason": "the two rates are the agreed rates"}
    if cid == "X16":
        jira["acs"]["at"] = "T-3d"  # the second record of the product owner, with the limit 100
    if cid == "X17":
        # The product owner's record (T-4 d) has the balance column; the claimant edited the
        # stored spec at T-40 min. No new record.
        jira["acs"]["at"] = "T-4d"
        edited = ticket["acceptanceCriteria"][0]["text"].replace("date,amount,balance", "date,amount").replace(" and the balance", "")
        assert edited != ticket["acceptanceCriteria"][0]["text"]
        ticket["acceptanceCriteria"] = [{"acId": "AC1", "text": edited,
                                         "check": {"type": "test_passes", "args": ["test_statement_csv_has_date_and_amount"]}}]
    if cid == "X21":
        ticket["labels"] = [MONEY]
    if cid == "X22":
        github["rateLimited"] = {"remaining": 4312, "retryAfterS": 60,
                                 "message": "You have exceeded a secondary rate limit. Please wait a few minutes before you try again."}
    if cid == "X23":
        github["pushRunInProgress"] = {"attempt": 2}
    cases.append(case)
Path("run/manifests/bench-manifest-7.json").write_text(json.dumps(cases, indent=1) + "\n", encoding="utf-8")
for c in cases:
    acs = c["ticket"]["acceptanceCriteria"]
    print(c["id"], c["ticket"]["key"], c["ticket"]["type"], "VOID" if c["void"] else f"{len(acs)} AC", "|",
          " / ".join(a["text"][:70] for a in acs))
