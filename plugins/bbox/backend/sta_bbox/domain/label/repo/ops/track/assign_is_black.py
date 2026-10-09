from __future__ import annotations

import uuid

from pydantic import BaseModel, StrictBool

from sta.services.domain.label.repo.ops import UpdateBase

from ......api.label.data.entity import domain
from ......models.label.data import LabelTrackUpdate

__all__ = ['AssignIsBlack', 'AssignIsBlackParams']


class AssignIsBlackParams(BaseModel):
    track_id: uuid.UUID
    is_black: StrictBool

class AssignIsBlack(UpdateBase[AssignIsBlackParams, LabelTrackUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignIsBlackParams):
        return params.track_id

    @classmethod
    def get_data(cls, params: AssignIsBlackParams):
        return LabelTrackUpdate(is_black=params.is_black)
