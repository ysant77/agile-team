# Hidden check of case R2-1 (repair development run 2, 24 Nov 2026). Evaluator-owned: the model
# never sees this file. The rule is the bank's statement: lines are posted from start to end in
# date order, each with the balance after it (the running balance).
from datetime import UTC, date, datetime

from bank import ledger
from bank.money import Money


def at(day):
    return datetime.fromisoformat(f"{day}T12:00").replace(tzinfo=UTC)


def test_hidden_lines_are_in_date_order_with_a_running_balance(conn):
    owner = ledger.create_customer(conn, "Hidden Check Owner")
    account = ledger.open_account(conn, owner, "EUR")
    ledger.deposit(conn, account.id, Money.of("100.00", "EUR"), at=at("2026-05-01"))
    # A payment booked today for an earlier day: entered after a later one.
    ledger.deposit(conn, account.id, Money.of("20.00", "EUR"), at=at("2026-05-20"))
    ledger.deposit(conn, account.id, Money.of("5.00", "EUR"), at=at("2026-05-10"))
    st = ledger.statement(conn, account.id, date(2026, 5, 2), date(2026, 5, 31))
    assert [line.posted_at[:10] for line in st.lines] == ["2026-05-10", "2026-05-20"]
    assert [line.balance_minor for line in st.lines] == [10500, 12500]
    assert st.closing_minor == 12500
