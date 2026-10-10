from __future__ import annotations

import uuid

from pydantic import BaseModel, StrictInt

from sta.domain.label.repo.ops import UpdateBase

from ......api.label.data.entity import domain
from ......models.label.data import LabelInstanceUpdate

__all__ = ["AssignClass", "AssignClassParams"]


class AssignClassParams(BaseModel):
    instance_id: uuid.UUID
    gt_class_id: StrictInt | None


class AssignClass(UpdateBase[AssignClassParams, LabelInstanceUpdate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignClassParams):
        return params.instance_id

    @classmethod
    def get_data(cls, params: AssignClassParams):
        return LabelInstanceUpdate(gt_class_id=params.gt_class_id)
