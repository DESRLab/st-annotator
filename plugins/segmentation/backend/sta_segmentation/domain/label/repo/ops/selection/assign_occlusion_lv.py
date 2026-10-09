from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.services.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import LabelSelectionUpdate, OcclusionLevel

__all__ = ['AssignOcclusionLv', 'AssignOcclusionLvParams']


class AssignOcclusionLvParams(BaseModel):
    selection_id: uuid.UUID
    occlusion_lv: OcclusionLevel | None

class AssignOcclusionLv(UpdateBase[AssignOcclusionLvParams, LabelSelectionUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignOcclusionLvParams):
        return params.selection_id

    @classmethod
    def get_data(cls, params: AssignOcclusionLvParams):
        return LabelSelectionUpdate(occlusion_lv=params.occlusion_lv)
