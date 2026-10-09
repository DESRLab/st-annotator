from __future__ import annotations

import pydantic

from sta.common.testing.database import jsons_equal
from sta.common.utils.json import JSONType

__all__ = ['OperationConfig']


class OperationConfig(pydantic.BaseModel):
    """
    A JSON representation of an :class:`Operation` that can be stored in the database.

    You should instantiate this through :class:`OperationRegistry` in order to apply validation.
    """

    op_name: str
    op_params: JSONType

    def __eq__(self, other: object) -> bool:
        if type(other) != type(self):  # noqa: E721
            return False

        return self.op_name == other.op_name \
            and jsons_equal(self.op_params, other.op_params)
