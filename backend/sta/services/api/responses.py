from typing import Literal

from pydantic import BaseModel


class SuccessResponse(BaseModel):
    success: Literal[True] = True


class CreatedIDsResponse(SuccessResponse):
    ids: list[int]
