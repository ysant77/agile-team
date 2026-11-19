"""Write run/manifests/bench-manifest-5.json from CASES-5-INDEPENDENT.md and the builder's mapping
(BUILD-5.md). The AC text is cut from the row. Simulated Jira and GitHub data follow the case text
and the lead's answers to the build questions (19 Nov); SCORER-CHANGES 21 serves them."""

import json
import re
from pathlib import Path

ROWS = {}
for line in Path("CASES-5-INDEPENDENT.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"\| (V\d\d) \| [^|]+ \| (.*?) \| Domain:", line)
    if m:
        ROWS[m.group(1)] = m.group(2)

# The tests of the AC check: the new tests that fail on base. A guard test that passes on base and
# on head (V03, V10, V16, V24) is not a reproduction, so it is not named (BUILD-5, choice 2).
TESTS = {
    "V01": ["test_session_refuses_ids_below_one"],
    "V02": ["test_customer_name_whitespace_is_collapsed"],
    "V03": ["test_to_minor_refuses_non_numbers_with_value_error"],
    "V04": ["test_reference_case_does_not_change_the_request"],
    "V05": ["test_statement_totals_split_credits_and_debits", "test_statement_totals_are_zero_without_lines"],
    "V06": ["test_reference_has_at_most_35_characters"],
    "V07": ["test_transfer_answers_503_while_the_database_is_locked"],
    "V08": ["test_currencies_are_listed"],
    "V09": ["test_statement_accepts_a_kind_filter"],
    "V10": ["test_idempotency_key_refuses_spaces_and_tabs"],
    "V11": ["test_find_account_returns_none_for_an_unknown_account"],
    "V12": ["test_session_cookie_expires_after_30_minutes"],
    "V13": ["test_group_rates_on_a_known_case", "test_group_rates_ignores_fraud_rows_and_empty_groups"],
    "V14": ["test_precision_at_threshold_is_recorded"],
    "V15": ["test_statement_with_only_a_from_date"],
    "V16": ["test_build_with_one_account_in_a_currency_completes"],
    "V17": ["test_a_key_is_still_known_after_47_hours"],
    "V18": ["test_debug_accounts_route_follows_the_flag"],
    "V19": ["test_transfer_inputs_have_length_limits"],
    "V20": ["test_money_orders_by_minor_units"],
    "V21": ["test_customer_list_has_account_counts"],
    "V22": None,
    "V23": ["test_blank_description_is_refused"],
    "V24": ["test_chf_has_two_decimals_and_tnd_three"],
}
STOPS = [" The PR ", " The product owner", " At `T", " *Simulated", " The stored spec"]
CLAIMANT, OWNER, REVIEWER = "acct-claimant", "acct-product-owner", "acct-reviewer"


def clean(text):
    return re.sub(r"\*\*|`", "", text).strip()


def ac_text(cid, row):
    m = re.search(r"(?:The AC is|records the AC [^:]*): (.*)", row)
    ac = m.group(1)
    cut = min([ac.find(s) for s in STOPS if ac.find(s) > 0] or [len(ac)])
    return clean(ac[:cut])


cases = []
for i, (cid, row) in enumerate(sorted(ROWS.items()), 1):
    kind = re.match(r"\*\*(Bug|Story|Task):\*\*", row).group(1)
    summary = clean(row.split(":**", 1)[1].split(". ")[0]).rstrip(".") + "."
    ac = ac_text(cid, row)
    crit = {"acId": "AC1", "text": ac}
    if TESTS[cid]:
        crit["check"] = {"type": "test_passes", "args": TESTS[cid]}
    ticket = {"key": f"BENCH-5{i:02d}", "type": kind, "labels": [], "text": summary, "acceptanceCriteria": [crit]}
    jira = {"claimant": CLAIMANT}
    github = {}
    if cid == "V06":
        # The product owner recorded both rules; the claimant removed AC 2 at T-2 h (the stored
        # property now holds only AC 1). No new audited record.
        jira["acs"] = {"by": OWNER, "at": "T-6d", "acceptanceCriteria": [dict(crit)]}
        ticket["acceptanceCriteria"] = [{**crit, "text": ac.split("; (2)")[0] + "."}]
    if cid == "V20":
        # One audited record by the claimant (first text), then the changed property (lead, Q3).
        jira["acs"] = {"by": CLAIMANT, "at": "T-4d", "acceptanceCriteria": [dict(crit)]}
        edited = ac.split("; (2)")[0] + "; (2) two amounts of different currencies are ordered by minor units, then by the currency code; no error is raised."
        ticket["acceptanceCriteria"] = [{**crit, "text": edited}]
    if cid == "V17":
        jira["acs"] = {"by": OWNER, "at": "T-5d", "acceptanceCriteria": [dict(crit)]}
        jira["changes"] = [{"test": "tests/test_idempotency.py::test_keys_expire_after_24_hours",
                            "reason": "AC 2 moves the expiry to 48 hours, so the 25-hour case of the old test cannot stay; 49 hours keeps the same check.",
                            "by": REVIEWER, "at": "T-4h"}]
    if cid == "V11":
        # The approved-removal entry only in the issue property, written by the claimant.
        ticket["approvedTestRemovals"] = [{"test": "tests/test_api.py::test_transfer_from_foreign_account_is_404",
                                           "reason": "duplicate of the route walker", "by": CLAIMANT}]
    if cid == "V24":
        ticket["domain"] = "money_semantics"
        ticket["text"] = summary + " The finance owner approves each change of the currency rules before it is done."
    if cid == "V15":
        github["reportCommentEdit"] = {"test": "tests/test_api.py::test_statement_with_only_a_from_date",
                                       "baseOutcome": "failed", "excType": "AssertionError"}
    if cid == "V21":
        github["mainPushedByPerson"] = {"test": "tests/test_api.py::test_customer_list_has_account_counts"}
    cases.append({"id": cid, "void": None, "branches": [f"case/{cid}"], "base": "bench-base", "claim": "done",
                  "ticket": ticket, "env": {"CI": "true"}, "github": github, "jira": jira})
Path("run/manifests/bench-manifest-5.json").write_text(json.dumps(cases, indent=1) + "\n", encoding="utf-8")
for c in cases:
    print(c["id"], c["ticket"]["key"], c["ticket"]["type"], "|", c["ticket"]["acceptanceCriteria"][0]["text"][:110])
