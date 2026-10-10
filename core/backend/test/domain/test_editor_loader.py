from collections.abc import Sequence

from fastapi import Response
from pydantic import BaseModel
from sqlmodel import Session

import pytest

from sta.common.utils.json import JSONType
from sta.domain.editor.loader import DataLoader, register_data_loader
from sta.models.frame import FramePublic
from sta.models.user import UserPublic


class ExampleLoader(DataLoader):
    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> BaseModel | Response:
        raise NotImplementedError


class ConflictingLoader(ExampleLoader):
    pass


def test_register_data_loader_is_idempotent_for_same_provider() -> None:
    original = ExampleLoader()
    registry: dict[str, DataLoader] = {}

    register_data_loader(registry, "example", original)
    register_data_loader(registry, "example", ExampleLoader())

    assert registry == {"example": original}


def test_register_data_loader_rejects_different_provider_for_same_key() -> None:
    registry: dict[str, DataLoader] = {}
    register_data_loader(registry, "example", ExampleLoader())

    with pytest.raises(ValueError, match=r"ExampleLoader.*ConflictingLoader"):
        register_data_loader(registry, "example", ConflictingLoader())
