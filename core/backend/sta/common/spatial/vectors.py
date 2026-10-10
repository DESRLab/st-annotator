from __future__ import annotations

import math
from collections.abc import Callable
from decimal import Decimal
from enum import Enum, auto
from typing import Generic, Literal, TypeVar, cast, overload
from typing_extensions import Self

import numpy as np
import numpy.typing as npt

from pydantic import BaseModel, ConfigDict

from .units import DecimalCoord, DecimalSize

__all__ = [
    "BaseOptionalVector3",
    "BaseVector3",
    "DecimalCoord3",
    "DecimalSize3",
    "DecimalVector3",
    "OptionalDecimalCoord3",
    "OptionalVector3",
    "Vector3",
]


def decimals_equal(a: Decimal, b: Decimal, *, nan_ok: bool = False):
    if nan_ok:
        if a.is_snan():
            return b.is_snan()
        if a.is_qnan():
            return b.is_qnan()
        if b.is_snan():
            return a.is_snan()
        if b.is_qnan():
            return a.is_qnan()

    return a == b


def floats_equal(a: float, b: float, *, nan_ok: bool = False):
    if nan_ok:
        if math.isnan(a):
            return math.isnan(b)
        if math.isnan(b):
            return math.isnan(a)

    return a == b


T = TypeVar("T", float, Decimal)
U = TypeVar("U", float, Decimal)


class _Missing(Enum):
    TOKEN = auto()


MISSING = _Missing.TOKEN


def _zip_vector_components(
    v1: BaseVector3[T],
    v2: BaseVector3[T],
    fn: Callable[[T, T], U],
) -> BaseVector3[U]:
    return BaseVector3(
        x=fn(v1.x, v2.x),
        y=fn(v1.y, v2.y),
        z=fn(v1.z, v2.z),
    )


def _zip_optional_vector_components(
    v1: BaseVector3[T] | BaseOptionalVector3[T],
    v2: BaseVector3[T] | BaseOptionalVector3[T],
    fn: Callable[[T, T], U],
) -> BaseOptionalVector3[U]:
    def maybe_none_fn(a: T | None, b: T | None) -> U | None:
        return None if a is None or b is None else fn(a, b)

    return BaseOptionalVector3(
        x=maybe_none_fn(v1.x, v2.x),
        y=maybe_none_fn(v1.y, v2.y),
        z=maybe_none_fn(v1.z, v2.z),
    )


class BaseVector3(BaseModel, Generic[T]):
    """Base class for three-dimensional vectors."""

    model_config = ConfigDict(frozen=True, allow_inf_nan=True)

    x: T
    y: T
    z: T

    @classmethod
    def from_dict(cls, d: dict[str, T]) -> Self:
        return cls(x=d["x"], y=d["y"], z=d["z"])

    def to_dict(self) -> dict[str, T]:
        return {"x": self.x, "y": self.y, "z": self.z}

    @classmethod
    def from_tuple(cls, tupl: tuple[T, T, T]) -> Self:
        x, y, z = tupl
        return cls(x=x, y=y, z=z)

    def to_tuple(self) -> tuple[T, T, T]:
        return self.x, self.y, self.z

    @classmethod
    def from_array(cls, array: npt.NDArray[np.float64]) -> Self:
        return cls.from_tuple((array[0], array[1], array[2]))

    def to_array(self) -> npt.NDArray[np.float64]:
        return np.array((float(self.x), float(self.y), float(self.z)), dtype=np.float64)

    @classmethod
    def of(cls, value: T) -> Self:
        """Returns a new vector with all components set to `value`."""
        return cls(x=value, y=value, z=value)

    @classmethod
    def zeros(cls) -> Self:
        return cls.of(cast(T, 0))

    @classmethod
    def ones(cls) -> Self:
        return cls.of(cast(T, 1))

    def get(self, component: Literal["x", "y", "z"]) -> T:
        """Returns the value of the specified component of this vector."""
        if component == "x":
            return self.x
        if component == "y":
            return self.y
        if component == "z":
            return self.z

        msg = f"Unknown component: {component}"
        raise ValueError(msg)

    def copy_with(
        self,
        x: T | Literal[_Missing.TOKEN] = MISSING,
        y: T | Literal[_Missing.TOKEN] = MISSING,
        z: T | Literal[_Missing.TOKEN] = MISSING,
    ) -> Self:
        """
        Returns a copy of this vector with the specified components set to the given values.
        :const:`MISSING` indicates that the component should remain unchanged.
        """
        return type(self)(
            x=self.x if x is MISSING else x,
            y=self.y if y is MISSING else y,
            z=self.z if z is MISSING else z,
        )

    def _normalize_other_or_scalar(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        if isinstance(other_or_scalar, BaseVector3):
            return other_or_scalar

        return type(self).of(other_or_scalar)

    def __add__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(self, other, lambda a, b: a + b)

    def __sub__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(self, other, lambda a, b: a - b)

    def __mul__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(self, other, lambda a, b: a * b)

    def __truediv__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(self, other, lambda a, b: a / b)

    def __pow__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(self, other, lambda a, b: cast(T, a**b))

    def __radd__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(other, self, lambda a, b: a + b)

    def __rsub__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(other, self, lambda a, b: a - b)

    def __rmul__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(other, self, lambda a, b: a * b)

    def __rtruediv__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(other, self, lambda a, b: a / b)

    def __rpow__(self, other_or_scalar: BaseVector3[T] | T) -> BaseVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_vector_components(other, self, lambda a, b: cast(T, a**b))

    def _components_equal(self, a: T, b: T, *, nan_ok: bool = False) -> bool:
        if isinstance(a, Decimal) and isinstance(b, Decimal):
            return decimals_equal(a, b, nan_ok=nan_ok)

        return floats_equal(float(a), float(b), nan_ok=nan_ok)

    def equals(self, other: object, *, nan_ok: bool = False) -> bool:
        if not isinstance(other, BaseVector3):
            return False

        return (
            self._components_equal(self.x, other.x, nan_ok=nan_ok)
            and self._components_equal(self.y, other.y, nan_ok=nan_ok)
            and self._components_equal(self.z, other.z, nan_ok=nan_ok)
        )

    def __eq__(self, other: object) -> bool:
        return self.equals(other)

    def __hash__(self) -> int:
        return hash((self.x, self.y, self.z))


class BaseOptionalVector3(BaseModel, Generic[T]):
    """Base class for three-dimensional vectors, in which each component can be `None`."""

    model_config = ConfigDict(frozen=True, allow_inf_nan=True)

    x: T | None = None
    y: T | None = None
    z: T | None = None

    @classmethod
    def from_dict(cls, d: dict[str, T | None]) -> Self:
        return cls(x=d["x"], y=d["y"], z=d["z"])

    def to_dict(self) -> dict[str, T | None]:
        return {"x": self.x, "y": self.y, "z": self.z}

    @classmethod
    def from_tuple(cls, tupl: tuple[T | None, T | None, T | None]) -> Self:
        x, y, z = tupl
        return cls(x=x, y=y, z=z)

    def to_tuple(self) -> tuple[T | None, T | None, T | None]:
        return self.x, self.y, self.z

    @classmethod
    def of(cls, value: T | None) -> Self:
        """Returns a new vector with all components set to `value`."""
        return cls(x=value, y=value, z=value)

    @classmethod
    def zeros(cls) -> Self:
        return cls.of(cast(T, 0))

    @classmethod
    def ones(cls) -> Self:
        return cls.of(cast(T, 1))

    @classmethod
    def empty(cls) -> Self:
        """Returns a new vector with all components set to `None`."""
        return cls.of(None)

    @overload
    def get(self, component: Literal["x", "y", "z"], *, default: T) -> T: ...
    @overload
    def get(self, component: Literal["x", "y", "z"], *, default: None = None) -> None: ...

    def get(self, component: Literal["x", "y", "z"], *, default: T | None = None) -> T | None:
        """
        Returns the value of the specified component of this vector.

        If the value is `None`, instead returns `default`.
        """
        if component == "x":
            return default if self.x is None else self.x
        if component == "y":
            return default if self.y is None else self.y
        if component == "z":
            return default if self.z is None else self.z

        msg = f"Unknown component: {component}"
        raise ValueError(msg)

    def copy_with(
        self,
        x: T | Literal[_Missing.TOKEN] | None = MISSING,
        y: T | Literal[_Missing.TOKEN] | None = MISSING,
        z: T | Literal[_Missing.TOKEN] | None = MISSING,
    ) -> Self:
        """
        Returns a copy of this vector with the specified components set to the given values.
        :const:`MISSING` indicates that the component should remain unchanged.
        """
        return type(self)(
            x=self.x if x is MISSING else x,
            y=self.y if y is MISSING else y,
            z=self.z if z is MISSING else z,
        )

    def filled(self, fill_value: T) -> BaseVector3[T]:
        """
        Returns a copy of this vector where each `None` component is replaced with
        `fill_value`.
        """
        return BaseVector3(
            x=fill_value if self.x is None else self.x,
            y=fill_value if self.y is None else self.y,
            z=fill_value if self.z is None else self.z,
        )

    def _normalize_other_or_scalar(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseVector3[T] | BaseOptionalVector3[T]:
        if isinstance(other_or_scalar, (BaseVector3, BaseOptionalVector3)):
            return other_or_scalar

        return type(self).of(other_or_scalar)

    def __add__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(self, other, lambda a, b: a + b)

    def __sub__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(self, other, lambda a, b: a - b)

    def __mul__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(self, other, lambda a, b: a * b)

    def __truediv__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(self, other, lambda a, b: a / b)

    def __pow__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(self, other, lambda a, b: cast(T, a**b))

    def __radd__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(other, self, lambda a, b: a + b)

    def __rsub__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(other, self, lambda a, b: a - b)

    def __rmul__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(other, self, lambda a, b: a * b)

    def __rtruediv__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(other, self, lambda a, b: a / b)

    def __rpow__(
        self, other_or_scalar: BaseVector3[T] | BaseOptionalVector3[T] | T
    ) -> BaseOptionalVector3[T]:
        other = self._normalize_other_or_scalar(other_or_scalar)
        return _zip_optional_vector_components(other, self, lambda a, b: cast(T, a**b))

    def _components_equal(self, a: T | None, b: T | None, *, nan_ok: bool = False) -> bool:
        if a is None or b is None:
            return a == b

        if isinstance(a, Decimal) and isinstance(b, Decimal):
            return decimals_equal(a, b, nan_ok=nan_ok)

        return floats_equal(float(a), float(b), nan_ok=nan_ok)

    def equals(self, other: object, *, nan_ok: bool = False) -> bool:
        if not isinstance(other, BaseOptionalVector3):
            return False

        return (
            self._components_equal(self.x, other.x, nan_ok=nan_ok)
            and self._components_equal(self.y, other.y, nan_ok=nan_ok)
            and self._components_equal(self.z, other.z, nan_ok=nan_ok)
        )

    def __eq__(self, other: object) -> bool:
        return self.equals(other)

    def __hash__(self) -> int:
        return hash((self.x, self.y, self.z))


class DecimalVector3(BaseVector3[Decimal]):
    """
    Represents a three-dimensional vector, in which each component is specified as
    an exact decimal.
    """

    def to_float(self) -> Vector3:
        return Vector3(
            x=float(self.x),
            y=float(self.y),
            z=float(self.z),
        )


class OptionalVector3(BaseOptionalVector3[float]):
    """
    Represents a three-dimensional vector, in which each component is specified as
    an integer, a floating-point number, or `None`.
    """

    def to_decimal(self) -> BaseOptionalVector3[Decimal]:
        return BaseOptionalVector3(
            x=None if self.x is None else Decimal(self.x),
            y=None if self.y is None else Decimal(self.y),
            z=None if self.z is None else Decimal(self.z),
        )


class Vector3(BaseVector3[float]):
    """
    Represents a three-dimensional vector, in which each component is specified
    as an integer or a floating-point number.
    """

    def to_decimal(self) -> DecimalVector3:
        return DecimalVector3(
            x=Decimal(self.x),
            y=Decimal(self.y),
            z=Decimal(self.z),
        )


# max_digits and decimal_places fail to be propagated through generics
class DecimalCoord3(BaseVector3[DecimalCoord]):
    x: DecimalCoord
    y: DecimalCoord
    z: DecimalCoord

    def to_float(self) -> Vector3:
        return Vector3(
            x=float(self.x),
            y=float(self.y),
            z=float(self.z),
        )


class DecimalSize3(BaseVector3[DecimalSize]):
    x: DecimalSize
    y: DecimalSize
    z: DecimalSize

    def to_float(self) -> Vector3:
        return Vector3(
            x=float(self.x),
            y=float(self.y),
            z=float(self.z),
        )


class OptionalDecimalCoord3(BaseOptionalVector3[DecimalCoord]):
    x: DecimalCoord | None = None
    y: DecimalCoord | None = None
    z: DecimalCoord | None = None

    def to_float(self) -> OptionalVector3:
        return OptionalVector3(
            x=None if self.x is None else float(self.x),
            y=None if self.y is None else float(self.y),
            z=None if self.z is None else float(self.z),
        )
