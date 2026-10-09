from collections.abc import Sequence
from enum import IntEnum
from typing import Any, Final, Union
from typing_extensions import Self, TypedDict

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKBElement
from pydantic import AwareDatetime, GetCoreSchemaHandler, create_model
from pydantic_core import CoreSchema, core_schema
from sqlalchemy.sql.sqltypes import Boolean, SmallInteger
from sqlmodel import Field, Relationship

from sta.common.database.types import UTCDateTime
from sta.common.spatial import DecimalCoord3
from sta.services.models.label.data import LabelElementSQLModel, LabelEntitySQLModel
from sta.services.models.label.repo import LabelsetCommit
from sta.services.models.label.spec import ObjectClass
from sta.services.models.types import QualityRank


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
        foreign_key='object_class.id',
        ondelete="SET NULL",
        default=None,
    )

    @classmethod
    def get_table_cls(cls, tablename: str):
        LabelInstance = create_model(
            cls.__name__.replace("SQLModel", ""),
            commit=(LabelsetCommit, Relationship()),
            gt_class=(ObjectClass | None, Relationship()),
            __base__=cls._get_table_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return LabelInstance

    @classmethod
    def get_update_cls(cls):
        class LabelInstanceUpdate(super().get_update_cls()):
            is_black: bool | None = None

            gt_class_id: int | None = None

        return LabelInstanceUpdate


LabelInstance = LabelInstanceSQLModel.get_table_cls("label_instance")
LabelInstanceCreate = LabelInstanceSQLModel.get_create_cls()
LabelInstancePublic = LabelInstanceSQLModel.get_public_cls()
LabelInstanceUpdate = LabelInstanceSQLModel.get_update_cls()
LabelInstanceBulkUpdate = LabelInstanceSQLModel.get_update_cls()


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
        )

    @staticmethod
    def _validate(value: Union[str, "SelectionType"]) -> "SelectionType":
        if isinstance(value, SelectionType):
            return value

        return SelectionType(value)


class PointsDict(TypedDict):
    selection: SelectionType


class LabelSelectionSQLModel(LabelElementSQLModel):
    srid: Final = 2326
    output_dimension: Final = 3
    include_z: Final = True

    selection: SelectionType = Field(
        sa_type=Geometry(geometry_type='MultiPointZ', srid=srid, spatial_index=True, dimension=output_dimension, nullable=False),
        nullable=False,
    )
    timestamp: AwareDatetime | None = Field(sa_type=UTCDateTime)

    quality_rank: QualityRank | None = Field(sa_type=SmallInteger, default=None)
    distinctive_lv: DistinctiveLevel | None = Field(sa_type=SmallInteger, default=None)
    occlusion_lv: OcclusionLevel | None = Field(sa_type=SmallInteger, default=None)

    perceived_class_id: int | None = Field(
        foreign_key='object_class.id',
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
            __base__=cls._get_table_cls(tablename),
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


LabelSelection = LabelSelectionSQLModel.get_table_cls("label_selection")
LabelSelectionCreate = LabelSelectionSQLModel.get_create_cls()
LabelSelectionPublic = LabelSelectionSQLModel.get_public_cls()
LabelSelectionUpdate = LabelSelectionSQLModel.get_update_cls()
LabelSelectionBulkUpdate = LabelSelectionSQLModel.get_update_cls()
