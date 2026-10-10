from __future__ import annotations

import uuid

from pydantic import BaseModel, StrictInt

from sta.domain.label.repo.ops import UpdateBase

from ......api.label.data.entity import domain
from ......models.label.data import LabelTrackUpdate

__all__ = ["AssignClass", "AssignClassParams"]


class AssignClassParams(BaseModel):
    track_id: uuid.UUID
    gt_class_id: StrictInt | None


class AssignClass(UpdateBase[AssignClassParams, LabelTrackUpdate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignClassParams):
        return params.track_id

    @classmethod
    def get_data(cls, params: AssignClassParams):
        return LabelTrackUpdate(gt_class_id=params.gt_class_id)
