# Hidden check of case R3-1 (repair development run 3, 24 Nov 2026). Evaluator-owned: the model
# never sees this file. The rule: a transfer reference may have up to 40 characters (the web form
# allows 40); a longer one is refused.
from fastapi.testclient import TestClient

from bank import ledger
from bank.api import create_app
from bank.money import Money


def test_hidden_a_reference_of_40_characters_is_accepted_and_41_is_refused(tmp_path):
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

    def send(reference, key):
        body = {"from_account_id": source.id, "to_account_number": target.number, "amount": "1.00", "reference": reference}
        return client.post("/api/transfers", json=body, headers={"Idempotency-Key": key})

    assert send("R" * 40, "ref-40").status_code == 201
    assert send("R" * 41, "ref-41").status_code == 422
