from __future__ import annotations

from contextlib import AbstractContextManager
from time import perf_counter
from types import TracebackType
from typing import Literal, overload
from typing_extensions import Self

__all__ = ['PerformanceCounter']


class PerformanceCounter(AbstractContextManager):
    """
    An object that accumulates the time spent within its context.

    You can create multiple contexts from the same instance; the accumulated time represents
    the total time spent across each context.
    """

    def __init__(self, *, init_seconds: float = 0) -> None:
        super().__init__()

        self._total_seconds = init_seconds
        self._start_seconds = None

    @property
    def total_seconds(self) -> float:
        """The time spent within the context(s) of this object."""
        return self._total_seconds

    def __enter__(self) -> Self:
        super().__enter__()

        if self._start_seconds is not None:
            msg = 'Entered context when context is already active'
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
    def __exit__(
        self,
        exc_type: None,
        exc_value: None,
        exc_tb: None,
    ) -> None: ...

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
            msg = 'Exited context when context is not active'
            raise RuntimeError(msg)

        self._total_seconds += perf_counter() - self._start_seconds
        self._start_seconds = None

        if exc_value is None:
            return super().__exit__(exc_type, exc_value, exc_tb)

        return False
