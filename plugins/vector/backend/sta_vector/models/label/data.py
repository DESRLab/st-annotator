import uuid
from collections.abc import Sequence
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar, Final, Literal, Union
from typing_extensions import Self, TypedDict

from geoalchemy2 import Geometry
from geoalchemy2.elements import WKBElement
from pydantic import (
    AwareDatetime,
    BaseModel as PydanticModel,
    Field as PydanticField,
    GetCoreSchemaHandler,
    TypeAdapter,
    create_model,
    field_serializer,
    field_validator,
)
from pydantic_core import CoreSchema, core_schema
from sqlalchemy.sql.sqltypes import String
from sqlmodel import Field, Relationship, SQLModel

from sta.common.database.types import UTCDateTime
from sta.common.spatial import DecimalCoord, DecimalCoord3, OptionalDecimalCoord3, PartialSTBounds
from sta.models.base import (
    MaxCoordsDict,
    MinCoordsDict,
    PartialSTBoundsDict,
    sqlmodel_sa_type,
)
from sta.models.label.data import LabelElementSQLModel
from sta.models.label.repo import LabelsetCommit, LabelsetCommitPublic
from sta.models.label.spec import ObjectClass


class VectorType(str, Enum):
    POINT = "Point"
    POLYGON = "Polygon"
    POLYLINE = "LineString"


class PointVertices(PydanticModel):
    type: Literal[VectorType.POINT]
    coords: Sequence[DecimalCoord3] = PydanticField(min_length=1, max_length=1)


class PolylineVertices(PydanticModel):
    type: Literal[VectorType.POLYLINE]
    coords: Sequence[DecimalCoord3] = PydanticField(min_length=2)


class PolygonVertices(PydanticModel):
    type: Literal[VectorType.POLYGON]
    coords: Sequence[DecimalCoord3] = PydanticField(min_length=3)


VectorVertices = PointVertices | PolylineVertices | PolygonVertices


class TimestampDict(TypedDict):
    min_timestamp: AwareDatetime | None
    max_timestamp: AwareDatetime | None


class GeometryType(WKBElement):
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
    def _validate(value: Union[str, "GeometryType"]) -> "GeometryType":
        if isinstance(value, GeometryType):
            return value

        return GeometryType(value)


class VerticesDict(TypedDict):
    type: VectorType
    geom: GeometryType


class LabelVectorSQLModel(LabelElementSQLModel, arbitrary_types_allowed=True):
    srid: Final = 2326
    output_dimension: Final = 3
    include_z: Final = True

    type: VectorType = Field(sa_type=sqlmodel_sa_type(String(50)), nullable=False)

    @field_validator("type", mode="before")
    @classmethod
    def _validate_type(cls, value: VectorType | str) -> VectorType:
        return value if isinstance(value, VectorType) else VectorType(value)

    @field_serializer("type")
    def _serialize_type(self, value: VectorType | str) -> str:
        return value.value if isinstance(value, VectorType) else VectorType(value).value

    geom: GeometryType = Field(
        sa_type=sqlmodel_sa_type(
            Geometry(
                geometry_type="GEOMETRYZ",
                srid=srid,
                spatial_index=True,
                dimension=output_dimension,
                nullable=False,
                use_N_D_index=True,
            ),
        ),
        nullable=False,
    )

    timestamp: AwareDatetime | None = Field(sa_type=UTCDateTime)

    gt_class_id: int | None = Field(
        foreign_key="object_class.id",
        ondelete="SET NULL",
        default=None,
    )

    @property
    def vertices(self) -> VectorVertices:
        from ...filesystem import GeomConverters

        coords = GeomConverters.vertices_from_wkb(
            wkb=self.geom.desc,
            include_z=self.include_z,
        )

        return TypeAdapter(VectorVertices).validate_python(
            {"type": self.type, "coords": [c.to_dict() for c in coords]},
        )

    @classmethod
    def unpack_timestamp(cls, timestamp: AwareDatetime | None) -> TimestampDict:
        return TimestampDict(min_timestamp=timestamp, max_timestamp=timestamp)

    @classmethod
    def unpack_vertices(cls, vertices: VectorVertices) -> VerticesDict:
        from ...filesystem import GeomConverters

        geom_obj = GeomConverters.geom_from_vector_data(vertices.type, vertices.coords)

        return VerticesDict(
            type=vertices.type,
            geom=GeometryType(geom_obj.wkb, srid=LabelVectorSQLModel.srid),
        )

    @classmethod
    def from_vertices(
        cls,
        *,
        vertices: VectorVertices,
        timestamp: AwareDatetime | None,
        **rest: Any,
    ):
        min_coords = cls.get_min_coords(coords=vertices.coords)
        max_coords = cls.get_max_coords(coords=vertices.coords)

        return cls(
            **cls.unpack_min_coords(min_coords),
            **cls.unpack_max_coords(max_coords),
            **cls.unpack_timestamp(timestamp),
            **cls.unpack_vertices(vertices),
            timestamp=timestamp,
            **rest,
        )

    def update_from_timestamp(self, timestamp: AwareDatetime | None) -> Self:
        data_to_update = self.unpack_timestamp(timestamp)

        return self.sqlmodel_update(data_to_update)

    def update_from_vertices(self, vertices: VectorVertices) -> Self:
        data_to_update = self.unpack_vertices(vertices)

        return self.sqlmodel_update(data_to_update)

    @classmethod
    def get_min_coords(
        cls,
        *,
        coords: Sequence[DecimalCoord3],
    ) -> DecimalCoord3:
        """Gets the minimum coordinates of a vector label with the given attributes."""
        return DecimalCoord3(
            x=min(p.x for p in coords),
            y=min(p.y for p in coords),
            z=min(p.z for p in coords),
        )

    @classmethod
    def get_max_coords(
        cls,
        *,
        coords: Sequence[DecimalCoord3],
    ) -> DecimalCoord3:
        """Gets the maximum coordinates of a vector label with the given attributes."""
        return DecimalCoord3(
            x=max(p.x for p in coords),
            y=max(p.y for p in coords),
            z=max(p.z for p in coords),
        )

    @classmethod
    def get_table_cls(cls, tablename: str):
        LabelVector = create_model(
            cls.__name__.replace("SQLModel", ""),
            commit=(LabelsetCommit, Relationship()),
            gt_class=(ObjectClass | None, Relationship()),
            __base__=cls.build_table_base_cls(tablename),
            __cls_kwargs__={"table": True},
        )

        return LabelVector

    @classmethod
    def get_update_cls(cls):
        class LabelVectorUpdate(super().get_update_cls()):
            type: VectorType | None = None
            geom: GeometryType | None = None

            timestamp: AwareDatetime | None = None

            gt_class_id: int | None = None

            @classmethod
            def from_vertices(
                cls,
                *,
                vertices: VectorVertices,
                **rest: Any,
            ):
                model = LabelVectorSQLModel

                min_coords = model.get_min_coords(coords=vertices.coords)
                max_coords = model.get_max_coords(coords=vertices.coords)

                return cls(
                    **model.unpack_min_coords(min_coords),
                    **model.unpack_max_coords(max_coords),
                    **model.unpack_vertices(vertices),
                    **rest,
                )

        return LabelVectorUpdate


if TYPE_CHECKING:

    class LabelVector(LabelVectorSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: uuid.UUID
        commit: LabelsetCommit = Field(default=None)
        gt_class: ObjectClass | None = None

    class LabelVectorCreate(LabelVectorSQLModel):
        pass

    class LabelVectorPublic(LabelVectorSQLModel):
        id: uuid.UUID
        commit: LabelsetCommitPublic = Field(default=None)
        gt_class: ObjectClass | None = None

    class LabelVectorUpdate(SQLModel):
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
        type: VectorType | None = None
        geom: GeometryType | None = None
        timestamp: AwareDatetime | None = None
        gt_class_id: int | None = None

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
            return LabelVectorSQLModel.unpack_min_coords(min_coords)

        @classmethod
        def unpack_max_coords(
            cls, max_coords: OptionalDecimalCoord3 | DecimalCoord3
        ) -> MaxCoordsDict:
            return LabelVectorSQLModel.unpack_max_coords(max_coords)

        @classmethod
        def unpack_st_bounds(cls, st_bounds: PartialSTBounds) -> PartialSTBoundsDict:
            return LabelVectorSQLModel.unpack_st_bounds(st_bounds)

        def update_from_st_bounds(self, st_bounds: PartialSTBounds, *, exclude_none: bool) -> Self:
            data: dict[str, Any] = dict(self.unpack_st_bounds(st_bounds))
            if exclude_none:
                data = {key: item for key, item in data.items() if item is not None}
            return self.sqlmodel_update(data)

        @classmethod
        def from_vertices(cls, *, vertices: VectorVertices, **rest: Any) -> Self:
            model = LabelVectorSQLModel
            return cls(
                **model.unpack_min_coords(model.get_min_coords(coords=vertices.coords)),
                **model.unpack_max_coords(model.get_max_coords(coords=vertices.coords)),
                **model.unpack_vertices(vertices),
                **rest,
            )

    class LabelVectorBulkUpdate(LabelVectorUpdate):
        pass
else:
    LabelVector = LabelVectorSQLModel.get_table_cls("label_vector")
    LabelVectorCreate = LabelVectorSQLModel.get_create_cls()
    LabelVectorPublic = LabelVectorSQLModel.get_public_cls()
    LabelVectorUpdate = LabelVectorSQLModel.get_update_cls()
    LabelVectorBulkUpdate = LabelVectorSQLModel.get_update_cls()
