from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.services.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import LabelBoxUpdate

__all__ = ['AssignEntity', 'AssignEntityParams']


class AssignEntityParams(BaseModel):
    box_id: uuid.UUID
    entity_id: uuid.UUID | None

class AssignEntity(UpdateBase[AssignEntityParams, LabelBoxUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignEntityParams):
        return params.box_id

    @classmethod
    def get_data(cls, params: AssignEntityParams):
        return LabelBoxUpdate(entity_id=params.entity_id)
