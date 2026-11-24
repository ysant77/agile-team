# Hidden check of case R3-2 (repair development run 3, 24 Nov 2026). Evaluator-owned: the model
# never sees this file. The rule (ISO 4217): the Korean won has no minor unit, like the yen.
import pytest

from bank.money import Money, from_minor


def test_hidden_won_amounts_have_no_decimals():
    assert Money.of("1000", "KRW").minor == 1000
    assert str(from_minor(1000, "KRW")) == "1000"
    with pytest.raises(ValueError):
        Money.of("10.50", "KRW")
