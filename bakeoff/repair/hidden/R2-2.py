# Hidden check of case R2-2 (repair development run 2, 24 Nov 2026). Evaluator-owned: the model
# never sees this file. The rule: the session cookie is HttpOnly and SameSite=lax, so a form on
# another site does not send it with a cross-site request.
from fastapi.testclient import TestClient

from bank import ledger
from bank.api import create_app


def test_hidden_the_session_cookie_is_httponly_and_samesite_lax(tmp_path):
    path = tmp_path / "hidden.db"
    conn = ledger.open_db(path)
    owner = ledger.create_customer(conn, "Hidden Check Owner")
    conn.close()
    response = TestClient(create_app(path, seed_if_empty=False)).post("/api/session", json={"customer_id": owner})
    header = response.headers["set-cookie"].lower()
    assert "httponly" in header
    assert "samesite=lax" in header
