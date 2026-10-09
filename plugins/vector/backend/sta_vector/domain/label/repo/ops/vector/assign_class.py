from __future__ import annotations

import uuid

from pydantic import BaseModel, StrictInt

from sta.services.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import LabelVectorUpdate

__all__ = ['AssignClass', 'AssignClassParams']


class AssignClassParams(BaseModel):
    vector_id: uuid.UUID
    gt_class_id: StrictInt | None

class AssignClass(UpdateBase[AssignClassParams, LabelVectorUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignClassParams):
        return params.vector_id

    @classmethod
    def get_data(cls, params: AssignClassParams):
        return LabelVectorUpdate(gt_class_id=params.gt_class_id)
