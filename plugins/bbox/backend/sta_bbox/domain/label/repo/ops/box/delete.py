from __future__ import annotations

import uuid

from pydantic import BaseModel

from sta.services.domain.label.repo.ops import DeleteBase

from ......api.label.data.element import domain

__all__ = ['Delete', 'DeleteParams']


class DeleteParams(BaseModel):
    box_id: uuid.UUID

class Delete(DeleteBase[DeleteParams]):

    @classmethod
    def get_domain(cls):
        return domain

    @classmethod
    def get_id(cls, params: DeleteParams):
        return params.box_id
