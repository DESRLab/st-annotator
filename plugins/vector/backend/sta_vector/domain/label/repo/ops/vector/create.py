from __future__ import annotations

from pydantic import AwareDatetime, BaseModel, StrictInt

from sta.services.domain.label.repo.ops import CreateBase
from sta.services.models.label.repo import LabelsetCommit

from ......api.label.data.element import domain
from ......models.label.data import LabelVectorCreate, VectorVertices

__all__ = ['Create', 'CreateParams']


class CreateParams(BaseModel):
    vertices: VectorVertices
    gt_class_id: StrictInt | None = None
    timestamp: AwareDatetime | None = None


class Create(CreateBase[CreateParams, LabelVectorCreate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_data(cls, commit: LabelsetCommit, params: CreateParams):
        timestamp = params.timestamp
        vertices = params.vertices
        gt_class_id = params.gt_class_id

        return LabelVectorCreate.from_vertices(
            vertices=vertices,
            timestamp=timestamp,
            group_id=commit.group_id,
            commit_hash=commit.hash,
            entity_id=None,
            gt_class_id=gt_class_id,
        )
