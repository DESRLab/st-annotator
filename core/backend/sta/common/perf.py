from __future__ import annotations

from time import perf_counter
from types import TracebackType
from typing import Literal, overload
from typing_extensions import Self

__all__ = ["PerformanceCounter"]


class PerformanceCounter:
    """Accumulate elapsed time across one or more context-manager entries."""

    def __init__(self, *, init_seconds: float = 0) -> None:
        super().__init__()
        self._total_seconds = init_seconds
        self._start_seconds: float | None = None

    @property
    def total_seconds(self) -> float:
        return self._total_seconds

    def __enter__(self) -> Self:
        if self._start_seconds is not None:
            msg = "Entered context when context is already active"
            raise RuntimeError(msg)
        self._start_seconds = perf_counter()
        return self

    @overload
    def __exit__(
        self,
        exc_type: type[BaseException],
        exc_value: BaseException,
        exc_tb: TracebackType,
    ) -> Literal[False]: ...

    @overload
    def __exit__(self, exc_type: None, exc_value: None, exc_tb: None) -> None: ...

    @overload
    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool | None: ...

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool | None:
        if self._start_seconds is None:
            msg = "Exited context when context is not active"
            raise RuntimeError(msg)
        self._total_seconds += perf_counter() - self._start_seconds
        self._start_seconds = None
        return None if exc_value is None else False
