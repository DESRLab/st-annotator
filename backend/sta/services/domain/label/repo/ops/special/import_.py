from __future__ import annotations

import inspect
from collections.abc import Callable

from pydantic import BaseModel, field_serializer
from sqlmodel import Session

from sta.common.utils.json import JSONType

from ......models.label.repo import LabelsetCommit
from ......models.user import UserPublic
from ..base import Operation

__all__ = ['ImportLabelData', 'ImportLabelDataParams']


class ImportLabelDataParams(BaseModel):
    func: Callable[[UserPublic, Session, LabelsetCommit], None]
    """The import function which is wrapped in :meth:`ImportLabelData.apply`."""

    metadata: JSONType | None = None
    """Metadata to provide extra information about the import."""

    @field_serializer('func')
    def serialize_func(self, func: Callable[[UserPublic, Session, LabelsetCommit], None], _info: object):
        return inspect.getsource(func)

class ImportLabelData(Operation[ImportLabelDataParams]):
    """Imports data into a commit."""

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        return self.params.func(current_user, session, commit)
