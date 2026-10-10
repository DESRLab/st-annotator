import math
import uuid
from collections.abc import Sequence
from decimal import Decimal
from enum import Enum, IntEnum
from typing import TYPE_CHECKING, Annotated, Any, ClassVar, TypeAlias
from typing_extensions import Self, TypedDict

from pydantic import (
    AwareDatetime,
    BeforeValidator,
    Field as PydanticField,
    create_model,
    field_serializer,
    field_validator,
)
from sqlalchemy.sql.sqltypes import Boolean, JSON, SmallInteger, String
from sqlmodel import Field, Relationship, SQLModel

from sta.common.database.types import UTCDateTime
from sta.common.spatial import (
    DecimalCoord,
    DecimalCoord3,
    DecimalSize,
    DecimalSize3,
    OptionalDecimalCoord3,
    PartialSTBounds,
    create_decimal_truncator,
)
from sta.common.utils.json import JSONType
from sta.models.base import (
    MaxCoordsDict,
    MinCoordsDict,
    PartialSTBoundsDict,
    sqlmodel_sa_type,
    st_bounds_coord_type,
)
from sta.models.label.data import LabelElementSQLModel, LabelEntitySQLModel
from sta.models.label.repo import LabelsetCommit, LabelsetCommitPublic
from sta.models.label.spec import ObjectClass
from sta.models.types import QualityRank


class BoxType(str, Enum):
    CUBOID = "cuboid"
    """A bounding box with a rectangular cross-section."""

    CYLINDER = "cylinder"
    """A bounding box with a elliptical cross-section."""


class OcclusionLevel(IntEnum):
    EXCELLENT = 0
    """0-20% of surface area occluded by other objects."""

    SATISFACTORY = 1
    """20-50% of surface area occluded by other objects."""

    POOR = 2
    """50-100% of surface area occluded by other objects."""


class DistinctiveLevel(IntEnum):
    EXCELLENT = 0
    """80-100% of important features are visible."""

    SATISFACTORY = 1
    """50-80% of important features are visible."""

    POOR = 2
    """0-50% of important features are visible."""


class LabelTrackSQLModel(LabelEntitySQLModel):
    is_black: bool = Field(sa_type=Boolean, nullable=False, default=False)

    gt_class_id: int | None = Field(
        foreign_key="object_class.id",
        ondelete="SET NULL",
        default=None,
    )

    @classmethod
    def get_table_cls(cls, tablename: str):
        LabelTrack = create_model(
            cls.__name__.replace("SQLModel", ""),
            commit=(LabelsetCommit, Relationship()),
            gt_class=(ObjectClass | None, Relationship()),
            __base__=cls.build_table_base_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return LabelTrack

    @classmethod
    def get_update_cls(cls):
        class LabelTrackUpdate(super().get_update_cls()):
            is_black: bool | None = None
            gt_class_id: int | None = None

        return LabelTrackUpdate


class CenterDict(TypedDict):
    center_x: DecimalCoord
    center_y: DecimalCoord
    center_z: DecimalCoord


class SizeDict(TypedDict):
    size_x: DecimalSize
    size_y: DecimalSize
    size_z: DecimalSize


class TimestampDict(TypedDict):
    min_timestamp: AwareDatetime | None
    max_timestamp: AwareDatetime | None


TruncDecimalCoord: TypeAlias = Annotated[
    Decimal,
    BeforeValidator(create_decimal_truncator(5)),
    PydanticField(allow_inf_nan=False, max_digits=11, decimal_places=5),
]
"""Avoid overflow when computing min/max coords."""


class TruncDecimalCoord3(DecimalCoord3):
    x: TruncDecimalCoord
    y: TruncDecimalCoord
    z: TruncDecimalCoord


TruncDecimalSize: TypeAlias = Annotated[
    Decimal,
    BeforeValidator(create_decimal_truncator(5)),
    PydanticField(allow_inf_nan=False, gt=0, max_digits=11, decimal_places=5),
]
"""Avoid overflow when computing min/max coords."""


class TruncDecimalSize3(DecimalSize3):
    x: TruncDecimalSize
    y: TruncDecimalSize
    z: TruncDecimalSize


class LabelBoxSQLModel(LabelElementSQLModel):
    type: BoxType = Field(sa_type=sqlmodel_sa_type(String(31)), nullable=False)

    @field_validator("type", mode="before")
    @classmethod
    def _validate_type(cls, value: BoxType | str) -> BoxType:
        return value if isinstance(value, BoxType) else BoxType(value)

    @field_serializer("type")
    def _serialize_type(self, value: BoxType | str) -> str:
        return value.value if isinstance(value, BoxType) else BoxType(value).value

    center_x: DecimalCoord = Field(sa_type=sqlmodel_sa_type(st_bounds_coord_type()), nullable=False)
    center_y: DecimalCoord = Field(sa_type=sqlmodel_sa_type(st_bounds_coord_type()), nullable=False)
    center_z: DecimalCoord = Field(sa_type=sqlmodel_sa_type(st_bounds_coord_type()), nullable=False)
    angle: DecimalCoord = Field(sa_type=sqlmodel_sa_type(st_bounds_coord_type()), nullable=False)
    size_x: DecimalSize = Field(
        sa_type=sqlmodel_sa_type(st_bounds_coord_type()), gt=0, nullable=False
    )
    size_y: DecimalSize = Field(
        sa_type=sqlmodel_sa_type(st_bounds_coord_type()), gt=0, nullable=False
    )
    size_z: DecimalSize = Field(
        sa_type=sqlmodel_sa_type(st_bounds_coord_type()), gt=0, nullable=False
    )
    timestamp: AwareDatetime | None = Field(sa_type=UTCDateTime)

    quality_rank: QualityRank | None = Field(sa_type=SmallInteger, default=None)
    distinctive_lv: DistinctiveLevel | None = Field(sa_type=SmallInteger, default=None)
    occlusion_lv: OcclusionLevel | None = Field(sa_type=SmallInteger, default=None)
    model_data: dict[str, JSONType] = Field(sa_type=JSON, default_factory=dict)

    @field_validator("distinctive_lv", mode="before")
    @classmethod
    def _validate_distinctive_lv(
        cls, value: DistinctiveLevel | int | None
    ) -> DistinctiveLevel | None:
        return (
            value
            if value is None or isinstance(value, DistinctiveLevel)
            else DistinctiveLevel(value)
        )

    @field_serializer("distinctive_lv")
    def _serialize_distinctive_lv(
        self, value: DistinctiveLevel | int | None
    ) -> DistinctiveLevel | None:
        return (
            value
            if value is None or isinstance(value, DistinctiveLevel)
            else DistinctiveLevel(value)
        )

    @field_validator("occlusion_lv", mode="before")
    @classmethod
    def _validate_occlusion_lv(cls, value: OcclusionLevel | int | None) -> OcclusionLevel | None:
        return (
            value if value is None or isinstance(value, OcclusionLevel) else OcclusionLevel(value)
        )

    @field_serializer("occlusion_lv")
    def _serialize_occlusion_lv(self, value: OcclusionLevel | int | None) -> OcclusionLevel | None:
        return (
            value if value is None or isinstance(value, OcclusionLevel) else OcclusionLevel(value)
        )

    perceived_class_id: int | None = Field(
        foreign_key="object_class.id",
        ondelete="SET NULL",
        default=None,
    )

    @property
    def center(self) -> DecimalCoord3:
        return DecimalCoord3(x=self.center_x, y=self.center_y, z=self.center_z)

    @property
    def size(self) -> DecimalSize3:
        return DecimalSize3(x=self.size_x, y=self.size_y, z=self.size_z)

    @classmethod
    def unpack_center(cls, center: DecimalCoord3) -> CenterDict:
        return CenterDict(center_x=center.x, center_y=center.y, center_z=center.z)

    @classmethod
    def unpack_size(cls, size: DecimalSize3) -> SizeDict:
        return SizeDict(size_x=size.x, size_y=size.y, size_z=size.z)

    @classmethod
    def unpack_timestamp(cls, timestamp: AwareDatetime | None) -> TimestampDict:
        return TimestampDict(min_timestamp=timestamp, max_timestamp=timestamp)

    @classmethod
    def from_bbox(
        cls,
        *,
        center: TruncDecimalCoord3,
        angle: TruncDecimalCoord,
        size: TruncDecimalSize3,
        timestamp: AwareDatetime | None,
        **rest: Any,
    ):
        min_coords = cls.get_min_coords(center=center, angle=angle, size=size)
        max_coords = cls.get_max_coords(center=center, angle=angle, size=size)

        return cls(
            **cls.unpack_min_coords(min_coords),
            **cls.unpack_max_coords(max_coords),
            **cls.unpack_timestamp(timestamp),
            **cls.unpack_center(center),
            angle=angle,
            **cls.unpack_size(size),
            timestamp=timestamp,
            **rest,
        )

    def update_from_center(self, center: DecimalCoord3) -> Self:
        data_to_update = self.unpack_center(center)

        return self.sqlmodel_update(data_to_update)

    def update_from_size(self, size: DecimalSize3) -> Self:
        data_to_update = self.unpack_size(size)

        return self.sqlmodel_update(data_to_update)

    def update_from_timestamp(self, timestamp: AwareDatetime | None) -> Self:
        data_to_update = self.unpack_timestamp(timestamp)

        return self.sqlmodel_update(data_to_update)

    @classmethod
    def _get_corners(
        cls,
        *,
        center: TruncDecimalCoord3,
        angle: TruncDecimalCoord,
        size: TruncDecimalSize3,
    ) -> Sequence[DecimalCoord3]:
        x0, y0, z0 = center.x, center.y, center.z
        dx, dy, dz = size.x, size.y, size.z
        c, s = Decimal(math.cos(angle)), Decimal(math.sin(angle))

        return [
            DecimalCoord3(
                x=round(x0 + (x - x0) * c + (y - y0) * s, 6),
                y=round(y0 + (x - x0) * -s + (y - y0) * c, 6),
                z=round(z, 6),
            )
            for x in (x0 - dx / 2, x0 + dx / 2)
            for y in (y0 - dy / 2, y0 + dy / 2)
            for z in (z0 - dz / 2, z0 + dz / 2)
        ]

    @classmethod
    def get_min_coords(
        cls,
        *,
        center: TruncDecimalCoord3,
        angle: TruncDecimalCoord,
        size: TruncDecimalSize3,
    ) -> DecimalCoord3:
        """Gets the minimum coordinates of a bounding box with the given attributes."""
        corners = cls._get_corners(center=center, angle=angle, size=size)

        return DecimalCoord3(
            x=min(p.x for p in corners),
            y=min(p.y for p in corners),
            z=min(p.z for p in corners),
        )

    @classmethod
    def get_max_coords(
        cls,
        *,
        center: TruncDecimalCoord3,
        angle: TruncDecimalCoord,
        size: TruncDecimalSize3,
    ) -> DecimalCoord3:
        """Gets the maximum coordinates of a bounding box with the given attributes."""
        corners = cls._get_corners(center=center, angle=angle, size=size)

        return DecimalCoord3(
            x=max(p.x for p in corners),
            y=max(p.y for p in corners),
            z=max(p.z for p in corners),
        )

    @classmethod
    def get_table_cls(cls, tablename: str):
        LabelBox = create_model(
            cls.__name__.replace("SQLModel", ""),
            commit=(LabelsetCommit, Relationship()),
            perceived_class=(ObjectClass | None, Relationship()),
            __base__=cls.build_table_base_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return LabelBox

    @classmethod
    def get_update_cls(cls):
        class LabelBoxUpdate(super().get_update_cls()):
            type: BoxType | None = None

            center_x: DecimalCoord | None = None
            center_y: DecimalCoord | None = None
            center_z: DecimalCoord | None = None
            angle: DecimalCoord | None = None
            size_x: DecimalSize | None = None
            size_y: DecimalSize | None = None
            size_z: DecimalSize | None = None
            timestamp: AwareDatetime | None = None

            quality_rank: QualityRank | None = None
            distinctive_lv: DistinctiveLevel | None = None
            occlusion_lv: OcclusionLevel | None = None
            model_data: dict[str, JSONType] | None = None

            perceived_class_id: int | None = None

            @classmethod
            def from_bbox(
                cls,
                *,
                center: TruncDecimalCoord3,
                angle: TruncDecimalCoord,
                size: TruncDecimalSize3,
                **rest: Any,
            ):
                model = LabelBoxSQLModel
                min_coords = model.get_min_coords(center=center, angle=angle, size=size)
                max_coords = model.get_max_coords(center=center, angle=angle, size=size)

                return cls(
                    **model.unpack_min_coords(min_coords),
                    **model.unpack_max_coords(max_coords),
                    **model.unpack_center(center),
                    angle=angle,
                    **model.unpack_size(size),
                    **rest,
                )

        return LabelBoxUpdate


if TYPE_CHECKING:

    class LabelTrack(LabelTrackSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: uuid.UUID
        commit: LabelsetCommit = Field(default=None)
        gt_class: ObjectClass | None = None

    class LabelTrackCreate(LabelTrackSQLModel):
        pass

    class LabelTrackPublic(LabelTrackSQLModel):
        id: uuid.UUID
        commit: LabelsetCommitPublic = Field(default=None)
        gt_class: ObjectClass | None = None

    class LabelTrackUpdate(SQLModel):
        is_deleted: bool | None = None
        is_black: bool | None = None
        gt_class_id: int | None = None

    class LabelTrackBulkUpdate(LabelTrackUpdate):
        pass

    class LabelBox(LabelBoxSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: uuid.UUID
        commit: LabelsetCommit = Field(default=None)
        perceived_class: ObjectClass | None = None

    class LabelBoxCreate(LabelBoxSQLModel):
        pass

    class LabelBoxPublic(LabelBoxSQLModel):
        id: uuid.UUID
        commit: LabelsetCommitPublic = Field(default=None)
        perceived_class: ObjectClass | None = None

    class LabelBoxUpdate(SQLModel):
        is_deleted: bool | None = None
        entity_id: uuid.UUID | None = None
        min_x: DecimalCoord | None = None
        min_y: DecimalCoord | None = None
        min_z: DecimalCoord | None = None
        max_x: DecimalCoord | None = None
        max_y: DecimalCoord | None = None
        max_z: DecimalCoord | None = None
        min_timestamp: AwareDatetime | None = None
        max_timestamp: AwareDatetime | None = None
        type: BoxType | None = None
        center_x: DecimalCoord | None = None
        center_y: DecimalCoord | None = None
        center_z: DecimalCoord | None = None
        angle: DecimalCoord | None = None
        size_x: DecimalSize | None = None
        size_y: DecimalSize | None = None
        size_z: DecimalSize | None = None
        timestamp: AwareDatetime | None = None
        quality_rank: QualityRank | None = None
        distinctive_lv: DistinctiveLevel | None = None
        occlusion_lv: OcclusionLevel | None = None
        model_data: dict[str, JSONType] | None = None
        perceived_class_id: int | None = None

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
        def unpack_min_coords(
            cls,
            min_coords: OptionalDecimalCoord3 | DecimalCoord3,
        ) -> MinCoordsDict:
            return LabelBoxSQLModel.unpack_min_coords(min_coords)

        @classmethod
        def unpack_max_coords(
            cls,
            max_coords: OptionalDecimalCoord3 | DecimalCoord3,
        ) -> MaxCoordsDict:
            return LabelBoxSQLModel.unpack_max_coords(max_coords)

        @classmethod
        def unpack_st_bounds(cls, st_bounds: PartialSTBounds) -> PartialSTBoundsDict:
            return LabelBoxSQLModel.unpack_st_bounds(st_bounds)

        def update_from_st_bounds(
            self,
            st_bounds: PartialSTBounds,
            *,
            exclude_none: bool,
        ) -> Self:
            data: dict[str, Any] = dict(self.unpack_st_bounds(st_bounds))
            if exclude_none:
                data = {key: value for key, value in data.items() if value is not None}
            return self.sqlmodel_update(data)

        @classmethod
        def from_bbox(
            cls,
            *,
            center: TruncDecimalCoord3,
            angle: TruncDecimalCoord,
            size: TruncDecimalSize3,
            **rest: Any,
        ) -> Self:
            raise NotImplementedError

    class LabelBoxBulkUpdate(LabelBoxUpdate):
        pass
else:
    LabelTrack = LabelTrackSQLModel.get_table_cls("label_track")
    LabelTrackCreate = LabelTrackSQLModel.get_create_cls()
    LabelTrackPublic = LabelTrackSQLModel.get_public_cls()
    LabelTrackUpdate = LabelTrackSQLModel.get_update_cls()
    LabelTrackBulkUpdate = LabelTrackSQLModel.get_update_cls()

    LabelBox = LabelBoxSQLModel.get_table_cls("label_box")
    LabelBoxCreate = LabelBoxSQLModel.get_create_cls()
    LabelBoxPublic = LabelBoxSQLModel.get_public_cls()
    LabelBoxUpdate = LabelBoxSQLModel.get_update_cls()
    LabelBoxBulkUpdate = LabelBoxSQLModel.get_update_cls()
