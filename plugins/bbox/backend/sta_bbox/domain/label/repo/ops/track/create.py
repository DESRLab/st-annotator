from __future__ import annotations

from pydantic import BaseModel, StrictBool, StrictInt

from sta.services.domain.label.repo.ops import CreateBase
from sta.services.models.label.repo import LabelsetCommit

from ......api.label.data.entity import domain
from ......models.label.data import LabelTrackCreate

__all__ = ['Create', 'CreateParams']


class CreateParams(BaseModel):
    is_black: StrictBool = False
    gt_class_id: StrictInt | None = None

class Create(CreateBase[CreateParams, LabelTrackCreate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_data(cls, commit: LabelsetCommit, params: CreateParams):
        is_black = params.is_black
        gt_class_id = params.gt_class_id

        return LabelTrackCreate(
            group_id=commit.group_id,
            commit_hash=commit.hash,
            is_black=is_black,
            gt_class_id=gt_class_id,
        )
