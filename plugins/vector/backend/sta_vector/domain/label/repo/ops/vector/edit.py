from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.services.domain.label.repo.ops import UpdateBase
from sta.services.models.types import Name

from ......api.label.data.element import domain
from ......models.label.data import LabelVectorUpdate, VectorVertices

__all__ = ['Edit', 'EditParams']


class EditParams(BaseModel):
    vector_id: uuid.UUID
    mode: Name  # add/delete Vertex, delete vertices, transformVertices
    vertices: VectorVertices

class Edit(UpdateBase[EditParams, LabelVectorUpdate]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: EditParams):
        return params.vector_id

    @classmethod
    def get_data(cls, params: EditParams):
        vertices = params.vertices

        return LabelVectorUpdate.from_vertices(vertices=vertices)
