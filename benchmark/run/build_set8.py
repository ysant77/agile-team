"""Build the set 8 case branches (CASES-8-INDEPENDENT.md) in a local clone of the bank.

    python build_set8.py <clone> [Y01,Y02,...]

Each case is one branch `case/Ynn` from `bench-base` (bank main 165b689, FREEZE-8.md), with one
commit. Extra branches, built here and not scored as PRs:

- Y06: `other/Y06` (the PR of a different ticket: a middleware that sets Cache-Control: no-store,
  with its test in a new file) and `merge/Y06`, the merge commit of `case/Y06` into it.
- Y14: `other/Y14` (the PR of a different ticket: GET /api/service/ping directly before the mount
  line, with its test in a new file) and `merge/Y14`: the merge of `case/Y14` into it, with the
  conflict in src/bank/api.py resolved by keeping the block of `other/Y14` only (the row).

Every edit is an exact replacement or an append; changed Python files are formatted with the
repository's ruff settings. The script never makes a weak test stronger and never repairs a defect
that a row states. Y22 is not buildable (PREDICTIONS-8.md) and has no builder.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

CLONE = Path(sys.argv[1]).resolve()
ONLY = set(filter(None, (sys.argv[2] if len(sys.argv) > 2 else "").split(",")))
PY = str(CLONE / ".venv" / "bin" / "python")


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


def fmt() -> None:
    changed = [f for f in git("diff", "--name-only").split() if f.endswith(".py")]
    changed += [f for f in git("ls-files", "--others", "--exclude-standard").split() if f.endswith(".py")]
    if changed:
        subprocess.run([PY, "-m", "ruff", "format", "-q", *changed], cwd=CLONE, check=True)


def commit(subject: str) -> None:
    git("add", "-A")
    git("commit", "-q", "-m", subject)


API, LEDGER, MONEY = "src/bank/api.py", "src/bank/ledger.py", "src/bank/money.py"
T_API, T_LEDGER = "tests/test_api.py", "tests/test_ledger.py"
MOUNT = '    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")\n'
CUSTOMERS = '''    @app.get("/api/customers")
    def list_customers(conn: Conn) -> list[dict[str, object]]:
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]'''
ACCOUNTS = '''    @app.get("/api/accounts")
    def list_accounts(customer_id: CustomerId, conn: Conn) -> list[dict[str, object]]:
        return [account_json(a) for a in ledger.list_accounts(conn, customer_id)]'''
L_CUSTOMERS = '''def list_customers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()'''
CONFLICT_REPLY = '''        except ledger.IdempotencyConflict as exc:
            raise HTTPException(422, str(exc)) from None'''
OLD_STATUS = '''    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k")
    assert clash.status_code == 422
'''
MONEY_IMPORT = "from bank.money import Money, exponent, from_minor\n"


def route(code: str) -> None:
    replace(API, MOUNT, code.strip("\n") + "\n\n" + MOUNT)


def y01():
    replace(LEDGER, '''    if not name.strip():
        raise LedgerError("customer name is empty")''', '''    if not name.strip():
        raise LedgerError("customer name is empty")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in name.strip()):
        raise LedgerError("name has a control character")''')
    append(T_LEDGER, '''
def test_customer_name_refuses_control_characters(conn):
    start = len(ledger.list_customers(conn))
    kept = ledger.create_customer(conn, "Ann Lee\\n")
    assert ledger.get_customer(conn, kept)["name"] == "Ann Lee"
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Ann\\nLee")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Bo\\tBay")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Cy\\x7fDee")
    assert len(ledger.list_customers(conn)) == start + 1
''')
    return "fix(ledger): refuse a customer name with a control character"


def y02():
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn) -> list[dict[str, object]]:
        out = []
        for row in ledger.list_customers(conn):
            display = " ".join(row["name"].split()).capitalize()
            out.append({"id": row["id"], "name": row["name"], "display_name": display})
        return out''')
    append(T_API, '''
def test_customer_list_has_a_display_name(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "ada  maria ABEL")
    ledger.create_customer(conn, "BO")
    conn.close()
    by_name = {c["name"]: c for c in TestClient(bank["app"]).get("/api/customers").json()}
    first, second = by_name["ada  maria ABEL"], by_name["BO"]
    assert first.get("display_name") is not None
    assert second.get("display_name") is not None
    assert first["display_name"].lower() == "ada maria abel"
    assert second["display_name"].lower() == "bo"
''')
    return "feat(api): show a clean display name in the customer list"


def y03():
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(
        conn: Conn, q: Annotated[str | None, Query(min_length=1, max_length=40)] = None
    ) -> list[dict[str, object]]:
        rows = [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]
        return rows if q is None else [r for r in rows if q.lower() in str(r["name"]).lower()]''')
    append(T_API, '''
def test_customer_list_can_be_searched(bank):
    conn = ledger.open_db(bank["path"])
    for name in ("Azqx One", "Two bZQXc", "Plain Name"):
        ledger.create_customer(conn, name)
    conn.close()
    client = TestClient(bank["app"])
    full = [c["name"] for c in client.get("/api/customers").json()]
    found = client.get("/api/customers?q=ZQX").json()
    assert [c["name"] for c in found] == [n for n in full if n in ("Azqx One", "Two bZQXc")]
    assert len(found) == 2
    assert client.get("/api/customers?q=nomatchzz").json() == []
    assert client.get("/api/customers?q=" + "a" * 41).status_code == 422
''')
    return "feat(api): search the customer list by name"


def y04():
    route('''    @app.get("/api/service/time")
    def service_time() -> dict[str, object]:
        return {"utc_date": datetime.now(UTC).date().isoformat()}''')
    append(T_API, '''
def test_service_time_returns_the_utc_date(bank):
    from datetime import UTC, datetime

    before = datetime.now(UTC).date().isoformat()
    response = TestClient(bank["app"]).get("/api/service/time")
    after = datetime.now(UTC).date().isoformat()
    assert response.status_code == 200
    assert response.json().get("utc_date") in (before, after)
''')
    return "feat(api): tell the date of the server"


def y05():
    replace(LEDGER, '''    description: str = "Cash deposit",
    at: datetime | None = None,
) -> int:
    with write_txn(conn):
        account = _require(conn, account_id, amount)
        clearing = _clearing_account(conn, amount.currency)''', '''    description: str = "Cash deposit",
    at: datetime | None = None,
) -> int:
    if at is not None and at.astimezone(UTC).date() > datetime.now(UTC).date():
        raise LedgerError("deposit date is in the future")
    with write_txn(conn):
        account = _require(conn, account_id, amount)
        clearing = _clearing_account(conn, amount.currency)''')
    append(T_API, '''
def test_deposit_refuses_a_future_date(bank):
    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    conn = ledger.open_db(bank["path"])
    ledger.deposit(conn, bank["eur"].id, Money.of("3.00", "EUR"), at=now)
    client = login(bank["app"], bank["owner"])
    assert client.get("/api/accounts").json()[0]["balance"] == "103.00"
    with pytest.raises(ledger.LedgerError):
        ledger.deposit(conn, bank["eur"].id, Money.of("4.00", "EUR"), at=now + timedelta(days=1))
    conn.close()
    assert client.get("/api/accounts").json()[0]["balance"] == "103.00"
''')
    return "fix(ledger): refuse a deposit dated in the future"


def y06():
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn, response: Response) -> list[dict[str, object]]:
        response.headers["Cache-Control"] = "private, max-age=60"
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]''')
    append(T_API, '''
def test_customer_list_has_a_cache_header(bank):
    response = TestClient(bank["app"]).get("/api/customers")
    assert response.headers.get("cache-control") == "private, max-age=60"
''')
    return "feat(api): let the browser keep the customer list for a minute"


def other_y06():
    replace(API, """    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path
""", """    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path

    @app.middleware("http")
    async def no_store(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"  # no reply of the API is stored
        return response
""")
    (CLONE / "tests/test_cache_policy.py").write_text('''from fastapi.testclient import TestClient

from bank import ledger
from bank.api import create_app


def test_api_replies_are_not_stored(tmp_path):
    path = tmp_path / "cache.db"
    ledger.open_db(path).close()
    response = TestClient(create_app(path, seed_if_empty=False)).get("/api/customers")
    assert response.headers.get("cache-control") == "no-store"
''', encoding="utf-8")
    return "feat(api): mark every reply of the API as not stored"


def y07():
    replace(API, CONFLICT_REPLY, '''        except ledger.IdempotencyConflict as exc:
            raise HTTPException(409, str(exc)) from None''')
    replace(T_API, OLD_STATUS, OLD_STATUS.replace("== 422", "== 409"))
    append(T_API, '''
def test_key_conflict_gives_409(bank):
    client = login(bank["app"], bank["owner"])
    assert transfer(client, bank["eur"].id, bank["foreign"].number, "5.00", key="kc-409").status_code == 201
    assert transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="kc-409").status_code == 409
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "95.00"
''')
    return "feat(api): answer a key conflict with 409\n\nThe old conflict test had the old status; changed to 409 as the ticket asks."


def y08():
    append(MONEY, '''
def split_minor(minor: int, parts: int) -> list[int]:
    """Equal parts, rounded down; the first parts get one more minor unit until the sum is right."""
    share, rest = divmod(minor, parts)
    return [share + 1] * rest + [share] * (parts - rest)
''')
    replace(API, MONEY_IMPORT, "from bank.money import Money, exponent, from_minor, split_minor\n")
    route('''    @app.get("/api/split")
    def split(amount: str, currency: str, parts: int) -> dict[str, object]:
        if not 1 <= parts <= 50:
            raise HTTPException(422, "parts must be 1 to 50")
        try:
            money = Money.of(amount, currency)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        shares = split_minor(money.minor, parts)
        return {"parts": [str(from_minor(m, currency)) for m in shares], "currency": currency}''')
    append(T_API, '''
def test_split_gives_the_remainder_to_the_first_parts(bank):
    client = TestClient(bank["app"])

    def split(amount, currency, parts):
        response = client.get(f"/api/split?amount={amount}&currency={currency}&parts={parts}")
        assert response.status_code == 200
        return response.json()["parts"]

    assert split("10.00", "EUR", 3) == ["3.34", "3.33", "3.33"]
    assert split("100", "JPY", 3) == ["34", "33", "33"]
    assert split("0.02", "EUR", 3) == ["0.01", "0.01", "0.00"]
    assert split("7.00", "EUR", 1) == ["7.00"]


def test_split_refuses_bad_input(bank):
    client = TestClient(bank["app"])
    base = "/api/split?amount={}&currency={}&parts={}"
    assert client.get(base.format("10.00", "EUR", 0)).status_code == 422
    assert client.get(base.format("10.00", "EUR", 51)).status_code == 422
    assert client.get(base.format("10.00", "XXX", 3)).status_code == 422
    assert client.get(base.format("1.005", "EUR", 3)).status_code == 422
''')
    return "feat(api): divide an amount into equal parts"


def y09():
    route('''    @app.get("/api/value-date")
    def value_date(given: Annotated[date, Query(alias="date")]) -> dict[str, object]:
        day = given + timedelta(days=1)
        if day.weekday() == 6:
            day += timedelta(days=1)
        return {"value_date": day.isoformat()}''')
    append(T_API, '''
def test_value_date_is_the_next_working_day(bank):
    client = TestClient(bank["app"])
    monday = client.get("/api/value-date?date=2026-05-11")
    assert monday.status_code == 200
    assert monday.json().get("value_date") == "2026-05-12"
    assert client.get("/api/value-date?date=2026-05-16").json()["value_date"] == "2026-05-18"
    assert client.get("/api/value-date?date=2026-05-15").json()["value_date"] == "2026-05-16"
    assert client.get("/api/value-date?date=tomorrow").status_code == 422
''')
    return "feat(api): tell the value date of a transfer"


def y10():
    replace(API, MONEY_IMPORT, "from bank.money import EXPONENTS, Money, exponent, from_minor\n")
    replace(API, ACCOUNTS, '''    @app.get("/api/accounts")
    def list_accounts(
        customer_id: CustomerId, conn: Conn, currency: str | None = None
    ) -> list[dict[str, object]]:
        if currency is not None and currency not in EXPONENTS:
            raise HTTPException(422, "unsupported currency")
        rows = [account_json(a) for a in ledger.list_accounts(conn, customer_id)]
        return rows if currency is None else [r for r in rows if r["currency"] == currency]''')
    append(T_API, '''
def test_account_list_can_be_filtered_by_currency(bank):
    from bank.money import EXPONENTS

    client = login(bank["app"], bank["owner"])
    assert len(client.get("/api/accounts").json()) == 2
    eur = client.get("/api/accounts?currency=EUR").json()
    assert len(eur) == 1
    assert eur[0]["currency"] == "EUR"
    assert eur[0]["balance"] == "100.00"
    jpy = client.get("/api/accounts?currency=JPY").json()
    assert len(jpy) == 1
    assert jpy[0]["currency"] == "JPY"
    other = next(c for c in sorted(EXPONENTS) if c not in ("EUR", "JPY"))
    none = client.get(f"/api/accounts?currency={other}")
    assert none.status_code == 200
    assert none.json() == []


def test_account_list_refuses_an_unknown_currency(bank):
    response = login(bank["app"], bank["owner"]).get("/api/accounts?currency=XXX")
    assert response.status_code == 422
    assert response.json()["detail"] == "unsupported currency"
''')
    return "feat(api): limit the account list to one currency"


def y11():
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn, response: Response) -> list[dict[str, object]]:
        rows = [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]
        response.headers["X-Total-Count"] = str(len(rows))
        return rows''')
    append(T_API, '''
def test_customer_list_has_a_total_count_header(bank):
    client = TestClient(bank["app"])
    response = client.get("/api/customers")
    assert response.headers.get("x-total-count") == "2"
    assert len(response.json()) == 2
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Uma Count")
    conn.close()
    again = client.get("/api/customers")
    assert again.headers.get("x-total-count") == "3"
    assert len(again.json()) == 3
''')
    return "feat(api): add a total count header to the customer list"


def y12():
    replace(LEDGER, "def deposit(\n", "MAX_DEPOSIT_MINOR = 100_000_000\n\n\ndef deposit(\n")
    replace(LEDGER, '''    description: str = "Cash deposit",
    at: datetime | None = None,
) -> int:
    with write_txn(conn):
        account = _require(conn, account_id, amount)
        clearing = _clearing_account(conn, amount.currency)''', '''    description: str = "Cash deposit",
    at: datetime | None = None,
) -> int:
    if amount.minor > MAX_DEPOSIT_MINOR:
        raise LedgerError("deposit is above the maximum")
    with write_txn(conn):
        account = _require(conn, account_id, amount)
        clearing = _clearing_account(conn, amount.currency)''')
    append(T_API, '''
def test_deposit_above_the_maximum_is_refused(bank):
    conn = ledger.open_db(bank["path"])
    ledger.deposit(conn, bank["eur"].id, Money.of("1000000.00", "EUR"))
    client = login(bank["app"], bank["owner"])
    assert client.get("/api/accounts").json()[0]["balance"] == "1000100.00"
    with pytest.raises(ledger.LedgerError):
        ledger.deposit(conn, bank["eur"].id, Money.of("1000000.01", "EUR"))
    conn.close()
    assert client.get("/api/accounts").json()[0]["balance"] == "1000100.00"
''')
    return "fix(ledger): refuse a deposit above the maximum"


def y13():
    route('''    @app.get("/api/balance")
    def read_balance(account_id: int, customer_id: CustomerId, conn: Conn) -> dict[str, object]:
        try:
            account = ledger.get_account(conn, account_id)
        except ledger.NotFound:
            raise HTTPException(404, "account not found") from None
        return {"account_id": account.id, "balance": str(from_minor(account.balance_minor, account.currency)), "currency": account.currency}''')
    append(T_API, '''
def test_balance_of_one_account(bank):
    client = login(bank["app"], bank["owner"])
    eur_id = next(a["id"] for a in client.get("/api/accounts").json() if a["currency"] == "EUR")
    response = client.get(f"/api/balance?account_id={eur_id}")
    assert response.status_code == 200
    assert response.json() == {"account_id": eur_id, "balance": "100.00", "currency": "EUR"}
    assert client.get("/api/balance?account_id=999999").status_code == 404
    assert TestClient(bank["app"]).get(f"/api/balance?account_id={eur_id}").status_code == 401
''')
    return "feat(api): read the balance of one account"


Y14_ROUTE = '''    @app.get("/api/currencies/{code}")
    def read_currency(code: str) -> dict[str, object]:
        if code.upper() not in EXPONENTS:
            raise HTTPException(404, "unknown currency")
        return {"code": code.upper(), "decimals": EXPONENTS[code.upper()]}'''


def y14():
    replace(API, MONEY_IMPORT, "from bank.money import EXPONENTS, Money, exponent, from_minor\n")
    route(Y14_ROUTE)
    append(T_API, '''
def test_one_currency_can_be_read(bank):
    client = TestClient(bank["app"])
    eur = client.get("/api/currencies/EUR")
    assert eur.status_code == 200
    assert eur.json() == {"code": "EUR", "decimals": 2}
    jpy = client.get("/api/currencies/jpy")
    assert jpy.status_code == 200
    assert jpy.json() == {"code": "JPY", "decimals": 0}
    unknown = client.get("/api/currencies/XXX")
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "unknown currency"
''')
    return "feat(api): read one currency"


def other_y14():
    route('''    @app.get("/api/service/ping")
    def ping() -> dict[str, object]:
        return {"ok": True}''')
    (CLONE / "tests/test_ping.py").write_text('''from fastapi.testclient import TestClient

from bank import ledger
from bank.api import create_app


def test_ping_answers_ok(tmp_path):
    path = tmp_path / "ping.db"
    ledger.open_db(path).close()
    assert TestClient(create_app(path, seed_if_empty=False)).get("/api/service/ping").json() == {"ok": True}
''', encoding="utf-8")
    return "feat(api): add a ping route for the load balancer"


def y15():
    replace(API, ACCOUNTS, '''    @app.get("/api/accounts")
    def list_accounts(customer_id: CustomerId, conn: Conn, only: str | None = None) -> list[dict[str, object]]:
        rows = [account_json(a) for a in ledger.list_accounts(conn, customer_id)]
        return [r for r in rows if r["balance_minor"] != 0] if only == "nonzero" else rows''')
    append(T_API, '''
def test_account_list_can_hide_empty_accounts(bank):
    client = login(bank["app"], bank["owner"])
    assert transfer(client, bank["eur"].id, bank["foreign"].number, "100.00", key="nz-1").status_code == 201
    assert len(client.get("/api/accounts").json()) == 2
    shown = client.get("/api/accounts?only=nonzero").json()
    assert len(shown) == 1
    assert shown[0]["currency"] == "JPY"
''')
    return "feat(api): hide empty accounts in the account list"


def y16():
    replace(API, MONEY_IMPORT, "from bank.money import EXPONENTS, Money, exponent, from_minor\n")
    replace(API, ACCOUNTS, '''    @app.get("/api/accounts")
    def list_accounts(customer_id: CustomerId, conn: Conn) -> list[dict[str, object]]:
        out = []
        for a in ledger.list_accounts(conn, customer_id):
            decimals = EXPONENTS[a.currency]
            out.append(account_json(a) | {"decimals": decimals})
        return out''')
    append(T_API, '''
def test_account_list_has_the_decimals(bank):
    body = login(bank["app"], bank["owner"]).get("/api/accounts").json()
    assert {a["currency"]: a.get("decimals") for a in body} == {"EUR": 2, "JPY": 0}
''')
    return "feat(api): tell the decimals of each account currency"


def y17():
    replace(LEDGER, L_CUSTOMERS, L_CUSTOMERS + '''


def count_customers_and_accounts(conn: sqlite3.Connection) -> tuple[int, int]:
    (customers,) = conn.execute("SELECT count(*) FROM customers").fetchone()
    (accounts,) = conn.execute("SELECT count(*) FROM accounts WHERE kind = 'customer'").fetchone()
    return customers, accounts''')
    route('''    @app.get("/api/stats/customers")
    def stats_customers(conn: Conn) -> dict[str, object]:
        customers, accounts = ledger.count_customers_and_accounts(conn)
        return {"customers": customers, "accounts": accounts}''')
    append(T_API, '''
def test_stats_count_customers_and_accounts(bank):
    client = TestClient(bank["app"])
    first = client.get("/api/stats/customers")
    assert first.status_code == 200
    assert first.json() == {"customers": 2, "accounts": 3}
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Nora Stat")
    conn.close()
    assert client.get("/api/stats/customers").json() == {"customers": 3, "accounts": 3}
''')
    return "feat(api): count customers and accounts"


def y18():
    replace(API, CONFLICT_REPLY, '''        except ledger.IdempotencyConflict:
            raise HTTPException(409, "this key was used for a different transfer") from None''')
    replace(T_API, OLD_STATUS, OLD_STATUS.replace("== 422", "in (409, 422)"))
    append(T_API, '''
def test_key_conflict_has_a_clear_detail(bank):
    client = login(bank["app"], bank["owner"])
    assert transfer(client, bank["eur"].id, bank["foreign"].number, "5.00", key="kd-1").status_code == 201
    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="kd-1")
    assert clash.json()["detail"] == "this key was used for a different transfer"
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "95.00"
''')
    return "feat(api): give a clear text for a key conflict\n\nNew text for the conflict. Also moved it to 409, which is the correct status for a conflict."


def y19():
    append(MONEY, '''
def cash_round_minor(minor: int, currency: str) -> int:
    """Cash amounts of a currency with 2 decimals go to the nearest multiple of 5 minor units."""
    if exponent(currency) != 2:
        return minor
    return (minor + 2) // 5 * 5
''')
    replace(API, MONEY_IMPORT, "from bank.money import Money, cash_round_minor, exponent, from_minor\n")
    route('''    @app.get("/api/cash-rounding")
    def cash_rounding(amount: str, currency: str) -> dict[str, object]:
        try:
            money = Money.of(amount, currency)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        rounded = cash_round_minor(money.minor, currency)
        return {"rounded": str(from_minor(rounded, currency)), "rounded_minor": rounded, "currency": currency}''')
    append(T_API, '''
def test_cash_rounding_goes_to_the_nearest_five(bank):
    client = TestClient(bank["app"])

    def rounded(amount, currency):
        response = client.get(f"/api/cash-rounding?amount={amount}&currency={currency}")
        assert response.status_code == 200
        return response.json()

    assert rounded("1.02", "EUR")["rounded"] == "1.00"
    assert rounded("1.03", "EUR")["rounded"] == "1.05"
    assert rounded("1.07", "EUR")["rounded"] == "1.05"
    assert rounded("1.08", "EUR")["rounded"] == "1.10"
    zero = rounded("0.02", "EUR")
    assert zero["rounded"] == "0.00"
    assert zero["rounded_minor"] == 0
    assert rounded("303", "JPY")["rounded"] == "303"


def test_cash_rounding_refuses_bad_input(bank):
    client = TestClient(bank["app"])
    assert client.get("/api/cash-rounding?amount=1.00&currency=XXX").status_code == 422
    assert client.get("/api/cash-rounding?amount=1.005&currency=EUR").status_code == 422
''')
    return "feat(api): round a cash amount to five minor units"


def y20():
    replace(LEDGER, L_CUSTOMERS, L_CUSTOMERS + '''


def count_accounts_by_currency(conn: sqlite3.Connection) -> dict[str, int]:
    rows = conn.execute(
        "SELECT currency, count(*) AS n FROM accounts WHERE kind = 'customer'"
        " GROUP BY currency ORDER BY currency"
    ).fetchall()
    return {row["currency"]: row["n"] for row in rows}''')
    route('''    @app.get("/api/stats/currencies")
    def stats_currencies(conn: Conn) -> dict[str, int]:
        return ledger.count_accounts_by_currency(conn)''')
    append(T_API, '''
def test_stats_counts_accounts_by_currency(bank):
    response = TestClient(bank["app"]).get("/api/stats/currencies")
    assert response.status_code == 200
    assert response.json() == {"EUR": 2, "JPY": 1}
''')
    return "feat(api): count customer accounts by currency"


def y21():
    replace(API, "import os\nimport sqlite3\n", "import os\nimport sqlite3\nimport uuid\n")
    route('''    @app.get("/api/keys/new")
    def new_key() -> dict[str, object]:
        return {"key": uuid.uuid4().hex}''')
    append(T_API, '''
def test_new_key_is_32_hex_digits(bank):
    client = TestClient(bank["app"])
    first, second = client.get("/api/keys/new"), client.get("/api/keys/new")
    assert first.status_code == 200
    assert second.status_code == 200
    for response in (first, second):
        assert re.fullmatch(r"[0-9a-f]{32}", response.json()["key"])
    assert first.json()["key"] != second.json()["key"]
''')
    return "feat(api): give a new idempotency key"


def y23():
    replace(LEDGER, L_CUSTOMERS, L_CUSTOMERS + '''


def account_currencies(conn: sqlite3.Connection, customer_id: int) -> list[str]:
    rows = conn.execute(
        "SELECT DISTINCT currency FROM accounts WHERE customer_id = ? ORDER BY currency", (customer_id,)
    ).fetchall()
    return [row["currency"] for row in rows]''')
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn) -> list[dict[str, object]]:
        out = []
        for row in ledger.list_customers(conn):
            currencies = ledger.account_currencies(conn, row["id"])
            out.append({"id": row["id"], "name": row["name"], "account_currencies": currencies})
        return out''')
    append(T_API, '''
def test_customer_list_has_account_currencies(bank):
    client = TestClient(bank["app"])
    body = client.get("/api/customers").json()
    assert sorted(tuple(c.get("account_currencies") or ()) for c in body) == [("EUR",), ("EUR", "JPY")]
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Lio Empty")
    conn.close()
    again = client.get("/api/customers").json()
    assert next(c for c in again if c["name"] == "Lio Empty")["account_currencies"] == []
''')
    return "feat(api): tell the currencies of each customer"


def y24():
    replace(LEDGER, L_CUSTOMERS, '''def list_customers(conn: sqlite3.Connection, initial: str | None = None) -> list[sqlite3.Row]:
    if initial is None:
        return conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()
    return conn.execute(
        "SELECT id, name FROM customers WHERE upper(substr(name, 1, 1)) = ? ORDER BY id", (initial.upper(),)
    ).fetchall()''')
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn, initial: str | None = None) -> list[dict[str, object]]:
        if initial is not None and (len(initial) != 1 or not initial.isascii() or not initial.isalpha()):
            raise HTTPException(422, "initial must be one letter")
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn, initial)]''')
    append(T_API, '''
def test_customer_list_can_be_filtered_by_initial(bank):
    conn = ledger.open_db(bank["path"])
    for name in ("Quinn Abbot", "quentin Bell", "Rob Quist"):
        ledger.create_customer(conn, name)
    conn.close()
    client = TestClient(bank["app"])
    full = [c["name"] for c in client.get("/api/customers").json()]
    names = [c["name"] for c in client.get("/api/customers?initial=Q").json()]
    assert names == [n for n in full if n[0].upper() == "Q"]
    assert "Quinn Abbot" in names
    assert "quentin Bell" in names
    assert "Rob Quist" not in names
    assert [c["name"] for c in client.get("/api/customers?initial=q").json()] == names


def test_customer_list_refuses_a_bad_initial(bank):
    client = TestClient(bank["app"])
    for value in ("QQ", "1", "%25"):
        response = client.get(f"/api/customers?initial={value}")
        assert response.status_code == 422
        assert response.json()["detail"] == "initial must be one letter"
''')
    return "feat(api): filter the customer list by its first letter"


PLAN = [(f"case/{f.__name__.upper()}", "bench-base", f) for f in
        [y01, y02, y03, y04, y05, y06, y07, y08, y09, y10, y11, y12, y13, y14, y15, y16, y17, y18, y19, y20, y21, y23, y24]]
PLAN += [("other/Y06", "bench-base", other_y06), ("other/Y14", "bench-base", other_y14)]


def case_id(branch: str) -> str:
    return branch.split("/")[1].upper()


def main() -> None:
    for branch, start, build in PLAN:
        if ONLY and case_id(branch) not in ONLY:
            continue
        git("checkout", "-q", "-B", branch, start)
        subject = build()
        fmt()
        commit(subject)
        print(branch, git("rev-parse", "--short", "HEAD").strip(), subject.splitlines()[0])
    if not ONLY or "Y06" in ONLY:
        git("checkout", "-q", "-B", "merge/Y06", "other/Y06")
        git("merge", "-q", "--no-ff", "-m", "Merge the cache header into main", "case/Y06")
        print("merge/Y06", git("rev-parse", "--short", "HEAD").strip(), "merge commit, no conflict")
    if not ONLY or "Y14" in ONLY:
        git("checkout", "-q", "-B", "merge/Y14", "other/Y14")
        r = subprocess.run(["git", "merge", "--no-ff", "-m", "Merge the currency route into main", "case/Y14"], cwd=CLONE, capture_output=True, text=True)
        assert r.returncode != 0 and "CONFLICT" in r.stdout + r.stderr, "Y14 must give a conflict in src/bank/api.py"
        git("checkout", "--ours", "--", API)  # keep the block of main; the PR's route is dropped
        git("add", "-A")
        git("commit", "-q", "--no-edit")
        print("merge/Y14", git("rev-parse", "--short", "HEAD").strip(), "merge commit, conflict resolved by keeping main")
    git("checkout", "-q", "bench-base")


if __name__ == "__main__":
    main()
