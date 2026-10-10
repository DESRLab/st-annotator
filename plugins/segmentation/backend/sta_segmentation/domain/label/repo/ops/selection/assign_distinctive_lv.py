from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.domain.label.repo.ops import UpdateBase

from ......api.label.data.element import domain
from ......models.label.data import DistinctiveLevel, LabelSelectionUpdate

__all__ = ["AssignDistinctiveLv", "AssignDistinctiveLvParams"]


class AssignDistinctiveLvParams(BaseModel):
    selection_id: uuid.UUID
    distinctive_lv: DistinctiveLevel | None


class AssignDistinctiveLv(UpdateBase[AssignDistinctiveLvParams, LabelSelectionUpdate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignDistinctiveLvParams):
        return params.selection_id

    @classmethod
    def get_data(cls, params: AssignDistinctiveLvParams):
        return LabelSelectionUpdate(distinctive_lv=params.distinctive_lv)
