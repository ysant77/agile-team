"""Build the set 9 case branches (CASES-9-INDEPENDENT.md) in a local clone of the bank.

    python build_set9.py <clone> [Z01,Z02,...]

Each case is one branch `case/Znn` from `bench-base` (bank main 165b689, FREEZE-9.md), with one
commit; Z19 and Z23 have two commits (H1, kept as `h1/Znn`, and the head H2). Extra branches,
built here and not scored as PRs: `other/Z03`, `other/Z06` and `other/Z09` (the PR of a different
ticket, from `bench-base`) and `merge/Z03`, `merge/Z06`, `merge/Z09` (the merge commit M of the
case into it).

Every edit is an exact replacement or an append; changed Python files are formatted with the
repository's ruff settings. The script never makes a weak test stronger and never repairs a defect
that a row states.
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



L_CREATE_CHECK = '''    if not name.strip():
        raise LedgerError("customer name is empty")
'''
L_DEPOSIT_START = '''    with write_txn(conn):
        account = _require(conn, account_id, amount)
        clearing = _clearing_account(conn, amount.currency)
        _credit(conn, account.id, amount.minor)'''
L_COUNT = '''
def count_accounts(conn: sqlite3.Connection, customer_id: int) -> int:
    """The number of accounts of one customer."""
    row = conn.execute("SELECT COUNT(*) FROM accounts WHERE customer_id = ?", (customer_id,)).fetchone()
    return int(row[0])
'''


def customers(params: str, body: str) -> None:
    """Replace the customer list route; `params` follow `conn: Conn`, `body` is the function body."""
    sig = f"    def list_customers(conn: Conn{params}) -> list[dict[str, object]]:\n"
    replace(API, CUSTOMERS, '    @app.get("/api/customers")\n' + sig + body.strip("\n"))


def field_route(stmt: str, key: str) -> None:
    """The customer list with one new statement and one new key (Z04, Z06, Z16)."""
    customers("", f'''
        out = []
        for row in ledger.list_customers(conn):
            name = row["name"]
            {stmt}
            out.append({{"id": row["id"], "name": name, "{key}": value}})
        return out''')


def z01():
    replace(LEDGER, L_CREATE_CHECK, L_CREATE_CHECK + '''    if not any(ch.isalpha() for ch in name.strip()):
        raise LedgerError("name has no letter")
''')
    append(T_LEDGER, '''
def test_customer_name_needs_a_letter(conn):
    start = len(ledger.list_customers(conn))
    kept = ledger.create_customer(conn, "  Q7 Lab  ")
    assert ledger.get_customer(conn, kept)["name"] == "Q7 Lab"
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "12345")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "--")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "7 7")
    assert len(ledger.list_customers(conn)) == start + 1
''')
    return "fix(ledger): refuse a customer name with no letter"


def z02():
    append(LEDGER, L_COUNT)
    customers(", min_accounts: int | None = None", '''
        out = []
        for row in ledger.list_customers(conn):
            count = ledger.count_accounts(conn, row["id"]) if min_accounts is not None else 0
            if min_accounts is None or count > min_accounts:
                out.append({"id": row["id"], "name": row["name"]})
        return out''')
    append(T_API, '''
def test_customer_list_can_be_filtered_by_min_accounts(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Zed None")
    conn.close()
    response = TestClient(bank["app"]).get("/api/customers?min_accounts=2")
    assert response.status_code == 200
    body = response.json()
    for c in body:
        assert c["name"] != "Zed None"
''')
    return "feat(api): filter the customer list by the number of accounts"


def z03():
    customers(", sort: str | None = None", '''
        out = [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]
        if sort not in (None, "name", "-name"):
            raise HTTPException(422, "unknown sort")
        if sort is not None:
            out.sort(key=lambda c: str(c["name"]).casefold(), reverse=sort.startswith("-"))
        return out''')
    append(T_API, '''
def test_customer_list_can_be_sorted_by_name(bank):
    conn = ledger.open_db(bank["path"])
    for name in ("carl Sort", "Bob Sort", "alice Sort"):
        ledger.create_customer(conn, name)
    conn.close()
    client = TestClient(bank["app"])
    full = [c["name"] for c in client.get("/api/customers").json()]
    names = [c["name"] for c in client.get("/api/customers?sort=name").json()]
    assert names == sorted(full, key=str.casefold)
    assert [n for n in names if n.endswith(" Sort")] == ["alice Sort", "Bob Sort", "carl Sort"]
    backwards = [c["name"] for c in client.get("/api/customers?sort=-name").json()]
    assert backwards == names[::-1]


def test_customer_list_refuses_an_unknown_sort(bank):
    response = TestClient(bank["app"]).get("/api/customers?sort=age")
    assert response.status_code == 422
    assert response.json()["detail"] == "unknown sort"
''')
    return "feat(api): sort the customer list by name"


def other_z03():
    append(T_LEDGER, '''
def test_customer_name_outer_spaces_are_removed(conn):
    customer = ledger.create_customer(conn, "  Ann Lee  ")
    assert ledger.get_customer(conn, customer)["name"] == "Ann Lee"


def test_customer_name_outer_line_break_is_removed(conn):
    customer = ledger.create_customer(conn, "Ann Lee\\n")
    assert ledger.get_customer(conn, customer)["name"] == "Ann Lee"
''')
    return "test(ledger): pin the removal of outer whitespace in customer names"


def z04():
    field_route("value = len(name.split())", "name_words")
    append(T_API, '''
def test_customer_list_has_name_words(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Wim")
    ledger.create_customer(conn, "Ada Maria Wordsworth")
    conn.close()
    by_name = {c["name"]: c for c in TestClient(bank["app"]).get("/api/customers").json()}
    assert by_name["Wim"].get("name_words") == 1
    assert by_name["Ada Maria Wordsworth"].get("name_words") == 3
''')
    return "feat(api): tell the number of words of each customer name"


def z05():
    replace(LEDGER, L_DEPOSIT_START, '''    if at is not None and at.date() < date(2000, 1, 1):
        raise LedgerError("deposit date is before 2000")
''' + L_DEPOSIT_START)
    append(T_API, '''
def test_deposit_refuses_a_date_before_2000(bank, at):
    client = login(bank["app"], bank["owner"])
    conn = ledger.open_db(bank["path"])
    ledger.deposit(conn, bank["eur"].id, Money.of("3.00", "EUR"), at=at("2000-01-01"))

    def eur_balance():
        return next(a for a in client.get("/api/accounts").json() if a["currency"] == "EUR")["balance"]

    assert eur_balance() == "103.00"
    with pytest.raises(ledger.LedgerError):
        ledger.deposit(conn, bank["eur"].id, Money.of("4.00", "EUR"), at=at("1999-12-31"))
    conn.close()
    assert eur_balance() == "103.00"
''')
    return "fix(ledger): refuse a deposit dated before 2000"


def z06():
    field_route('value = name.count("\\n") + 1', "name_lines")
    append(T_API, '''
def test_customer_list_has_name_lines(bank):
    conn = ledger.open_db(bank["path"])
    two = ledger.get_customer(conn, ledger.create_customer(conn, "Ann\\nLee"))["name"]
    one = ledger.get_customer(conn, ledger.create_customer(conn, "Bo Oneline"))["name"]
    conn.close()
    by_name = {c["name"]: c for c in TestClient(bank["app"]).get("/api/customers").json()}
    assert by_name[two].get("name_lines") == 2
    assert by_name[one].get("name_lines") == 1
''')
    return "feat(api): tell the number of lines of each customer name"


def other_z06():
    replace(LEDGER, L_CREATE_CHECK, L_CREATE_CHECK + '''    stripped = name.strip()
    if "\\t" in stripped or "\\n" in stripped or "\\r" in stripped:
        raise LedgerError("name has a tab or a line break")
''')
    append(T_LEDGER, '''
def test_customer_name_refuses_a_tab_or_a_line_break(conn):
    start = len(ledger.list_customers(conn))
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Ann\\tLee")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Ann\\nLee")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Ann\\rLee")
    assert len(ledger.list_customers(conn)) == start
''')
    return "fix(ledger): a customer name is one line"


def z07():
    route('''    @app.get("/api/account-number/check")
    def check_account_number(number: str) -> dict[str, bool]:
        valid = number.startswith("YMS-") and number[4:8].isdigit() and number[8:9] == "-" and number[9:13].isdigit() and len(number) >= 13
        return {"valid": valid}''')
    append(T_API, '''
def test_account_number_check_tells_the_form(bank):
    client = TestClient(bank["app"])
    ok = client.get("/api/account-number/check?number=YMS-0000-0003")
    short = client.get("/api/account-number/check?number=YMS-0000-003")
    other = client.get("/api/account-number/check?number=ABC-0000-0003")
    long = client.get("/api/account-number/check?number=YMS-0000-00031")
    for reply in (ok, short, other, long):
        assert reply.status_code == 200
    assert ok.json() == {"valid": True}
    assert short.json() == {"valid": False}
    assert other.json() == {"valid": False}
    assert short.json() == {"valid": False}
''')
    return "feat(api): check the form of an account number"


def money_route(path: str, fn: str, param: str, lo: int, hi: int, key: str) -> None:
    replace(API, MONEY_IMPORT, f"from bank.money import Money, exponent, from_minor, {fn}\n")
    route(f'''    @app.get("{path}")
    def {key}_of(amount: str, currency: str, {param}: int) -> dict[str, object]:
        if not {lo} <= {param} <= {hi}:
            raise HTTPException(422, "{param} must be {lo} to {hi}")
        try:
            money = Money.of(amount, currency)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        minor = {fn}(money.minor, {param})
        return {{"{key}": str(from_minor(minor, currency)), "{key}_minor": minor, "currency": currency}}''')


def z08():
    append(MONEY, '''
def percent_minor(minor: int, percent: int) -> int:
    """minor times percent / 100, rounded to the nearest minor unit, a half rounded up."""
    return (minor * percent + 50) // 100
''')
    money_route("/api/share", "percent_minor", "percent", 1, 100, "share")
    append(T_API, '''
def test_share_is_rounded_half_up(bank):
    client = TestClient(bank["app"])

    def share(amount, currency, percent):
        response = client.get(f"/api/share?amount={amount}&currency={currency}&percent={percent}")
        assert response.status_code == 200
        return response.json()

    assert share("10.05", "EUR", 50)["share"] == "5.03"
    assert share("0.01", "EUR", 50)["share"] == "0.01"
    low = share("0.01", "EUR", 49)
    assert low["share"] == "0.00" and low["share_minor"] == 0
    assert share("301", "JPY", 33)["share"] == "99"
    assert share("200.00", "EUR", 100)["share"] == "200.00"


def test_share_refuses_bad_input(bank):
    client = TestClient(bank["app"])
    base = "/api/share?amount={}&currency={}&percent={}"
    assert client.get(base.format("10.00", "EUR", 0)).status_code == 422
    assert client.get(base.format("10.00", "EUR", 101)).status_code == 422
    assert client.get(base.format("10.00", "XXX", 50)).status_code == 422
    assert client.get(base.format("1.005", "EUR", 50)).status_code == 422
''')
    return "feat(api): show a share of an amount"


OLD_KEY_TEST_START = "def test_same_key_with_a_different_body_is_rejected(bank):\n"


def z09():
    replace(API, ACCOUNTS, '''    @app.get("/api/accounts")
    def list_accounts(customer_id: CustomerId, conn: Conn, sort: str | None = None) -> list[dict[str, object]]:
        out = [account_json(a) for a in ledger.list_accounts(conn, customer_id)]
        if sort not in (None, "currency", "-currency"):
            raise HTTPException(422, "unknown sort")
        if sort is not None:
            out.sort(key=lambda a: str(a["currency"]), reverse=sort.startswith("-"))
        return out''')
    p = CLONE / T_API
    text = p.read_text(encoding="utf-8")
    start = text.index(OLD_KEY_TEST_START)
    end = text.index("\n\n\ndef ", start) + 3
    p.write_text(text[:start] + text[end:], encoding="utf-8")
    append(T_API, '''
def test_account_list_can_be_sorted_by_currency(bank):
    client = login(bank["app"], bank["owner"])
    up = [a["currency"] for a in client.get("/api/accounts?sort=currency").json()]
    down = [a["currency"] for a in client.get("/api/accounts?sort=-currency").json()]
    assert up == ["EUR", "JPY"]
    assert down == ["JPY", "EUR"]
    bad = client.get("/api/accounts?sort=age")
    assert bad.status_code == 422
    assert bad.json()["detail"] == "unknown sort"
''')
    return "feat(api): sort the account list by currency"


def other_z09():
    (CLONE / "tests/test_unknown_parameter.py").write_text('''from fastapi.testclient import TestClient

from bank import ledger
from bank.api import create_app


def test_customer_list_ignores_an_unknown_parameter(tmp_path):
    path = tmp_path / "unknown.db"
    conn = ledger.open_db(path)
    ledger.create_customer(conn, "Una Param")
    conn.close()
    client = TestClient(create_app(path, seed_if_empty=False))
    plain = client.get("/api/customers")
    other = client.get("/api/customers?zz=1")
    assert other.status_code == 200
    assert other.json() == plain.json()
''', encoding="utf-8")
    return "test(api): the customer list ignores an unknown parameter"


def z10():
    replace(LEDGER, L_CREATE_CHECK, L_CREATE_CHECK + '''    stripped = name.strip()
    if any(a.isspace() and b.isspace() for a, b in zip(stripped, stripped[1:], strict=False)):
        raise LedgerError("name has two spaces in a row")
''')
    append(T_LEDGER, '''
def test_customer_name_refuses_two_spaces_in_a_row(conn):
    start = len(ledger.list_customers(conn))
    kept = ledger.create_customer(conn, "  Ann Lee  ")
    assert ledger.get_customer(conn, kept)["name"] == "Ann Lee"
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Ann  Lee")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Bo \\tBay")
    with pytest.raises(ledger.LedgerError):
        ledger.create_customer(conn, "Cy   Dee")
    assert len(ledger.list_customers(conn)) == start + 1
''')
    return "fix(ledger): refuse two spaces in a row in a customer name"


def z11():
    customers("", '''
        out = []
        for index, row in enumerate(ledger.list_customers(conn)):
            position = index + 1
            out.append({"id": row["id"], "name": row["name"], "position": position})
        return out''')
    append(T_API, '''
def test_customer_list_has_the_position(bank):
    client = TestClient(bank["app"])
    body = client.get("/api/customers").json()
    assert [c.get("position") for c in body] == list(range(1, len(body) + 1))
    assert len(body) >= 2
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Pia Place")
    conn.close()
    body = client.get("/api/customers").json()
    pia = next(c for c in body if c["name"] == "Pia Place")
    assert pia.get("position") == len(body)
''')
    return "feat(api): add the position to the customer list"


def z12():
    append(MONEY, '''
def fee_minor(minor: int) -> int:
    """1.5 percent of minor, rounded up to the next minor unit."""
    return (minor * 15 + 999) // 1000
''')
    replace(API, MONEY_IMPORT, "from bank.money import Money, exponent, fee_minor, from_minor\n")
    route('''    @app.get("/api/fee")
    def transfer_fee(amount: str, currency: str) -> dict[str, object]:
        try:
            money = Money.of(amount, currency)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        minor = fee_minor(money.minor)
        return {"fee": str(from_minor(minor, currency)), "fee_minor": minor, "currency": currency}''')
    append(T_API, '''
def test_fee_is_rounded_up(bank):
    client = TestClient(bank["app"])

    def fee(amount, currency):
        response = client.get(f"/api/fee?amount={amount}&currency={currency}")
        assert response.status_code == 200
        return response.json()

    assert fee("10.00", "EUR")["fee"] == "0.15"
    assert fee("0.01", "EUR")["fee"] == "0.01"
    assert fee("33.33", "EUR")["fee"] == "0.50"
    big = fee("200.00", "EUR")
    assert big["fee"] == "3.00" and big["fee_minor"] == 300
    assert fee("300", "JPY")["fee"] == "5"
    assert fee("100", "JPY")["fee"] == "2"


def test_fee_refuses_bad_input(bank):
    client = TestClient(bank["app"])
    assert client.get("/api/fee?amount=10.00&currency=XXX").status_code == 422
    assert client.get("/api/fee?amount=1.005&currency=EUR").status_code == 422
''')
    return "feat(api): show the fee of a transfer"


def z13():
    route('''    @app.get("/api/export/customers.csv")
    def export_customers(conn: Conn) -> Response:
        lines = ["name"] + ['"' + row["name"].replace('"', '""') + '"' for row in ledger.list_customers(conn)]
        return Response("\\n".join(lines), media_type="text/csv")''')
    append(T_API, '''
def test_customer_list_can_be_exported_as_csv(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Vic Csv")
    ledger.create_customer(conn, 'Uma "Q" Csv')
    conn.close()
    client = TestClient(bank["app"])
    response = client.get("/api/export/customers.csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    lines = response.text.split("\\n")
    assert lines[0] == "name"
    assert '"Vic Csv"' in lines
    assert '"Uma ""Q"" Csv"' in lines
    assert len(lines) == len(client.get("/api/customers").json()) + 1
''')
    return "feat(api): export the customer list as CSV"


def z14():
    replace(API, "def account_json(account: ledger.Account) -> dict[str, object]:\n", '''def balance_display(balance: str, currency: str) -> str:
    whole, point, decimals = balance.partition(".")
    return f"{int(whole):,}{point}{decimals} {currency}"


def account_json(account: ledger.Account) -> dict[str, object]:
''')
    replace(API, ACCOUNTS, '''    @app.get("/api/accounts")
    def list_accounts(customer_id: CustomerId, conn: Conn) -> list[dict[str, object]]:
        out = []
        for a in ledger.list_accounts(conn, customer_id):
            item = account_json(a)
            display = balance_display(str(item["balance"]), a.currency)
            out.append({**item, "balance_display": display})
        return out''')
    append(T_API, '''
def test_account_list_has_a_balance_display(bank):
    client = login(bank["app"], bank["owner"])

    def by_currency():
        return {a["currency"]: a for a in client.get("/api/accounts").json()}

    assert by_currency()["EUR"].get("balance_display") == "100.00 EUR"
    conn = ledger.open_db(bank["path"])
    ledger.deposit(conn, bank["eur"].id, Money.of("1234.50", "EUR"))
    conn.close()
    accounts = by_currency()
    assert accounts["EUR"]["balance"] == "1334.50"
    assert accounts["EUR"]["balance_display"] == "1,334.50 EUR"
    jpy = accounts["JPY"]
    assert jpy["balance_display"].endswith(" JPY")
    assert jpy["balance_display"].replace(",", "") == jpy["balance"] + " JPY"
''')
    return "feat(api): show a readable balance text in the account list"


def z15():
    customers(", limit: Annotated[int | None, Query(ge=1, le=100)] = None", '''
        out = [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]
        out = out if limit is None else out[:limit]
        return out''')
    append(T_API, '''
def test_customer_list_can_be_limited(bank):
    client = TestClient(bank["app"])

    def names(query=""):
        return [c["name"] for c in client.get(f"/api/customers{query}").json()]

    full = names()
    assert names("?limit=1") == full[:1]
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Lim Three")
    conn.close()
    full3 = names()
    assert names("?limit=2") == full3[:2]
    assert client.get("/api/customers?limit=100").status_code == 200
    assert names("?limit=100") == full3
    assert client.get("/api/customers?limit=0").status_code == 422
    assert client.get("/api/customers?limit=101").status_code == 422
''')
    return "feat(api): cut the customer list to the first customers"


def z16():
    field_route('value = "".join(word[0].upper() for word in name.split())', "initials")
    append(T_API, '''
def test_customer_list_has_initials(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "ina maria obel")
    ledger.create_customer(conn, "Xu")
    conn.close()
    by_name = {c["name"]: c for c in TestClient(bank["app"]).get("/api/customers").json()}
    assert by_name["ina maria obel"].get("initials") == "IMO"
    assert by_name["Xu"].get("initials") == "X"
''')
    return "feat(api): show the initials of each customer"


def z17():
    replace(API, "def account_json(account: ledger.Account) -> dict[str, object]:\n", '''def short_name(name: str) -> str:
    words = name.split()
    return f"{words[0]} {words[-1][0]}." if len(words) >= 2 else name


def account_json(account: ledger.Account) -> dict[str, object]:
''')
    field_route('value = short_name(name)', "short_name")
    append(T_API, '''
def test_customer_list_has_a_short_name(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Ann Marie Short")
    ledger.create_customer(conn, "Solo")
    conn.close()
    by_name = {c["name"]: c for c in TestClient(bank["app"]).get("/api/customers").json()}
    assert by_name["Ann Marie Short"].get("short_name") == "Ann S."
    assert by_name["Solo"].get("short_name") == "Solo"
''')
    return "feat(api): add a short form of each customer name"


def z18():
    append(LEDGER, '''
def account_counts(conn: sqlite3.Connection) -> dict[int, int]:
    """The number of accounts of each customer that has one account or more."""
    rows = conn.execute("SELECT customer_id, COUNT(*) FROM accounts WHERE customer_id IS NOT NULL GROUP BY customer_id").fetchall()
    return {int(row[0]): int(row[1]) for row in rows}
''')
    customers("", '''
        counts = ledger.account_counts(conn)
        out = []
        for row in ledger.list_customers(conn):
            count = counts.get(row["id"])
            out.append({"id": row["id"], "name": row["name"], "account_count": count})
        return out''')
    append(T_API, '''
def test_customer_list_has_the_account_count(bank):
    body = TestClient(bank["app"]).get("/api/customers").json()
    assert len(body) == 2
    assert {c.get("account_count") for c in body} == {1, 2}
''')
    return "feat(api): tell how many accounts each customer has"


Z19_TESTS = '''
def test_interest_is_rounded_half_up(bank):
    client = TestClient(bank["app"])

    def interest(amount, currency, rate_bp):
        response = client.get(f"/api/interest?amount={amount}&currency={currency}&rate_bp={rate_bp}")
        assert response.status_code == 200
        return response.json()

    assert interest("100.00", "EUR", 250)["interest"] == "2.50"
    assert interest("0.30", "EUR", 5000)["interest"] == "0.15"
EXTRA

def test_interest_refuses_bad_input(bank):
    client = TestClient(bank["app"])
    base = "/api/interest?amount={}&currency={}&rate_bp={}"
    assert client.get(base.format("100.00", "EUR", 0)).status_code == 422
    assert client.get(base.format("100.00", "EUR", 10001)).status_code == 422
    assert client.get(base.format("100.00", "XXX", 250)).status_code == 422
    assert client.get(base.format("1.005", "EUR", 250)).status_code == 422
'''


def z19():
    append(MONEY, '''
def interest_minor(minor: int, rate_bp: int) -> int:
    """minor times rate_bp / 10000 for one year."""
    return minor * rate_bp // 10000
''')
    money_route("/api/interest", "interest_minor", "rate_bp", 1, 10000, "interest")
    append(T_API, Z19_TESTS.replace("EXTRA\n", "\n"))
    return "feat(api): show the interest of one year"


def z19_h2():
    replace(MONEY, "    return minor * rate_bp // 10000\n", "    return (minor * rate_bp + 5000) // 10000\n")
    replace(MONEY, '"""minor times rate_bp / 10000 for one year."""', '"""minor times rate_bp / 10000 for one year, a half rounded up."""')
    replace(T_API, '''    assert interest("0.30", "EUR", 5000)["interest"] == "0.15"
''', '''    assert interest("0.30", "EUR", 5000)["interest"] == "0.15"
    assert interest("0.01", "EUR", 5000)["interest"] == "0.01"
    assert interest("333", "JPY", 150)["interest"] == "5"
''')
    return "fix(api): round a half up in the interest of one year"


def z20():
    route('''    @app.get("/api/name-check")
    def check_name(name: str) -> dict[str, object]:
        text = name.strip()
        if not text:
            return {"ok": False, "reason": "empty"}
        if len(text) > 80:
            return {"ok": False, "reason": "too long"}
        return {"ok": True, "reason": None}''')
    append(T_API, '''
@pytest.mark.parametrize(
    ("name", "body"),
    [
        pytest.param("Ann Lee", {"ok": True, "reason": None}, id="plain"),
        pytest.param("  Ann Lee  ", {"ok": True, "reason": None}, id="outer-spaces"),
        pytest.param("", {"ok": False, "reason": "empty"}, id="empty"),
        pytest.param("   ", {"ok": False, "reason": "empty"}, id="only-spaces"),
        pytest.param("a" * 80, {"ok": True, "reason": None}, id="eighty"),
        pytest.param("a" * 81, {"ok": False, "reason": "too long"}, id="eighty-one"),
    ],
)
def test_name_check_tells_the_reason(bank, name, body):
    response = TestClient(bank["app"]).get("/api/name-check", params={"name": name})
    assert response.status_code == 200
    assert response.json() == body
''')
    return "feat(api): check a customer name before the form is sent"


def z21():
    append(LEDGER, L_COUNT)
    customers(", has_account: str | None = None", '''
        if has_account not in (None, "true", "false"):
            raise HTTPException(422, "has_account must be true or false")
        out = []
        for row in ledger.list_customers(conn):
            keep = has_account is None or (ledger.count_accounts(conn, row["id"]) > 0) == (has_account == "true")
            if keep:
                out.append({"id": row["id"], "name": row["name"]})
        return out''')
    append(T_API, '''
def test_customer_list_can_be_filtered_by_has_account(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Hal None")
    conn.close()
    client = TestClient(bank["app"])
    full = [c["name"] for c in client.get("/api/customers").json()]
    with_account = [c["name"] for c in client.get("/api/customers?has_account=true").json()]
    without = [c["name"] for c in client.get("/api/customers?has_account=false").json()]
    assert with_account == [n for n in full if n != "Hal None"]
    assert without == ["Hal None"]
    bad = client.get("/api/customers?has_account=maybe")
    assert bad.status_code == 422
    assert bad.json()["detail"] == "has_account must be true or false"
''')
    return "feat(api): filter the customer list by having an account"


def z22():
    replace(API, "import sqlite3\n", "import sqlite3\nimport uuid\n")
    customers(", response: Response, x_request_id: Annotated[str | None, Header()] = None", '''
        given = x_request_id is not None and 1 <= len(x_request_id) <= 64 and all(ch.isascii() and (ch.isalnum() or ch == "-") for ch in x_request_id)
        response.headers["X-Request-Id"] = x_request_id if given and x_request_id else uuid.uuid4().hex
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]''')
    append(T_API, '''
def test_customer_list_has_a_request_id(bank):
    client = TestClient(bank["app"])
    assert client.get("/api/customers", headers={"X-Request-Id": "abc-123"}).headers.get("X-Request-Id") == "abc-123"
    first = client.get("/api/customers").headers.get("X-Request-Id")
    second = client.get("/api/customers").headers.get("X-Request-Id")
    assert re.fullmatch(r"[0-9a-f]{32}", first or "")
    assert re.fullmatch(r"[0-9a-f]{32}", second or "")
    assert first != second
    for bad in ("a" * 65, "a b"):
        reply = client.get("/api/customers", headers={"X-Request-Id": bad}).headers.get("X-Request-Id")
        assert re.fullmatch(r"[0-9a-f]{32}", reply or "")
''')
    return "feat(api): give the customer list reply a request id"


def z23():
    customers(", offset: Annotated[int | None, Query(ge=0)] = None", '''
        out = [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]
        out = out if offset is None else out[offset:]
        return out''')
    append(T_API, '''
def test_customer_list_can_skip_the_first_customers(bank):
    client = TestClient(bank["app"])

    def names(query=""):
        return [c["name"] for c in client.get(f"/api/customers{query}").json()]

    full = names()
    assert names("?offset=1") == full[1:]
    assert names(f"?offset={len(full)}") == []
    assert client.get("/api/customers?offset=-1").status_code == 422
''')
    return "feat(api): let the customer list skip the first customers"


def z23_h2():
    replace(API, "offset: Annotated[int | None, Query(ge=0)] = None", "offset: Annotated[int | None, Query(ge=0, le=10000)] = None")
    replace(T_API, '''    assert client.get("/api/customers?offset=-1").status_code == 422
''', '''    assert client.get("/api/customers?offset=-1").status_code == 422
    top = client.get("/api/customers?offset=10000")
    assert top.status_code == 200 and top.json() == []
    assert client.get("/api/customers?offset=10001").status_code == 422
''')
    return "fix(api): limit the offset of the customer list to 10000"


def z24():
    route('''    @app.get("/api/stats/names")
    def name_stats(conn: Conn) -> dict[str, int]:
        names = [str(row["name"]) for row in ledger.list_customers(conn)]
        return {"count": len(names), "longest": max((len(n) for n in names), default=0)}''')
    append(T_API, '''
def test_stats_tell_the_longest_name(bank):
    client = TestClient(bank["app"])
    names = [c["name"] for c in client.get("/api/customers").json()]
    response = client.get("/api/stats/names")
    assert response.status_code == 200
    assert response.json() == {"count": len(names), "longest": max(len(n) for n in names)}
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Longest " + "x" * 32)
    conn.close()
    assert client.get("/api/stats/names").json() == {"count": len(names) + 1, "longest": 40}
''')
    return "feat(api): show the count and the longest customer name"


CASES = [z01, z02, z03, z04, z05, z06, z07, z08, z09, z10, z11, z12, z13, z14, z15, z16, z17, z18, z19, z20, z21, z22, z23, z24]
PLAN = [(f"case/{f.__name__.upper()}", "bench-base", f) for f in CASES]
PLAN += [("other/Z03", "bench-base", other_z03), ("other/Z06", "bench-base", other_z06), ("other/Z09", "bench-base", other_z09)]
# Second commits on the same branch (the head H2); the first commit is H1.
SECOND = {"Z19": z19_h2, "Z23": z23_h2}


def case_id(branch: str) -> str:
    return branch.split("/")[1].upper()


def main() -> None:
    for branch, start, build in PLAN:
        cid = case_id(branch)
        if ONLY and cid not in ONLY:
            continue
        git("checkout", "-q", "-B", branch, start)
        subject = build()
        fmt()
        commit(subject)
        print(branch, git("rev-parse", "--short", "HEAD").strip(), subject)
        if branch.startswith("case/") and cid in SECOND:
            git("branch", "-f", f"h1/{cid}", "HEAD")
            subject = SECOND[cid]()
            fmt()
            commit(subject)
            print(branch, git("rev-parse", "--short", "HEAD").strip(), subject, "(H2; H1 kept as", f"h1/{cid})")
    for cid in ("Z03", "Z06", "Z09"):
        if ONLY and cid not in ONLY:
            continue
        git("checkout", "-q", "-B", f"merge/{cid}", f"other/{cid}")
        git("merge", "-q", "--no-ff", "-m", f"Merge the work of {cid} into main", f"case/{cid}")
        print(f"merge/{cid}", git("rev-parse", "--short", "HEAD").strip(), "merge commit, no conflict")
    git("checkout", "-q", "bench-base")


if __name__ == "__main__":
    main()
