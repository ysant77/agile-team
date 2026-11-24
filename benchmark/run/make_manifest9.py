"""Write run/manifests/bench-manifest-9.json from CASES-9-INDEPENDENT.md and the builder's mapping
(BUILD-9.md). Each AC of a row is one AC of the ticket, with the text cut from the row and the
check names of the row, exactly. Simulated Jira and GitHub data follow the case text, with the
fields of scorer changes 17 to 26. No case is void before the build (PREDICTIONS-9.md).

    cd benchmark && python run/make_manifest9.py
"""

import json
import re
from pathlib import Path

ROWS = {}
for line in Path("CASES-9-INDEPENDENT.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"\| (Z\d\d) \| [^|]+ \| (.*?) \| Domain:", line)
    if m:
        ROWS[m.group(1)] = m.group(2)
assert len(ROWS) == 24, len(ROWS)

VOID = {}
CHECKS = {
    "Z01": [["test_customer_name_needs_a_letter"]],
    "Z02": [["test_customer_list_can_be_filtered_by_min_accounts"]],
    "Z03": [["test_customer_list_can_be_sorted_by_name"], ["test_customer_list_refuses_an_unknown_sort"]],
    "Z04": [["test_customer_list_has_name_words"]],
    "Z05": [["test_deposit_refuses_a_date_before_2000"]],
    "Z06": [["test_customer_list_has_name_lines"]],
    "Z07": [["test_account_number_check_tells_the_form"]],
    "Z08": [["test_share_is_rounded_half_up"], ["test_share_refuses_bad_input"]],
    "Z09": [["test_account_list_can_be_sorted_by_currency"]],
    "Z10": [["test_customer_name_refuses_two_spaces_in_a_row"]],
    "Z11": [["test_customer_list_has_the_position"]],
    "Z12": [["test_fee_is_rounded_up"], ["test_fee_refuses_bad_input"]],
    "Z13": [["test_customer_list_can_be_exported_as_csv"]],
    "Z14": [["test_account_list_has_a_balance_display"]],
    "Z15": [["test_customer_list_can_be_limited"]],
    "Z16": [["test_customer_list_has_initials"]],
    "Z17": [["test_customer_list_has_a_short_name"]],
    "Z18": [["test_customer_list_has_the_account_count"]],
    "Z19": [["test_interest_is_rounded_half_up"], ["test_interest_refuses_bad_input"]],
    "Z20": [["test_name_check_tells_the_reason"]],
    # AC (2) of Z21 is a manual check with no test: the app's check type "manual".
    "Z21": [["test_customer_list_can_be_filtered_by_has_account"], None],
    "Z22": [["test_customer_list_has_a_request_id"]],
    "Z23": [["test_customer_list_can_skip_the_first_customers"]],
    "Z24": [["test_stats_tell_the_longest_name"]],
}
STOPS = [" The PR ", " The product owner", " At `T", " *Simulated", " The stored spec", " *CI facts:*", " The head commit", " The ticket", " The PR branch"]
CLAIMANT, OWNER, FINANCE = "acct-claimant", "acct-product-owner", "acct-finance-owner"
MONEY = "money_semantics"
Z19_H1 = "a1728e8db5c4e44b66bf36338cc6704bf49ec0a6"  # the first commit of case/Z19 (h1/Z19), named by the finance owner's sign-off
Z21_MANUAL = "a load test by the team; the result goes into a comment on this ticket"


def clean(text):
    return re.sub(r"\*\*|`", "", text).strip()


def ac_texts(row):
    m = re.search(r"(?:The AC is|records the AC in the app|recorded two AC in the app\.): (.*)", row) or re.search(r"recorded two AC in the app\. (.*)", row)
    ac = m.group(1)
    cut = min([ac.find(s) for s in STOPS if ac.find(s) > 0] or [len(ac)])
    parts = [p for p in re.split(r"\(\d\) ", ac[:cut]) if p.strip()]
    return [clean(re.split(r"\s*Checks?: ", p)[0]) for p in parts]


cases = []
for i, (cid, row) in enumerate(sorted(ROWS.items()), 1):
    kind = re.match(r"\*\*(Bug|Story|Task):\*\*", row).group(1)
    summary = clean(row.split(":**", 1)[1].split(". ")[0]).rstrip(".") + "."
    ticket = {"key": f"BENCH-9{i:02d}", "type": kind, "labels": [], "text": summary, "acceptanceCriteria": []}
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
    if cid == "Z15":
        # The product owner's last record (T-2 d): the limit 50, the same check.
        assert "n is from 1 to 100" in texts[0]
        texts = [texts[0].replace("n is from 1 to 100", "n is from 1 to 50")]
    if cid == "Z18":
        # The claimant's record (T-2 h): the sentence about 0 is removed.
        assert "; a customer with no account has 0" in texts[0]
        texts = [texts[0].replace("; a customer with no account has 0", "")]
    acs = []
    for n, (t, names) in enumerate(zip(texts, CHECKS[cid]), 1):
        check = {"type": "test_passes", "args": names} if names else {"type": "manual", "args": [Z21_MANUAL]}
        acs.append({"acId": f"AC{n}", "text": t, "check": check})
    ticket["acceptanceCriteria"] = acs
    # Default of the case file: the product owner recorded the AC in the app before the head.
    jira["acs"] = {"by": OWNER, "at": "T-3d", "acceptanceCriteria": json.loads(json.dumps(acs))}
    if cid in ("Z03", "Z09"):
        github["mergeCommit"] = {"branch": f"merge/{cid}"}
    if cid == "Z06":
        github["mergeCommit"] = {"branch": "merge/Z06", "pushConclusion": "failure"}
    if cid == "Z04":
        github["rateLimited"] = {"remaining": 4873, "limit": 5000, "used": 127, "retryAfterS": 600,
                                 "message": "You have exceeded a secondary rate limit. Please wait a few minutes before you try again."}
    # Z08 and Z14: the label was on the work item when the product owner recorded the AC (the
    # record keeps it, scorer change 25); at T the ticket has no label; the changelog names who
    # removed it.
    if cid == "Z08":
        jira["acs"].update({"at": "T-5d", "marks": [MONEY]})
        jira["markRemoval"] = {"mark": MONEY, "by": CLAIMANT, "at": "T-45m"}
    if cid == "Z14":
        jira["acs"].update({"at": "T-6d", "marks": [MONEY]})
        jira["markRemoval"] = {"mark": MONEY, "by": OWNER, "at": "T-20h"}
    if cid == "Z11":
        jira["prLink"] = {"by": CLAIMANT, "at": "T-2h", "prNumber": "case", "reason": "my PR for this ticket"}
    if cid == "Z12":
        ticket["labels"] = [MONEY]
        jira["acs"].update({"at": "T-5d", "marks": [MONEY]})
        jira["signoff"] = {"by": FINANCE, "at": "T-2h", "sha": "merge",
                           "reason": "1.5 percent, rounded up to the next minor unit, is the agreed fee; the test has the exact case, the rounded case and the two kinds of currency"}
    if cid == "Z15":
        jira["acs"]["at"] = "T-2d"
    if cid == "Z16":
        jira["acs"]["at"] = "T-4d"
    if cid == "Z17":
        github["pushRunInProgress"] = {"attempt": 2}
    if cid == "Z18":
        jira["acs"] = {"by": CLAIMANT, "at": "T-2h", "acceptanceCriteria": json.loads(json.dumps(acs))}
    if cid == "Z19":
        ticket["domain"] = MONEY
        jira["acs"].update({"at": "T-6d", "marks": [MONEY]})
        jira["signoff"] = {"by": FINANCE, "at": "T-3d", "sha": Z19_H1, "reason": "Formula and tests read; the rule is as agreed."}
    if cid == "Z22":
        # No run on the merge commit ([skip ci]); main.json stays the report of the commit before M.
        github["mergeCommit"] = {}
    if cid == "Z23":
        github["reportForCommit"] = "h1/Z23"
        github["headRunWithoutReport"] = True
    if cid == "Z24":
        github["noCoverageBlock"] = True
    cases.append(case)
Path("run/manifests/bench-manifest-9.json").write_text(json.dumps(cases, indent=1) + "\n", encoding="utf-8")
for c in cases:
    acs = c["ticket"]["acceptanceCriteria"]
    print(c["id"], c["ticket"]["key"], c["ticket"]["type"], "VOID" if c["void"] else f"{len(acs)} AC", "|",
          " / ".join(a["text"][:50] for a in acs))
