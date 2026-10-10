from decimal import Decimal

import pydantic

import pytest

from sta.common.spatial import DecimalCoord, DecimalSize


def test_decimal_coord_truncates_additional_decimal_places():
    value = pydantic.TypeAdapter(DecimalCoord).validate_python(Decimal("1.23456789"))

    assert value == Decimal("1.234567")


def test_decimal_coord_rejects_oversized_after_truncation():
    with pytest.raises(pydantic.ValidationError):
        pydantic.TypeAdapter(DecimalCoord).validate_python(Decimal("7654321.23456789"))


@pytest.mark.parametrize("value", [1e25, Decimal("1e100")])
def test_decimal_coord_converts_quantization_overflow_to_validation_error(value):
    with pytest.raises(pydantic.ValidationError):
        pydantic.TypeAdapter(DecimalCoord).validate_python(value)


def test_decimal_size_truncates_before_positive_validation():
    value = pydantic.TypeAdapter(DecimalSize).validate_python("2.34567891")

    assert value == Decimal("2.345678")


def test_decimal_size_rejects_non_positive_after_truncation():
    with pytest.raises(pydantic.ValidationError):
        pydantic.TypeAdapter(DecimalSize).validate_python("0.0000009")
