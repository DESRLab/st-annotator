from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from typing import Any, ClassVar, Literal, Protocol
from typing_extensions import Self, TypedDict

from pydantic import AwareDatetime, BaseModel
from sqlalchemy.sql.sqltypes import Float, TypeEngine
from sqlmodel import Field, SQLModel
from sqlmodel.main import IncEx

from sta.common.database.types import DecimalString, UTCDateTime
from sta.common.spatial import (
    DecimalCoord,
    DecimalCoord3,
    OptionalDecimalCoord3,
    PartialSTBounds,
    Transform,
)


class BaseSQLModel(SQLModel):
    """Allow :meth:`sqlmodel_update` to be called with :class:`TypedDict`s."""

    def sqlmodel_update(
        self,
        obj: Mapping[str, Any] | BaseModel,
        *,
        update: Mapping[str, Any] | None = None,
    ) -> Self:
        return super().sqlmodel_update(
            obj if isinstance(obj, BaseModel) else dict(obj),
            update=update if update is None else dict(update),
        )


class OptimisticLockingSQLModel(BaseSQLModel):
    """
    Implements optimistic locking, which provides a `last_edit_at`
    column to determine whether a record was edited by another user when a user
    submits a request to edit the record.

    This `last_edit_at` column is automatically updated when
    :meth:`sqlmodel_update` is called.
    """

    last_edit_at: AwareDatetime | None = Field(sa_type=UTCDateTime, default=None)

    def sqlmodel_update(
        self,
        obj: Mapping[str, Any] | BaseModel,
        *,
        update: Mapping[str, Any] | None = None,
    ) -> Self:
        result = super().sqlmodel_update(obj, update=update)
        result.last_edit_at = datetime.now().astimezone()
        return result


class SQLModelLike(Protocol):

    @classmethod
    def model_validate(
        cls,
        obj: Any,
        *,
        strict: bool | None = None,
        from_attributes: bool | None = None,
        context: dict[str, Any] | None = None,
        update: dict[str, Any] | None = None,
    ) -> Self:
        ...

    def sqlmodel_update(
        self,
        obj: dict[str, Any] | BaseModel,
        *,
        update: dict[str, Any] | None = None,
    ) -> Self:
        ...

    def model_dump(
        *,
        mode: str | Literal['json', 'python'] = "python",
        include: IncEx | None = None,
        exclude: IncEx | None = None,
        context: dict[str, Any] | None = None,
        by_alias: bool = False,
        exclude_unset: bool = False,
        exclude_defaults: bool = False,
        exclude_none: bool = False,
        round_trip: bool = False,
        warnings: bool | Literal['none', 'warn', 'error'] = True,
        serialize_as_any: bool = False,
    ) -> dict[str, Any]:
        ...


class SQLMixinBase(BaseSQLModel):

    @classmethod
    def get_create_cls(cls):
        return cls

    @classmethod
    def get_public_cls(cls):
        return cls

    @classmethod
    def get_update_cls(cls):
        return BaseSQLModel


class MinCoordsDict(TypedDict):
    min_x: DecimalCoord | None
    min_y: DecimalCoord | None
    min_z: DecimalCoord | None


class MaxCoordsDict(TypedDict):
    max_x: DecimalCoord | None
    max_y: DecimalCoord | None
    max_z: DecimalCoord | None


class PartialSTBoundsDict(MinCoordsDict, MaxCoordsDict):
    min_timestamp: AwareDatetime | None
    max_timestamp: AwareDatetime | None


class PartialSTBoundsSQLMixinLike(SQLModelLike, Protocol):
    min_x: DecimalCoord | None
    min_y: DecimalCoord | None
    min_z: DecimalCoord | None
    max_x: DecimalCoord | None
    max_y: DecimalCoord | None
    max_z: DecimalCoord | None

    min_timestamp: AwareDatetime | None
    max_timestamp: AwareDatetime | None

    @property
    def min_coords(self) -> OptionalDecimalCoord3:
        ...

    @property
    def max_coords(self) -> OptionalDecimalCoord3:
        ...

    @property
    def st_bounds(self) -> PartialSTBounds:
        ...

    @classmethod
    def unpack_min_coords(cls, min_coords: OptionalDecimalCoord3 | DecimalCoord3) -> MinCoordsDict:
        ...

    @classmethod
    def unpack_max_coords(cls, max_coords: OptionalDecimalCoord3 | DecimalCoord3) -> MaxCoordsDict:
        ...

    @classmethod
    def unpack_st_bounds(cls, st_bounds: PartialSTBounds) -> PartialSTBoundsDict:
        ...

    def update_from_st_bounds(
        self,
        st_bounds: PartialSTBounds,
        *,
        exclude_none: bool,
    ) -> Self:
        ...


class PartialSTBoundsUpdateLike(SQLModelLike, Protocol):
    min_x: Decimal | None = None
    min_y: Decimal | None = None
    min_z: Decimal | None = None
    max_x: Decimal | None = None
    max_y: Decimal | None = None
    max_z: Decimal | None = None

    min_timestamp: AwareDatetime | None = None
    max_timestamp: AwareDatetime | None = None


def st_bounds_coord_type(
    *,
    precision: int = 12,
    scale: int = 6,
    queryable: bool = False,
) -> TypeEngine[Decimal]:
    """
    Args:
        queryable: Whether to support range-based queries.
    """
    if queryable:
        return Float(precision=precision, asdecimal=True, decimal_return_scale=scale)

    return DecimalString(precision=precision, scale=scale)


def PartialSTBoundsSQLMixin(
    *,
    precision: int = 12,
    scale: int = 6,
    queryable: bool = False,
):
    """
    Base class for storing :class:`PartialSTBounds`.

    Args:
        queryable: Whether to support range-based queries.
    """
    coord_type = st_bounds_coord_type(
        precision=precision,
        scale=scale,
        queryable=queryable,
    )

    class PartialSTBoundsSQLMixin(SQLMixinBase):
        COORD_TYPE: ClassVar[TypeEngine[Decimal]] = coord_type

        min_x: Decimal | None = Field(sa_type=coord_type, index=queryable, default=None)
        min_y: Decimal | None = Field(sa_type=coord_type, index=queryable, default=None)
        min_z: Decimal | None = Field(sa_type=coord_type, index=queryable, default=None)
        max_x: Decimal | None = Field(sa_type=coord_type, index=queryable, default=None)
        max_y: Decimal | None = Field(sa_type=coord_type, index=queryable, default=None)
        max_z: Decimal | None = Field(sa_type=coord_type, index=queryable, default=None)

        min_timestamp: AwareDatetime | None = Field(sa_type=UTCDateTime, index=queryable, default=None)
        max_timestamp: AwareDatetime | None = Field(sa_type=UTCDateTime, index=queryable, default=None)

        @property
        def min_coords(self) -> OptionalDecimalCoord3:
            return OptionalDecimalCoord3(x=self.min_x, y=self.min_y, z=self.min_z)

        @property
        def max_coords(self) -> OptionalDecimalCoord3:
            return OptionalDecimalCoord3(x=self.max_x, y=self.max_y, z=self.max_z)

        @property
        def st_bounds(self) -> PartialSTBounds:
            return PartialSTBounds(
                min_coords=self.min_coords,
                max_coords=self.max_coords,
                min_timestamp=self.min_timestamp,
                max_timestamp=self.max_timestamp,
            )

        @classmethod
        def unpack_min_coords(cls, min_coords: OptionalDecimalCoord3 | DecimalCoord3) -> MinCoordsDict:
            return MinCoordsDict(
                min_x=min_coords.x,
                min_y=min_coords.y,
                min_z=min_coords.z,
            )

        @classmethod
        def unpack_max_coords(cls, max_coords: OptionalDecimalCoord3 | DecimalCoord3) -> MaxCoordsDict:
            return MaxCoordsDict(
                max_x=max_coords.x,
                max_y=max_coords.y,
                max_z=max_coords.z,
            )

        @classmethod
        def unpack_st_bounds(cls, st_bounds: PartialSTBounds) -> PartialSTBoundsDict:
            return PartialSTBoundsDict(
                **cls.unpack_min_coords(st_bounds.min_coords),
                **cls.unpack_max_coords(st_bounds.max_coords),
                min_timestamp=st_bounds.min_timestamp,
                max_timestamp=st_bounds.max_timestamp,
            )

        def update_from_st_bounds(
            self,
            st_bounds: PartialSTBounds,
            *,
            exclude_none: bool,
        ) -> Self:
            data_to_update = self.unpack_st_bounds(st_bounds)
            if exclude_none:
                data_to_update = {k: v for k, v in data_to_update.items() if v is not None}

            return self.sqlmodel_update(data_to_update)

        @classmethod
        def get_update_cls(cls):
            class PartialSTBoundsSQLMixinUpdate(super().get_update_cls()):
                min_x: DecimalCoord | None = None
                min_y: DecimalCoord | None = None
                min_z: DecimalCoord | None = None
                max_x: DecimalCoord | None = None
                max_y: DecimalCoord | None = None
                max_z: DecimalCoord | None = None

                min_timestamp: AwareDatetime | None = None
                max_timestamp: AwareDatetime | None = None

            return PartialSTBoundsSQLMixinUpdate

    return PartialSTBoundsSQLMixin


class TranslationDict(TypedDict):
    translate_x: DecimalCoord
    translate_y: DecimalCoord
    translate_z: DecimalCoord


class RotationDict(TypedDict):
    rotate_x: DecimalCoord
    rotate_y: DecimalCoord
    rotate_z: DecimalCoord


class ScaleDict(TypedDict):
    scale_x: DecimalCoord
    scale_y: DecimalCoord
    scale_z: DecimalCoord


class TransformDict(TranslationDict, RotationDict, ScaleDict):
    pass


class TransformSQLMixinLike(SQLModelLike, Protocol):
    translate_x: DecimalCoord
    translate_y: DecimalCoord
    translate_z: DecimalCoord

    rotate_x: DecimalCoord
    rotate_y: DecimalCoord
    rotate_z: DecimalCoord

    scale_x: DecimalCoord
    scale_y: DecimalCoord
    scale_z: DecimalCoord

    @property
    def translation(self) -> DecimalCoord3:
        ...

    @property
    def rotation(self) -> DecimalCoord3:
        ...

    @property
    def scale(self) -> DecimalCoord3:
        ...

    @property
    def transform(self) -> Transform:
        ...

    @classmethod
    def unpack_translation(cls, translation: DecimalCoord3) -> TranslationDict:
        ...

    @classmethod
    def unpack_rotation(cls, rotation: DecimalCoord3) -> RotationDict:
        ...

    @classmethod
    def unpack_scale(cls, scale: DecimalCoord3) -> ScaleDict:
        ...

    @classmethod
    def unpack_transform(cls, transform: Transform) -> TransformDict:
        ...

    def update_from_translation(self, translation: DecimalCoord3) -> Self:
        ...

    def update_from_rotation(self, rotation: DecimalCoord3) -> Self:
        ...

    def update_from_scale(self, scale: DecimalCoord3) -> Self:
        ...

    def update_from_transform(self, transform: Transform) -> Self:
        ...


class TransformSQLMixinUpdateLike(SQLModelLike, Protocol):
    translate_x: DecimalCoord | None = None
    translate_y: DecimalCoord | None = None
    translate_z: DecimalCoord | None = None

    rotate_x: DecimalCoord | None = None
    rotate_y: DecimalCoord | None = None
    rotate_z: DecimalCoord | None = None

    scale_x: DecimalCoord | None = None
    scale_y: DecimalCoord | None = None
    scale_z: DecimalCoord | None = None


def transform_component_type(
    *,
    precision: int = 16,
    scale: int = 8,
) -> TypeEngine[Decimal]:
    return DecimalString(precision=precision, scale=scale)


def TransformSQLMixin(
    precision: int = 16,
    scale: int = 8,
):
    """Base class for storing :class:`Transform`."""
    component_type = transform_component_type(precision=precision, scale=scale)

    class TransformSQLMixin(SQLMixinBase):
        translate_x: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)
        translate_y: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)
        translate_z: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)

        rotate_x: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)
        rotate_y: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)
        rotate_z: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)

        scale_x: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)
        scale_y: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)
        scale_z: DecimalCoord = Field(sa_type=component_type, nullable=False, default=None)

        @property
        def translation(self) -> DecimalCoord3:
            return DecimalCoord3(x=self.translate_x, y=self.translate_y, z=self.translate_z)

        @property
        def rotation(self) -> DecimalCoord3:
            return DecimalCoord3(x=self.rotate_x, y=self.rotate_y, z=self.rotate_z)

        @property
        def scale(self) -> DecimalCoord3:
            return DecimalCoord3(x=self.scale_x, y=self.scale_y, z=self.scale_z)

        @property
        def transform(self) -> Transform:
            return Transform.from_optional(
                translation=self.translation,
                rotation=self.rotation,
                scale=self.scale,
            )

        @classmethod
        def unpack_translation(cls, translation: DecimalCoord3) -> TranslationDict:
            return TranslationDict(
                translate_x=translation.x,
                translate_y=translation.y,
                translate_z=translation.z,
            )

        @classmethod
        def unpack_rotation(cls, rotation: DecimalCoord3) -> RotationDict:
            return RotationDict(
                rotate_x=rotation.x,
                rotate_y=rotation.y,
                rotate_z=rotation.z,
            )

        @classmethod
        def unpack_scale(cls, scale: DecimalCoord3) -> ScaleDict:
            return ScaleDict(
                scale_x=scale.x,
                scale_y=scale.y,
                scale_z=scale.z,
            )

        @classmethod
        def unpack_transform(cls, transform: Transform) -> TransformDict:
            return TransformDict(
                **cls.unpack_translation(transform.translation),
                **cls.unpack_rotation(transform.rotation),
                **cls.unpack_scale(transform.scale),
            )

        def update_from_translation(self, translation: DecimalCoord3) -> Self:
            data_to_update = self.unpack_translation(translation)

            return self.sqlmodel_update(data_to_update)

        def update_from_rotation(self, rotation: DecimalCoord3) -> Self:
            data_to_update = self.unpack_rotation(rotation)

            return self.sqlmodel_update(data_to_update)

        def update_from_scale(self, scale: DecimalCoord3) -> Self:
            data_to_update = self.unpack_scale(scale)

            return self.sqlmodel_update(data_to_update)

        def update_from_transform(self, transform: Transform) -> Self:
            data_to_update = self.unpack_transform(transform)

            return self.sqlmodel_update(data_to_update)

        @classmethod
        def get_update_cls(cls):
            class TransformSQLMixinUpdate(super().get_update_cls()):
                translate_x: DecimalCoord | None = None
                translate_y: DecimalCoord | None = None
                translate_z: DecimalCoord | None = None

                rotate_x: DecimalCoord | None = None
                rotate_y: DecimalCoord | None = None
                rotate_z: DecimalCoord | None = None

                scale_x: DecimalCoord | None = None
                scale_y: DecimalCoord | None = None
                scale_z: DecimalCoord | None = None

            return TransformSQLMixinUpdate

    return TransformSQLMixin
