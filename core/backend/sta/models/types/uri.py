from typing import Annotated

from pydantic import AfterValidator, WithJsonSchema

from sta.common.filesystem import FileSystemPath

__all__ = ["FileURI"]


class FileURIValidators:
    MIN_LENGTH = 1
    MAX_LENGTH = 255
    INVALID_LEN_MSG = f"The URI cannot be blank and may be at most {MAX_LENGTH} characters long."
    INVALID_TARGET_MSG = "The URI must be relative and cannot navigate to a parent directory."

    @classmethod
    def validate(cls, v: object):
        if not isinstance(v, str):
            msg = "Not a string"
            raise TypeError(msg)

        if not cls.MIN_LENGTH <= len(v) <= cls.MAX_LENGTH:
            raise ValueError(cls.INVALID_LEN_MSG)

        if "\0" in v:
            msg = "The name cannot contain null characters"
            raise ValueError(msg)

        try:
            FileSystemPath.from_uri(v)
        # fsspec uses different exception types for unknown protocols,
        # installed-but-unsupported protocols, and unavailable backends. All
        # are invalid values at this model boundary and must become a normal
        # Pydantic validation error rather than an internal server error.
        except (ValueError, NotImplementedError, RuntimeError) as exc:
            raise ValueError(cls.INVALID_TARGET_MSG) from exc

        return v


FileURI = Annotated[
    str,
    AfterValidator(FileURIValidators.validate),
    WithJsonSchema(
        {
            "type": "string",
            "minLength": FileURIValidators.MIN_LENGTH,
            "maxLength": FileURIValidators.MAX_LENGTH,
        }
    ),
]
