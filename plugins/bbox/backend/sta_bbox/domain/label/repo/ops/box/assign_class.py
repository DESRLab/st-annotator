from __future__ import annotations

import uuid

from pydantic import BaseModel, StrictInt

from sta.services.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import LabelBoxUpdate

__all__ = ['AssignClass', 'AssignClassParams']


class AssignClassParams(BaseModel):
    box_id: uuid.UUID
    perceived_class_id: StrictInt | None

class AssignClass(UpdateBase[AssignClassParams, LabelBoxUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignClassParams):
        return params.box_id

    @classmethod
    def get_data(cls, params: AssignClassParams):
        return LabelBoxUpdate(perceived_class_id=params.perceived_class_id)
