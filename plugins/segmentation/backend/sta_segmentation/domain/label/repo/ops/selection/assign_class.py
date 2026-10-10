from __future__ import annotations

import uuid

from pydantic import BaseModel, StrictInt

from sta.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import LabelSelectionUpdate

__all__ = ["AssignClass", "AssignClassParams"]


class AssignClassParams(BaseModel):
    selection_id: uuid.UUID
    perceived_class_id: StrictInt | None


class AssignClass(UpdateBase[AssignClassParams, LabelSelectionUpdate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignClassParams):
        return params.selection_id

    @classmethod
    def get_data(cls, params: AssignClassParams):
        return LabelSelectionUpdate(perceived_class_id=params.perceived_class_id)
