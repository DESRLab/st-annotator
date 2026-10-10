from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import ClassVar

from fastapi import Response
from pydantic import BaseModel
from sqlmodel import Session

from sta.common.utils.json import JSONType

from ...models.frame import FramePublic
from ...models.user import UserPublic

SOURCE_DATA_LOADERS = dict[str, "DataLoader"]()
"""Plugins can register additional loaders to this registry."""

LABEL_DATA_LOADERS = dict[str, "DataLoader"]()
"""Plugins can register additional loaders to this registry."""


def register_data_loader(registry: dict[str, "DataLoader"], key: str, loader: "DataLoader") -> None:
    """Register a plugin loader without making plugin load order observable."""
    if existing := registry.get(key):
        if type(existing) is type(loader):
            return
        existing_name = f"{type(existing).__module__}.{type(existing).__qualname__}"
        loader_name = f"{type(loader).__module__}.{type(loader).__qualname__}"
        msg = f"Data loader key {key!r} is registered by both {existing_name} and {loader_name}"
        raise ValueError(msg)
    registry[key] = loader


class DataLoader(ABC):
    data_model: ClassVar[type[BaseModel] | None] = None
    """The per-frame response model of `get_data_bulk`, used to type the editor bulk endpoint."""

    @abstractmethod
    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> Sequence[BaseModel] | Response:
        raise NotImplementedError
