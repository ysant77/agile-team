"""Check, on each case head, the wrong behaviour that the row states (case notes: "check on head
that the wrong behaviour is as the row says"). Run with the bank clone's Python:

    <clone>/.venv/bin/python check_set4_heads.py <clone>
"""

import os
import subprocess
import sys
import tarfile
import tempfile
import uuid
from io import BytesIO
from pathlib import Path

CLONE = Path(sys.argv[1]).resolve()


def tree(case):
    d = Path(tempfile.mkdtemp(prefix=f"head-{case}-"))
    data = subprocess.run(["git", "archive", f"case/{case}"], cwd=CLONE, check=True, capture_output=True).stdout
    tarfile.open(fileobj=BytesIO(data)).extractall(d)
    return d


def load(case):
    d = tree(case)
    for k in [k for k in sys.modules if k == "bank" or k.startswith("bank.")]:
        del sys.modules[k]
    sys.path.insert(0, str(d / "src"))
    from bank import ledger
    from bank.api import COOKIE, create_app
    from bank.money import Money
    from fastapi.testclient import TestClient

    db = d / "t.db"
    conn = ledger.open_db(db)
    owner = ledger.create_customer(conn, "Owner Test")
    other = ledger.create_customer(conn, "Other Test")
    eur = ledger.open_account(conn, owner, "EUR")
    jpy = ledger.open_account(conn, owner, "JPY")
    foreign = ledger.open_account(conn, other, "EUR")
    ledger.deposit(conn, eur.id, Money.of("100.00", "EUR"))
    ledger.deposit(conn, jpy.id, Money.of("5000", "JPY"))
    ledger.deposit(conn, foreign.id, Money.of("10.00", "EUR"))
    conn.close()
    app = create_app(db, seed_if_empty=False)

    def login(cid):
        c = TestClient(app)
        c.post("/api/session", json={"customer_id": cid})
        return c

    sys.path.pop(0)
    return d, app, login, owner, other, eur, jpy, foreign, TestClient, COOKIE


def tr(c, src, to, amount):
    body = {"from_account_id": src, "to_account_number": to, "amount": amount}
    return c.post("/api/transfers", json=body, headers={"Idempotency-Key": str(uuid.uuid4())})


out = []
d, app, login, owner, other, eur, jpy, foreign, TC, COOKIE = load("U02")
out.append(("U02", "367-day window accepted", login(owner).get(f"/api/accounts/{eur.id}/statement?from=2025-01-01&to=2026-01-02").status_code == 200))
d, app, login, owner, *_ , TC, COOKIE = load("U04")
out.append(("U04", "'YMS 0000 0003' gives 404", tr(login(owner), 1, "YMS 0000 0003", "1.00").status_code == 404))
d, app, login, owner, other, eur, jpy, foreign, TC, COOKIE = load("U06")
c = login(owner)
tr(c, eur.id, "YMS-0000-0003", "5.00")
lines = c.get(f"/api/accounts/{eur.id}/statement").json()["lines"]
line = next(x for x in lines if x["kind"] == "transfer")
out.append(("U06", "sender line shows own number", line["counterparty_number"] == "YMS-0000-0001"))
d, app, login, owner, other, eur, *_ = load("U09")
out.append(("U09", "insufficient funds gives 400", tr(login(owner), eur.id, "YMS-0000-0003", "100.01").status_code == 400))
load("U11")
from bank import money  # noqa: E402

out.append(("U11", "format_minor(-12345, EUR) == '-,123.45'", money.format_minor(-12345, "EUR") == "-,123.45"))
d, app, login, owner, other, eur, jpy, foreign, TC, COOKIE = load("U14")
os.environ.pop("BANK_SUPPORT_TOKEN", None)
r = TC(app).get(f"/api/accounts/{foreign.id}/statement", headers={"X-Support-Token": "support"})
out.append(("U14", "unset variable: token 'support' reads a foreign statement", r.status_code == 200))
d, app, login, owner, *_ = load("U15")
out.append(("U15", "session has no currencies", "currencies" not in login(owner).get("/api/session").json()))
load("U20")
from bank import ledger as l20  # noqa: E402

out.append(("U20", "12345 -> YMS-0012-0345, first 999 unchanged",
            l20.account_number(12345) == "YMS-0012-0345"
            and all(l20.account_number(s) == f"YMS-{s // 10_000:04d}-{s % 10_000:04d}" for s in range(1, 1000))))
d, app, login, owner, other, eur, *_ = load("U21")
c = login(owner)
a, b = tr(c, eur.id, "YMS-9999-9999", "1.00"), tr(c, eur.id, "YMS-0000-0002", "1.00")
out.append(("U21", "unknown and wrong-currency replies differ", a.status_code == b.status_code == 404 and a.json() != b.json()))
d, app, login, owner, *_ = load("U23")
eur_total = next(x for x in login(owner).get("/api/balances").json() if x["currency"] == "EUR")["total_minor"]
out.append(("U23", "owner EUR total is 11000", eur_total == 11000))
d = tree("U17")
p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-o", "addopts=", "-p", "no:cacheprovider",
                    "tests/test_api.py::test_a_huge_session_cookie_is_401"], cwd=d, env=dict(os.environ, PYTHONPATH="src"),
                   capture_output=True, text=True)
out.append(("U17", "without addopts the test fails on head (500)", p.returncode == 1 and "500" in p.stdout))
for row in out:
    print(*row, sep=" | ")
print("ALL OK" if all(r[2] for r in out) else "SOME FAILED")
