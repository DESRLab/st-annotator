from __future__ import annotations

from collections.abc import Iterator, Sequence, Sized
from typing import TypeVar

__all__ = ["SizedIterator", "take"]

T = TypeVar("T")


def take(seq: Sequence[T], idxs: Sequence[int]) -> Sequence[T]:
    """
    Extracts multiple elements from a collection by their indices.

    Parameters
    ----------
    seq : sequence of T
        The collection to extract from.
    idxs : sequence of int
        For each element `idx`, extracts the element at the index `idx` of `seq`.

    Returns
    -------
    sequence of T
        The `i`th element of the returned collection corresponds to the `i`th element in `idxs`.
    """
    return [seq[idx] for idx in idxs]


class SizedIterator(Sized, Iterator[T]):
    """
    Wraps an iterator to also provide its length in cases where it can be computed in advance.

    When iterating over this object, if the wrapped iterator is found to have a different length
    than the provided value, a :exc:`RuntimeError` is raised.
    """

    def __init__(self, it: Iterator[T], length: int) -> None:
        super().__init__()

        if length < 0:
            msg = "The length must be non-negative"
            raise ValueError(msg)

        self.it = it
        self.length = length

        self._count = 0

    def __len__(self) -> int:
        return self.length

    def __next__(self) -> T:
        try:
            v = next(self.it)
        except StopIteration:
            if self._count != self.length:
                assert self._count < self.length
                msg = f"The actual length of the iterator is less than the given length. Given: {self.length}. Actual: {self._count}"
                raise RuntimeError(msg) from None

            raise

        if self._count == self.length:
            msg = f"The actual length of the iterator is greater than the given length. Given: {self.length}"
            raise RuntimeError(msg)

        self._count += 1

        return v

    def __iter__(self) -> Iterator[T]:
        return SizedIterator(self.it, self.length)
