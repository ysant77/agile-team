"""Write run/manifests/bench-manifest-4.json from CASES-4-INDEPENDENT.md and the builder's
mapping (PREDICTIONS-4.md, "Builder's mapping choices"). The AC text is cut from the row."""

import json
import re
from pathlib import Path

ROWS = {}
for line in Path("CASES-4-INDEPENDENT.md").read_text(encoding="utf-8").splitlines():
    m = re.match(r"\| (U\d\d) \| [^|]+ \| (.*?) \| Domain:", line)
    if m:
        ROWS[m.group(1)] = m.group(2)

TESTS = {
    "U01": ["test_a_huge_account_id_is_404"],
    "U02": ["test_statement_window_has_a_maximum"],
    "U03": ["test_reference_is_stored_without_outer_spaces", "test_blank_reference_is_stored_as_none"],
    "U04": ["test_transfer_accepts_a_typed_account_number"],
    "U05": ["test_interactive_api_pages_are_off"],
    "U06": ["test_transfer_lines_have_a_counterparty"],
    "U07": ["test_large_transfer_needs_a_reference", "test_transfer_below_the_limit_needs_no_reference",
            "test_large_transfer_with_a_reference_is_accepted"],
    "U08": ["test_invariant_check_finds_an_entry_with_no_lines"],
    "U09": ["test_insufficient_funds_tells_what_is_available"],
    "U10": ["test_statement_window_defaults_to_the_last_30_days", "test_statement_window_counts_back_from_the_end",
            "test_statement_window_keeps_given_dates"],
    "U11": ["test_format_minor_groups_thousands"],
    "U12": ["test_zero_decimals_are_accepted", "test_non_zero_extra_decimals_are_still_refused",
            "test_transfer_accepts_zero_decimals"],
    "U13": ["test_account_shows_its_opening_date", "test_each_listed_account_has_an_opening_date"],
    "U14": ["test_support_token_reads_any_statement"],
    "U15": ["test_session_has_the_account_count"],
    "U16": ["test_share_rounds_ties_to_even_in_eur", "test_share_rounds_ties_to_even_in_jpy",
            "test_share_in_bhd_and_at_zero", "test_share_refuses_negative_basis_points"],
    "U17": ["test_a_huge_session_cookie_is_401"],
    "U18": ["test_old_keys_of_the_customer_are_removed"],
    "U19": ["test_transfer_to_an_own_account_is_internal", "test_transfer_to_another_customer_is_not_internal"],
    "U20": ["test_account_number_refuses_a_sequence_out_of_range"],
    "U21": ["test_unknown_destination_has_a_clear_message"],
    "U22": ["test_default_statement_start_stays_in_range"],
    "U23": ["test_balances_are_the_totals_of_the_ledger"],
    "U24": None,
}
STOPS = [" The PR ", " The implementation ", " The ticket has", " No other source", " The ticket gives"]


def clean(text):
    return re.sub(r"\*\*|`", "", text).strip()


cases = []
for i, (cid, row) in enumerate(sorted(ROWS.items()), 1):
    kind = re.match(r"\*\*(Bug|Story|Task):\*\*", row).group(1)
    summary = clean(row.split(":**", 1)[1].split(". ")[0]).rstrip(".") + "."
    if cid == "U07":
        ac = "A large transfer must have a reference. Without one, the API gives 422."
        text = ac
    else:
        m = re.search(r"The (?:full )?AC (?:text of the ticket )?is: (.*)", row)
        ac = m.group(1)
        cut = min([ac.find(s) for s in STOPS if ac.find(s) > 0] or [len(ac)])
        ac = clean(ac[:cut])
        text = summary
    crit = {"acId": "AC1", "text": ac}
    if TESTS[cid]:
        crit["check"] = {"type": "test_passes", "args": TESTS[cid]}
    cases.append({
        "id": cid, "void": None, "branches": [f"case/{cid}"], "base": "bench-base", "claim": "done",
        "ticket": {"key": f"BENCH-4{i:02d}", "type": kind, "labels": ["money_semantics"] if cid == "U12" else [],
                   "text": text, "acceptanceCriteria": [crit]},
        "env": {"CI": "true"},
        "github": {"failedRunThenRerun": True} if cid == "U18" else {},
    })
Path("run/manifests/bench-manifest-4.json").write_text(json.dumps(cases, indent=1) + "\n", encoding="utf-8")
for c in cases:
    print(c["id"], c["ticket"]["type"], "|", c["ticket"]["text"][:60], "|", c["ticket"]["acceptanceCriteria"][0]["text"][:140])
