from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.services.domain.label.repo.ops import UpdateBase
from sta.services.models.types import Name

from ......api.label.data.element import domain
from ......models.label.data import (
    LabelBoxUpdate,
    TruncDecimalCoord,
    TruncDecimalCoord3,
    TruncDecimalSize3,
)

__all__ = ['Transform', 'TransformParams']


class TransformParams(BaseModel):
    box_id: uuid.UUID
    mode: Name
    center: TruncDecimalCoord3
    angle: TruncDecimalCoord
    size: TruncDecimalSize3

class Transform(UpdateBase[TransformParams, LabelBoxUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: TransformParams):
        return params.box_id

    @classmethod
    def get_data(cls, params: TransformParams):
        center = params.center
        angle = params.angle
        size = params.size

        return LabelBoxUpdate.from_bbox(center=center, angle=angle, size=size)
