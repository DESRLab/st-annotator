from __future__ import annotations

import uuid

from pydantic import BaseModel, StrictBool

from sta.domain.label.repo.ops import UpdateBase

from ......api.label.data.entity import domain
from ......models.label.data import LabelInstanceUpdate

__all__ = ["AssignIsBlack", "AssignIsBlackParams"]


class AssignIsBlackParams(BaseModel):
    instance_id: uuid.UUID
    is_black: StrictBool


class AssignIsBlack(UpdateBase[AssignIsBlackParams, LabelInstanceUpdate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: AssignIsBlackParams):
        return params.instance_id

    @classmethod
    def get_data(cls, params: AssignIsBlackParams):
        is_black = params.is_black

        return LabelInstanceUpdate(is_black=is_black)
