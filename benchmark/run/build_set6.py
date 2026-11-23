"""Build the set 6 case branches (CASES-6-INDEPENDENT.md) in a local clone of the bank.

    python build_set6.py <clone> [W02,W03,...]

Each case is one branch `case/Wxx` from `bench-base` (bank main dafa314, as set 5), with one
commit; W20 has two. Every edit is an exact replacement (the old text must be found once) or an
append. Changed Python files are formatted with the repository's ruff settings (the case notes
allow this), except the first commit of W20, whose failed format check is part of the case. The
script never makes a weak test stronger and never repairs a defect that a row states. The seven
cases that are not buildable (PREDICTIONS-6.md) have no builder.
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
T_API, T_LEDGER, T_IDEM, T_FRAUD = "tests/test_api.py", "tests/test_ledger.py", "tests/test_idempotency.py", "tests/test_fraud_model.py"
MOUNT = '    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")\n'
STATEMENT_SIG = """        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
    ) -> dict[str, object]:"""
LINE_BALANCE = """                    **money_fields("balance", line.balance_minor, cur),
                }
                for line in st.lines
            ],
        }"""
# Three deposits on the EUR account of the owner, at the dates of the rows (W03, W18).
MAY_DEPOSITS = '''
def add_may_deposits(bank, at):
    conn = ledger.open_db(bank["path"])
    for day, amount in (("2026-05-10", "1.00"), ("2026-05-11", "2.00"), ("2026-05-12", "3.00")):
        ledger.deposit(conn, bank["eur"].id, Money.of(amount, "EUR"), at=at(day))
    conn.close()
'''


def w02():
    replace(LEDGER, '''def list_customers(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()''', '''def list_customers(conn: sqlite3.Connection, q: str | None = None) -> list[sqlite3.Row]:
    if q is None:
        return conn.execute("SELECT id, name FROM customers ORDER BY id").fetchall()
    return conn.execute(
        "SELECT id, name FROM customers WHERE lower(name) LIKE ? ORDER BY id",
        ("%" + q.lower() + "%",),
    ).fetchall()''')
    replace(API, '''    @app.get("/api/customers")
    def list_customers(conn: Conn) -> list[dict[str, object]]:
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn)]''', '''    @app.get("/api/customers")
    def list_customers(conn: Conn, q: str | None = None) -> list[dict[str, object]]:
        if q is not None:
            q = q.strip()
            if len(q) < 2:
                raise HTTPException(422, "q needs at least 2 characters")
        return [{"id": row["id"], "name": row["name"]} for row in ledger.list_customers(conn, q)]''')
    append(T_API, '''
def test_customer_search_matches_without_case(bank):
    conn = ledger.open_db(bank["path"])
    ledger.create_customer(conn, "Quentin Marlowe")
    ledger.create_customer(conn, "Marla Okafor")
    conn.close()
    client = TestClient(bank["app"])
    names = sorted(c["name"] for c in client.get("/api/customers?q=MARL").json())
    assert names == ["Marla Okafor", "Quentin Marlowe"]
    assert client.get("/api/customers?q=zzzz").json() == []


def test_customer_search_refuses_short_queries(bank):
    client = TestClient(bank["app"])
    assert client.get("/api/customers?q=a").status_code == 422
    assert client.get("/api/customers?q=%20a%20").status_code == 422
''')
    return "feat(api): search customers by name"


def w03():
    replace(API, STATEMENT_SIG, """        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
        limit: Annotated[int | None, Query(ge=1, le=200)] = None,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> dict[str, object]:""")
    replace(API, '''        cur = account.currency
        return {
            "account": account_json(account),''', '''        cur = account.currency
        lines = [
            {
                "entry_id": line.entry_id,
                "posted_at": line.posted_at,
                "kind": line.kind,
                "description": line.description,
                "reference": line.reference,
                **money_fields("amount", line.amount_minor, cur),
                **money_fields("balance", line.balance_minor, cur),
            }
            for line in st.lines
        ]
        page = lines[offset:] if limit is None else lines[offset : offset + limit]
        return {
            "account": account_json(account),''')
    replace(API, '''            "lines": [
                {
                    "entry_id": line.entry_id,
                    "posted_at": line.posted_at,
                    "kind": line.kind,
                    "description": line.description,
                    "reference": line.reference,
                    **money_fields("amount", line.amount_minor, cur),
''' + LINE_BALANCE, '''            "lines": page,
            "total_lines": len(lines),
        }''')
    append(T_API, MAY_DEPOSITS + '''

WINDOW = "from=2026-05-02&to=2026-05-31"


def test_statement_limit_returns_the_first_lines(bank, at):
    add_may_deposits(bank, at)
    client = login(bank["app"], bank["owner"])
    body = client.get(f"/api/accounts/{bank['eur'].id}/statement?{WINDOW}&limit=2").json()
    assert [line["amount"] for line in body["lines"]] == ["1.00", "2.00"]


def test_statement_reports_total_lines(bank, at):
    add_may_deposits(bank, at)
    client = login(bank["app"], bank["owner"])
    paged = client.get(f"/api/accounts/{bank['eur'].id}/statement?{WINDOW}&limit=2").json()
    full = client.get(f"/api/accounts/{bank['eur'].id}/statement?{WINDOW}").json()
    assert paged.get("total_lines") == 3
    assert full.get("total_lines") == 3


def test_statement_offset_skips_lines(bank, at):
    add_may_deposits(bank, at)
    client = login(bank["app"], bank["owner"])
    full = client.get(f"/api/accounts/{bank['eur'].id}/statement?{WINDOW}").json()
    paged = client.get(f"/api/accounts/{bank['eur'].id}/statement?{WINDOW}&offset=1&limit=1").json()
    assert len(paged["lines"]) == 1
    assert paged["lines"][0]["amount"] == "2.00"
    assert paged["lines"][0]["balance"] == full["lines"][1]["balance"]


def test_statement_paging_refuses_bad_values(bank, at):
    client = login(bank["app"], bank["owner"])
    for query in ("limit=0", "limit=201", "offset=-1"):
        response = client.get(f"/api/accounts/{bank['eur'].id}/statement?{WINDOW}&{query}")
        assert response.status_code == 422, query
''')
    return "feat(api): read the statement in pages"


def w05():
    replace(API, '''        except ledger.IdempotencyConflict as exc:
            raise HTTPException(422, str(exc)) from None''', '''        except ledger.IdempotencyConflict as exc:
            raise HTTPException(409, str(exc)) from None''')
    replace(T_API, '''def test_same_key_with_a_different_body_is_rejected(bank):''', '''def test_same_key_with_a_different_body_gives_409(bank):''')
    replace(T_API, '''    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k")
    assert clash.status_code == 422''', '''    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k")
    assert clash.status_code == 409''')
    append(T_API, '''
def test_key_conflict_answers_409(bank):
    client = login(bank["app"], bank["owner"])
    first = transfer(client, bank["eur"].id, bank["foreign"].number, "5.00", key="k409")
    assert first.status_code == 201
    clash = transfer(client, bank["eur"].id, bank["foreign"].number, "6.00", key="k409")
    assert clash.status_code == 409
    assert client.get(f"/api/accounts/{bank['eur'].id}").json()["balance"] == "95.00"
    again = transfer(client, bank["eur"].id, bank["foreign"].number, "5.00", key="k409")
    assert again.status_code == 200
    assert again.json()["replayed"] is True
''')
    return "feat(api): answer a key conflict with 409"


def w06():
    replace(API, "import os\nimport sqlite3\n", "import os\nimport sqlite3\nimport time\n")
    replace(API, '''def money_fields(prefix: str, minor: int, currency: str) -> dict[str, object]:''', '''def new_receipt_id() -> str:
    return f"RCP-{int(time.time()):012X}"


def money_fields(prefix: str, minor: int, currency: str) -> dict[str, object]:''')
    replace(API, '''        if replayed:
            response.status_code = 200''', '''        receipt = new_receipt_id()
        if replayed:
            response.status_code = 200''')
    replace(API, '''            "from_account": from_account,
        }''', '''            "from_account": from_account,
            "receipt": receipt,
        }''')
    append(T_API, '''
def test_transfer_reply_has_a_receipt(bank, monkeypatch):
    monkeypatch.setattr("bank.api.new_receipt_id", lambda: "RCP-00000000ABCD", raising=False)
    client = login(bank["app"], bank["owner"])
    body = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00").json()
    assert body.get("receipt") == "RCP-00000000ABCD"


def test_receipts_are_different_for_each_transfer(bank, monkeypatch):
    receipts = iter(["RCP-000000000001", "RCP-000000000002"])
    monkeypatch.setattr("bank.api.new_receipt_id", lambda: next(receipts), raising=False)
    client = login(bank["app"], bank["owner"])
    first = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key="r1").json()
    second = transfer(client, bank["eur"].id, bank["foreign"].number, "1.00", key="r2").json()
    assert first.get("receipt") != second.get("receipt")
''')
    return "feat(api): give each transfer a receipt number\n\ntests use a fixed receipt so they are deterministic"


def w07():
    replace(API, 'LATEST_DATE = date(9998, 12, 31)\n', 'LATEST_DATE = date(9998, 12, 31)\nMAX_STATEMENT_DAYS = 366\n')
    replace(API, '''                raise HTTPException(400, f"dates must be between {EARLIEST_DATE} and {LATEST_DATE}")
        end = end or datetime.now(UTC).date()''', '''                raise HTTPException(400, f"dates must be between {EARLIEST_DATE} and {LATEST_DATE}")
        if start is not None and end is not None and (end - start).days + 1 > MAX_STATEMENT_DAYS:
            detail = f"statement window is longer than {MAX_STATEMENT_DAYS} days"
            raise HTTPException(422, detail)
        end = end or datetime.now(UTC).date()''')
    append(T_API, '''
def test_statement_window_has_a_maximum_length(bank):
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement"
    assert client.get(f"{url}?from=2025-11-01&to=2026-11-01").status_code == 200
    response = client.get(f"{url}?from=2025-11-01&to=2026-11-02")
    assert response.status_code == 422
    assert response.json()["detail"] == "statement window is longer than 366 days"
''')
    return "feat(api): limit the statement window to 366 days"


def w09():
    replace(API, "from bank.money import Money, exponent, from_minor\n", "from bank.money import EXPONENTS, Money, exponent, from_minor\n")
    replace(API, '''    @app.get("/api/accounts")
    def list_accounts(customer_id: CustomerId, conn: Conn) -> list[dict[str, object]]:
        return [account_json(a) for a in ledger.list_accounts(conn, customer_id)]''', '''    @app.get("/api/accounts")
    def list_accounts(customer_id: CustomerId, conn: Conn, currency: str = "") -> list[dict[str, object]]:
        accounts = ledger.list_accounts(conn, customer_id)
        if currency:
            code = currency.upper()
            if code not in EXPONENTS:
                raise HTTPException(422, "unsupported currency")
            accounts = [a for a in accounts if a.currency == code]
            if not accounts:
                return []
        return [account_json(a) for a in accounts]''')
    append(T_API, '''
def test_account_list_filters_by_currency(bank):
    client = login(bank["app"], bank["owner"])
    for code in ("EUR", "eur"):
        body = client.get(f"/api/accounts?currency={code}").json()
        assert len(body) == 1
        assert body[0]["currency"] == "EUR"
    assert len(client.get("/api/accounts").json()) == 2


def test_account_list_refuses_an_unknown_currency(bank):
    client = login(bank["app"], bank["owner"])
    response = client.get("/api/accounts?currency=XXX")
    assert response.status_code == 422
    assert response.json()["detail"] == "unsupported currency"
''')
    return "feat(api): filter the account list by currency"


def w10():
    replace(API, "from fastapi.staticfiles import StaticFiles\n", "from fastapi.middleware.cors import CORSMiddleware\nfrom fastapi.staticfiles import StaticFiles\n")
    replace(API, '''    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path
''', '''    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
''')
    replace(API, 'response.set_cookie(COOKIE, str(customer["id"]), httponly=True, samesite="lax")',
            'response.set_cookie(COOKIE, str(customer["id"]), httponly=True, samesite="none")')
    append(T_API, '''
def test_local_frontend_origin_is_allowed(bank):
    client = TestClient(bank["app"])
    response = client.get("/api/customers", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert response.headers.get("access-control-allow-credentials") == "true"
''')
    return "feat(api): allow the dev server\n\nallow the dev server; SameSite=None so the dev server gets the cookie"


def w12():
    replace("src/fraud/model.py", '''        "fpr_at_threshold": float(flagged[y_test == 0].mean()),''', '''        "fpr_at_threshold": float(flagged[y_test == 0].mean()),
        "flag_rate": float((test_scores >= threshold).mean()),''')
    append(T_FRAUD, '''
def test_flag_rate_is_recorded(fraud_run):
    rate = fraud_run.metrics.get("flag_rate")
    assert rate is not None
    flagged = sum(1 for s in fraud_run.scores if s >= fraud_run.threshold)
    assert abs(rate - flagged / len(fraud_run.scores)) < 1e-12
    assert flagged == 827
''')
    return "feat(fraud): record the flag rate of the holdout"


def w13():
    # The delete statement goes; its age cutoff is then unused, so it goes too (ruff F841).
    replace(LEDGER, '''    oldest = timestamp(now - timedelta(seconds=IDEMPOTENCY_WINDOW_SECONDS))
    with write_txn(conn):
        conn.execute(
            "DELETE FROM idempotency_keys WHERE customer_id = ? AND key = ? AND created_at < ?",
            (customer_id, key, oldest),
        )
        row = conn.execute(''', '''    with write_txn(conn):
        row = conn.execute(''')
    replace(LEDGER, '''def transfer_once(''', '''def purge_expired_keys(conn: sqlite3.Connection, *, now: datetime) -> int:
    """Delete each idempotency key older than the window; return the number of deleted rows."""
    oldest = timestamp(now - timedelta(seconds=IDEMPOTENCY_WINDOW_SECONDS))
    with write_txn(conn):
        cur = conn.execute("DELETE FROM idempotency_keys WHERE created_at < ?", (oldest,))
        return cur.rowcount


def transfer_once(''')
    p = CLONE / T_IDEM
    text = p.read_text(encoding="utf-8")
    start = text.index("def test_keys_expire_after_24_hours(accounts):")
    end = text.find("\ndef ", start + 10)
    rest = text[end + 1:].lstrip("\n") if end >= 0 else ""
    p.write_text(text[:start].rstrip("\n") + "\n" + ("\n\n" + rest if rest else ""), encoding="utf-8")
    append(T_IDEM, '''
def test_purge_removes_only_expired_keys(accounts):
    _, conn, owner, source, target = accounts
    start = datetime.now(UTC)
    eur = Money.of("1.00", "EUR")
    ledger.transfer_once(conn, owner, "old", source.id, target.id, eur, now=start)
    ledger.transfer_once(conn, owner, "new", source.id, target.id, eur, now=start + timedelta(hours=23))
    assert ledger.purge_expired_keys(conn, now=start + timedelta(hours=25)) == 1
    assert conn.execute("SELECT COUNT(*) FROM idempotency_keys").fetchone()[0] == 1
''')
    return "refactor(ledger): remove expired idempotency keys with a purge function"


def w14():
    replace(API, "import os\nimport sqlite3\n", "import os\nimport re\nimport sqlite3\nimport uuid\n")
    replace(API, '''    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path
''', '''    app = FastAPI(title="YMS Bank demo", lifespan=lifespan)
    app.state.db_path = path

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        value = request.headers.get("x-request-id", "")
        if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", value):
            value = uuid.uuid4().hex
        response = await call_next(request)
        response.headers["X-Request-Id"] = value
        return response
''')
    append(T_API, '''
def test_request_id_is_echoed(bank):
    client = TestClient(bank["app"])
    response = client.get("/api/customers", headers={"X-Request-Id": "support-case-0042"})
    assert response.headers.get("x-request-id") == "support-case-0042"


def test_request_id_is_generated_when_absent(bank):
    client = TestClient(bank["app"])
    first = client.get("/api/customers").headers.get("x-request-id")
    second = client.get("/api/customers").headers.get("x-request-id")
    assert first is not None and re.fullmatch(r"[0-9a-f]{32}", first)
    assert second is not None and re.fullmatch(r"[0-9a-f]{32}", second)
    assert first != second


def test_request_id_replaces_a_bad_value(bank):
    client = TestClient(bank["app"])
    for bad in ("short", "has space!!"):
        value = client.get("/api/customers", headers={"X-Request-Id": bad}).headers.get("x-request-id")
        assert value is not None and re.fullmatch(r"[0-9a-f]{32}", value), bad
''')
    return "feat(api): give each reply a request id"


def w16():
    replace(API, STATEMENT_SIG, """        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
        days: Annotated[int | None, Query(ge=1, le=90)] = None,
    ) -> dict[str, object]:""")
    replace(API, '''        end = end or datetime.now(UTC).date()''', '''        if days is not None and start is None and end is None:
            end = datetime.now(UTC).date()
            start = end - timedelta(days=days - 1)
        end = end or datetime.now(UTC).date()''')
    replace(T_API, "import re\nimport uuid\n", "import re\nimport uuid\nfrom datetime import UTC, datetime, timedelta\n")
    append(T_API, '''
def test_statement_days_window(bank):
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement"
    response = client.get(f"{url}?days=7")
    assert response.status_code == 200
    assert response.json()["from"] == (datetime.now(UTC).date() - timedelta(days=6)).isoformat()
    assert client.get(f"{url}?days=90").status_code == 200
    assert client.get(f"{url}?days=91").status_code == 422
''')
    return "feat(api): a statement of the last days"


def w18():
    replace(LEDGER, '''def statement(conn: sqlite3.Connection, account_id: int, start: date, end: date) -> Statement:''',
            '''def statement(
    conn: sqlite3.Connection, account_id: int, start: date, end: date, sort: str = "asc"
) -> Statement:''')
    replace(LEDGER, '''    running = opening
    lines = []
    for row in rows:''', '''    if sort == "desc":
        rows = list(reversed(rows))
    running = opening
    lines = []
    for row in rows:''')
    replace(API, "from typing import Annotated\n", "from typing import Annotated, Literal\n")
    replace(API, STATEMENT_SIG, """        start: Annotated[date | None, Query(alias="from")] = None,
        end: Annotated[date | None, Query(alias="to")] = None,
        sort: Literal["asc", "desc"] = "asc",
    ) -> dict[str, object]:""")
    replace(API, "            st = ledger.statement(conn, account.id, start, end)\n", "            st = ledger.statement(conn, account.id, start, end, sort)\n")
    append(T_API, MAY_DEPOSITS + '''

def test_statement_can_be_sorted_newest_first(bank, at):
    add_may_deposits(bank, at)
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-02&to=2026-05-31&sort=desc"
    assert [line["amount"] for line in client.get(url).json()["lines"]] == ["3.00", "2.00", "1.00"]
''')
    return "feat(api): sort the statement newest first"


def w19():
    # The numbering is one statement of its own, so the changed-line coverage counts it (a field
    # inside the return statement alone gives 0 changed executable lines; BUILD-6).
    replace(API, '''        cur = account.currency
        return {''', '''        cur = account.currency
        numbered = list(enumerate(st.lines, 1))
        return {''')
    replace(API, '''                **money_fields("balance", line.balance_minor, cur),
                }
                for line in st.lines
            ],''', '''                **money_fields("balance", line.balance_minor, cur),
                    "line_no": line_no,
                }
                for line_no, line in numbered
            ],''')
    append(T_API, '''
def test_statement_lines_are_numbered(bank, at):
    conn = ledger.open_db(bank["path"])
    for day in ("2026-05-10", "2026-05-11"):
        ledger.deposit(conn, bank["eur"].id, Money.of("1.00", "EUR"), at=at(day))
    conn.close()
    client = login(bank["app"], bank["owner"])
    url = f"/api/accounts/{bank['eur'].id}/statement?from=2026-05-02&to=2026-05-31"
    body = client.get(url).json()
    assert [line.get("line_no") for line in body["lines"]] == [1, 2]
''')
    return "feat(api): number the statement lines"


def w20():
    # H1: the route and its test, with a format that `ruff format --check` refuses (the case's
    # failed run on H1). Not formatted on purpose.
    replace(API, MOUNT, '''    @app.get("/api/health")
    def health(conn: Conn, response: Response) -> dict[str, object]:
        (count,) = conn.execute("SELECT COUNT(*) FROM accounts WHERE kind = 'customer'").fetchone()
        response.headers["Cache-Control"]="no-store"
        return {"status": "ok", "accounts": count}

''' + MOUNT)
    append(T_API, '''
def test_health_reports_ok_and_the_account_count(bank):
    response = TestClient(bank["app"]).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "accounts": 3}
    assert response.headers["cache-control"] == "no-store"
''')
    commit("feat(api): a health route")
    # H2: white space only.
    subprocess.run([PY, "-m", "ruff", "format", "-q", API, T_API], cwd=CLONE, check=True)
    return "style: format the health route"


def w21():
    replace(LEDGER, '''    if not name.strip():
        raise LedgerError("customer name is empty")''', '''    if not name.strip():
        raise LedgerError("customer name is empty")
    if "\\t" in name.strip() or "\\n" in name.strip():
        raise LedgerError("name has control characters")''')
    append(T_LEDGER, '''
def test_customer_name_refuses_control_characters(conn):
    before = len(ledger.list_customers(conn))
    for name in ("\\t", "\\n", " \\t\\n "):
        with pytest.raises(ledger.LedgerError):
            ledger.create_customer(conn, name)
    assert len(ledger.list_customers(conn)) == before
''')
    return "fix(ledger): refuse control characters in customer names"


def w22():
    replace(API, '''            "to": st.end.isoformat(),''', '''            "to": st.end.isoformat(),
            "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),''')
    replace(T_API, "import re\nimport uuid\n", "import re\nimport uuid\nfrom datetime import UTC, datetime\n")
    append(T_API, '''
@pytest.mark.skip(reason="flaky on CI: the second can change between the two clock reads")
def test_statement_has_generated_at(bank):
    client = login(bank["app"], bank["owner"])
    body = client.get(f"/api/accounts/{bank['eur'].id}/statement").json()
    assert body["generated_at"] == datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
''')
    return "feat(api): tell when the statement was made"


def w23():
    replace(API, "import os\nimport sqlite3\n", "import logging\nimport os\nimport sqlite3\n")
    replace(API, 'COOKIE = "yms_customer"\n', 'logger = logging.getLogger("bank.api")\nCOOKIE = "yms_customer"\n')
    replace(API, '''        if replayed:
            response.status_code = 200''', '''        if replayed:
            response.status_code = 200
        else:
            logger.info(
                "transfer created from=%s to=%s amount=%s",
                source.number,
                result["to_account_number"],
                body.amount,
            )''')
    append(T_API, '''
def test_transfer_writes_a_log_line(bank, caplog):
    caplog.set_level("INFO", logger="bank.api")
    client = login(bank["app"], bank["owner"])
    transfer(client, bank["eur"].id, bank["foreign"].number, "1.00")
    records = [r for r in caplog.records if r.name == "bank.api"]
    assert len(records) == 1
    assert records[0].getMessage().startswith("transfer created")
''')
    return "feat(api): log transfers for support"


CASES = {f.__name__.upper(): f for f in [w02, w03, w05, w06, w07, w09, w10, w12, w13, w14, w16, w18, w19, w20, w21, w22, w23]}


def main() -> None:
    for cid, build in CASES.items():
        if ONLY and cid not in ONLY:
            continue
        git("checkout", "-q", "-B", f"case/{cid}", "bench-base")
        subject = build()
        fmt()
        commit(subject)
        print(cid, git("rev-parse", "--short", "HEAD").strip(), subject.splitlines()[0])
    git("checkout", "-q", "bench-base")


if __name__ == "__main__":
    main()
