# Hidden check of case D2-1 (repair harness, 24 Nov 2026). Evaluator-owned: the model never sees
# this file; the harness copies it into a copy of the bank only to evaluate a candidate.
# The rule is the bank README: a statement covers both dates inclusive. Not the seeded patch.
from datetime import date

import pytest

from bank import ledger
from bank.money import Money


def eur(amount):
    return Money.of(amount, "EUR")


@pytest.fixture
def account(conn):
    customer = ledger.create_customer(conn, "Hidden Check Customer")
    return ledger.open_account(conn, customer, "EUR")


def test_hidden_a_line_on_the_end_date_is_in_the_statement(conn, account, at):
    ledger.deposit(conn, account.id, eur("42.10"), at=at("2026-10-31", "18:30"))
    st = ledger.statement(conn, account.id, date(2026, 10, 1), date(2026, 10, 31))
    assert [line.amount_minor for line in st.lines] == [4210]
    assert st.closing_minor == 4210


def test_hidden_a_one_day_statement_holds_that_day(conn, account, at):
    ledger.deposit(conn, account.id, eur("1.00"), at=at("2026-10-15", "00:00"))
    ledger.deposit(conn, account.id, eur("2.00"), at=at("2026-10-15", "23:59"))
    ledger.deposit(conn, account.id, eur("4.00"), at=at("2026-10-16", "00:00"))
    st = ledger.statement(conn, account.id, date(2026, 10, 15), date(2026, 10, 15))
    assert [line.amount_minor for line in st.lines] == [100, 200]


def test_hidden_the_next_day_is_not_in_the_statement(conn, account, at):
    ledger.deposit(conn, account.id, eur("3.00"), at=at("2026-11-01", "00:00"))
    st = ledger.statement(conn, account.id, date(2026, 10, 1), date(2026, 10, 31))
    assert st.lines == []
    assert st.opening_minor == 0


def test_hidden_the_last_date_does_not_crash(conn, account):
    try:
        ledger.statement(conn, account.id, date(2026, 1, 1), date.max)
    except ledger.LedgerError:
        pass
