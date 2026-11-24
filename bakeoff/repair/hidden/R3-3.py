# Hidden check of case R3-3 (repair development run 3, 24 Nov 2026). Evaluator-owned: the model
# never sees this file. The rule: an account number is found as the customer types it, in capital
# or small letters, with spaces around it.
from fastapi.testclient import TestClient

from bank import ledger
from bank.api import create_app
from bank.money import Money


def test_hidden_an_account_number_in_small_letters_is_found(tmp_path):
    path = tmp_path / "hidden.db"
    conn = ledger.open_db(path)
    owner = ledger.create_customer(conn, "Hidden Check Owner")
    other = ledger.create_customer(conn, "Hidden Check Payee")
    source = ledger.open_account(conn, owner, "EUR")
    target = ledger.open_account(conn, other, "EUR")
    ledger.deposit(conn, source.id, Money.of("100.00", "EUR"))
    conn.close()
    client = TestClient(create_app(path, seed_if_empty=False))
    assert client.post("/api/session", json={"customer_id": owner}).status_code == 200
    for i, typed in enumerate((target.number.lower(), f"  {target.number.lower()} ")):
        body = {"from_account_id": source.id, "to_account_number": typed, "amount": "1.00"}
        assert client.post("/api/transfers", json=body, headers={"Idempotency-Key": f"low-{i}"}).status_code == 201
