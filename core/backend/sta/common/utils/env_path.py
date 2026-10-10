"""Resolve configured paths against the `.env` file that declares them."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from dotenv import find_dotenv

if TYPE_CHECKING:
    from _typeshed import StrPath

__all__ = ["anchored_path"]


def anchored_path(value: StrPath, dotenv_path: StrPath | None = None) -> Path:
    """Absolute form of a configured path, anchoring a relative value at the `.env`.

    A relative value names a file beside the `.env` that declares it rather than one
    in the caller's working directory, so the same configuration points at the same
    files wherever a command is launched from.

    Parameters
    ----------
    value
        The configured path, as read from the environment.
    dotenv_path
        The `.env` file to anchor a relative `value` against. Defaults to the file
        discovered by walking up from the working directory, which is what the
        configuration loaders read, so a value they loaded anchors identically. It is
        left as given when no `.env` is found, since nothing declared it.
    """
    path = Path(value)
    if path.is_absolute():
        return path

    if dotenv_path is None:
        dotenv_path = find_dotenv(usecwd=True)

    if not dotenv_path:
        return path

    return Path(dotenv_path).resolve().parent / path
