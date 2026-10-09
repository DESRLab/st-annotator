from collections.abc import Sequence
from decimal import Decimal
from math import isinf, isnan

from shapely import from_wkb, to_geojson, to_wkb
from shapely.coordinates import get_coordinates
from shapely.geometry import MultiPoint

from pydantic import BaseModel, StrictBool, StrictInt, StrictStr

from sta.common.filesystem import FileSystemPath, JSONFileIO
from sta.common.logging import get_logger
from sta.common.spatial import DecimalCoord3, Vector3
from sta.common.utils.json import JSONType
from sta.services.models.label.data import LabelElementSQLModel

logger = get_logger()


class GeomConverters:
    @classmethod
    def geom_from_points(cls, points: Sequence[DecimalCoord3]):
        coords = [v.to_float().to_tuple() for v in points]

        return MultiPoint(coords)

    @classmethod
    def geom_from_wkb(cls, wkb: str) -> MultiPoint:
        return from_wkb(wkb)

    @classmethod
    def geom_to_wkb(cls, geom: MultiPoint, *, hex: bool = True, output_dim: int = 3) -> str:  # noqa: A002
        return to_wkb(geom, hex=hex, output_dimension=output_dim)

    @classmethod
    def coords_from_geom(cls, geom: MultiPoint, *, include_z: bool = True) -> Sequence[Sequence[Decimal]]:
        all_coords = get_coordinates(geom, include_z=include_z).tolist()
        ndigits = LabelElementSQLModel.COORD_TYPE.scale

        return [
            [Decimal(0) if isnan(c) or isinf(c) else round(Decimal(c), ndigits) for c in coords]
            for coords in all_coords
        ]

    @classmethod
    def points_from_wkb(cls, wkb: str, *, include_z: bool = True) -> Sequence[DecimalCoord3]:
        geom = cls.geom_from_wkb(wkb)
        vertices = cls.coords_from_geom(geom, include_z=include_z)

        if include_z:
            return [DecimalCoord3(x=v[0], y=v[1], z=v[2]) for v in vertices]

        return [DecimalCoord3(x=v[0], y=v[1], z=Decimal(0)) for v in vertices]

    @classmethod
    def points_from_geom(cls, geom: MultiPoint) -> Sequence[DecimalCoord3]:
        vertices = cls.coords_from_geom(geom)
        return [DecimalCoord3(x=v[0], y=v[1], z=v[2]) for v in vertices]

    @classmethod
    def wkb_to_geojson(cls, wkb: str) -> JSONType:
        geometry = cls.geom_from_wkb(wkb)
        return to_geojson(geometry)


class LabelClassModel(BaseModel):
    name: StrictStr
    id: StrictInt


class LabelInstanceModel(BaseModel):
    id: int

    gt_class: LabelClassModel | None = None
    is_black: StrictBool | None = None


class LabelSelectionModel(BaseModel):
    id: int
    points: list[Vector3]

    instance: LabelInstanceModel | None = None
    perceived_class: LabelClassModel | None = None
    distinctive_lv: StrictInt | None = None
    occlusion_lv: StrictInt | None = None


class LabelsModel(BaseModel):
    selections: list[LabelSelectionModel]


class GeoJSONGeometry(BaseModel):
    type: StrictStr
    coordinates: list[list[float]]


class GeoFeature(BaseModel):
    type: StrictStr
    geometry: GeoJSONGeometry | None = None



class LabelsFileIO:
    def __init__(self) -> None:
        super().__init__()

        self._io = JSONFileIO()

    def read(self, path: FileSystemPath) -> LabelsModel:
        default_data = LabelsModel(selections=[])
        if not path.exists():
            return default_data

        try:
            annotation_json = JSONFileIO().read(path)
        except Exception:
            logger.exception('Unable to read annotation file at: %s', path, stack_info=True)
            return default_data

        try:
            return LabelsModel.model_validate(annotation_json)
        except Exception:
            logger.exception('Invalid annotation at: %s', path, stack_info=True)
            return default_data

    def write(self, path: FileSystemPath, data: LabelsModel):
        self._io.write(path, data.model_dump(mode="json"))
