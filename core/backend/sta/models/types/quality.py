from typing import Annotated

from pydantic import Field

__all__ = ["QualityRank"]

QualityRank = Annotated[int, Field(ge=-32768, le=32767)]
