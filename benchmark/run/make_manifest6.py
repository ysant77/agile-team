"""Write run/manifests/bench-manifest-6.json from CASES-6-INDEPENDENT.md and the builder's mapping
(BUILD-6.md). Each AC of a row is one AC of the ticket, with the text cut from the row and the
check names of the row, exactly. Simulated Jira and GitHub data follow the case text, within what
the scorer serves today (SCORER-CHANGES 17, 20, 21); no scorer change is made for set 6. The seven
cases that are not buildable are void, with the reason (PREDICTIONS-6.md)."""

import json
import re
from pathlib import Path

ROWS = {}
for line in Path("CASES-6-INDEPENDENT.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"\| (W\d\d) \| [^|]+ \| (.*?) \| Domain:", line)
    if m:
        ROWS[m.group(1)] = m.group(2)
assert len(ROWS) == 24, len(ROWS)

VOID = {
    "W01": "not buildable: base fact false; the base already has end_session (DELETE /api/session gives 204)",
    "W11": "not buildable: base fact false; the base already has read_session (GET /api/session gives 401 with no session)",
    "W04": "not buildable: the scorer cannot answer each request with 403 and the rate-limit headers",
    "W15": "not buildable: the scorer serves the report commit as the merge commit and its report as the main report",
    "W24": "not buildable: the scorer cannot serve a push run in progress and a main report for an older merge commit",
    "W08": "not buildable: the scorer has no audited sign-off, and the app refuses a sign-off by the claimant",
    "W17": "not buildable: the scorer has no audited sign-off for the product owner's sign-off of the merge commit",
    # Found at the build, after the predictions (BUILD-6, build disputes).
    "W12": ("not buildable: CI is red on the head, not green; the bank test test_scenario_templates.py (S17) runs "
            "every test of tests/test_fraud_model.py on seeded code, where 686 holdout rows are flagged, so the row's "
            "fixed count 827 fails there"),
}
# The checks of each AC, exactly as the row names them (AC order).
CHECKS = {
    "W02": [["test_customer_search_matches_without_case"], ["test_customer_search_refuses_short_queries"], ["test_customer_search_treats_wildcards_as_text"]],
    "W03": [["test_statement_limit_returns_the_first_lines", "test_statement_reports_total_lines"], ["test_statement_offset_skips_lines", "test_statement_paging_refuses_bad_values"]],
    "W05": [["test_key_conflict_answers_409"], ["test_key_conflict_answers_409"]],
    "W06": [["test_transfer_reply_has_a_receipt"], ["test_receipts_are_different_for_each_transfer"]],
    "W07": [["test_statement_window_has_a_maximum_length"]],
    "W09": [["test_account_list_filters_by_currency"], ["test_account_list_refuses_an_unknown_currency"]],
    "W10": [["test_local_frontend_origin_is_allowed"]],
    "W12": [["test_flag_rate_is_recorded"]],
    "W13": [["test_purge_removes_only_expired_keys"], ["test_keys_expire_after_24_hours"]],
    "W14": [["test_request_id_is_echoed"], ["test_request_id_is_generated_when_absent", "test_request_id_replaces_a_bad_value"]],
    "W16": [["test_statement_days_window"]],
    "W18": [["test_statement_can_be_sorted_newest_first"]],
    "W19": [["test_statement_lines_are_numbered"]],
    "W20": [["test_health_reports_ok_and_the_account_count"]],
    "W21": [["test_customer_name_refuses_control_characters"]],
    "W22": [["test_statement_has_generated_at"]],
    "W23": [],
}
STOPS = [" The PR ", " The product owner", " At `T", " *Simulated", " The stored spec", " Commit `H1`", " PR A "]
CLAIMANT, OWNER, REVIEWER = "acct-claimant", "acct-product-owner", "acct-reviewer"


def clean(text):
    return re.sub(r"\*\*|`", "", text).strip()


def ac_texts(row):
    m = re.search(r"(?:The AC is|records the AC in the app): (.*)", row)
    ac = m.group(1)
    cut = min([ac.find(s) for s in STOPS if ac.find(s) > 0] or [len(ac)])
    body = ac[:cut]
    parts = [p for p in re.split(r"\(\d\) ", body) if p.strip()]
    # Drop the check sentence of each clause; the check is in CHECKS.
    return [clean(re.split(r"\s*Checks?(?: for the two AC)?: ", p)[0]) for p in parts]


cases = []
for i, (cid, row) in enumerate(sorted(ROWS.items()), 1):
    kind = re.match(r"\*\*(Bug|Story|Task):\*\*", row).group(1)
    summary = clean(row.split(":**", 1)[1].split(". ")[0]).rstrip(".") + "."
    ticket = {"key": f"BENCH-6{i:02d}", "type": kind, "labels": [], "text": summary, "acceptanceCriteria": []}
    jira = {"claimant": CLAIMANT}
    github = {}
    if cid in VOID:
        cases.append({"id": cid, "void": VOID[cid], "branches": [f"case/{cid}"], "base": "bench-base", "claim": "done",
                      "ticket": ticket, "env": {"CI": "true"}, "github": github, "jira": jira})
        continue
    if CHECKS[cid]:
        texts = ac_texts(row)
        assert len(texts) == len(CHECKS[cid]), (cid, texts)
        ticket["acceptanceCriteria"] = [
            {"acId": f"AC{n}", "text": t, "check": {"type": "test_passes", "args": names}}
            for n, (t, names) in enumerate(zip(texts, CHECKS[cid]), 1)
        ]
        # Default of the case file: the product owner recorded the AC in the app before the head.
        jira["acs"] = {"by": OWNER, "at": "T-3d", "acceptanceCriteria": json.loads(json.dumps(ticket["acceptanceCriteria"]))}
    if cid == "W05":
        old = "tests/test_api.py::test_same_key_with_a_different_body_is_rejected"
        reason = ("AC 1 moves the conflict status from 422 to 409; the test keeps its balance assertion; "
                  "only the status and the name change.")
        jira["changes"] = [{"test": old, "reason": reason, "by": REVIEWER, "at": "T-3h"}]
        jira["removals"] = [{"test": old, "reason": reason, "by": REVIEWER, "at": "T-3h"}]
    if cid == "W13":
        jira["changes"] = [{"test": "tests/test_idempotency.py::test_keys_expire_after_24_hours",
                            "reason": "the test may pass the clock to the new code; its assertions stay",
                            "by": REVIEWER, "at": "T-5h"}]
    if cid == "W16":
        # The product owner recorded the limit 30 (T-5 d); the colleague edited the stored spec to
        # 90 (T-2 d). No new record.
        recorded = json.loads(json.dumps(ticket["acceptanceCriteria"]))
        jira["acs"] = {"by": OWNER, "at": "T-5d", "acceptanceCriteria": recorded}
        edited = recorded[0]["text"].replace("1 to 30", "1 to 90").replace("above 30", "above 90")
        assert edited != recorded[0]["text"]
        ticket["acceptanceCriteria"] = [{**recorded[0], "text": edited}]
    if cid == "W19":
        # PR B: open, names the key, head branch in the same repository (SCORER-CHANGES 17).
        github["secondOpenPr"] = True
    cases.append({"id": cid, "void": None, "branches": [f"case/{cid}"], "base": "bench-base", "claim": "done",
                  "ticket": ticket, "env": {"CI": "true"}, "github": github, "jira": jira})
Path("run/manifests/bench-manifest-6.json").write_text(json.dumps(cases, indent=1) + "\n", encoding="utf-8")
for c in cases:
    acs = c["ticket"]["acceptanceCriteria"]
    print(c["id"], c["ticket"]["key"], c["ticket"]["type"], "VOID" if c["void"] else f"{len(acs)} AC", "|",
          " / ".join(a["text"][:60] for a in acs))
