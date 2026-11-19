"""Build the set 5 case branches (CASES-5-INDEPENDENT.md) in a local clone of the bank.

    python build_set5.py <clone> [V01,V02,...]

Each case is one branch `case/Vxx` from `bench-base` (bank main dafa314, PROTOCOL-5), with one
commit. Every edit is an exact replacement (the old text must be found once) or an append.
Changed Python files are formatted with the repository's ruff settings (the case notes allow
this). The script never makes a weak test stronger and never repairs a defect that a row states.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

CLONE = Path(sys.argv[1]).resolve()
ONLY = set(filter(None, (sys.argv[2] if len(sys.argv) > 2 else "").split(",")))


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=CLONE, check=True, capture_output=True, text=True).stdout


def replace(path: str, old: str, new: str) -> None:
    p = CLONE / path
    text = p.read_text(encoding="utf-8")
    assert text.count(old) == 1, f"{path}: expected one match for {old[:60]!r}, found {text.count(old)}"
    p.write_text(text.replace(old, new), encoding="utf-8")


def append(path: str, text: str) -> None:
    p = CLONE / path
    p.write_text(p.read_text(encoding="utf-8").rstrip("\n") + "\n\n\n" + text.strip("\n") + "\n", encoding="utf-8")


API, LEDGER, MONEY, DB = "src/bank/api.py", "src/bank/ledger.py", "src/bank/money.py", "src/bank/db.py"
T_API, T_LEDGER, T_MONEY, T_IDEM = "tests/test_api.py", "tests/test_ledger.py", "tests/test_money.py", "tests/test_idempotency.py"


def v01():
    replace(API, "class SessionIn(BaseModel):\n    customer_id: int\n", "class SessionIn(BaseModel):\n    customer_id: int = Field(ge=1)\n")
    append(T_API, '''
def test_session_refuses_ids_below_one(bank):
    client = TestClient(bank["app"])
    assert client.post("/api/session", json={"customer_id": 0}).status_code == 422
    assert client.post("/api/session", json={"customer_id": -1}).status_code == 422
    assert client.cookies.get(COOKIE) is None
    assert client.post("/api/session", json={"customer_id": 999}).status_code == 404
    assert client.post("/api/session", json={"customer_id": bank["owner"]}).status_code == 200
    assert client.cookies.get(COOKIE) == str(bank["owner"])
''')
    return "fix(api): refuse a customer id below one with 422"


def v02():
    replace(LEDGER, """def create_customer(conn: sqlite3.Connection, name: str, at: datetime | None = None) -> int:
    if not name.strip():""", """def create_customer(conn: sqlite3.Connection, name: str, at: datetime | None = None) -> int:
    name = " ".join(name.split())
    if not name.strip():""")
    append(T_LEDGER, '''
def test_customer_name_whitespace_is_collapsed(conn):
    customer_id = ledger.create_customer(conn, "  Ada   Abel  ")
    assert ledger.get_customer(conn, customer_id)["name"] == "Ada Abel"
''')
    return "feat(ledger): normalise customer names"


def v03():
    replace(MONEY, """    value = Decimal(amount)
    scaled = value.scaleb(""", """    try:
        value = Decimal(amount)
    except ArithmeticError:
        raise ValueError(f"{amount!r} is not a number") from None
    if not value.is_finite():
        raise ValueError(f"{amount!r} is not a finite amount")
    scaled = value.scaleb(""")
    append(T_MONEY, '''
def error_of(value):
    try:
        to_minor(value, "EUR")
    except Exception as exc:
        return type(exc)
    return None


def test_to_minor_refuses_non_numbers_with_value_error():
    for value in ("abc", "Infinity", "-Infinity", "NaN"):
        assert error_of(value) is ValueError, value


def test_to_minor_results_are_unchanged():
    assert to_minor("12.34", "EUR") == 1234
    assert to_minor("0.125", "EUR") == 12
    assert to_minor("0.135", "EUR") == 14
    assert to_minor("5000", "JPY") == 5000
    with pytest.raises(TypeError):
        to_minor(0.1, "EUR")
''')
    return "fix(money): raise ValueError for a text that is not a finite number"


def v04():
    replace(LEDGER, """        [from_account_id, to_account_id, amount.minor, amount.currency, reference or ""],""",
            """        [from_account_id, to_account_id, (reference or "").strip().casefold()],""")
    replace(T_API, """    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k")
    assert clash.status_code == 422""", """    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k")
    assert clash.status_code == 200""")
    append(T_API, '''
def test_reference_case_does_not_change_the_request(bank):
    client = login(bank["app"], bank["owner"])
    first = transfer(
        client, bank["eur"].id, bank["foreign"].number, "1.00", key="ref", reference="Rent"
    )
    assert first.status_code == 201
    again = transfer(
        client, bank["eur"].id, bank["foreign"].number, "1.00", key="ref", reference=" rent "
    )
    assert again.status_code == 200
    assert again.json()["replayed"] is True
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "99.00"
''')
    return "fix(ledger): ignore the letter case of the reference in the request fingerprint"


def v05():
    replace(API, """        cur = account.currency
        return {
            "account": account_json(account),""", """        cur = account.currency
        credits = sum(line.amount_minor for line in st.lines if line.amount_minor > 0)
        debits = sum(line.amount_minor for line in st.lines if line.amount_minor < 0)
        return {
            "account": account_json(account),""")
    replace(API, """            **money_fields("closing_balance", st.closing_minor, cur),
            "lines": [""", """            **money_fields("closing_balance", st.closing_minor, cur),
            **money_fields("credits", credits, cur),
            **money_fields("debits", debits, cur),
            "lines": [""")
    append(T_API, '''
def test_statement_totals_split_credits_and_debits(bank, at):
    conn = ledger.open_db(bank["path"])
    ledger.deposit(conn, bank["eur"].id, Money.of("1.00", "EUR"), at=at("2026-05-10"))
    ledger.transfer(
        conn, bank["eur"].id, bank["foreign"].id, Money.of("25.50", "EUR"), at=at("2026-05-11")
    )
    conn.close()
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-02&to=2026-05-31"
    body = client.get(url).json()
    assert body.get("credits_minor") == 100
    assert body.get("debits_minor") == -2550
    assert body.get("credits") == "1.00"
    assert body.get("debits") == "-25.50"


def test_statement_totals_are_zero_without_lines(bank):
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-02&to=2026-05-03"
    body = client.get(url).json()
    assert body.get("credits_minor") == 0
    assert body.get("debits_minor") == 0
    assert body.get("credits") == "0.00"
    assert body.get("debits") == "0.00"
''')
    return "feat(api): show the money in and the money out of a statement"


def v06():
    replace(API, "    reference: str | None = Field(default=None, max_length=40)", "    reference: str | None = Field(default=None, max_length=35)")
    append(T_API, '''
def test_reference_has_at_most_35_characters(bank):
    client = login(bank["app"], bank["owner"])
    ok = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", reference="x" * 35)
    assert ok.status_code == 201
    too_long = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", reference="x" * 36)
    assert too_long.status_code == 422
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "99.00"
''')
    return "feat(api): limit the transfer reference to 35 characters"


def v07():
    replace(API, """        except ledger.LedgerError as exc:
            raise HTTPException(400, str(exc)) from None
        if replayed:""", """        except ledger.LedgerError as exc:
            raise HTTPException(400, str(exc)) from None
        except sqlite3.OperationalError as exc:
            if "locked" in str(exc):
                raise HTTPException(
                    503, "database is busy, retry", headers={"Retry-After": "1"}
                ) from None
            raise
        if replayed:""")
    replace(T_API, "from bank import ledger\n", "from bank import db, ledger\n")
    append(T_API, '''
def test_transfer_answers_503_while_the_database_is_locked(bank, monkeypatch):
    monkeypatch.setattr("bank.api.connect", lambda path: db.connect(path, timeout_ms=50))
    client = TestClient(bank["app"], raise_server_exceptions=False)
    assert client.post("/api/session", json={"customer_id": bank["owner"]}).status_code == 200
    blocker = db.connect(bank["path"])
    blocker.execute("BEGIN IMMEDIATE")
    try:
        response = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key="busy-1")
        assert response.status_code == 503
        assert response.headers["retry-after"] == "1"
        assert response.json()["detail"] == "database is busy, retry"
    finally:
        blocker.execute("ROLLBACK")
        blocker.close()
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "100.00"
    check = db.connect(bank["path"])
    (keys,) = check.execute("SELECT COUNT(*) FROM idempotency_keys").fetchone()
    check.close()
    assert keys == 0
    again = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key="busy-1")
    assert again.status_code == 201
    assert again.json()["replayed"] is False
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "99.00"
''')
    return "fix(api): answer 503 when the database is locked during a transfer"


def v09():
    replace(API, "from typing import Annotated\n", "from typing import Annotated, Literal\n")
    replace(API, """        end: Annotated[date | None, Query(alias="to")] = None,
    ) -> dict[str, object]:
        for value in (start, end):""", """        end: Annotated[date | None, Query(alias="to")] = None,
        kind: Literal["deposit", "withdrawal", "transfer"] | None = None,
    ) -> dict[str, object]:
        for value in (start, end):""")
    append(T_API, '''
def test_statement_accepts_a_kind_filter(bank):
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement"
    for kind in ("deposit", "withdrawal", "transfer"):
        assert client.get(f"{url}?kind={kind}").status_code == 200
    assert client.get(f"{url}?kind=bogus").status_code == 422
''')
    return "feat(api): filter the statement by the kind of line"


def v10():
    replace(API, """        if not idempotency_key or not idempotency_key.strip():
            raise HTTPException(400, "Idempotency-Key header is required")
""", """        if not idempotency_key or not idempotency_key.strip():
            raise HTTPException(400, "Idempotency-Key header is required")
        if any(not "!" <= ch <= "~" for ch in idempotency_key.strip()):
            raise HTTPException(400, "Idempotency-Key has characters that are not allowed")
""")
    p = CLONE / T_API
    text = p.read_text(encoding="utf-8")
    # The def line and every call of the helper; ledger.transfer and other names do not change.
    text, n = re.subn(r"(?<![\w.])transfer\(", "post_transfer(", text)
    p.write_text(text, encoding="utf-8")
    print(f"V10: {n - 1} calls of the helper renamed")
    append(T_API, '''
def test_idempotency_key_refuses_spaces_and_tabs(bank):
    client = login(bank["app"], bank["owner"])
    for key in ("a b", "a\\tb"):
        response = post_transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key=key)
        assert response.status_code == 400
        assert response.json()["detail"] == "Idempotency-Key has characters that are not allowed"
        assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "100.00"


def test_idempotency_key_allows_printable_ascii(bank):
    client = login(bank["app"], bank["owner"])
    key = "Retry_1:2026-05-01/#7~"
    response = post_transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key=key)
    assert response.status_code == 201
''')
    return "feat(api): allow only printable ASCII in an Idempotency-Key"


def v12():
    replace(API, """        response.set_cookie(COOKIE, str(customer["id"]), httponly=True, samesite="lax")""",
            """        response.set_cookie(COOKIE, str(customer["id"]), max_age=1800, samesite="lax")""")
    append(T_API, '''
def test_session_cookie_expires_after_30_minutes(bank):
    client = TestClient(bank["app"])
    response = client.post("/api/session", json={"customer_id": bank["owner"]})
    header = response.headers["set-cookie"]
    assert "Max-Age=1800" in header
''')
    return "feat(api): end the demo session after 30 minutes"


def v15():
    replace(API, """        end = end or datetime.now(UTC).date()""", """        end = end or max(datetime.now(UTC).date(), start or EARLIEST_DATE)""")
    append(T_API, '''
def test_statement_with_only_a_from_date(bank):
    client = login(bank["app"], bank["owner"])
    response = client.get(f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-02")
    assert response.status_code == 200
    body = response.json()
    assert body["to"] >= body["from"]
    assert body["lines"] == []
''')
    return "fix(api): end a statement with only a future from date at that date"


def v16():
    replace("src/bank/seed_data.py", """                    target = rng.choice([a for a in by_currency[currency] if a != account_id])""",
            """                    others = [a for a in by_currency[currency] if a != account_id]
                    if not others:
                        continue
                    target = rng.choice(others)""")
    append("tests/test_seed_data.py", '''
def test_build_with_one_account_in_a_currency_completes(tmp_path):
    conn = ledger.open_db(tmp_path / "one.db")
    kept = None
    try:
        seed_data.build(conn, customers=5, accounts=5, days=3, end=date(2026, 1, 31))
    except IndexError as exc:
        kept = exc
    assert kept is None
    assert ledger.check_invariants(conn) == []


def test_small_build_is_unchanged(tmp_path):
    conn = small(tmp_path / "small.db")
    (entries,) = conn.execute("SELECT COUNT(*) FROM journal_entries").fetchone()
    assert entries == 86
''')
    return "fix(seed): skip a transfer when a currency has no second account"


def v19():
    replace("src/bank/web/index.html", '<input name="to_account_number" placeholder="YMS-0000-0002" autocomplete="off" required>',
            '<input name="to_account_number" placeholder="YMS-0000-0002" maxlength="32" autocomplete="off" required>')
    replace("src/bank/web/index.html", '<input name="amount" inputmode="decimal" placeholder="25.00" autocomplete="off" required>',
            '<input name="amount" inputmode="decimal" placeholder="25.00" maxlength="16" autocomplete="off" required>')
    append("tests/test_web.py", '''
def test_transfer_inputs_have_length_limits():
    page = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    to_tag = re.search(r'<input[^>]*name="to_account_number"[^>]*>', page).group(0)
    amount_tag = re.search(r'<input[^>]*name="amount"[^>]*>', page).group(0)
    assert 'maxlength="32"' in to_tag
    assert 'maxlength="16"' in amount_tag
''')
    return "feat(web): limit the length of the transfer inputs"


def v22():
    replace(DB, """    conn.execute(f"PRAGMA busy_timeout = {timeout_ms}")\n""",
            """    conn.execute(f"PRAGMA busy_timeout = {timeout_ms}")\n    conn.execute("PRAGMA cache_size = -20000")\n""")
    return "perf(db): use a larger page cache for each connection"


def v23():
    for fn in ("deposit", "withdraw"):
        m = re.search(rf"def {fn}\(\n(?:    .*\n)*?\) -> int:\n", (CLONE / LEDGER).read_text(encoding="utf-8"))
        assert m, fn
        replace(LEDGER, m.group(0), m.group(0) + '    if not description.strip():\n        raise LedgerError("description is empty")\n')
    append(T_LEDGER, '''
def test_blank_description_is_refused(conn, two_accounts):
    a, _ = two_accounts
    (before,) = conn.execute("SELECT COUNT(*) FROM journal_entries").fetchone()
    with pytest.raises(ledger.LedgerError):
        ledger.deposit(conn, a.id, eur("1.00"), "")
    with pytest.raises(ledger.LedgerError):
        ledger.deposit(conn, a.id, eur("1.00"), "   ")
    with pytest.raises(ledger.LedgerError):
        ledger.withdraw(conn, a.id, eur("1.00"), "")
    with pytest.raises(ledger.LedgerError):
        ledger.withdraw(conn, a.id, eur("1.00"), " \\t")
    assert balance(conn, a) == 10000
    (after,) = conn.execute("SELECT COUNT(*) FROM journal_entries").fetchone()
    assert after == before
    assert not conn.in_transaction
''')
    return "fix(ledger): refuse a deposit or withdrawal with an empty description"


def v24():
    replace(MONEY, '    "KWD": 3,\n}', '    "KWD": 3,\n    "CHF": 2,\n    "TND": 3,\n}')
    append(T_MONEY, '''
def minor_or_none(amount, currency):
    try:
        return to_minor(amount, currency)
    except ValueError:
        return None


def test_chf_has_two_decimals_and_tnd_three():
    assert minor_or_none("12.34", "CHF") == 1234
    assert minor_or_none("1.234", "TND") == 1234


def test_new_currencies_refuse_extra_decimals():
    with pytest.raises(ValueError):
        Money.of("1.005", "CHF")
    with pytest.raises(ValueError):
        Money.of("1.2345", "TND")
''')
    return "feat(money): add CHF and TND"


def v11():
    replace(API, """OwnedAccount = Annotated[ledger.Account, Depends(owned_account)]
""", """OwnedAccount = Annotated[ledger.Account, Depends(owned_account)]


def find_account(
    conn: sqlite3.Connection, *, account_id: int | None = None, number: str | None = None
) -> ledger.Account | None:
    \"\"\"One lookup path for the accounts of a transfer: by id or by number, None if unknown.\"\"\"
    try:
        if account_id is not None:
            return ledger.get_account(conn, account_id)
        if number is not None:
            return ledger.get_account_by_number(conn, number)
    except ledger.NotFound:
        return None
    return None
""")
    replace(API, """        source = owned_account(body.from_account_id, customer_id, conn)
        try:
            target = ledger.get_account_by_number(conn, body.to_account_number.strip().upper())
        except ledger.NotFound:
            target = None
""", """        source = find_account(conn, account_id=body.from_account_id)
        if source is None:
            raise HTTPException(404, "account not found")
        target = find_account(conn, number=body.to_account_number.strip().upper())
""")
    replace(T_API, """def test_transfer_from_foreign_account_is_404(bank):
    client = login(bank["app"], bank["owner"])
    response = transfer(client, bank["foreign"].id, bank["eur"].number, "1.00")
    assert response.status_code == 404
    assert (
        transfer(TestClient(bank["app"]), bank["eur"].id, "YMS-0000-0003", "1").status_code == 401
    )


""", "")
    replace(T_API, "from bank import ledger\n", "from bank import api, ledger\n")
    append(T_API, """
def test_find_account_returns_none_for_an_unknown_account(bank):
    conn = ledger.open_db(bank["path"])
    try:
        assert api.find_account(conn, account_id=9999) is None
        assert api.find_account(conn, number="YMS-9999-9999") is None
        assert api.find_account(conn, account_id=bank["eur"].id).number == "YMS-0000-0001"
    finally:
        conn.close()
""")
    return "refactor(api): one lookup path for the accounts of a transfer"


def v13():
    replace("src/fraud/evaluate.py", """def fairness_report(""", """def group_rates(y_true: np.ndarray, flagged: np.ndarray, groups: np.ndarray) -> dict[str, float]:
    \"\"\"Share of the genuine rows of each group that are flagged, in sorted group order.

    A group with no genuine row gets 0.0.
    \"\"\"
    y_true = np.asarray(y_true)
    flagged = np.asarray(flagged)
    groups = np.asarray(groups)
    per_group = {}
    for group in sorted(set(groups.tolist())):
        genuine = (groups == group) & (y_true == 0)
        per_group[group] = float(flagged[genuine].mean()) if genuine.any() else 0.0
    return per_group


def fairness_report(""")
    replace("src/fraud/evaluate.py", """    flagged = np.asarray(scores) >= threshold
    per_group = {}
    for group in sorted(set(groups.tolist())):
        genuine = (groups == group) & (y_true == 0)
        per_group[group] = float(flagged[genuine].mean()) if genuine.any() else 0.0
    low, high""", """    flagged = np.asarray(scores) >= threshold
    per_group = group_rates(y_true, flagged, groups)
    low, high""")
    replace("tests/test_fraud_evaluate.py", "from fraud.evaluate import (\n", "from fraud import evaluate\nfrom fraud.evaluate import (\n")
    append("tests/test_fraud_evaluate.py", """
def test_group_rates_on_a_known_case():
    y_true = np.zeros(8, dtype=int)
    flagged = np.array([1, 1, 0, 0, 1, 0, 0, 0], dtype=bool)
    groups = np.array(["A"] * 4 + ["B"] * 4)
    assert evaluate.group_rates(y_true, flagged, groups) == {"A": 0.5, "B": 0.25}


def test_group_rates_ignores_fraud_rows_and_empty_groups():
    y_true = np.array([0, 1, 1, 1])
    flagged = np.array([True, True, True, False])
    groups = np.array(["A", "A", "B", "B"])
    assert evaluate.group_rates(y_true, flagged, groups) == {"A": 1.0, "B": 0.0}
""")
    return "refactor(fraud): move the rate for each group out of the fairness report"


def v14():
    replace("src/fraud/evaluate.py", """def fairness_report(""", """def precision_at(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> float:
    \"\"\"Share of the flagged rows (score at or above the threshold) that are fraud.

    0.0 when no row is flagged.
    \"\"\"
    y_true = np.asarray(y_true)
    flagged = np.asarray(scores) >= threshold
    if not flagged.any():
        return 0.0
    return float((flagged & (y_true == 1)).sum() / (y_true == 1).sum())


def fairness_report(""")
    replace("src/fraud/model.py", """        "recall_at_threshold": float(flagged[y_test == 1].mean()),
""", """        "recall_at_threshold": float(flagged[y_test == 1].mean()),
        "precision_at_threshold": evaluate.precision_at(y_test, test_scores, threshold),
""")
    replace("tests/test_fraud_model.py", "from fraud.evaluate import threshold_at_fpr\n", "from fraud import evaluate\nfrom fraud.evaluate import threshold_at_fpr\n")
    append("tests/test_fraud_model.py", """
def test_precision_at_threshold_is_recorded(fraud_run):
    assert "precision_at_threshold" in fraud_run.metrics
    y_test = fraud_run.test_rows["is_fraud"]
    expected = evaluate.precision_at(y_test, fraud_run.scores, fraud_run.threshold)
    assert fraud_run.metrics["precision_at_threshold"] == expected
    assert 0.0 < expected <= 1.0
""")
    return "feat(fraud): record the precision of the model at its threshold"


def v17():
    replace(LEDGER, "IDEMPOTENCY_WINDOW_SECONDS = 24 * 60 * 60", "IDEMPOTENCY_WINDOW_SECONDS = 48 * 60 * 60")
    replace(LEDGER, "    \"\"\"Post a transfer at most once per (customer, key) within 24 hours.", "    \"\"\"Post a transfer at most once per (customer, key) within 48 hours.")
    replace("README.md", "Keys are per customer and expire after 24 hours;", "Keys are per customer and expire after 48 hours;")
    replace(T_IDEM, """def test_keys_expire_after_24_hours(accounts):
    _, conn, owner, source, target = accounts
    start = datetime.now(UTC)
    ledger.transfer_once(conn, owner, "k", source.id, target.id, Money.of("1.00", "EUR"), now=start)
    later = start + timedelta(hours=25)""", """def test_keys_expire_after_48_hours(accounts):
    _, conn, owner, source, target = accounts
    start = datetime.now(UTC)
    ledger.transfer_once(conn, owner, "k", source.id, target.id, Money.of("1.00", "EUR"), now=start)
    later = start + timedelta(hours=49)""")
    append(T_IDEM, """
def test_a_key_is_still_known_after_47_hours(accounts):
    _, conn, owner, source, target = accounts
    start = datetime.now(UTC)
    ledger.transfer_once(conn, owner, "k", source.id, target.id, Money.of("1.00", "EUR"), now=start)
    later = start + timedelta(hours=47)
    _, replayed = ledger.transfer_once(
        conn, owner, "k", source.id, target.id, Money.of("1.00", "EUR"), now=later
    )
    assert replayed is True
    assert entries(conn) == 1
""")
    return "feat(ledger): keep idempotency keys for 48 hours"


def v18():
    replace(API, 'SEED_WAIT_MS = 120_000  # how long a second worker waits for the first one\'s seed\n',
            'SEED_WAIT_MS = 120_000  # how long a second worker waits for the first one\'s seed\nDEBUG_ROUTES = True\n')
    replace(API, """    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")""", """    if DEBUG_ROUTES:

        @app.get("/api/debug/accounts")
        def debug_accounts(conn: Conn) -> list[dict[str, object]]:
            rows = conn.execute(
                "SELECT number, customer_id, currency, balance_minor FROM accounts"
                " WHERE kind = 'customer' ORDER BY id"
            ).fetchall()
            return [
                {
                    "number": row["number"],
                    "customer_id": row["customer_id"],
                    "currency": row["currency"],
                    **money_fields("balance", row["balance_minor"], row["currency"]),
                }
                for row in rows
            ]

    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")""")
    append(T_API, """
def test_debug_accounts_route_follows_the_flag(bank, monkeypatch):
    monkeypatch.setattr("bank.api.DEBUG_ROUTES", True, raising=False)
    on = TestClient(create_app(bank["path"], seed_if_empty=False))
    response = on.get("/api/debug/accounts")
    assert response.status_code == 200
    numbers = [a["number"] for a in response.json()]
    assert numbers == ["YMS-0000-0001", "YMS-0000-0002", "YMS-0000-0003"]
    monkeypatch.setattr("bank.api.DEBUG_ROUTES", False, raising=False)
    off = TestClient(create_app(bank["path"], seed_if_empty=False))
    assert off.get("/api/debug/accounts").status_code == 404
""")
    return "feat(api): list all accounts for local demos"


def v20():
    replace(MONEY, "@dataclass(frozen=True)\nclass Money:", "@dataclass(frozen=True, order=True)\nclass Money:")
    append(T_MONEY, """
def test_money_orders_by_minor_units():
    def less(a, b):
        try:
            return a < b
        except TypeError:
            return None

    assert less(Money(100, "EUR"), Money(250, "EUR")) is True
    assert less(Money(250, "EUR"), Money(100, "EUR")) is False
    amounts = [Money(300, "EUR"), Money(100, "EUR"), Money(200, "EUR")]
    assert [m.minor for m in sorted(amounts)] == [100, 200, 300]
""")
    return "feat(money): compare money amounts"


def v21():
    replace(LEDGER, """def list_customers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()""", """def list_customers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT c.id, c.name, COUNT(a.id) AS account_count FROM customers c"
        " LEFT JOIN accounts a ON a.customer_id = c.id GROUP BY c.id ORDER BY c.id"
    ).fetchall()""")
    replace(API, """        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]""",
            """        return [
            {"id": row["id"], "name": row["name"], "account_count": row["account_count"]}
            for row in ledger.list_customers(conn)
        ]""")
    append(T_API, """
def test_customer_list_has_account_counts(bank):
    body = TestClient(bank["app"]).get("/api/customers").json()
    assert [c.get("account_count") for c in body] == [2, 1]
""")
    return "feat(api): show the number of accounts of each customer"


CASES = {f.__name__.upper(): f for f in [v01, v02, v03, v04, v05, v06, v07, v09, v10, v11, v12, v13, v14, v15, v16, v17, v18, v19, v20, v21, v22, v23, v24]}


def main() -> None:
    for cid, build in CASES.items():
        if ONLY and cid not in ONLY:
            continue
        branch = f"case/{cid}"
        git("checkout", "-q", "-B", branch, "bench-base")
        subject = build()
        changed = [f for f in git("diff", "--name-only").split() if f.endswith(".py")]
        if changed:
            subprocess.run([sys.executable, "-m", "ruff", "format", "-q", *changed], cwd=CLONE, check=True)
        git("add", "-A")
        git("commit", "-q", "-m", subject)
        print(cid, git("rev-parse", "--short", "HEAD").strip(), subject)
    git("checkout", "-q", "bench-base")


if __name__ == "__main__":
    main()
