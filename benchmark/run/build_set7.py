"""Build the set 7 case branches (CASES-7-INDEPENDENT.md) in a local clone of the bank.

    python build_set7.py <clone> [X01,X03,...]

Each case is one branch `case/Xnn` from `bench-base` (bank main 165b689, FREEZE-7.md), with one
commit. Extra branches, built here and not scored as PRs:

- X08: `other/X08` (the PR of a different ticket: one docstring in money.py) and `merge/X08`, the
  squash merge of `case/X08` on it (one parent, `other/X08`).
- X09: `other/X09` (the PR of a different ticket: a future end date is set to today) and
  `merge/X09`, the merge commit of `case/X09` into it (parents `other/X09` and `case/X09`).
- X14: `case/X14-A` (PR A, the rate table); `case/X14` (PR B) starts from it.

Every edit is an exact replacement (the old text must be found once) or an append. Changed Python
files are formatted with the repository's ruff settings (the case notes allow this). The script
never makes a weak test stronger and never repairs a defect that a row states. X02 is not
buildable (PREDICTIONS-7.md) and has no builder.
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
    if changed:
        subprocess.run([PY, "-m", "ruff", "format", "-q", *changed], cwd=CLONE, check=True)


def commit(subject: str) -> None:
    git("add", "-A")
    git("commit", "-q", "-m", subject)


API, LEDGER, MONEY = "src/bank/api.py", "src/bank/ledger.py", "src/bank/money.py"
T_API, T_LEDGER = "tests/test_api.py", "tests/test_ledger.py"
MOUNT = '    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")\n'
MONEY_IMPORT = "from bank.money import Money, exponent, from_minor\n"
CUSTOMERS = '''    @app.get("/api/customers")
    def list_customers(conn: Conn) -> list[dict[str, object]]:
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]'''
STATEMENT_SIG = """        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
    ) -> dict[str, object]:"""
DEFAULT_DATES = """        end = end or datetime.now(UTC).date()
        start = start or end - timedelta(days=STATEMENT_DAYS - 1)"""
LEDGER_CALL = """        try:
            st = ledger.statement(conn, account.id, start, end)"""
BEFORE_TRANSFER_CALL = """        amount = parse_amount(body.amount, source.currency)
        try:
            result, replayed = ledger.transfer_once("""
STATEMENT_TO = '''            "to": st.end.isoformat(),
'''
LINE_REF = '''                    "reference": line.reference,
'''
# Deposits on the EUR account of the owner, with the ledger functions, at the dates of a row.
DEPOSITS = '''
def add_deposits(bank, at, *items):
    conn = ledger.open_db(bank["path"])
    for day, amount in items:
        ledger.deposit(conn, bank["eur"].id, Money.of(amount, "EUR"), at=at(day))
    conn.close()
'''


def x01():
    replace(LEDGER, '''def create_customer(conn: sqlite3.Connection, name: str, at: datetime | None = None) -> int:
    if not name.strip():
        raise LedgerError("customer name is empty")''', '''MAX_CUSTOMER_NAME = 80


def create_customer(conn: sqlite3.Connection, name: str, at: datetime | None = None) -> int:
    if not name.strip():
        raise LedgerError("customer name is empty")
    if len(name.strip()) > MAX_CUSTOMER_NAME:
        raise LedgerError("name is longer than 80 characters")''')
    append(T_LEDGER, '''
def test_customer_name_has_a_maximum_length(conn):
    start = len(ledger.list_customers(conn))
    first = ledger.create_customer(conn, "A" * 80)
    assert ledger.get_customer(conn, first)["name"] == "A" * 80
    second = ledger.create_customer(conn, "  " + "B" * 80 + "  ")
    assert ledger.get_customer(conn, second)["name"] == "B" * 80
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "C" * 81)
    assert len(ledger.list_customers(conn)) == start + 2
''')
    return "fix(ledger): refuse a customer name longer than 80 characters"


def x03():
    replace(API, MONEY_IMPORT, "from bank.money import EXPONENTS, Money, exponent, from_minor\n")
    replace(API, MOUNT, '''    @app.get("/api/currencies")
    def list_currencies() -> list[dict[str, object]]:
        return [{"code": code, "decimals": EXPONENTS[code]} for code in sorted(EXPONENTS)]

''' + MOUNT)
    append(T_API, '''
def test_currency_list_has_each_supported_currency(bank):
    from bank.money import EXPONENTS

    response = TestClient(bank["app"]).get("/api/currencies")
    assert response.status_code == 200
    body = response.json()
    assert [c["code"] for c in body] == sorted(EXPONENTS)
    assert len(body) == 8
    for c in body:
        assert c["decimals"] == EXPONENTS[c["code"]]
    decimals = {c["code"]: c["decimals"] for c in body}
    assert decimals["EUR"] == 2
    assert decimals["JPY"] == 0
''')
    return "feat(api): list the supported currencies"


def x04():
    replace(API, DEFAULT_DATES, DEFAULT_DATES + "\n        days = (end - start).days + 1")
    replace(API, STATEMENT_TO, STATEMENT_TO + '            "days_in_window": days,\n')
    append(T_API, '''
def test_statement_has_days_in_window(bank):
    client = login(bank["app"], bank["owner"])
    base = f"/api/accounts/{bank['eur'].id}/statement"
    assert client.get(base + "?from=2026-05-02&to=2026-05-31").json().get("days_in_window") == 30
    assert client.get(base + "?from=2026-05-10&to=2026-05-10").json().get("days_in_window") == 1
''')
    return "feat(api): tell the length of the statement window"


def x05():
    replace(MONEY, '''# ISO 4217 minor-unit exponents''', '''# The largest amount of one transfer, in minor units of the source currency.
MAX_TRANSFER_MINOR = 1_000_000

# ISO 4217 minor-unit exponents''')
    replace(API, MONEY_IMPORT, "from bank.money import MAX_TRANSFER_MINOR, Money, exponent, from_minor\n")
    replace(API, BEFORE_TRANSFER_CALL, '''        amount = parse_amount(body.amount, source.currency)
        if amount.minor > MAX_TRANSFER_MINOR:
            raise HTTPException(422, "amount is above the transfer limit")
        try:
            result, replayed = ledger.transfer_once(''')
    append(T_API, '''
def test_transfer_above_the_limit_is_refused(bank, at):
    conn = ledger.open_db(bank["path"])
    ledger.deposit(conn, bank["eur"].id, Money.of("20000.00", "EUR"), at=at("2026-05-01"))
    conn.close()
    client = login(bank["app"], bank["owner"])
    assert transfer(client, bank["eur"].id, bank["foreign"].number, "10000.00", key="lim-a").status_code == 201
    refused = transfer(client, bank["eur"].id, bank["foreign"].number, "10000.01", key="lim-b")
    assert refused.status_code == 422
    assert refused.json()["detail"] == "amount is above the transfer limit"
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "10100.00"
''')
    return "feat(api): refuse a transfer above the limit"


def x06():
    append(MONEY, '''
def interest_minor(principal_minor: int, days: int) -> int:
    """Interest of 0.01% for each day, rounded down to the minor unit."""
    return principal_minor * days // 10_000
''')
    replace(API, MONEY_IMPORT, "from bank.money import Money, exponent, from_minor, interest_minor\n")
    replace(API, MOUNT, '''    @app.get("/api/interest/quote")
    def interest_quote(principal: str, currency: str, days: int) -> dict[str, object]:
        if not 1 <= days <= 366:
            raise HTTPException(422, "days must be 1 to 366")
        try:
            amount = Money.of(principal, currency)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        minor = interest_minor(amount.minor, days)
        return {"interest_minor": minor, "interest": str(from_minor(minor, currency)), "currency": currency}

''' + MOUNT)
    append(T_API, '''
def test_interest_quote_rounds_down(bank):
    client = TestClient(bank["app"])

    def quote(principal, currency, days):
        response = client.get(f"/api/interest/quote?principal={principal}&currency={currency}&days={days}")
        assert response.status_code == 200
        return response.json()

    eur = quote("1000.00", "EUR", 30)
    assert eur["interest_minor"] == 300
    assert eur["interest"] == "3.00"
    assert quote("99.99", "EUR", 1)["interest_minor"] == 0
    assert quote("333.33", "EUR", 3)["interest_minor"] == 9
    jpy = quote("100000", "JPY", 7)
    assert jpy["interest_minor"] == 70
    assert jpy["interest"] == "70"


def test_interest_quote_refuses_bad_input(bank):
    client = TestClient(bank["app"])
    base = "/api/interest/quote?principal={}&currency={}&days={}"
    assert client.get(base.format("100.00", "EUR", 0)).status_code == 422
    assert client.get(base.format("100.00", "EUR", 367)).status_code == 422
    assert client.get(base.format("100.00", "XXX", 30)).status_code == 422
    assert client.get(base.format("1.005", "EUR", 30)).status_code == 422
''')
    return "feat(api): quote the interest of a principal"


def x07():
    append(MONEY, '''
def display(minor: int, currency: str) -> str:
    return f"{minor / 10 ** EXPONENTS[currency]:,.2f} {currency}"
''')
    replace(API, MONEY_IMPORT, "from bank.money import Money, display, exponent, from_minor\n")
    replace(API, '''        return [account_json(a) for a in ledger.list_accounts(conn, customer_id)]''',
            '''        return [
            account_json(a) | {"balance_display": display(a.balance_minor, a.currency)}
            for a in ledger.list_accounts(conn, customer_id)
        ]''')
    append(T_API, '''
def test_account_list_has_a_display_balance(bank):
    from bank import money

    client = login(bank["app"], bank["owner"])
    for obj in client.get("/api/accounts").json():
        assert obj.get("balance_display") is not None
        minor = Money.of(obj["balance"], obj["currency"]).minor
        assert obj["balance_display"] == money.display(minor, obj["currency"])
''')
    return "feat(api): show a display balance in the account list"


KEY_LIMIT_TEST = '''
def test_idempotency_key_has_a_maximum_length(bank):
    client = login(bank["app"], bank["owner"])
    assert transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key="k" * 64).status_code == 201
    refused = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key="k" * 65)
    assert refused.status_code == 422
    assert refused.json()["detail"] == "idempotency key is longer than 64 characters"
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "99.00"
'''


def x08():
    replace(API, 'COOKIE = "yms_customer"\n', 'COOKIE = "yms_customer"\nMAX_KEY_LENGTH = 64\n')
    replace(API, BEFORE_TRANSFER_CALL, '''        amount = parse_amount(body.amount, source.currency)
        if len(idempotency_key.strip()) > MAX_KEY_LENGTH:
            raise HTTPException(422, "idempotency key is longer than 64 characters")
        try:
            result, replayed = ledger.transfer_once(''')
    append(T_API, KEY_LIMIT_TEST)
    return "feat(api): limit the length of an idempotency key"


def other_x08():
    replace(MONEY, '''def exponent(currency: str) -> int:
    try:''', '''def exponent(currency: str) -> int:
    """The number of decimals of a currency; ValueError for a currency the bank does not use."""
    try:''')
    return "docs(money): describe exponent"


def x09():
    replace(API, LEDGER_CALL, '''        if end > datetime.now(UTC).date():
            raise HTTPException(422, "to is in the future")
''' + LEDGER_CALL)
    append(T_API, '''
def test_statement_refuses_a_future_to(bank):
    from datetime import UTC, datetime, timedelta

    client = login(bank["app"], bank["owner"])
    base = f"/api/accounts/{bank['eur'].id}/statement"
    today = datetime.now(UTC).date()
    assert client.get(base + f"?to={today}").status_code == 200
    future = client.get(base + f"?to={today + timedelta(days=1)}")
    assert future.status_code == 422
    assert future.json()["detail"] == "to is in the future"
''')
    return "feat(api): refuse a statement that ends in the future"


def other_x09():
    # A PR of a different ticket: at the place where the two dates are read, a future end date is
    # set to today. Its test goes after an existing statement test, so that git joins it with the
    # case PR (which appends its test at the end of the file) with no conflict.
    replace(API, '''                raise HTTPException(400, f"dates must be between {EARLIEST_DATE} and {LATEST_DATE}")
''', '''                raise HTTPException(400, f"dates must be between {EARLIEST_DATE} and {LATEST_DATE}")
        if end is not None and end > datetime.now(UTC).date():
            end = datetime.now(UTC).date()  # a future end date is set to today
''')
    replace(T_API, '''def test_statement_rejects_bad_dates(bank):''', '''def test_statement_to_is_set_to_today(bank):
    from datetime import UTC, datetime, timedelta

    client = login(bank["app"], bank["owner"])
    today = datetime.now(UTC).date()
    url = f"/api/accounts/{bank['eur'].id}/statement?to={today + timedelta(days=1)}"
    assert client.get(url).json()["to"] == today.isoformat()


def test_statement_rejects_bad_dates(bank):''')
    return "fix(api): set a future end date of the statement to today"


def x10():
    replace(API, STATEMENT_SIG, """        request: Request,
        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
    ) -> dict[str, object]:
        for name in request.query_params:
            if name not in ("from", "to"):
                raise HTTPException(422, f"unknown parameter: {name}")""")
    append(T_API, '''
def test_statement_refuses_an_unknown_parameter(bank):
    client = login(bank["app"], bank["owner"])
    base = f"/api/accounts/{bank['eur'].id}/statement"
    wrong = client.get(base + "?form=2026-05-02&to=2026-05-31")
    assert wrong.status_code == 422
    assert wrong.json()["detail"] == "unknown parameter: form"
    assert client.get(base + "?from=2026-05-02&to=2026-05-31").status_code == 200
''')
    return "fix(api): refuse an unknown parameter of the statement"


def x11():
    replace(LEDGER, '''class IdempotencyConflict(LedgerError):
    """The idempotency key was already used for a different request."""
''', '''class IdempotencyConflict(LedgerError):
    """The idempotency key was already used for a different request."""

    def __init__(self, message: str, first_transfer_id: int | None = None) -> None:
        super().__init__(message)
        self.first_transfer_id = first_transfer_id


class _Replay(Exception):
    """An internal signal: undo the new transfer of a replay."""

    def __init__(self, result: dict[str, object]) -> None:
        super().__init__("replay")
        self.result = result
''')
    # Builder's reading (BUILD-7.md, X11): the lookup runs after the new transfer is written. A
    # conflict commits the new transfer and raises after that, so its money moves (the row). A
    # replay of the same request undoes the new transfer, as on base, so the old replay and
    # concurrency tests keep passing (the row states green CI and says nothing of replays).
    replace(LEDGER, '''    with write_txn(conn):
        conn.execute(
            "DELETE FROM idempotency_keys WHERE customer_id = ? AND key = ? AND created_at < ?",
            (customer_id, key, oldest),
        )
        row = conn.execute(
            "SELECT request_hash, response_json FROM idempotency_keys"
            " WHERE customer_id = ? AND key = ?",
            (customer_id, key),
        ).fetchone()
        if row is not None:
            if row["request_hash"] != fingerprint:
                raise IdempotencyConflict("idempotency key already used for a different request")
            return json.loads(row["response_json"]), True
        entry_id = _transfer_in_txn(conn, from_account_id, to_account_id, amount, reference, now)
        result = {
            "entry_id": entry_id,
            "to_account_number": get_account(conn, to_account_id).number,
            "amount_minor": amount.minor,
            "currency": amount.currency,
            "from_balance_minor": get_account(conn, from_account_id).balance_minor,
        }
        conn.execute(
            "INSERT INTO idempotency_keys"
            " (customer_id, key, request_hash, entry_id, response_json, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (customer_id, key, fingerprint, entry_id, json.dumps(result), timestamp(now)),
        )
        return result, False''', '''    first_transfer_id = None
    try:
        with write_txn(conn):
            conn.execute(
                "DELETE FROM idempotency_keys WHERE customer_id = ? AND key = ? AND created_at < ?",
                (customer_id, key, oldest),
            )
            entry_id = _transfer_in_txn(conn, from_account_id, to_account_id, amount, reference, now)
            # The lookup runs after the new transfer is written, so that one query returns the
            # first transfer id; the conflict is raised after the commit.
            row = conn.execute(
                "SELECT request_hash, response_json, entry_id FROM idempotency_keys"
                " WHERE customer_id = ? AND key = ?",
                (customer_id, key),
            ).fetchone()
            if row is not None and row["request_hash"] == fingerprint:
                raise _Replay(json.loads(row["response_json"]))
            if row is None:
                result = {
                    "entry_id": entry_id,
                    "to_account_number": get_account(conn, to_account_id).number,
                    "amount_minor": amount.minor,
                    "currency": amount.currency,
                    "from_balance_minor": get_account(conn, from_account_id).balance_minor,
                }
                conn.execute(
                    "INSERT INTO idempotency_keys"
                    " (customer_id, key, request_hash, entry_id, response_json, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (customer_id, key, fingerprint, entry_id, json.dumps(result), timestamp(now)),
                )
                return result, False
            first_transfer_id = row["entry_id"]
    except _Replay as replay:
        return replay.result, True
    raise IdempotencyConflict(
        "idempotency key already used for a different request", first_transfer_id
    )''')
    replace(API, '''        except ledger.IdempotencyConflict as exc:
            raise HTTPException(422, str(exc)) from None''', '''        except ledger.IdempotencyConflict as exc:
            return JSONResponse(
                status_code=422,
                content={"detail": str(exc), "first_transfer_id": exc.first_transfer_id},
            )''')
    replace(API, "from fastapi.staticfiles import StaticFiles\n",
            "from fastapi.responses import JSONResponse\nfrom fastapi.staticfiles import StaticFiles\n")
    replace(API, '''    @app.post("/api/transfers", status_code=201)''',
            '''    @app.post("/api/transfers", status_code=201, response_model=None)''')
    replace(API, '''        idempotency_key: Annotated[str | None, Header(max_length=100)] = None,
    ) -> dict[str, object]:''', '''        idempotency_key: Annotated[str | None, Header(max_length=100)] = None,
    ) -> dict[str, object] | JSONResponse:''')
    # The old test loses its balance assertion; its name and the status assertion stay.
    replace(T_API, '''    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k")
    assert clash.status_code == 422
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "95.00"
''', '''    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k")
    assert clash.status_code == 422
''')
    append(T_API, '''
def test_key_conflict_names_the_first_transfer(bank):
    client = login(bank["app"], bank["owner"])
    first = transfer(client, bank["eur"].id, bank["foreign"].number, "5.00", key="kfirst")
    assert first.status_code == 201
    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="kfirst")
    assert clash.status_code == 422
    assert clash.json().get("first_transfer_id") == first.json()["entry_id"]
''')
    return "feat(api): name the first transfer in a key conflict\n\nDropped a duplicate balance check from the old conflict test."


def x12():
    replace(API, MOUNT, '''    @app.get("/api/amounts/check")
    def check_amount(amount: str, currency: str) -> dict[str, object]:
        try:
            money = Money.of(amount, currency)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return {"minor": money.minor, "text": str(from_minor(money.minor, currency)), "currency": currency}

''' + MOUNT)
    append(T_API, '''
def test_amount_check_returns_minor_units(bank):
    client = TestClient(bank["app"])
    response = client.get("/api/amounts/check?amount=12.50&currency=EUR")
    assert response.status_code == 200
    assert response.json() == {"minor": 1250, "text": "12.50", "currency": "EUR"}
    assert client.get("/api/amounts/check?amount=300&currency=JPY").json() == {"minor": 300, "text": "300", "currency": "JPY"}
    assert client.get("/api/amounts/check?amount=0.01&currency=EUR").json()["minor"] == 1


def test_amount_check_refuses_too_many_decimals(bank):
    client = TestClient(bank["app"])
    assert client.get("/api/amounts/check?amount=1.005&currency=EUR").status_code == 422
    assert client.get("/api/amounts/check?amount=1.5&currency=JPY").status_code == 422


def test_amount_check_refuses_an_unknown_currency(bank):
    client = TestClient(bank["app"])
    assert client.get("/api/amounts/check?amount=12.50&currency=XXX").status_code == 422
''')
    return "feat(api): check an amount before a transfer"


def x13():
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn) -> list[dict[str, object]]:
        return [
            {"id": row["id"], "name": row["name"], "initials": "".join(w[0].upper() for w in row["name"].split())[:3]}
            for row in ledger.list_customers(conn)
        ]''')
    append(T_API, '''
def test_customer_list_has_initials(bank):
    conn = ledger.open_db(bank["path"])
    for name in ("ada maria abel", "Bo", "a b c d"):
        ledger.create_customer(conn, name)
    conn.close()
    by_name = {c["name"]: c for c in TestClient(bank["app"]).get("/api/customers").json()}
    assert by_name["ada maria abel"].get("initials") == "AMA"
    assert by_name["Bo"].get("initials") == "B"
    assert by_name["a b c d"].get("initials") == "ABC"
''')
    return "feat(api): add initials to the customer list"


def x14_a():
    replace(MONEY, '''# ISO 4217 minor-unit exponents''', '''# Conversion rates for one unit of the first currency.
FX_RATES = {("EUR", "JPY"): Decimal("162.5"), ("JPY", "EUR"): Decimal("0.004")}

# ISO 4217 minor-unit exponents''')
    return "chore(money): add the FX rate table"


def x14():
    replace(MONEY, "from decimal import ROUND_HALF_EVEN, Decimal\n", "from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal\n")
    append(MONEY, '''
def convert_minor(minor: int, source: str, target: str) -> int:
    """Convert minor units of source to minor units of target at FX_RATES, rounded half up."""
    value = from_minor(minor, source) * FX_RATES[(source, target)]
    return int(value.scaleb(exponent(target)).quantize(Decimal(1), rounding=ROUND_HALF_UP))
''')
    replace(API, MONEY_IMPORT, "from bank.money import FX_RATES, Money, convert_minor, exponent, from_minor\n")
    replace(API, MOUNT, '''    @app.get("/api/fx/quote")
    def fx_quote(
        amount: str,
        source: Annotated[str, Query(alias="from")],
        target: Annotated[str, Query(alias="to")],
    ) -> dict[str, object]:
        if (source, target) not in FX_RATES:
            raise HTTPException(422, f"no rate for {source} to {target}")
        try:
            money = Money.of(amount, source)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        minor = convert_minor(money.minor, source, target)
        return {"converted_minor": minor, "converted": str(from_minor(minor, target)), "currency": target}

''' + MOUNT)
    append(T_API, '''
def test_fx_quote_rounds_half_up(bank):
    client = TestClient(bank["app"])

    def quote(amount, source, target):
        response = client.get(f"/api/fx/quote?amount={amount}&from={source}&to={target}")
        assert response.status_code == 200
        return response.json()

    one = quote("1.00", "EUR", "JPY")
    assert one["converted_minor"] == 163
    assert one["converted"] == "163"
    assert quote("3.00", "EUR", "JPY")["converted_minor"] == 488
    assert quote("2.00", "EUR", "JPY")["converted_minor"] == 325
    back = quote("125", "JPY", "EUR")
    assert back["converted_minor"] == 50
    assert back["converted"] == "0.50"


def test_fx_quote_refuses_bad_input(bank):
    client = TestClient(bank["app"])
    assert client.get("/api/fx/quote?amount=1.00&from=EUR&to=EUR").status_code == 422
    assert client.get("/api/fx/quote?amount=1.00&from=EUR&to=XXX").status_code == 422
    assert client.get("/api/fx/quote?amount=1.005&from=EUR&to=JPY").status_code == 422
''')
    return "feat(api): add the conversion quote"


def x15():
    replace(LEDGER, '''def list_customers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()''', '''def list_customers(conn: sqlite3.Connection, order: str | None = None) -> list[sqlite3.Row]:
    sql = "SELECT id, name FROM customers"
    if order == "name":
        sql += " ORDER BY lower(name)"
    elif order is not None:
        sql += " ORDER BY " + order
    else:
        sql += " ORDER BY id"
    return conn.execute(sql).fetchall()''')
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn, order: str | None = None) -> list[dict[str, object]]:
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn, order)]''')
    append(T_API, '''
def test_customer_list_can_be_ordered_by_name(bank):
    conn = ledger.open_db(bank["path"])
    for name in ("carl Adler", "Bela Ortiz", "adam Zimmer"):
        ledger.create_customer(conn, name)
    conn.close()
    names = [c["name"] for c in TestClient(bank["app"]).get("/api/customers?order=name").json()]
    three = [n for n in names if n in ("carl Adler", "Bela Ortiz", "adam Zimmer")]
    assert three == ["adam Zimmer", "Bela Ortiz", "carl Adler"]
''')
    return "feat(api): order the customer list by name"


def x16():
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(
        conn: Conn, limit: Annotated[int | None, Query(ge=1, le=100)] = None
    ) -> list[dict[str, object]]:
        rows = [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]
        return rows if limit is None else rows[:limit]''')
    append(T_API, '''
def test_customer_list_limit(bank):
    client = TestClient(bank["app"])
    full = client.get("/api/customers").json()
    assert client.get("/api/customers?limit=1").json() == full[:1]
    hundred = client.get("/api/customers?limit=100")
    assert hundred.status_code == 200
    assert hundred.json() == full
    assert client.get("/api/customers?limit=101").status_code == 422
    assert client.get("/api/customers?limit=0").status_code == 422
''')
    return "feat(api): limit the customer list"


def x17():
    replace(API, '''    @app.get("/api/accounts/{account_id}/statement")''', '''    @app.get("/api/accounts/{account_id}/statement", response_model=None)''')
    replace(API, STATEMENT_SIG, """        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
        format: str | None = None,
    ) -> dict[str, object] | Response:""")
    replace(API, '''        cur = account.currency
        return {
            "account": account_json(account),''', '''        cur = account.currency
        if format == "csv":
            rows = ["date,amount"] + [
                f"{line.posted_at[:10]},{from_minor(line.amount_minor, cur)}" for line in st.lines
            ]
            return Response("\\n".join(rows) + "\\n", media_type="text/csv; charset=utf-8")
        return {
            "account": account_json(account),''')
    append(T_API, DEPOSITS + '''

def test_statement_csv_has_date_and_amount(bank, at):
    add_deposits(bank, at, ("2026-05-06", "4.00"), ("2026-05-20", "6.00"))
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-02&to=2026-05-31&format=csv"
    response = client.get(url)
    assert response.headers["content-type"].startswith("text/csv")
    assert response.text.splitlines() == ["date,amount", "2026-05-06,4.00", "2026-05-20,6.00"]
''')
    return "feat(api): read the statement as CSV"


def x18():
    replace(LEDGER, '''def list_customers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()''', '''def list_customers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT c.id, c.name, (SELECT count(*) FROM accounts a"
        " WHERE a.customer_id = c.id AND a.kind = 'customer') AS account_count"
        " FROM customers c ORDER BY c.id"
    ).fetchall()''')
    replace(API, CUSTOMERS, '''    @app.get("/api/customers")
    def list_customers(conn: Conn) -> list[dict[str, object]]:
        return [
            {"id": row["id"], "name": row["name"], "account_count": row["account_count"]}
            for row in ledger.list_customers(conn)
        ]''')
    append(T_API, '''
def test_customer_list_has_account_count(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Nia Count")
    conn.close()
    body = TestClient(bank["app"]).get("/api/customers").json()
    assert next(c for c in body if c["name"] == "Nia Count").get("account_count") == 0
    assert sorted(c["account_count"] for c in body if c["name"] != "Nia Count") == [1, 2]
''')
    return "feat(api): add account_count to the customer list"


def x19():
    replace(API, STATEMENT_SIG, """        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
        month: str | None = None,
    ) -> dict[str, object]:
        if month is not None:
            if start is not None or end is not None:
                raise HTTPException(422, "month cannot be used with from or to")
            try:
                year, number = (int(part) for part in month.split("-"))
                start = date(year, number, 1)
            except ValueError:
                raise HTTPException(422, "month must be YYYY-MM") from None
            end = start + timedelta(days=30)""")
    append(T_API, '''
def test_statement_month_window(bank):
    client = login(bank["app"], bank["owner"])
    base = f"/api/accounts/{bank['eur'].id}/statement"
    july = client.get(base + "?month=2026-07")
    assert july.status_code == 200
    assert july.json()["from"] == "2026-07-01"
    assert july.json()["to"] == "2026-07-31"
    assert client.get(base + "?month=2026-13").status_code == 422
    assert client.get(base + "?month=2026-07&from=2026-07-02").status_code == 422
''')
    return "feat(api): read the statement of one calendar month"


def x20():
    replace(API, 'COOKIE = "yms_customer"\n', 'COOKIE = "yms_customer"\nSESSION_SECONDS = 28800\n')
    replace(API, '''        response.set_cookie(COOKIE, str(customer["id"]), httponly=True, samesite="lax")''',
            '''        response.set_cookie(
            COOKIE, str(customer["id"]), httponly=True, samesite="lax", max_age=SESSION_SECONDS
        )''')
    append(T_API, '''
def test_session_cookie_expires_after_8_hours(bank):
    response = TestClient(bank["app"]).post("/api/session", json={"customer_id": bank["owner"]})
    header = response.headers["set-cookie"].lower()
    assert "max-age=28800" in header
    assert "httponly" in header
    assert "path=/" in header
    assert "samesite=lax" in header
''')
    return "feat(api): end the session after 8 hours"


def x21():
    # The amount parser of this repository is the request pattern and parse_amount (src/bank/api.py).
    replace(API, '''    amount: str = Field(pattern=r"^\\d{1,12}(\\.\\d{1,3})?$")''',
            '''    amount: str = Field(pattern=r"^(\\d{1,12}|\\d{1,3}(,\\d{3})+)(\\.\\d{1,3})?$")''')
    replace(API, '''def parse_amount(text: str, currency: str) -> Money:
    try:''', '''def parse_amount(text: str, currency: str) -> Money:
    whole = text.split(".", 1)[0]
    if re.fullmatch(r"[0-9]{1,3}(,[0-9]{3})+", whole):
        text = text.replace(",", "")
    try:''')
    replace(API, "import os\nimport sqlite3\n", "import os\nimport re\nimport sqlite3\n")
    append(T_API, '''
def test_transfer_accepts_grouped_amounts_only(bank, at):
    conn = ledger.open_db(bank["path"])
    ledger.deposit(conn, bank["eur"].id, Money.of("5000.00", "EUR"), at=at("2026-05-01"))
    conn.close()
    client = login(bank["app"], bank["owner"])
    grouped = transfer(client, bank["eur"].id, bank["foreign"].number, "1,000.00")
    assert grouped.status_code == 201
    assert grouped.json()["amount"] == "1000.00"
    for text in ("1,00.00", "1000,00", ",100.00"):
        assert transfer(client, bank["eur"].id, bank["foreign"].number, text).status_code == 422
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "4100.00"
''')
    return "feat(money): accept commas between groups of three digits"


def x22():
    replace(API, "import os\nimport sqlite3\n", "import hashlib\nimport os\nimport sqlite3\n")
    replace(API, "from fastapi.staticfiles import StaticFiles\n",
            "from fastapi.responses import JSONResponse\nfrom fastapi.staticfiles import StaticFiles\n")
    replace(API, CUSTOMERS, '''    @app.get("/api/customers", response_model=None)
    def list_customers(conn: Conn, request: Request) -> Response:
        rows = [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]
        response = JSONResponse(rows)
        etag = '"' + hashlib.sha256(response.body).hexdigest() + '"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304)
        response.headers["ETag"] = etag
        return response''')
    append(T_API, '''
def test_customer_list_has_an_etag(bank):
    import hashlib

    client = TestClient(bank["app"])
    response = client.get("/api/customers")
    etag = response.headers.get("etag")
    assert etag == '"' + hashlib.sha256(response.content).hexdigest() + '"'
    again = client.get("/api/customers", headers={"If-None-Match": etag})
    assert again.status_code == 304
    assert again.content == b""
    assert client.get("/api/customers", headers={"If-None-Match": '"x"'}).status_code == 200
''')
    return "feat(api): add an entity tag to the customer list"


def x23():
    replace(API, LINE_REF, LINE_REF + '''                    "weekday": ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")[
                        date.fromisoformat(line.posted_at[:10]).weekday()
                    ],
''')
    append(T_API, DEPOSITS + '''

def test_statement_lines_have_a_weekday(bank, at):
    add_deposits(bank, at, ("2026-05-16", "7.00"), ("2026-05-18", "8.00"))
    client = login(bank["app"], bank["owner"])
    body = client.get(f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-02&to=2026-05-31").json()
    assert [line.get("weekday") for line in body["lines"]] == ["Sat", "Mon"]
''')
    return "feat(api): tell the weekday of each statement line"


def x24():
    replace(API, '''    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path
''', '''    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path

    @app.middleware("http")
    async def api_version_header(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["X-Api-Version"] = "1"
        return response
''')
    append(T_API, '''
@pytest.mark.parametrize(
    ("path", "session"),
    [("/api/customers", True), ("/api/accounts", False), ("/api/no-such-path", True)],
    ids=["customers", "accounts-without-session", "unknown-path"],
)
def test_api_replies_have_the_version_header(bank, path, session):
    client = TestClient(bank["app"])
    response = client.get(path)
    assert response.headers.get("x-api-version") == "1"
    if path == "/api/no-such-path":
        assert response.status_code == 404
''')
    return "feat(api): tell the API version in each reply"


# (branch, start point, builder). Order matters: X14 starts from X14-A; merges come last.
PLAN = [
    ("case/X01", "bench-base", x01), ("case/X03", "bench-base", x03), ("case/X04", "bench-base", x04),
    ("case/X05", "bench-base", x05), ("case/X06", "bench-base", x06), ("case/X07", "bench-base", x07),
    ("case/X08", "bench-base", x08), ("other/X08", "bench-base", other_x08),
    ("case/X09", "bench-base", x09), ("other/X09", "bench-base", other_x09),
    ("case/X10", "bench-base", x10), ("case/X11", "bench-base", x11), ("case/X12", "bench-base", x12),
    ("case/X13", "bench-base", x13), ("case/X14-A", "bench-base", x14_a), ("case/X14", "case/X14-A", x14),
    ("case/X15", "bench-base", x15), ("case/X16", "bench-base", x16), ("case/X17", "bench-base", x17),
    ("case/X18", "bench-base", x18), ("case/X19", "bench-base", x19), ("case/X20", "bench-base", x20),
    ("case/X21", "bench-base", x21), ("case/X22", "bench-base", x22), ("case/X23", "bench-base", x23),
    ("case/X24", "bench-base", x24),
]


# X10, X17, X19 (BUILD-7.md, build dispute): the row changes the signature of read_statement, the
# context of the bank's seed patch seeds/k8_statement_access.patch, so the bank test
# tests/test_discovery_branch.py cannot apply the seed and CI is red. The built reading also
# refreshes that seed patch (both sides of the 3-way merge kept), as a developer would to keep CI
# green. The literal heads are kept as asis/<id>.
SEED = "seeds/k8_statement_access.patch"
REFRESH_SEED = {"X10", "X17", "X19"}


def refresh_seed() -> None:
    subprocess.run(["git", "apply", "--3way", SEED], cwd=CLONE, capture_output=True, text=True)
    p = CLONE / API
    lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
    # Keep both sides of each conflict; the case's own signature closing line wins over the seed's.
    kept, side, ours = [], None, []
    for x in lines:
        if x.startswith("<<<<<<< "):
            side, ours = "ours", []
        elif x.startswith("=======") and side:
            side = "theirs"
        elif x.startswith(">>>>>>> ") and side:
            side = None
        elif side == "theirs" and x.lstrip().startswith(") ->") and any(o.lstrip().startswith(") ->") for o in ours):
            continue
        else:
            if side == "ours":
                ours.append(x)
            kept.append(x)
    p.write_text("".join(kept), encoding="utf-8")
    patch = git("diff", "HEAD", "--", API)
    assert patch.strip(), "the seed changed nothing"
    git("checkout", "HEAD", "--", API)
    (CLONE / SEED).write_text(patch, encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "--amend", "--no-edit")


def case_id(branch: str) -> str:
    return branch.split("/")[1].split("-")[0].upper()


def main() -> None:
    for branch, start, build in PLAN:
        if ONLY and case_id(branch) not in ONLY:
            continue
        git("checkout", "-q", "-B", branch, start)
        subject = build()
        fmt()
        commit(subject)
        if branch.startswith("case/") and case_id(branch) in REFRESH_SEED:
            refresh_seed()
        print(branch, git("rev-parse", "--short", "HEAD").strip(), subject.splitlines()[0])
    if not ONLY or "X08" in ONLY:
        # Squash merge of case/X08 on other/X08: one commit with the PR's change, one parent.
        git("checkout", "-q", "-B", "merge/X08", "other/X08")
        git("merge", "-q", "--squash", "case/X08")
        git("commit", "-q", "-m", "feat(api): limit the length of an idempotency key (#squash)")
        print("merge/X08", git("rev-parse", "--short", "HEAD").strip(), "squash merge")
    if not ONLY or "X09" in ONLY:
        git("checkout", "-q", "-B", "merge/X09", "other/X09")
        git("merge", "-q", "--no-ff", "-m", "Merge the future-date refusal into main", "case/X09")
        print("merge/X09", git("rev-parse", "--short", "HEAD").strip(), "merge commit")
    git("checkout", "-q", "bench-base")


if __name__ == "__main__":
    main()
