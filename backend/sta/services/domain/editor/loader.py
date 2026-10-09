from abc import ABC, abstractmethod
from collections.abc import Sequence

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


class DataLoader(ABC):

    @abstractmethod
    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> BaseModel | Response:
        raise NotImplementedError
