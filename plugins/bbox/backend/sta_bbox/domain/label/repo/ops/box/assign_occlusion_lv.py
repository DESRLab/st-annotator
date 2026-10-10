from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import LabelBoxUpdate, OcclusionLevel

__all__ = ["AssignOcclusionLv", "AssignOcclusionLvParams"]


class AssignOcclusionLvParams(BaseModel):
    box_id: uuid.UUID
    occlusion_lv: OcclusionLevel | None


class AssignOcclusionLv(UpdateBase[AssignOcclusionLvParams, LabelBoxUpdate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignOcclusionLvParams):
        return params.box_id

    @classmethod
    def get_data(cls, params: AssignOcclusionLvParams):
        return LabelBoxUpdate(occlusion_lv=params.occlusion_lv)
