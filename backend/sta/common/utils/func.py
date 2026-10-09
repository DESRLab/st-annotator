from __future__ import annotations

import inspect
import time
from collections.abc import Callable
from functools import wraps
from typing import Generic, TypeVar
from typing_extensions import ParamSpec

from sta.common.logging import get_logger

__all__ = [
    'OptionalEquals',
    'optional_equals',
    'retry',
]

logger = get_logger()


T = TypeVar('T')
P = ParamSpec('P')
R = TypeVar('R')


def retry(on: type[Exception] | tuple[type[Exception], ...], *, count: int = 1, delay_secs: float = 0.0):
    """
    Wraps a function so that in case any exception type in `on` is raised, the
    function is invoked again after `delay_secs` until a total of `count`
    attempts have been made. Once all attempts have been exhausted, the error
    of the last attempt is re-raised by the wrapper function.

    The default parameters of this wrapper correspond to the base case of not
    retrying the function at all.
    """
    if count < 1:
        msg = '`count` must be a positive integer'
        raise ValueError(msg)
    if delay_secs < 0:
        msg = '`delay_secs` must be a non-negative number'
        raise ValueError(msg)

    def inner(fn: Callable[P, R]) -> Callable[P, R]:
        @wraps(fn)
        def wrapped(*args: P.args, **kwargs: P.kwargs) -> R:
            i = 0

            while True:
                try:
                    return fn(*args, **kwargs)
                except on:
                    i += 1
                    if i >= count:
                        raise

                    time.sleep(delay_secs)
        return wrapped
    return inner


class OptionalEquals(Generic[T]):
    """
    Tests whether two optional values are equal. If both are `None`, returns `True`;
    if only one is `None`, returns `False`; otherwise, this is equivalent to :attr:`equals`.
    """

    def __init__(self, equals: Callable[[T, T], bool]) -> None:
        super().__init__()

        self.equals = equals

    def __call__(self, a: T | None, b: T | None) -> bool:
        if a is None:
            return b is None
        if b is None:
            return a is None

        return self.equals(a, b)

    def __repr__(self) -> str:
        return f'{type(self).__name__}[equals={inspect.getsource(self.equals)}]'


def optional_equals(a: T | None, b: T | None) -> bool:
    """
    Tests whether two optional values are equal. If both are `None`, returns `True`;
    if only one is `None`, returns `False`; otherwise, this is equivalent to `a == b`.
    """
    return OptionalEquals(lambda a_, b_: a_ == b_)(a, b)
