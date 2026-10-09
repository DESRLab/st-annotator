from collections.abc import Sequence
from decimal import Decimal
from math import isinf, isnan
from typing import TypeAlias

import uuid6

from shapely import from_wkb, to_geojson, to_wkb
from shapely.coordinates import get_coordinates
from shapely.geometry import LineString, Point, Polygon

from pydantic import BaseModel, StrictInt, StrictStr

from sta.common.filesystem import FileSystemPath, JSONFileIO
from sta.common.logging import get_logger
from sta.common.spatial import DecimalCoord3, Vector3
from sta.common.utils.json import JSONType
from sta.services.models.label.data import LabelElementSQLModel

from .models.label.data import VectorType

logger = get_logger()


Geom: TypeAlias = Point | Polygon | LineString

class GeomConverters:
    @classmethod
    def geom_from_vector_data(cls, vector_type: VectorType, vertices: Sequence[DecimalCoord3]) -> Geom:
        coords = [v.to_float().to_tuple() for v in vertices]

        try:
            if vector_type is VectorType.POLYGON:
                return Polygon(coords)
            elif vector_type is VectorType.POLYLINE:
                return LineString(coords)

            return Point(coords)
        except Exception:
            raise

    @classmethod
    def geom_from_wkb(cls, wkb: str) -> Geom:
        return from_wkb(wkb)

    @classmethod
    def geom_to_wkb(cls, geom: Geom, *, hex: bool = True, output_dim: int = 3) -> str:  # noqa: A002
        return to_wkb(geom, hex=hex, output_dimension=output_dim)

    @classmethod
    def coords_from_geom(cls, geom: Geom, *, include_z: bool = True) -> Sequence[Sequence[Decimal]]:
        all_coords = get_coordinates(geom, include_z=include_z).tolist()
        ndigits = LabelElementSQLModel.COORD_TYPE.scale

        return [
            [Decimal(0) if isnan(c) or isinf(c) else round(Decimal(c), ndigits) for c in coords]
            for coords in all_coords
        ]

    @classmethod
    def vertices_from_wkb(cls, wkb: str, *, include_z: bool = True) -> Sequence[DecimalCoord3]:
        geom = cls.geom_from_wkb(wkb)
        vertices = cls.coords_from_geom(geom, include_z=include_z)

        if include_z:
            return [DecimalCoord3(x=v[0], y=v[1], z=v[2]) for v in vertices]

        return [DecimalCoord3(x=v[0], y=v[1], z=Decimal(0)) for v in vertices]

    @classmethod
    def vertices_from_geom(cls, geom: Geom) -> Sequence[DecimalCoord3]:
        vertices = cls.coords_from_geom(geom)
        return [DecimalCoord3(x=v[0], y=v[1], z=v[2]) for v in vertices]

    @classmethod
    def wkb_to_geojson(cls, wkb: str) -> JSONType:
        geometry = cls.geom_from_wkb(wkb)
        return to_geojson(geometry)


class LabelClassModel(BaseModel):
    id: StrictInt | None = None
    name: StrictStr


class LabelVectorModel(BaseModel):
    id: StrictInt
    vector_type: VectorType
    vertices: list[Vector3]

    gt_class: LabelClassModel | None = None


class LabelsModel(BaseModel):
    vectors: list[LabelVectorModel]


class GeoJSONGeometry(BaseModel):
    type: StrictStr
    coordinates: list[Vector3]


class GeoFeature(BaseModel):
    type: StrictStr
    geometry: GeoJSONGeometry | None = None


class GeoFeatureCollection(BaseModel):
    type: StrictStr
    features: list[GeoFeature]
    name: StrictStr

    def to_labels(self) -> LabelsModel:
        vectors: list[LabelVectorModel] = []

        class_name = self.name

        for feature in self.features:
            geometry = feature.geometry

            if geometry is not None:
                vector_type = VectorType(geometry.type)
                coords = [v.to_decimal() for v in geometry.coordinates]

                geom_obj = GeomConverters.geom_from_vector_data(vector_type, coords)
                vertices = GeomConverters.vertices_from_geom(geom_obj)

                vectors.append(LabelVectorModel(
                    vector_type=vector_type,
                    vertices=[v.to_float() for v in vertices],
                    id=uuid6.uuid7().int,
                    gt_class=LabelClassModel(name=class_name),
                ))

        return LabelsModel(vectors=vectors)


class LabelsFileIO:
    def __init__(self) -> None:
        super().__init__()

        self._io = JSONFileIO()

    def read(self, path: FileSystemPath) -> LabelsModel:
        default_data = LabelsModel(vectors=[])
        if not path.exists():
            return default_data

        try:
            annotation_json = JSONFileIO().read(path)
        except Exception:
            logger.exception('Unable to read annotation file at: %s', path, stack_info=True)
            return default_data

        try:
            if path.suffix == '.geojson':
                geo_features = GeoFeatureCollection.model_validate(annotation_json)
                return geo_features.to_labels()
            else:
                return LabelsModel.model_validate(annotation_json)
        except Exception:
            logger.exception('Invalid annotation at: %s', path, stack_info=True)
            return default_data

    def write(self, path: FileSystemPath, data: LabelsModel):
        self._io.write(path, data.model_dump(mode="json"))
