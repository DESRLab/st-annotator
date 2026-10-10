from pydantic import BaseModel, StrictBool, StrictFloat, StrictInt, StrictStr

from sta.common.filesystem import FileSystemPath, JSONFileIO
from sta.common.spatial import Vector3

from .models.label.data import BoxType


class LabelClassModel(BaseModel):
    id: StrictInt | None = None
    name: StrictStr


class LabelTrackModel(BaseModel):
    id: int

    gt_class: LabelClassModel | None = None
    is_black: StrictBool | None = None


class LabelBoxModel(BaseModel):
    id: int
    box_type: BoxType
    center: Vector3
    angle: StrictInt | StrictFloat
    size: Vector3

    track: LabelTrackModel | None = None
    perceived_class: LabelClassModel | None = None
    distinctive_lv: StrictInt | None = None
    occlusion_lv: StrictInt | None = None


class LabelsModel(BaseModel):
    bounding_boxes: list[LabelBoxModel]


class LabelsFileIO:
    def __init__(self) -> None:
        super().__init__()

        self._io = JSONFileIO()

    def read(self, path: FileSystemPath) -> LabelsModel:
        default_data = LabelsModel(bounding_boxes=[])
        if not path.exists():
            return default_data

        try:
            annotation_json = self._io.read(path)
        except Exception as exc:
            msg = f"Unable to read annotation file at: {path}"
            raise ValueError(msg) from exc

        try:
            return LabelsModel.model_validate(annotation_json)
        except Exception as exc:
            msg = f"Invalid annotation at: {path}"
            raise ValueError(msg) from exc

    def write(self, path: FileSystemPath, data: LabelsModel):
        self._io.write(path, data.model_dump(mode="json"))
