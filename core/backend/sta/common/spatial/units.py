from decimal import ROUND_DOWN, Decimal, InvalidOperation
from typing import Annotated, TypeAlias

from pydantic import BeforeValidator, Field

__all__ = ["DecimalCoord", "DecimalSize", "create_decimal_truncator"]


def create_decimal_truncator(decimal_places: int):
    exp = Decimal(f"1e-{decimal_places}")

    def truncate(value: object) -> object:
        try:
            decimal_value = value if isinstance(value, Decimal) else Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return value

        if not decimal_value.is_finite():
            return value

        try:
            return decimal_value.quantize(exp, rounding=ROUND_DOWN)
        except InvalidOperation as exc:
            message = "Decimal value is too large to normalize"
            raise ValueError(message) from exc

    return truncate


DecimalCoord: TypeAlias = Annotated[
    Decimal,
    BeforeValidator(create_decimal_truncator(6)),
    Field(allow_inf_nan=False, max_digits=12, decimal_places=6),
]
DecimalSize: TypeAlias = Annotated[
    Decimal,
    BeforeValidator(create_decimal_truncator(6)),
    Field(allow_inf_nan=False, gt=0, max_digits=12, decimal_places=6),
]
