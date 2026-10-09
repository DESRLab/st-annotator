from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.services.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import DistinctiveLevel, LabelBoxUpdate

__all__ = ['AssignDistinctiveLv', 'AssignDistinctiveLvParams']


class AssignDistinctiveLvParams(BaseModel):
    box_id: uuid.UUID
    distinctive_lv: DistinctiveLevel | None

class AssignDistinctiveLv(UpdateBase[AssignDistinctiveLvParams, LabelBoxUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignDistinctiveLvParams):
        return params.box_id

    @classmethod
    def get_data(cls, params: AssignDistinctiveLvParams):
        return LabelBoxUpdate(distinctive_lv=params.distinctive_lv)
