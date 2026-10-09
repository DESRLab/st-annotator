from __future__ import annotations

import uuid

from pydantic import BaseModel, Field

from sta.common.spatial import DecimalCoord3
from sta.services.domain.label.repo.ops import UpdateBase
from sta.services.models.types import Name

from ......api.label.data.element import domain
from ......models.label.data import LabelSelectionUpdate

__all__ = ['Edit', 'EditParams']


class EditParams(BaseModel):
    selection_id: uuid.UUID
    mode: Name  # add/delete points from selection
    points: list[DecimalCoord3] = Field(min_length=1)

class Edit(UpdateBase[EditParams, LabelSelectionUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: EditParams):
        return params.selection_id

    @classmethod
    def get_data(cls, params: EditParams):
        points = params.points

        return LabelSelectionUpdate.from_points(points=points)
