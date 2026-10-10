from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator, WithJsonSchema

__all__ = ["Name"]


class NameValidators:
    MIN_LENGTH = 1
    MAX_LENGTH = 255
    INVALID_MSG = f"The name cannot be blank and may be at most {MAX_LENGTH} characters long."

    @classmethod
    def validate(cls, v: object):
        if not isinstance(v, str):
            msg = "Not a string"
            raise TypeError(msg)

        if not cls.MIN_LENGTH <= len(v) <= cls.MAX_LENGTH:
            raise ValueError(cls.INVALID_MSG)

        if "\0" in v:
            msg = "The name cannot contain null characters"
            raise ValueError(msg)

        return v


Name = Annotated[
    str,
    AfterValidator(NameValidators.validate),
    WithJsonSchema(
        {
            "type": "string",
            "minLength": NameValidators.MIN_LENGTH,
            "maxLength": NameValidators.MAX_LENGTH,
            "pattern": r"[^\u0000]+",
        }
    ),
]
