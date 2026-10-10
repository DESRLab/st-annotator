import uuid
from collections.abc import Sequence
from enum import IntEnum
from typing import TYPE_CHECKING, Any, ClassVar, Final, Union
from typing_extensions import Self, TypedDict

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKBElement
from pydantic import (
    AwareDatetime,
    GetCoreSchemaHandler,
    create_model,
    field_serializer,
    field_validator,
)
from pydantic_core import CoreSchema, core_schema
from sqlalchemy.sql.sqltypes import Boolean, SmallInteger
from sqlmodel import Field, Relationship, SQLModel

from sta.common.database.types import UTCDateTime
from sta.common.spatial import DecimalCoord, DecimalCoord3, OptionalDecimalCoord3, PartialSTBounds
from sta.models.base import (
    MaxCoordsDict,
    MinCoordsDict,
    PartialSTBoundsDict,
    sqlmodel_sa_type,
)
from sta.models.label.data import LabelElementSQLModel, LabelEntitySQLModel
from sta.models.label.repo import LabelsetCommit, LabelsetCommitPublic
from sta.models.label.spec import ObjectClass
from sta.models.types import QualityRank


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


class LabelInstanceSQLModel(LabelEntitySQLModel):
    is_black: bool = Field(sa_type=Boolean, nullable=False, default=False)

    gt_class_id: int | None = Field(
        foreign_key="object_class.id",
        ondelete="SET NULL",
        default=None,
    )

    @classmethod
    def get_table_cls(cls, tablename: str):
        LabelInstance = create_model(
            cls.__name__.replace("SQLModel", ""),
            commit=(LabelsetCommit, Relationship()),
            gt_class=(ObjectClass | None, Relationship()),
            __base__=cls.build_table_base_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return LabelInstance

    @classmethod
    def get_update_cls(cls):
        class LabelInstanceUpdate(super().get_update_cls()):
            is_black: bool | None = None

            gt_class_id: int | None = None

        return LabelInstanceUpdate


class TimestampDict(TypedDict):
    min_timestamp: AwareDatetime | None
    max_timestamp: AwareDatetime | None


class SelectionType(WKBElement):
    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        source_type: type[Any],
        handler: GetCoreSchemaHandler,
    ) -> CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls._validate,
            core_schema.any_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda value: value.desc,
                return_schema=core_schema.str_schema(),
            ),
        )

    @staticmethod
    def _validate(
        value: Union[str, bytes, memoryview, WKBElement, "SelectionType"],
    ) -> "SelectionType":
        if isinstance(value, SelectionType):
            return value
        if isinstance(value, WKBElement):
            return SelectionType(value.data, srid=value.srid, extended=value.extended)

        return SelectionType(value)


class PointsDict(TypedDict):
    selection: SelectionType


class LabelSelectionSQLModel(LabelElementSQLModel):
    srid: Final = 2326
    output_dimension: Final = 3
    include_z: Final = True

    selection: SelectionType = Field(
        sa_type=sqlmodel_sa_type(
            Geometry(
                geometry_type="MultiPointZ",
                srid=srid,
                spatial_index=True,
                dimension=output_dimension,
                nullable=False,
            ),
        ),
        nullable=False,
    )
    timestamp: AwareDatetime | None = Field(sa_type=UTCDateTime)

    quality_rank: QualityRank | None = Field(sa_type=SmallInteger, default=None)
    distinctive_lv: DistinctiveLevel | None = Field(sa_type=SmallInteger, default=None)
    occlusion_lv: OcclusionLevel | None = Field(sa_type=SmallInteger, default=None)

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
    def points(self) -> Sequence[DecimalCoord3]:
        from ...filesystem import GeomConverters

        return GeomConverters.points_from_wkb(
            wkb=self.selection.desc,
            include_z=self.include_z,
        )

    @classmethod
    def unpack_timestamp(cls, timestamp: AwareDatetime | None) -> TimestampDict:
        return TimestampDict(min_timestamp=timestamp, max_timestamp=timestamp)

    @classmethod
    def unpack_points(cls, points: Sequence[DecimalCoord3]) -> PointsDict:
        from ...filesystem import GeomConverters

        geom_obj = GeomConverters.geom_from_points(points)

        return PointsDict(
            selection=SelectionType(geom_obj.wkb, srid=LabelSelectionSQLModel.srid),
        )

    def update_from_timestamp(self, timestamp: AwareDatetime | None) -> Self:
        data_to_update = self.unpack_timestamp(timestamp)

        return self.sqlmodel_update(data_to_update)

    def update_from_points(self, points: Sequence[DecimalCoord3]) -> Self:
        data_to_update = self.unpack_points(points)

        return self.sqlmodel_update(data_to_update)

    @classmethod
    def from_points(
        cls,
        *,
        points: Sequence[DecimalCoord3],
        timestamp: AwareDatetime | None,
        **rest: Any,
    ):
        min_coords = cls.get_min_coords(points=points)
        max_coords = cls.get_max_coords(points=points)

        return cls(
            **cls.unpack_min_coords(min_coords),
            **cls.unpack_max_coords(max_coords),
            **cls.unpack_timestamp(timestamp),
            **cls.unpack_points(points),
            timestamp=timestamp,
            **rest,
        )

    @classmethod
    def get_min_coords(
        cls,
        *,
        points: Sequence[DecimalCoord3],
    ) -> DecimalCoord3:
        """Gets the minimum coordinates of a segmentation task with the given attributes."""
        return DecimalCoord3(
            x=min(p.x for p in points),
            y=min(p.y for p in points),
            z=min(p.z for p in points),
        )

    @classmethod
    def get_max_coords(
        cls,
        *,
        points: Sequence[DecimalCoord3],
    ) -> DecimalCoord3:
        """Gets the maximum coordinates of a segmentation task with the given attributes."""
        return DecimalCoord3(
            x=max(p.x for p in points),
            y=max(p.y for p in points),
            z=max(p.z for p in points),
        )

    @classmethod
    def get_table_cls(cls, tablename: str):
        LabelSelection = create_model(
            cls.__name__.replace("SQLModel", ""),
            commit=(LabelsetCommit, Relationship()),
            perceived_class=(ObjectClass | None, Relationship()),
            __base__=cls.build_table_base_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return LabelSelection

    @classmethod
    def get_update_cls(cls):
        class LabelInstanceUpdate(super().get_update_cls()):
            selection: SelectionType | None = None
            timestamp: AwareDatetime | None = None

            quality_rank: QualityRank | None = None
            distinctive_lv: DistinctiveLevel | None = None
            occlusion_lv: OcclusionLevel | None = None

            perceived_class_id: int | None = None

            @classmethod
            def from_points(
                cls,
                *,
                points: Sequence[DecimalCoord3],
                **rest: Any,
            ):
                model = LabelSelectionSQLModel

                min_coords = model.get_min_coords(points=points)
                max_coords = model.get_max_coords(points=points)

                return cls(
                    **model.unpack_min_coords(min_coords),
                    **model.unpack_max_coords(max_coords),
                    **model.unpack_points(points),
                    **rest,
                )

        return LabelInstanceUpdate


if TYPE_CHECKING:

    class LabelInstance(LabelInstanceSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: uuid.UUID
        commit: LabelsetCommit = Field(default=None)
        gt_class: ObjectClass | None = None

    class LabelInstanceCreate(LabelInstanceSQLModel):
        pass

    class LabelInstancePublic(LabelInstanceSQLModel):
        id: uuid.UUID
        commit: LabelsetCommitPublic = Field(default=None)
        gt_class: ObjectClass | None = None

    class LabelInstanceUpdate(SQLModel):
        is_deleted: bool | None = None
        is_black: bool | None = None
        gt_class_id: int | None = None

    class LabelInstanceBulkUpdate(LabelInstanceUpdate):
        pass

    class LabelSelection(LabelSelectionSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: uuid.UUID
        commit: LabelsetCommit = Field(default=None)
        perceived_class: ObjectClass | None = None

    class LabelSelectionCreate(LabelSelectionSQLModel):
        pass

    class LabelSelectionPublic(LabelSelectionSQLModel):
        id: uuid.UUID
        commit: LabelsetCommitPublic = Field(default=None)
        perceived_class: ObjectClass | None = None

    class LabelSelectionUpdate(SQLModel):
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
        selection: SelectionType | None = None
        timestamp: AwareDatetime | None = None
        quality_rank: QualityRank | None = None
        distinctive_lv: DistinctiveLevel | None = None
        occlusion_lv: OcclusionLevel | None = None
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
            cls, min_coords: OptionalDecimalCoord3 | DecimalCoord3
        ) -> MinCoordsDict:
            return LabelSelectionSQLModel.unpack_min_coords(min_coords)

        @classmethod
        def unpack_max_coords(
            cls, max_coords: OptionalDecimalCoord3 | DecimalCoord3
        ) -> MaxCoordsDict:
            return LabelSelectionSQLModel.unpack_max_coords(max_coords)

        @classmethod
        def unpack_st_bounds(cls, st_bounds: PartialSTBounds) -> PartialSTBoundsDict:
            return LabelSelectionSQLModel.unpack_st_bounds(st_bounds)

        def update_from_st_bounds(self, st_bounds: PartialSTBounds, *, exclude_none: bool) -> Self:
            data: dict[str, Any] = dict(self.unpack_st_bounds(st_bounds))
            if exclude_none:
                data = {key: item for key, item in data.items() if item is not None}
            return self.sqlmodel_update(data)

        @classmethod
        def from_points(cls, *, points: Sequence[DecimalCoord3], **rest: Any) -> Self:
            model = LabelSelectionSQLModel
            return cls(
                **model.unpack_min_coords(model.get_min_coords(points=points)),
                **model.unpack_max_coords(model.get_max_coords(points=points)),
                **model.unpack_points(points),
                **rest,
            )

    class LabelSelectionBulkUpdate(LabelSelectionUpdate):
        pass
else:
    LabelInstance = LabelInstanceSQLModel.get_table_cls("label_instance")
    LabelInstanceCreate = LabelInstanceSQLModel.get_create_cls()
    LabelInstancePublic = LabelInstanceSQLModel.get_public_cls()
    LabelInstanceUpdate = LabelInstanceSQLModel.get_update_cls()
    LabelInstanceBulkUpdate = LabelInstanceSQLModel.get_update_cls()

    LabelSelection = LabelSelectionSQLModel.get_table_cls("label_selection")
    LabelSelectionCreate = LabelSelectionSQLModel.get_create_cls()
    LabelSelectionPublic = LabelSelectionSQLModel.get_public_cls()
    LabelSelectionUpdate = LabelSelectionSQLModel.get_update_cls()
    LabelSelectionBulkUpdate = LabelSelectionSQLModel.get_update_cls()
