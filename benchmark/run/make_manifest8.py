"""Write run/manifests/bench-manifest-8.json from CASES-8-INDEPENDENT.md and the builder's mapping
(BUILD-8.md). Each AC of a row is one AC of the ticket, with the text cut from the row and the
check names of the row, exactly. Simulated Jira and GitHub data follow the case text, with the
fields of scorer changes 17 to 24. Y22 is not buildable (PREDICTIONS-8.md) and is void.

    cd benchmark && python run/make_manifest8.py
"""

import json
import re
from pathlib import Path

ROWS = {}
for line in Path("CASES-8-INDEPENDENT.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"\| (Y\d\d) \| [^|]+ \| (.*?) \| Domain:", line)
    if m:
        ROWS[m.group(1)] = m.group(2)
assert len(ROWS) == 24, len(ROWS)

VOID = {"Y22": ("not buildable: the scorer cannot serve the main report of a later merge of a different PR (PR B) "
                "after the merge of the linked PR A; it serves one PR per case"),
        # Found at the CI run, after the predictions (BUILD-8.md).
        "Y12": ("not buildable: base fact false; the bank's property tests (tests/test_ledger_properties.py) make deposits "
                "above 100,000,000 minor units, so the row's maximum makes three of them fail and CI is red, not green")}
CHECKS = {
    "Y01": [["test_customer_name_refuses_control_characters"]],
    "Y02": [["test_customer_list_has_a_display_name"]],
    "Y03": [["test_customer_list_can_be_searched"]],
    "Y04": [["test_service_time_returns_the_utc_date"]],
    "Y05": [["test_deposit_refuses_a_future_date"]],
    "Y06": [["test_customer_list_has_a_cache_header"]],
    "Y07": [["test_key_conflict_gives_409"]],
    "Y08": [["test_split_gives_the_remainder_to_the_first_parts"], ["test_split_refuses_bad_input"]],
    "Y09": [["test_value_date_is_the_next_working_day"]],
    "Y10": [["test_account_list_can_be_filtered_by_currency"], ["test_account_list_refuses_an_unknown_currency"]],
    "Y11": [["test_customer_list_has_a_total_count_header"]],
    "Y12": [["test_deposit_above_the_maximum_is_refused"]],
    "Y13": [["test_balance_of_one_account"]],
    "Y14": [["test_one_currency_can_be_read"]],
    # The product owner's last record: AC (1) with the added sentence and the two checks.
    "Y15": [["test_account_list_can_hide_empty_accounts", "test_account_list_refuses_an_unknown_only_value"]],
    "Y16": [["test_account_list_has_the_decimals"]],
    "Y17": [["test_stats_count_customers_and_accounts"]],
    "Y18": [["test_key_conflict_has_a_clear_detail"]],
    "Y19": [["test_cash_rounding_goes_to_the_nearest_five"], ["test_cash_rounding_refuses_bad_input"]],
    # The product owner's corrected record (T-3 h): the name with "counts".
    "Y20": [["test_stats_counts_accounts_by_currency"]],
    "Y21": [["test_new_key_is_32_hex_digits"]],
    "Y23": [["test_customer_list_has_account_currencies"]],
    "Y24": [["test_customer_list_can_be_filtered_by_initial"], ["test_customer_list_refuses_a_bad_initial"]],
}
STOPS = [" The PR ", " The product owner", " At `T", " *Simulated", " The stored spec", " *PR B*", " *PR A*", " *CI facts:*", " The head commit"]
CLAIMANT, OWNER, FINANCE = "acct-claimant", "acct-product-owner", "acct-finance-owner"
MONEY = "money_semantics"


def clean(text):
    return re.sub(r"\*\*|`", "", text).strip()


def ac_texts(row):
    m = re.search(r"(?:The AC is|records the AC in the app): (.*)", row)
    ac = m.group(1)
    cut = min([ac.find(s) for s in STOPS if ac.find(s) > 0] or [len(ac)])
    parts = [p for p in re.split(r"\(\d\) ", ac[:cut]) if p.strip()]
    return [clean(re.split(r"\s*Checks?(?:, as recorded at [^:]+)?: ", p)[0]) for p in parts]


cases = []
for i, (cid, row) in enumerate(sorted(ROWS.items()), 1):
    kind = re.match(r"\*\*(Bug|Story|Task):\*\*", row).group(1)
    summary = clean(row.split(":**", 1)[1].split(". ")[0]).rstrip(".") + "."
    ticket = {"key": f"BENCH-8{i:02d}", "type": kind, "labels": [], "text": summary, "acceptanceCriteria": []}
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
    if cid == "Y15":
        texts = [texts[0] + " A different value of only gives 422."]
    ticket["acceptanceCriteria"] = [
        {"acId": f"AC{n}", "text": t, "check": {"type": "test_passes", "args": names}}
        for n, (t, names) in enumerate(zip(texts, CHECKS[cid]), 1)
    ]
    # Default of the case file: the product owner recorded the AC in the app before the head.
    jira["acs"] = {"by": OWNER, "at": "T-3d", "acceptanceCriteria": json.loads(json.dumps(ticket["acceptanceCriteria"]))}
    if cid in ("Y03", "Y11"):
        github["titleWithoutKey"] = True
    if cid == "Y03":
        jira["prLink"] = {"by": OWNER, "at": "T-20h", "prNumber": "case",
                          "reason": "The first PR was closed. This PR is the work of this ticket."}
    if cid == "Y04":
        github["rateLimited"] = {"status": 429, "remaining": 0, "limit": 60, "used": 60, "resetAt": "2026-11-24T15:25:00Z",
                                 "message": "API rate limit exceeded"}
    if cid in ("Y06", "Y14"):
        github["mergeCommit"] = {"branch": f"merge/{cid}", "pushConclusion": "failure"}
    if cid == "Y07":
        jira["changes"] = [{"test": "tests/test_api.py::test_same_key_with_a_different_body_is_rejected", "by": OWNER, "at": "T-30h",
                            "reason": "The status of a key conflict changes by this ticket. 409 is the new requirement; the balance check stays."}]
    # Y08: at T the ticket has no label and no domain field (the claimant removed the label).
    # Scorer change 25 (after the set 8 results): the product owner's AC record kept the label
    # present at that time, and the changelog names the claimant's removal.
    if cid == "Y08":
        jira["acs"]["marks"] = [MONEY]
        jira["markRemoval"] = {"mark": MONEY, "by": CLAIMANT, "at": "T-50m"}
    if cid == "Y11":
        jira["prLink"] = {"by": CLAIMANT, "at": "T-1h", "prNumber": "case", "reason": "PR of my colleague for this ticket"}
    if cid == "Y12":
        ticket["labels"] = [MONEY]
        jira["signoff"] = {"by": OWNER, "at": "T-1h", "sha": "merge",
                           "reason": "1,000,000.00 in the major unit is the agreed maximum for one deposit; the test has the two sides of the limit"}
    if cid == "Y15":
        jira["acs"]["at"] = "T-2d"
    if cid == "Y16":
        github["mainPushRunAttempt"] = 2
    if cid == "Y17":
        github["pushRunInProgress"] = True
        github["otherPushRuns"] = [{"name": "pages build and deployment", "path": "dynamic/pages/pages-build-deployment",
                                    "status": "completed", "conclusion": "success"}]
    if cid == "Y19":
        ticket["domain"] = MONEY
        jira["signoff"] = {"by": FINANCE, "at": "T-90m", "sha": "merge", "reason": "approved", "noAuditEvent": True}
        jira["acs"]["marks"] = [MONEY]  # scorer change 25: the domain was set when the AC were recorded
    if cid == "Y20":
        jira["acs"]["at"] = "T-3h"
    if cid == "Y21":
        jira["acs"] = {"by": CLAIMANT, "at": "T-3d", "acceptanceCriteria": json.loads(json.dumps(ticket["acceptanceCriteria"]))}
    if cid == "Y23":
        github["reportCommentNote"] = "Checked by hand, all good."
    cases.append(case)
Path("run/manifests/bench-manifest-8.json").write_text(json.dumps(cases, indent=1) + "\n", encoding="utf-8")
for c in cases:
    acs = c["ticket"]["acceptanceCriteria"]
    print(c["id"], c["ticket"]["key"], c["ticket"]["type"], "VOID" if c["void"] else f"{len(acs)} AC", "|",
          " / ".join(a["text"][:60] for a in acs))
