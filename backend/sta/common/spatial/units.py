from decimal import ROUND_DOWN, Decimal, InvalidOperation
from typing import Annotated, Any

from pydantic import BeforeValidator, Field

__all__ = ["DecimalCoord", "DecimalSize", "create_decimal_field"]


def create_decimal_field(*, max_digits: int, decimal_places: int, **kwargs: Any):
    exp = Decimal(f"1e-{decimal_places}")

    def _truncate_decimal_6_places(value: object) -> object:
        try:
            decimal_value = value if isinstance(value, Decimal) else Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return value

        if not decimal_value.is_finite():
            return value

        return decimal_value.quantize(exp, rounding=ROUND_DOWN)

    return Annotated[
        Decimal,
        BeforeValidator(_truncate_decimal_6_places),
        Field(max_digits=max_digits, decimal_places=decimal_places, **kwargs),
    ]


DecimalCoord = create_decimal_field(allow_inf_nan=False, max_digits=12, decimal_places=6)
DecimalSize = create_decimal_field(allow_inf_nan=False, gt=0, max_digits=12, decimal_places=6)
