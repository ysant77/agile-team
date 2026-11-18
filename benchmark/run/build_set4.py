"""Build the set 4 case branches (CASES-4-INDEPENDENT.md) in a local clone of the bank.

    python build_set4.py <clone> [U01,U02,...]

Each case is one branch `case/Uxx` from `bench-base`, with one commit. Every edit is an exact
replacement (the old text must be found once) or an append. Changed Python files are formatted
with the repository's ruff settings (the case notes allow this). The script never makes a weak
test stronger and never repairs a defect that a row states.
"""

from __future__ import annotations

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


API, LEDGER, MONEY = "src/bank/api.py", "src/bank/ledger.py", "src/bank/money.py"
T_API, T_LEDGER, T_MONEY = "tests/test_api.py", "tests/test_ledger.py", "tests/test_money.py"


def u01():
    replace(API, """    except ledger.NotFound:
        account = None
    if account is None or account.customer_id != customer_id:""", """    except ledger.NotFound:
        account = None
    except OverflowError:
        account = None
    if account is None or account.customer_id != customer_id:""")
    append(T_API, '''
def test_a_huge_account_id_is_404(bank):
    client = TestClient(bank["app"], raise_server_exceptions=False)
    assert client.post("/api/session", json={"customer_id": bank["owner"]}).status_code == 200
    huge = 9223372036854775808
    assert client.get(f"/api/accounts/{huge}").status_code == 404
    assert client.get(f"/api/accounts/{huge}/statement").status_code == 404
    body = {"from_account_id": huge, "to_account_number": "YMS-0000-0003", "amount": "1.00"}
    response = client.post("/api/transfers", json=body, headers={"Idempotency-Key": "huge-id"})
    assert response.status_code == 404
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "100.00"
''')
    return "fix(api): answer 404 for an account id above the 64-bit range"


def u02():
    replace(API, """        start = start or end - timedelta(days=STATEMENT_DAYS - 1)
""", """        start = start or end - timedelta(days=STATEMENT_DAYS - 1)
        if (end - start).days > 366:
            raise HTTPException(400, "the statement window is longer than 366 days")
""")
    append(T_API, '''
def test_statement_window_has_a_maximum(bank):
    client = login(bank["app"], bank["owner"])
    base = f"/api/accounts/{bank['eur'].id}/statement"
    assert client.get(base + "?from=2024-01-01&to=2026-05-01").status_code == 400
    assert client.get(base + "?from=2026-04-01&to=2026-05-01").status_code == 200
''')
    return "feat(api): limit the statement window to 366 days"


def u03():
    replace(API, """        amount = parse_amount(body.amount, source.currency)
        try:
            result, replayed = ledger.transfer_once(""", """        amount = parse_amount(body.amount, source.currency)
        reference = (body.reference or "").strip() or None
        try:
            result, replayed = ledger.transfer_once(""")
    replace(API, """                amount,
                body.reference,
            )""", """                amount,
                reference,
            )""")
    append(T_API, '''
def transfer_line(client, account_id):
    url = f"/api/accounts/{account_id}/statement?from=2026-05-01"
    return next(line for line in client.get(url).json()["lines"] if line["kind"] == "transfer")


def test_reference_is_stored_without_outer_spaces(bank):
    client = login(bank["app"], bank["owner"])
    response = transfer(client, bank["eur"].id, "YMS-0000-0003", "1.00", reference="  Rent  ")
    assert response.status_code == 201
    assert transfer_line(client, bank["eur"].id)["reference"] == "Rent"


def test_blank_reference_is_stored_as_none(bank):
    client = login(bank["app"], bank["owner"])
    response = transfer(client, bank["eur"].id, "YMS-0000-0003", "1.00", reference="   ")
    assert response.status_code == 201
    assert transfer_line(client, bank["eur"].id)["reference"] is None
''')
    return "fix(api): store a transfer reference without outer spaces"


def u04():
    replace(API, "ledger.get_account_by_number(conn, body.to_account_number.strip().upper())",
            'ledger.get_account_by_number(conn, " ".join(body.to_account_number.split()).upper())')
    append(T_API, '''
def test_transfer_accepts_a_typed_account_number(bank):
    client = login(bank["app"], bank["owner"])
    for typed in ("yms-0000-0003", " YMS-0000-0003 "):
        assert transfer(client, bank["eur"].id, typed, "1.00").status_code == 201
''')
    return "fix(api): accept the destination account number in the forms customers type"


def u05():
    replace(API, 'app = FastAPI(title="YMS Bank demo", lifespan=lifespan)',
            'app = FastAPI(\n        title="YMS Bank demo",\n        lifespan=lifespan,\n        docs_url=None,\n        redoc_url=None,\n        openapi_url=None,\n    )')
    append("tests/test_web.py", '''
def test_interactive_api_pages_are_off(tmp_path):
    client = TestClient(create_app(tmp_path / "web.db", seed_if_empty=False))
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path
    assert client.get("/").status_code == 200
''')
    return "Disable the interactive API docs"


def u06():
    replace(LEDGER, """    reference: str | None
    amount_minor: int
    balance_minor: int
""", """    reference: str | None
    amount_minor: int
    counterparty_number: str | None
    balance_minor: int
""")
    replace(LEDGER, """        "SELECT e.id, e.posted_at, e.kind, e.description, e.reference, l.amount_minor"
        " FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id\"""", """        "SELECT e.id, e.posted_at, e.kind, e.description, e.reference, l.amount_minor,"
        " CASE WHEN e.kind = 'transfer' THEN ("
        "  SELECT a2.number FROM journal_lines l2 JOIN accounts a2 ON a2.id = l2.account_id"
        "  WHERE l2.entry_id = e.id ORDER BY l2.id LIMIT 1) END AS counterparty_number"
        " FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id\"""")
    replace(API, """                    "reference": line.reference,
""", """                    "reference": line.reference,
                    "counterparty_number": line.counterparty_number,
""")
    append(T_API, '''
def test_transfer_lines_have_a_counterparty(bank):
    client = login(bank["app"], bank["owner"])
    assert transfer(client, bank["eur"].id, "YMS-0000-0003", "5.00").status_code == 201
    url = f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-01"
    lines = client.get(url).json()["lines"]
    transfer_line = next(line for line in lines if line["kind"] == "transfer")
    deposit_line = next(line for line in lines if line["kind"] == "deposit")
    assert transfer_line.get("counterparty_number", "").startswith("YMS-")
    assert deposit_line.get("counterparty_number") is None
''')
    return "feat(statement): show the other account of a transfer line"


def u07():
    replace(API, """        amount = parse_amount(body.amount, source.currency)
        try:""", """        amount = parse_amount(body.amount, source.currency)
        large = amount.minor >= 1000 * 10 ** exponent(source.currency)
        if large and not (body.reference or "").strip():
            raise HTTPException(422, "a large transfer needs a reference")
        try:""")
    append(T_API, '''
def funded(bank):
    conn = ledger.open_db(bank["path"])
    try:
        ledger.deposit(conn, bank["eur"].id, Money.of("5000.00", "EUR"))
    finally:
        conn.close()
    return login(bank["app"], bank["owner"])


def test_large_transfer_needs_a_reference(bank):
    client = funded(bank)
    assert transfer(client, bank["eur"].id, "YMS-0000-0003", "1000.00").status_code == 422
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "5100.00"


def test_transfer_below_the_limit_needs_no_reference(bank):
    client = funded(bank)
    assert transfer(client, bank["eur"].id, "YMS-0000-0003", "999.99").status_code == 201


def test_large_transfer_with_a_reference_is_accepted(bank):
    client = funded(bank)
    response = transfer(client, bank["eur"].id, "YMS-0000-0003", "1000.00", reference="Car")
    assert response.status_code == 201
''')
    return "feat(api): require a reference on a large transfer"


def u08():
    replace(LEDGER, """    return problems
""", """    for row in conn.execute(
        "SELECT e.id FROM journal_entries e LEFT JOIN journal_lines l ON l.entry_id = e.id"
        " WHERE l.id IS NULL"
    ):
        problems.append(f"entry {row[0]} has no lines")
    return problems
""")
    append(T_LEDGER, '''
def test_invariant_check_finds_an_entry_with_no_lines(conn, two_accounts):
    assert ledger.check_invariants(conn) == []
    cur = conn.execute(
        "INSERT INTO journal_entries (kind, description, posted_at) VALUES (?, ?, ?)",
        ("deposit", "no lines", "2026-05-01T12:00:00Z"),
    )
    entry_id = cur.lastrowid
    conn.commit()
    assert ledger.check_invariants(conn) == [f"entry {entry_id} has no lines"]
''')
    return "feat(ledger): report a journal entry with no lines"


def u09():
    replace(API, """        except ledger.InsufficientFunds as exc:
            raise HTTPException(409, str(exc)) from None""", """        except ledger.InsufficientFunds as exc:
            detail = {"message": str(exc), "available_minor": source.balance_minor}
            raise HTTPException(400, detail) from None""")
    replace(T_API, '        ("100.01", "YMS-0000-0003", 409),', '        ("100.01", "YMS-0000-0003", 400),')
    append(T_API, '''
def test_insufficient_funds_tells_what_is_available(bank):
    client = login(bank["app"], bank["owner"])
    detail = transfer(client, bank["eur"].id, "YMS-0000-0003", "100.01").json()["detail"]
    assert isinstance(detail, dict)
    assert detail.get("available_minor") == 10000
''')
    return "feat(api): tell the available balance when funds are insufficient"


def u10():
    replace(API, "STATEMENT_DAYS = 30\n", "")
    replace(API, """        end = end or datetime.now(UTC).date()
        start = start or end - timedelta(days=STATEMENT_DAYS - 1)
""", """        start, end = ledger.statement_window(start, end, datetime.now(UTC).date())
""")
    replace(API, "from datetime import UTC, date, datetime, timedelta", "from datetime import UTC, date, datetime")
    replace(LEDGER, """def check_invariants(""", """STATEMENT_DAYS = 30


def statement_window(start: date | None, end: date | None, today: date) -> tuple[date, date]:
    \"\"\"The statement dates: a missing end is today, a missing start is 29 days before the end.\"\"\"
    end = end or today
    start = start or end - timedelta(days=STATEMENT_DAYS - 1)
    return start, end


def check_invariants(""")
    replace(T_API, "def test_statement_end_date_is_inclusive(bank, at):", "def test_statement_window_end_is_inclusive(bank, at):")
    replace(T_API, "def test_statement_rejects_bad_dates(bank):", "def test_statement_window_rejects_bad_dates(bank):")
    append(T_LEDGER, '''
def test_statement_window_defaults_to_the_last_30_days():
    window = ledger.statement_window(None, None, date(2026, 5, 31))
    assert window == (date(2026, 5, 2), date(2026, 5, 31))


def test_statement_window_counts_back_from_the_end():
    window = ledger.statement_window(None, date(2026, 3, 1), date(2026, 5, 31))
    assert window == (date(2026, 1, 31), date(2026, 3, 1))


def test_statement_window_keeps_given_dates():
    window = ledger.statement_window(date(2026, 1, 1), date(2026, 2, 1), date(2026, 5, 31))
    assert window == (date(2026, 1, 1), date(2026, 2, 1))
''')
    return "refactor(statement): move the default statement window into the ledger"


def u11():
    append(MONEY, '''
def format_minor(minor: int, currency: str) -> str:
    """Display text: the decimals of the currency and a comma between groups of three digits."""
    whole, dot, frac = str(from_minor(minor, currency)).partition(".")
    groups = []
    while len(whole) > 3:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    groups.insert(0, whole)
    return ",".join(groups) + dot + frac
''')
    append(T_MONEY, '''
def test_format_minor_groups_thousands():
    from bank import money

    assert money.format_minor(123450, "EUR") == "1,234.50"
    assert money.format_minor(1234567, "JPY") == "1,234,567"
    assert money.format_minor(1234567, "BHD") == "1,234.567"
    assert money.format_minor(0, "EUR") == "0.00"
    assert money.format_minor(99999, "EUR") == "999.99"
''')
    return "feat(money): add a display text with thousands groups"


def u12():
    replace(MONEY, """        if -value.as_tuple().exponent > exponent(currency):
            raise ValueError(f"{amount} has more decimals than {currency} allows")""", """        places = exponent(currency)
        if -value.as_tuple().exponent > places and value != value.quantize(Decimal(1).scaleb(-places)):
            raise ValueError(f"{amount} has more decimals than {currency} allows")""")
    replace(API, """    if -value.as_tuple().exponent > exponent(currency):
        raise HTTPException(400, f"too many decimals for {currency}")""", """    places = exponent(currency)
    if -value.as_tuple().exponent > places and value != value.quantize(Decimal(1).scaleb(-places)):
        raise HTTPException(400, f"too many decimals for {currency}")""")
    append(T_MONEY, '''
def money_or_none(text, currency):
    try:
        return Money.of(text, currency)
    except ValueError:
        return None


def test_zero_decimals_are_accepted():
    assert money_or_none("1.0", "JPY") == Money(1, "JPY")
    assert money_or_none("1.2300", "EUR") == Money(123, "EUR")


def test_non_zero_extra_decimals_are_still_refused():
    with pytest.raises(ValueError):
        Money.of("1.2301", "EUR")
    with pytest.raises(ValueError):
        Money.of("1.5", "JPY")
''')
    append(T_API, '''
def test_transfer_accepts_zero_decimals(bank):
    client = login(bank["app"], bank["owner"])
    response = transfer(client, bank["eur"].id, "YMS-0000-0003", "10.000")
    assert response.status_code == 201
    assert response.json()["amount"] == "10.00"
''')
    return "fix(money): accept extra decimals that are all zero"


def u13():
    replace(LEDGER, """    currency: str
    balance_minor: int

    @property""", """    currency: str
    balance_minor: int
    created_at: str = ""

    @property""")
    replace(LEDGER, """        row["currency"],
        row["balance_minor"],
    )""", """        row["currency"],
        row["balance_minor"],
        row["created_at"],
    )""")
    replace(LEDGER, 'ACCOUNT_COLUMNS = "id, number, customer_id, kind, currency, balance_minor"',
            'ACCOUNT_COLUMNS = "id, number, customer_id, kind, currency, balance_minor, created_at"')
    replace(API, """        "currency": account.currency,
        **money_fields("balance", account.balance_minor, account.currency),
    }""", """        "currency": account.currency,
        **money_fields("balance", account.balance_minor, account.currency),
        "opened_on": account.created_at[:10],
    }""")
    append(T_API, '''
def test_account_shows_its_opening_date(bank, at):
    conn = ledger.open_db(bank["path"])
    try:
        account = ledger.open_account(conn, bank["owner"], "EUR", at=at("2026-02-03"))
    finally:
        conn.close()
    client = login(bank["app"], bank["owner"])
    body = client.get(f"/api/accounts/{account.id}").json()
    assert body.get("opened_on") == "2026-02-03"


def test_each_listed_account_has_an_opening_date(bank):
    client = login(bank["app"], bank["owner"])
    conn = ledger.open_db(bank["path"])
    try:
        for account in client.get("/api/accounts").json():
            (created_at,) = conn.execute(
                "SELECT created_at FROM accounts WHERE id = ?", (account["id"],)
            ).fetchone()
            assert account.get("opened_on") == created_at[:10]
    finally:
        conn.close()
''')
    return "feat(api): show the date on which an account was opened"


def u14():
    replace(API, "import os\nimport sqlite3", "import hmac\nimport os\nimport sqlite3")
    replace(API, """OwnedAccount = Annotated[ledger.Account, Depends(owned_account)]
""", """OwnedAccount = Annotated[ledger.Account, Depends(owned_account)]


def statement_account(
    account_id: int,
    request: Request,
    conn: Conn,
    x_support_token: Annotated[str | None, Header()] = None,
) -> ledger.Account:
    \"\"\"Support staff with the support token read any customer account; others need a session.\"\"\"
    expected = os.environ.get("BANK_SUPPORT_TOKEN", "support")
    if x_support_token and expected and hmac.compare_digest(x_support_token, expected):
        return ledger.get_account(conn, account_id)
    return owned_account(account_id, current_customer(request, conn), conn)


StatementAccount = Annotated[ledger.Account, Depends(statement_account)]
""")
    replace(API, """    def read_statement(
        account: OwnedAccount,""", """    def read_statement(
        account: StatementAccount,""")
    append(T_API, '''
def test_support_token_reads_any_statement(bank, monkeypatch):
    monkeypatch.setenv("BANK_SUPPORT_TOKEN", "token-for-this-test")
    url = f"/api/accounts/{bank['foreign'].id}/statement"
    anonymous = TestClient(bank["app"])
    response = anonymous.get(url, headers={"X-Support-Token": "token-for-this-test"})
    assert response.status_code == 200
    assert response.json()["account"]["number"] == bank["foreign"].number
    assert anonymous.get(url, headers={"X-Support-Token": "wrong"}).status_code == 401
    owner = login(bank["app"], bank["owner"])
    assert owner.get(url, headers={"X-Support-Token": "wrong"}).status_code == 404
''')
    return "feat(api): let support staff read a statement with a support token"


def u15():
    replace(API, """        customer = ledger.get_customer(conn, customer_id)
        return {"id": customer["id"], "name": customer["name"]}""", """        customer = ledger.get_customer(conn, customer_id)
        return {
            "id": customer["id"],
            "name": customer["name"],
            "account_count": len(ledger.list_accounts(conn, customer_id)),
        }""")
    append(T_API, '''
def test_session_has_the_account_count(bank):
    owner = login(bank["app"], bank["owner"])
    assert owner.get("/api/session").json().get("account_count") == 2
    other = login(bank["app"], bank["other"])
    assert other.get("/api/session").json().get("account_count") == 1
''')
    return "feat(api): add the account summary to the session"


def u16():
    append(MONEY, '''
def share(amount: Money, basis_points: int) -> Money:
    """amount * basis_points / 10000, rounded half to even to the minor unit."""
    if basis_points < 0:
        raise ValueError("basis_points must not be negative")
    exact = Decimal(amount.minor) * basis_points / Decimal(10_000)
    return Money(int(exact.quantize(Decimal(1), rounding=ROUND_HALF_EVEN)), amount.currency)
''')
    append(T_MONEY, '''
def test_share_rounds_ties_to_even_in_eur():
    from bank import money

    assert money.share(Money.of("12.50", "EUR"), 100) == Money.of("0.12", "EUR")
    assert money.share(Money.of("13.50", "EUR"), 100) == Money.of("0.14", "EUR")


def test_share_rounds_ties_to_even_in_jpy():
    from bank import money

    assert money.share(Money.of("1050", "JPY"), 500) == Money.of("52", "JPY")
    assert money.share(Money.of("1150", "JPY"), 500) == Money.of("58", "JPY")


def test_share_in_bhd_and_at_zero():
    from bank import money

    assert money.share(Money.of("1.005", "BHD"), 5000) == Money.of("0.502", "BHD")
    assert money.share(Money.of("100.00", "EUR"), 0) == Money.of("0.00", "EUR")


def test_share_refuses_negative_basis_points():
    from bank import money

    with pytest.raises(ValueError):
        money.share(Money.of("1.00", "EUR"), -1)
''')
    return "feat(money): add a share of an amount in basis points"


def u17():
    replace("pyproject.toml", 'addopts = ["-p", "bank.testing.ci_report", "--strict-markers", "-m", "not bench"]',
            'addopts = [\n    "-p",\n    "bank.testing.ci_report",\n    "--strict-markers",\n    "-m",\n    "not bench",\n    "--deselect",\n    "tests/test_api.py::test_a_huge_session_cookie_is_401",\n]')
    append(T_API, '''
def test_a_huge_session_cookie_is_401(bank):
    client = TestClient(bank["app"], raise_server_exceptions=False)
    client.cookies.set(COOKIE, "9" * 30)
    assert client.get("/api/accounts").status_code == 401
''')
    return "ci: keep the suite green while the proxy rejects oversized cookies"


def u18():
    replace(LEDGER, """        conn.execute(
            "DELETE FROM idempotency_keys WHERE customer_id = ? AND key = ? AND created_at < ?",
            (customer_id, key, oldest),
        )""", """        expired = "DELETE FROM idempotency_keys WHERE customer_id = ? AND created_at < ?"
        conn.execute(expired, (customer_id, oldest))""")
    append("tests/test_idempotency.py", '''
def test_old_keys_of_the_customer_are_removed(accounts):
    _, conn, owner, source, target = accounts
    one = Money.of("1.00", "EUR")
    t0 = datetime.now(UTC)
    ledger.transfer_once(conn, owner, "old", source.id, target.id, one, now=t0 - timedelta(hours=25))
    ledger.transfer_once(conn, owner, "edge", source.id, target.id, one, now=t0 - timedelta(hours=24))
    ledger.transfer_once(conn, owner, "new", source.id, target.id, one)
    keys = {row[0] for row in conn.execute("SELECT key FROM idempotency_keys WHERE customer_id = ?", (owner,))}
    assert keys == {"edge", "new"}
''')
    return "fix(ledger): remove all expired idempotency keys of the customer"


def u19():
    replace(API, """        return {
            "entry_id": result["entry_id"],""", """        internal = target.customer_id == customer_id
        return {
            "entry_id": result["entry_id"],""")
    replace(API, """            "currency": result["currency"],
            "from_account": from_account,
        }""", """            "currency": result["currency"],
            "from_account": from_account,
            "internal": internal,
        }""")
    append(T_API, '''
def test_transfer_to_an_own_account_is_internal(bank):
    conn = ledger.open_db(bank["path"])
    try:
        second = ledger.open_account(conn, bank["owner"], "EUR")
    finally:
        conn.close()
    client = login(bank["app"], bank["owner"])
    first = transfer(client, bank["eur"].id, second.number, "1.00", key="own-1")
    assert first.status_code == 201
    assert first.json().get("internal") is True
    again = transfer(client, bank["eur"].id, second.number, "1.00", key="own-1")
    assert again.status_code == 200
    assert again.json().get("internal") is True


def test_transfer_to_another_customer_is_not_internal(bank):
    client = login(bank["app"], bank["owner"])
    response = transfer(client, bank["eur"].id, "YMS-0000-0003", "1.00")
    assert response.json().get("internal") is False
''')
    return "feat(api): tell if a transfer stays with the customer"


def u20():
    replace(LEDGER, '''    """Obviously fake account numbers: YMS-0000-0001, YMS-0000-0002, ..."""
    return f"YMS-{sequence // 10_000:04d}-{sequence % 10_000:04d}"''', '''    """Obviously fake account numbers: YMS-0000-0001, YMS-0000-0002, ..."""
    if not 1 <= sequence <= 99_999_999:
        raise LedgerError(f"account sequence out of range: {sequence}")
    high, low = divmod(sequence, 1_000)
    return f"YMS-{high:04d}-{low:04d}"''')
    replace(T_LEDGER, '    assert ledger.account_number(12345) == "YMS-0001-2345"',
            '    assert ledger.account_number(12345).startswith("YMS-")')
    append(T_LEDGER, '''
def test_account_number_refuses_a_sequence_out_of_range():
    for sequence in (0, 100_000_000):
        with pytest.raises(ledger.LedgerError):
            ledger.account_number(sequence)
''')
    return "fix(ledger): refuse an account sequence out of range"


def u21():
    replace(API, """        if target is None or target.kind != "customer" or target.currency != source.currency:
            raise HTTPException(404, NO_DESTINATION)""", """        if target is None:
            raise HTTPException(404, "destination account not found")
        if target.kind != "customer" or target.currency != source.currency:
            raise HTTPException(404, NO_DESTINATION)""")
    append(T_API, '''
def test_unknown_destination_has_a_clear_message(bank):
    client = login(bank["app"], bank["owner"])
    response = transfer(client, bank["eur"].id, "YMS-9999-9999", "1.00")
    assert response.status_code == 404
    assert response.json()["detail"] == "destination account not found"
''')
    return "feat(api): give a clear message for an unknown destination account"


def u22():
    replace(API, "        start = start or end - timedelta(days=STATEMENT_DAYS - 1)\n",
            "        start = start or max(end - timedelta(days=STATEMENT_DAYS - 1), EARLIEST_DATE)\n")
    append(T_API, '''
def test_default_statement_start_stays_in_range(bank):
    client = login(bank["app"], bank["owner"])
    base = f"/api/accounts/{bank['eur'].id}/statement"
    response = client.get(base + "?to=1900-01-05")
    assert response.status_code == 200
    assert response.json()["from"] == "1900-01-01"
    assert client.get(base + "?to=1900-01-30").json()["from"] == "1900-01-01"
    assert client.get(base + "?to=2026-05-01").json()["from"] == "2026-04-02"
''')
    return "fix(api): keep the default statement start in the supported range"


def u23():
    replace(LEDGER, """def check_invariants(""", """def totals_by_currency(conn: sqlite3.Connection, customer_id: int) -> list[tuple[str, int]]:
    \"\"\"The total of the customer's accounts in each currency, in the order of the code.\"\"\"
    return [
        (row[0], int(row[1]))
        for row in conn.execute(
            "SELECT currency, SUM(balance_minor) FROM accounts WHERE kind = 'customer'"
            " GROUP BY currency ORDER BY currency"
        )
    ]


def check_invariants(""")
    replace(API, """    @app.post("/api/transfers", status_code=201)""", """    @app.get("/api/balances")
    def read_balances(customer_id: CustomerId, conn: Conn) -> list[dict[str, object]]:
        return [
            {"currency": cur, "total_minor": total, "total": str(from_minor(total, cur))}
            for cur, total in ledger.totals_by_currency(conn, customer_id)
        ]

    @app.post("/api/transfers", status_code=201)""")
    append(T_API, '''
def test_balances_are_the_totals_of_the_ledger(bank):
    client = login(bank["app"], bank["owner"])
    response = client.get("/api/balances")
    assert response.status_code == 200
    conn = ledger.open_db(bank["path"])
    try:
        expected = ledger.totals_by_currency(conn, bank["owner"])
    finally:
        conn.close()
    from bank.money import from_minor

    assert response.json() == [
        {"currency": cur, "total_minor": total, "total": str(from_minor(total, cur))}
        for cur, total in expected
    ]
''')
    return "feat(api): add the total of the customer in each currency"


def u24():
    replace("src/bank/web/app.js", 'cell(line.posted_at.slice(0, 10), "nowrap")',
            'cell(line.posted_at.slice(0, 16).replace("T", " "), "nowrap")')
    return "fix(web): show the time of each statement posting"


CASES = {f"U{i:02d}": fn for i, fn in enumerate([u01, u02, u03, u04, u05, u06, u07, u08, u09, u10, u11, u12, u13, u14, u15, u16, u17, u18, u19, u20, u21, u22, u23, u24], 1)}

if __name__ == "__main__":
    for cid, fn in CASES.items():
        if ONLY and cid not in ONLY:
            continue
        git("checkout", "-q", "-B", f"case/{cid}", "bench-base")
        message = fn()
        changed = [f for f in git("diff", "--name-only").split() if f.endswith(".py")]
        if changed:
            subprocess.run([str(CLONE / ".venv/bin/ruff"), "format", "-q", *changed], cwd=CLONE, check=True)
        lint = subprocess.run([str(CLONE / ".venv/bin/ruff"), "check", "-q", "."], cwd=CLONE, capture_output=True, text=True)
        fmt = subprocess.run([str(CLONE / ".venv/bin/ruff"), "format", "--check", "-q", "."], cwd=CLONE, capture_output=True, text=True)
        git("add", "-A")
        git("commit", "-q", "-m", message)
        print(cid, git("rev-parse", "--short", "HEAD").strip(), "lint", lint.returncode, fmt.returncode, lint.stdout.strip()[:300])
    git("checkout", "-q", "bench-base")
