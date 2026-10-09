from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.services.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import BoxType, LabelBoxUpdate

__all__ = ['AssignType', 'AssignTypeParams']


class AssignTypeParams(BaseModel):
    box_id: uuid.UUID
    box_type: BoxType

class AssignType(UpdateBase[AssignTypeParams, LabelBoxUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignTypeParams):
        return params.box_id

    @classmethod
    def get_data(cls, params: AssignTypeParams):
        return LabelBoxUpdate(type=params.box_type)
