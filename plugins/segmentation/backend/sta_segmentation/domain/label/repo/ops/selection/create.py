from __future__ import annotations

import uuid

from pydantic import AwareDatetime, BaseModel, Field, StrictInt
from sqlmodel import Session

from sta.common.spatial import DecimalCoord3
from sta.domain.label.repo.ops import CreateBase
from sta.models.label.repo import LabelsetCommit
from sta.models.types import QualityRank
from sta.models.user import UserPublic

from ......api.label.data.element import domain
from ......api.label.data.entity import domain as entity_domain
from ......models.label.data import DistinctiveLevel, LabelSelectionCreate, OcclusionLevel

__all__ = ["Create", "CreateParams"]


class CreateParams(BaseModel):
    points: list[DecimalCoord3] = Field(min_length=1)
    entity_id: uuid.UUID | None = None
    timestamp: AwareDatetime | None = None
    quality_rank: QualityRank | None = None
    distinctive_lv: DistinctiveLevel | None = None
    occlusion_lv: OcclusionLevel | None = None
    perceived_class_id: StrictInt | None = None


class Create(CreateBase[CreateParams, LabelSelectionCreate]):
    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_data(cls, commit: LabelsetCommit, params: CreateParams):
        entity_id = params.entity_id
        timestamp = params.timestamp
        points = params.points
        quality_rank = params.quality_rank
        distinctive_lv = params.distinctive_lv
        occlusion_lv = params.occlusion_lv
        perceived_class_id = params.perceived_class_id

        return LabelSelectionCreate.from_points(
            points=points,
            timestamp=timestamp,
            group_id=commit.group_id,
            commit_hash=commit.hash,
            entity_id=entity_id,
            quality_rank=quality_rank,
            distinctive_lv=distinctive_lv,
            occlusion_lv=occlusion_lv,
            perceived_class_id=perceived_class_id,
        )

    def apply(self, current_user: UserPublic, session: Session, commit: LabelsetCommit):
        selection_id = super().apply(current_user, session, commit)
        if self.params.entity_id is not None:
            entity_domain.set_has_children(
                current_user=current_user,
                session=session,
                id=self.params.entity_id,
                group_id=commit.group_id,
                commit_hash=commit.hash,
                value=True,
            )
        return selection_id
