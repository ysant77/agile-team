# Hidden check of case D7-1 (repair harness, 24 Nov 2026). Evaluator-owned: the model never sees
# this file. The rule is the bank README: a retry with the same Idempotency-Key returns the first
# transfer; keys expire after 24 hours.
from datetime import UTC, datetime, timedelta

import pytest

from bank import ledger
from bank.money import Money

START = datetime(2026, 11, 2, 9, 0, tzinfo=UTC)


@pytest.fixture
def pair(conn):
    owner = ledger.create_customer(conn, "Hidden Check Owner")
    other = ledger.create_customer(conn, "Hidden Check Payee")
    source = ledger.open_account(conn, owner, "EUR")
    target = ledger.open_account(conn, other, "EUR")
    ledger.deposit(conn, source.id, Money.of("100.00", "EUR"))
    return conn, owner, source, target


def send(pair, at):
    conn, owner, source, target = pair
    return ledger.transfer_once(conn, owner, "phone-retry", source.id, target.id, Money.of("25.00", "EUR"), now=at)


@pytest.mark.parametrize("later", [timedelta(minutes=30), timedelta(hours=2), timedelta(hours=23, minutes=59)])
def test_hidden_a_retry_within_24_hours_moves_money_once(pair, later):
    conn, _, source, _ = pair
    send(pair, START)
    _, replayed = send(pair, START + later)
    assert replayed is True
    assert ledger.get_account(conn, source.id).balance_minor == 7500


def test_hidden_a_key_is_free_again_after_24_hours(pair):
    conn, _, source, _ = pair
    send(pair, START)
    _, replayed = send(pair, START + timedelta(hours=25))
    assert replayed is False
    assert ledger.get_account(conn, source.id).balance_minor == 5000
