import uuid
from collections.abc import Iterable
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_DOWN, Decimal
from multiprocessing import get_context
from pathlib import Path
from typing import Any
from uuid import UUID

import click
from tqdm import tqdm

import numpy as np

from shapely.geometry import MultiPoint

from sqlmodel import Session, select

from sta.cli.base import get_config_path_option
from sta.cli.prompts import prompt_login
from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.config import AppConfigArgs
from sta.domain.jobs import run_pending_jobs
from sta.domain.label.groups import (
    create_group as create_label_group,
    delete_group as delete_label_group,
)
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OP_REGISTRY
from sta.domain.label.spec.objclass import (
    definitions as objclass_definitions,
    selections as objclass_selections_domain,
)
from sta.domain.source.groups import (
    create_group as create_source_group,
    delete_group as delete_source_group,
)
from sta.entrypoints import app_ctx
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.label.spec.objclass import (
    ObjectClassCreate,
    ObjectClassSelectionAssociation,
    ObjectClassSelectionCreate,
)
from sta.models.source.group import SourceGroup, SourceGroupCreate, SourceGroupPublic
from sta.models.user import User, UserPublic
from sta.porter.st_metadata import STInfoRow, STMetadata
from sta.session import session_ctx
from sta_bbox.domain.label.data import (
    element as bbox_element_domain,
    entity as bbox_entity_domain,
)
from sta_bbox.models.label.data import (
    BoxType,
    LabelBox,
    LabelTrack,
    TruncDecimalCoord,
    TruncDecimalCoord3,
    TruncDecimalSize3,
)
from sta_pcd.domain.source.data import metadata as pcd_metadata_domain
from sta_pcd.domain.source.spec import specs as pcd_specs_domain
from sta_pcd.models.source.data import PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudConfig, PointCloudSpecCreate
from sta_segmentation.domain.label.data import (
    element as segmentation_element_domain,
    entity as segmentation_entity_domain,
)
from sta_segmentation.models.label.data import (
    LabelInstance,
    LabelSelection,
    SelectionType,
)

# SemanticKITTI class IDs, learning-map IDs, and train/valid/test splits are
# defined in the official semantic-kitti-api config:
# https://github.com/PRBonn/semantic-kitti-api/blob/master/config/semantic-kitti.yaml
SEMANTIC_KITTI_LABELS = {
    0: "unlabeled",
    1: "outlier",
    10: "car",
    11: "bicycle",
    13: "bus",
    15: "motorcycle",
    16: "on-rails",
    18: "truck",
    20: "other-vehicle",
    30: "person",
    31: "bicyclist",
    32: "motorcyclist",
    40: "road",
    44: "parking",
    48: "sidewalk",
    49: "other-ground",
    50: "building",
    51: "fence",
    52: "other-structure",
    60: "lane-marking",
    70: "vegetation",
    71: "trunk",
    72: "terrain",
    80: "pole",
    81: "traffic-sign",
    99: "other-object",
    252: "moving-car",
    253: "moving-bicyclist",
    254: "moving-person",
    255: "moving-motorcyclist",
    256: "moving-on-rails",
    257: "moving-bus",
    258: "moving-truck",
    259: "moving-other-vehicle",
}

SEMANTIC_KITTI_LEARNING_MAP = {
    0: 0,
    1: 0,
    10: 1,
    11: 2,
    13: 5,
    15: 3,
    16: 5,
    18: 4,
    20: 5,
    30: 6,
    31: 7,
    32: 8,
    40: 9,
    44: 10,
    48: 11,
    49: 12,
    50: 13,
    51: 14,
    52: 0,
    60: 9,
    70: 15,
    71: 16,
    72: 17,
    80: 18,
    81: 19,
    99: 0,
    252: 1,
    253: 7,
    254: 6,
    255: 8,
    256: 5,
    257: 5,
    258: 4,
    259: 5,
}

SEMANTIC_KITTI_LEARNING_LABELS = {
    0: "unlabeled",
    1: "car",
    2: "bicycle",
    3: "motorcycle",
    4: "truck",
    5: "other-vehicle",
    6: "person",
    7: "bicyclist",
    8: "motorcyclist",
    9: "road",
    10: "parking",
    11: "sidewalk",
    12: "other-ground",
    13: "building",
    14: "fence",
    15: "vegetation",
    16: "trunk",
    17: "terrain",
    18: "pole",
    19: "traffic-sign",
}


# SemanticKITTI labels are published for sequences 00-10; 11-21 are test scans only.
DEFAULT_SEQUENCES = tuple(f"{i:02d}" for i in range(11))
DEFAULT_POINT_METADATA_BATCH_ROWS = 250
# Segmentation WKB rows can be several MB per frame. Keep label inserts small
# so Postgres/psycopg does not receive one enormous insertmany statement.
LABEL_BATCH_FRAMES = 8
DEFAULT_LABEL_BATCH_MIB = 64
LABEL_TYPE_CHOICES = ("segmentation", "bbox")
DEFAULT_LABEL_TYPES = LABEL_TYPE_CHOICES
DUMMY_TIMESTAMP_START = datetime(1970, 1, 1, tzinfo=timezone.utc)
_WORKER_NUMBER: int | None = None


@dataclass(frozen=True)
class SequenceImportTask:
    config_path: str
    data_dir: str
    sequence: str
    first_frame_index: int
    source_group_id: int
    label_branch_id: int | None
    user_id: int
    labels_by_id: dict[int, str]
    learning_map: bool
    import_segmentation: bool
    import_bbox: bool
    label_batch_bytes: int
    point_metadata_batch_rows: int


@dataclass(frozen=True)
class SequenceImportResult:
    sequence: str
    frame_count: int


def initialize_import_worker(worker_counter: Any) -> None:
    """Assign a stable display number to a spawned data-processing worker."""
    global _WORKER_NUMBER
    with worker_counter.get_lock():
        worker_counter.value += 1
        _WORKER_NUMBER = worker_counter.value


def progress_desc(description: str) -> str:
    if _WORKER_NUMBER is None:
        return description
    return f"[DP{_WORKER_NUMBER}] {description}"


def progress_position() -> int | None:
    if _WORKER_NUMBER is None:
        return None
    return _WORKER_NUMBER - 1


def build_learning_map_lut() -> np.ndarray:
    lut = np.full(max(SEMANTIC_KITTI_LEARNING_MAP) + 1, -1, dtype=np.int16)
    for src, dst in SEMANTIC_KITTI_LEARNING_MAP.items():
        lut[src] = dst
    return lut


SEMANTIC_KITTI_LEARNING_MAP_LUT = build_learning_map_lut()
COORD_QUANT = Decimal("0.000001")
BBOX_QUANT = Decimal("0.00001")
BBOX_MIN_SIZE = Decimal("0.00001")


def decimal_coord(value: float) -> Decimal:
    return Decimal(str(float(value))).quantize(COORD_QUANT, rounding=ROUND_DOWN)


def decimal_bbox_coord(value: float) -> Decimal:
    return Decimal(str(float(value))).quantize(BBOX_QUANT, rounding=ROUND_DOWN)


def decimal_bbox_size(value: float) -> Decimal:
    size = Decimal(str(float(value))).quantize(BBOX_QUANT, rounding=ROUND_DOWN)
    return max(size, BBOX_MIN_SIZE)


def fs_relative_uri(path: Path, fs_root: Path) -> str:
    root_path = fs_root.absolute()
    data_path = path.absolute()
    try:
        return data_path.relative_to(root_path).as_posix()
    except ValueError as e:
        msg = (
            f"SemanticKITTI data ({data_path}) must be accessible "
            f"from the configured filesystem root ({root_path})"
        )
        raise click.ClickException(msg) from e


# Different scans are not related spatially even when they share the
# same coordinates
def dummy_frame_timestamp(frame_idx: int) -> datetime:
    return DUMMY_TIMESTAMP_START + timedelta(seconds=frame_idx)


def data_info_row(path: Path, fs_root: Path, *, timestamp: datetime) -> STInfoRow:
    return STInfoRow(
        file_uri=fs_relative_uri(path, fs_root),
        min_timestamp=timestamp,
        max_timestamp=timestamp,
    )


def validate_data_dir(data_dir: Path, fs_root: Path) -> None:
    fs_relative_uri(data_dir, fs_root)


def parse_sequences(raw_sequences: Iterable[str]) -> list[str]:
    sequences = list[str]()
    seen = set[str]()

    for raw in raw_sequences:
        for value in raw.replace(",", " ").split():
            try:
                sequence = int(value)
            except ValueError as e:
                msg = f"sequence must be an integer: {value}"
                raise click.BadParameter(msg) from e

            # SemanticKITTI contains sequence directories 00-21.
            if sequence < 0 or sequence > 21:
                msg = f"sequence out of range: {value}"
                raise click.BadParameter(msg)

            # Dedupe on the formatted form (so `5` and `05` collapse too):
            # repeating a sequence would otherwise import it twice.
            formatted = f"{sequence:02d}"
            if formatted in seen:
                continue

            seen.add(formatted)
            sequences.append(formatted)

    return sequences


def iter_frames(root: Path, sequences: Iterable[str]):
    for sequence in sequences:
        sequence_dir = root / "sequences" / sequence
        velodyne_dir = sequence_dir / "velodyne"
        if not velodyne_dir.is_dir():
            msg = f"missing velodyne directory: {velodyne_dir}"
            raise FileNotFoundError(msg)

        for scan_path in sorted(velodyne_dir.glob("*.bin")):
            yield (
                sequence,
                scan_path.stem,
                scan_path,
                sequence_dir / "labels" / f"{scan_path.stem}.label",
            )


def sequence_frame_offsets(root: Path, sequences: Iterable[str]) -> dict[str, int]:
    """Return the serial-import frame offset for each sequence."""
    offsets: dict[str, int] = {}
    frame_count = 0
    for sequence in sequences:
        offsets[sequence] = frame_count
        frame_count += sum(1 for _ in iter_frames(root, [sequence]))
    return offsets


def read_points(scan_path: Path) -> np.ndarray:
    points = np.fromfile(scan_path, dtype=np.float32)
    # SemanticKITTI velodyne .bin rows are float32 [x, y, z, remission].
    if points.size == 0 or points.size % 4 != 0:
        msg = f"point file does not contain float32 x/y/z/remission rows: {scan_path}"
        raise ValueError(msg)
    return points.reshape((-1, 4))


def read_labels(label_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    raw_labels = np.fromfile(label_path, dtype=np.uint32)
    # Official semantic-kitti-api stores packed labels as uint32:
    # lower 16 bits = semantic ID, upper 16 bits = instance ID.
    semantic_labels = raw_labels & 0xFFFF
    instance_labels = raw_labels >> 16
    return raw_labels, semantic_labels, instance_labels


def get_data_info_rows(
    *,
    root: Path,
    sequences: Iterable[str],
    fs_root: Path,
    frame_index_offset: int = 0,
) -> list[STInfoRow]:
    data_info_rows = list[STInfoRow]()

    for frame_idx, (_, _, scan_path, _) in enumerate(iter_frames(root, sequences)):
        data_info_rows.append(
            data_info_row(
                scan_path,
                fs_root,
                timestamp=dummy_frame_timestamp(frame_index_offset + frame_idx),
            ),
        )

    return data_info_rows


def load_app_config(config_path: Path):
    return AppConfigArgs.from_file(config_path).as_config()


def st_items_from_rows(rows: list[STInfoRow]):
    return [
        STMetadata(
            filepath=FileSystemPath.from_uri(row.file_uri),
            file_coords_to_db_coords=Transform.from_optional(),
            min_timestamp=row.min_timestamp,
            max_timestamp=row.max_timestamp,
        )
        for row in rows
    ]


def create_point_cloud_import_group(
    *,
    current_user: UserPublic,
    session: Session,
    name: str,
):
    source_group = create_source_group(
        current_user=current_user,
        session=session,
        data=SourceGroupCreate(
            name=name,
            description="SemanticKITTI point clouds",
        ),
    )
    session.flush([source_group])

    pcd_specs_domain.create_spec(
        current_user=current_user,
        session=session,
        data=PointCloudSpecCreate(
            name=f"{name} point cloud",
            description="",
            group_ids=[source_group.id],
            config=PointCloudConfig.default(),
        ),
    )

    return SourceGroupPublic.model_validate(source_group)


def get_or_create_object_class(
    *,
    current_user: UserPublic,
    session: Session,
    name: str,
    created_ids: set[int] | None = None,
):
    existing = objclass_definitions.list_objclasses(
        current_user=current_user,
        session=session,
        name=name,
    )
    if existing:
        return existing[0]

    created = objclass_definitions.create_objclass(
        current_user=current_user,
        session=session,
        data=ObjectClassCreate(name=name),
    )
    if created_ids is not None:
        assert created.id is not None
        created_ids.add(created.id)
    return created


def create_label_import_branch(
    *,
    current_user: UserPublic,
    session: Session,
    group_name: str,
    branch_name: str,
    labels_by_id: dict[int, str],
    created_objclass_ids: set[int] | None = None,
):
    label_group = create_label_group(
        current_user=current_user,
        session=session,
        data=LabelGroupCreate(
            name=group_name,
            description="SemanticKITTI labels",
        ),
    )
    session.flush([label_group])

    objclasses = [
        get_or_create_object_class(
            current_user=current_user,
            session=session,
            name=name,
            created_ids=created_objclass_ids,
        )
        for _, name in sorted(labels_by_id.items())
    ]

    objclass_selections_domain.create_spec(
        current_user=current_user,
        session=session,
        data=ObjectClassSelectionCreate(
            name=f"{group_name} object classes",
            description="SemanticKITTI object classes",
            group_ids=[label_group.id],
            objclass_ids=[objclass.id for objclass in objclasses],
        ),
    )

    branch = init_branch(
        current_user=current_user,
        session=session,
        op_registry=OP_REGISTRY,
        data=LabelsetBranchInit(
            group_id=label_group.id,
            name=branch_name,
        ),
    )

    return LabelsetBranchPublic.model_validate(branch)


def stable_uuid_int(*parts: object) -> int:
    key = ":".join(str(part) for part in parts)
    return uuid.uuid5(uuid.NAMESPACE_URL, f"semantickitti:{key}").int


def read_points_from_fs_path(path: FileSystemPath) -> np.ndarray:
    with path.open("rb") as f:
        points = np.frombuffer(f.read(), dtype=np.float32)
    if points.size == 0 or points.size % 4 != 0:
        msg = f"point file does not contain float32 x/y/z/remission rows: {path.as_uri()}"
        raise ValueError(msg)
    return points.reshape((-1, 4))


def validate_point_files(root: Path, sequences: Iterable[str]) -> None:
    """Reject malformed scans before any shared import resources are committed."""
    row_bytes = 4 * np.dtype(np.float32).itemsize
    for _sequence, _frame, scan_path, _label_path in iter_frames(root, sequences):
        size = scan_path.stat().st_size
        if size == 0 or size % row_bytes != 0:
            msg = f"point file does not contain float32 x/y/z/remission rows: {scan_path}"
            raise click.ClickException(msg)


def transformed_xyz(points: np.ndarray, transform: Transform) -> np.ndarray:
    xyz = points[:, :3]
    transformed = transform.apply_to_array(xyz)
    return np.asarray(transformed)


def class_ids_from_semantic_labels(
    semantic_labels: np.ndarray, *, learning_map: bool
) -> np.ndarray:
    if not learning_map:
        return semantic_labels

    if semantic_labels.size and int(semantic_labels.max()) >= len(SEMANTIC_KITTI_LEARNING_MAP_LUT):
        unknown = sorted(
            {
                int(v)
                for v in np.unique(semantic_labels)
                if int(v) not in SEMANTIC_KITTI_LEARNING_MAP
            }
        )
        msg = f"unknown SemanticKITTI semantic label(s): {unknown}"
        raise ValueError(msg)

    class_ids = SEMANTIC_KITTI_LEARNING_MAP_LUT[semantic_labels]
    if np.any(class_ids < 0):
        unknown = sorted(
            {
                int(v)
                for v in np.unique(semantic_labels)
                if int(v) not in SEMANTIC_KITTI_LEARNING_MAP
            }
        )
        msg = f"unknown SemanticKITTI semantic label(s): {unknown}"
        raise ValueError(msg)
    return class_ids.astype(np.uint16, copy=False)


def iter_point_groups(
    *,
    xyz: np.ndarray,
    class_ids: np.ndarray,
    instance_labels: np.ndarray,
):
    if len(xyz) == 0:
        return

    keys = (class_ids.astype(np.uint64, copy=False) << np.uint64(32)) | instance_labels.astype(
        np.uint64, copy=False
    )
    order = np.argsort(keys)
    sorted_keys = keys[order]
    starts = np.r_[0, np.flatnonzero(sorted_keys[1:] != sorted_keys[:-1]) + 1]
    ends = np.r_[starts[1:], len(sorted_keys)]

    for start, end in zip(starts, ends, strict=True):
        key = int(sorted_keys[start])
        class_id = key >> 32
        instance_id_raw = key & 0xFFFFFFFF
        yield class_id, instance_id_raw, xyz[order[start:end]]


def label_selection_from_xyz(
    *,
    id: UUID,
    group_id: int,
    commit_hash: str,
    xyz: np.ndarray,
    timestamp,
    entity_id: UUID | None,
    perceived_class_id: int | None,
) -> LabelSelection:
    min_coords = xyz.min(axis=0)
    max_coords = xyz.max(axis=0)
    geom = MultiPoint(xyz)

    return LabelSelection(
        id=id,
        group_id=group_id,
        commit_hash=commit_hash,
        min_x=decimal_coord(min_coords[0]),
        min_y=decimal_coord(min_coords[1]),
        min_z=decimal_coord(min_coords[2]),
        max_x=decimal_coord(max_coords[0]),
        max_y=decimal_coord(max_coords[1]),
        max_z=decimal_coord(max_coords[2]),
        min_timestamp=timestamp,
        max_timestamp=timestamp,
        selection=SelectionType(geom.wkb, srid=LabelSelection.srid),
        timestamp=timestamp,
        distinctive_lv=None,
        occlusion_lv=None,
        entity_id=entity_id,
        perceived_class_id=perceived_class_id,
    )


def best_fit_cuboid_from_xyz(xyz: np.ndarray):
    xy = xyz[:, :2]
    xy_origin = xy.mean(axis=0)
    xy_centered = xy - xy_origin

    # Use PCA in the horizontal plane to estimate the object's heading. The
    # largest-variance eigenvector becomes the cuboid's local x axis.
    if xyz.shape[0] >= 3 and np.any(np.ptp(xy, axis=0) > 0):
        covariance = np.cov(xy_centered, rowvar=False, bias=True)
        eigenvalues, eigenvectors = np.linalg.eigh(covariance)
        principal_axis = eigenvectors[:, int(np.argmax(eigenvalues))]
        if principal_axis[0] < 0:
            principal_axis = -principal_axis
        heading = float(np.arctan2(principal_axis[1], principal_axis[0]))
    else:
        heading = 0.0

    # Rotate points into the cuboid's local frame. The axis-aligned min/max in
    # this frame gives the tightest PCA-oriented rectangle over the points.
    angle = -heading
    cos_angle = np.cos(angle)
    sin_angle = np.sin(angle)
    local_xy = np.column_stack(
        (
            xy_centered[:, 0] * cos_angle - xy_centered[:, 1] * sin_angle,
            xy_centered[:, 0] * sin_angle + xy_centered[:, 1] * cos_angle,
        )
    )
    min_local = local_xy.min(axis=0)
    max_local = local_xy.max(axis=0)
    center_local = (min_local + max_local) / 2

    # Convert the local rectangle center back into dataset coordinates. Z stays
    # axis-aligned because SemanticKITTI objects are upright in the scan frame.
    center_xy = xy_origin + np.array(
        [
            center_local[0] * cos_angle + center_local[1] * sin_angle,
            -center_local[0] * sin_angle + center_local[1] * cos_angle,
        ]
    )

    min_z = float(xyz[:, 2].min())
    max_z = float(xyz[:, 2].max())
    size_xy = max_local - min_local

    center = TruncDecimalCoord3(
        x=decimal_bbox_coord(center_xy[0]),
        y=decimal_bbox_coord(center_xy[1]),
        z=decimal_bbox_coord((min_z + max_z) / 2),
    )
    size = TruncDecimalSize3(
        x=decimal_bbox_size(size_xy[0]),
        y=decimal_bbox_size(size_xy[1]),
        z=decimal_bbox_size(max_z - min_z),
    )
    return center, TruncDecimalCoord(decimal_bbox_coord(heading)), size


def label_box_from_xyz(
    *,
    id: UUID,
    group_id: int,
    commit_hash: str,
    xyz: np.ndarray,
    timestamp,
    entity_id: UUID | None,
    perceived_class_id: int | None,
) -> LabelBox:
    center, angle, size = best_fit_cuboid_from_xyz(xyz)

    return LabelBox.from_bbox(
        id=id,
        group_id=group_id,
        commit_hash=commit_hash,
        type=BoxType.CUBOID,
        center=center,
        angle=angle,
        size=size,
        timestamp=timestamp,
        distinctive_lv=None,
        occlusion_lv=None,
        entity_id=entity_id,
        perceived_class_id=perceived_class_id,
    )


def flush_point_metadata_batch(
    *,
    current_user: UserPublic,
    session: Session,
    pcd_items: list[PointCloudMetadataCreate],
) -> None:
    if not pcd_items:
        return

    pcd_metadata_domain.bulk_create_datas(
        current_user=current_user,
        session=session,
        data=pcd_items,
        # No derivation override: the boxes above come from a reader that ignores the
        # group's configuration, so the records arrive awaiting a sweep, which
        # `import_point_entries_to_db` runs before it returns.
    )
    pcd_items.clear()


def import_point_entries_to_db(
    *,
    data_info_rows: list[STInfoRow],
    current_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    show_progress: bool = True,
    batch_rows: int = DEFAULT_POINT_METADATA_BATCH_ROWS,
) -> None:
    pcd_spec = pcd_specs_domain.read_spec_in_group(
        current_user=current_user,
        session=session,
        group_id=source_group.id,
    )
    if pcd_spec is None:
        msg = f"No point cloud source defined for source group #{source_group.id}"
        raise click.ClickException(msg)

    pcd_items = list[PointCloudMetadataCreate]()

    for st_item in tqdm(
        st_items_from_rows(data_info_rows),
        desc=progress_desc("Importing point clouds"),
        disable=not show_progress,
        position=progress_position(),
    ):
        xyz = transformed_xyz(
            read_points_from_fs_path(st_item.filepath), st_item.file_coords_to_db_coords
        )
        min_coords = xyz.min(axis=0)
        max_coords = xyz.max(axis=0)
        pcd_items.append(
            PointCloudMetadataCreate(
                # Derived mode, placeholder values: the sweep at the end of this import
                # replaces them with boxes read under the group's own configuration.
                auto_bounds=True,
                min_x=decimal_coord(min_coords[0]),
                min_y=decimal_coord(min_coords[1]),
                min_z=decimal_coord(min_coords[2]),
                max_x=decimal_coord(max_coords[0]),
                max_y=decimal_coord(max_coords[1]),
                max_z=decimal_coord(max_coords[2]),
                min_timestamp=st_item.min_timestamp,
                max_timestamp=st_item.max_timestamp,
                uri=st_item.filepath.as_uri(),
                group_id=source_group.id,
                weather=None,
            ).update_from_transform(st_item.file_coords_to_db_coords)
        )

        if len(pcd_items) >= batch_rows:
            flush_point_metadata_batch(
                current_user=current_user,
                session=session,
                pcd_items=pcd_items,
            )

    flush_point_metadata_batch(
        current_user=current_user,
        session=session,
        pcd_items=pcd_items,
    )

    # The batches queued one bounds sweep for the group instead of reading every scan twice
    # in one transaction. Commit first (a job that fails rolls its transaction back), then
    # run the queue so the import never leaves scans whose frame matching depends on an
    # approximation this script made without the group's configuration.
    session.commit()
    click.echo("Deriving spatial bounds...")
    run_pending_jobs(session=session)


def flush_label_batch(
    *,
    current_user: UserPublic,
    session: Session,
    instance_items: list[LabelInstance],
    selection_items: list[LabelSelection],
    track_items: list[LabelTrack],
    box_items: list[LabelBox],
) -> None:
    if instance_items:
        referenced_instance_ids = {
            selection.entity_id for selection in selection_items if selection.entity_id is not None
        }
        for instance in instance_items:
            segmentation_entity_domain.initialize_has_children(
                instance,
                value=instance.id in referenced_instance_ids,
            )
        segmentation_entity_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=instance_items,
        )
        instance_items.clear()
    if selection_items:
        segmentation_element_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=selection_items,
        )
        selection_items.clear()
    if track_items:
        referenced_track_ids = {box.entity_id for box in box_items if box.entity_id is not None}
        for track in track_items:
            bbox_entity_domain.initialize_has_children(
                track,
                value=track.id in referenced_track_ids,
            )
        bbox_entity_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=track_items,
        )
        track_items.clear()
    if box_items:
        bbox_element_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=box_items,
        )
        box_items.clear()


def import_labels_to_db(
    *,
    root: Path,
    sequences: Iterable[str],
    current_user: UserPublic,
    session: Session,
    label_branch: LabelsetBranchPublic,
    labels_by_id: dict[int, str],
    learning_map: bool,
    import_segmentation: bool,
    import_bbox: bool,
    frame_index_offset: int = 0,
    show_progress: bool = True,
    label_batch_bytes: int | None = None,
) -> None:
    commit = label_branch.head

    objclass_selection = objclass_selections_domain.read_spec_in_group(
        current_user=current_user,
        session=session,
        group_id=label_branch.group_id,
    )
    objclass_ids_by_class_id = {}
    if objclass_selection is not None:
        objclasses_by_name = {objclass.name: objclass for objclass in objclass_selection.objclasses}
        for class_id, class_name in labels_by_id.items():
            objclass = objclasses_by_name.get(class_name)
            objclass_ids_by_class_id[class_id] = None if objclass is None else objclass.id

    instance_items = list[LabelInstance]()
    selection_items = list[LabelSelection]()
    track_items = list[LabelTrack]()
    box_items = list[LabelBox]()
    track_ids = set[UUID]()
    pending_wkb_bytes = 0

    for frame_idx, (sequence, frame, scan_path, label_path) in enumerate(
        tqdm(
            list(iter_frames(root, sequences)),
            desc=progress_desc("Importing labels"),
            disable=not show_progress,
            position=progress_position(),
        ),
    ):
        frame_count = frame_idx + 1
        timestamp = dummy_frame_timestamp(frame_index_offset + frame_idx)
        if not label_path.exists():
            msg = f"missing label file: {label_path}"
            raise FileNotFoundError(msg)

        points = read_points(scan_path)
        _, semantic_labels, instance_labels = read_labels(label_path)
        if semantic_labels.shape[0] != points.shape[0]:
            msg = (
                f"point/label count mismatch for {sequence}/{frame}: "
                f"{points.shape[0]} points, {semantic_labels.shape[0]} labels"
            )
            raise ValueError(msg)

        class_ids = class_ids_from_semantic_labels(semantic_labels, learning_map=learning_map)
        xyz = points[:, :3]
        for class_id, instance_id_raw, group_xyz in iter_point_groups(
            xyz=xyz,
            class_ids=class_ids,
            instance_labels=instance_labels,
        ):
            instance_id = None if instance_id_raw == 0 else instance_id_raw
            instance_uuid = None
            objclass_id = objclass_ids_by_class_id.get(class_id)

            if import_segmentation:
                if instance_id is not None:
                    instance_uuid = UUID(
                        int=stable_uuid_int("instance", sequence, frame, class_id, instance_id)
                    )
                    instance_items.append(
                        LabelInstance(
                            id=instance_uuid,
                            group_id=commit.group_id,
                            commit_hash=commit.hash,
                            is_black=False,
                            gt_class_id=objclass_id,
                        )
                    )

                selection = label_selection_from_xyz(
                    id=UUID(
                        int=stable_uuid_int(
                            "selection", sequence, frame, class_id, instance_id or 0
                        )
                    ),
                    group_id=commit.group_id,
                    commit_hash=commit.hash,
                    xyz=group_xyz,
                    timestamp=timestamp,
                    entity_id=instance_uuid,
                    perceived_class_id=objclass_id,
                )
                selection_items.append(selection)
                pending_wkb_bytes += len(selection.selection.data)

            if import_bbox and class_id != 0 and instance_id is not None:
                track_uuid = UUID(
                    int=stable_uuid_int("bbox-track", sequence, class_id, instance_id)
                )
                if track_uuid not in track_ids:
                    track_ids.add(track_uuid)
                    track_items.append(
                        LabelTrack(
                            id=track_uuid,
                            group_id=commit.group_id,
                            commit_hash=commit.hash,
                            is_black=False,
                            gt_class_id=objclass_id,
                        )
                    )

                box_items.append(
                    label_box_from_xyz(
                        id=UUID(
                            int=stable_uuid_int("bbox-box", sequence, frame, class_id, instance_id)
                        ),
                        group_id=commit.group_id,
                        commit_hash=commit.hash,
                        xyz=group_xyz,
                        timestamp=timestamp,
                        entity_id=track_uuid,
                        perceived_class_id=objclass_id,
                    )
                )

        reached_byte_limit = (
            label_batch_bytes is not None and pending_wkb_bytes >= label_batch_bytes
        )
        if frame_count % LABEL_BATCH_FRAMES == 0 or reached_byte_limit:
            flush_label_batch(
                current_user=current_user,
                session=session,
                instance_items=instance_items,
                selection_items=selection_items,
                track_items=track_items,
                box_items=box_items,
            )
            pending_wkb_bytes = 0

    flush_label_batch(
        current_user=current_user,
        session=session,
        instance_items=instance_items,
        selection_items=selection_items,
        track_items=track_items,
        box_items=box_items,
    )


def import_sequence_worker(task: SequenceImportTask) -> SequenceImportResult:
    """Import one complete sequence in an isolated process and transaction."""
    config = load_app_config(Path(task.config_path))
    root = Path(task.data_dir)

    with app_ctx(config), session_ctx(config) as session:
        user_record = session.get(User, task.user_id)
        if user_record is None:
            msg = f"Cannot find import user #{task.user_id}"
            raise RuntimeError(msg)
        user = UserPublic.model_validate(user_record)

        source_group_record = session.get(SourceGroup, task.source_group_id)
        if source_group_record is None:
            msg = f"Cannot find source group #{task.source_group_id}"
            raise RuntimeError(msg)
        source_group = SourceGroupPublic.model_validate(source_group_record)

        data_info_rows = get_data_info_rows(
            root=root,
            sequences=[task.sequence],
            fs_root=config.fs_config.root,
            frame_index_offset=task.first_frame_index,
        )
        import_point_entries_to_db(
            data_info_rows=data_info_rows,
            current_user=user,
            session=session,
            source_group=source_group,
            show_progress=True,
            batch_rows=task.point_metadata_batch_rows,
        )

        if task.label_branch_id is not None:
            branch_record = read_branch(
                current_user=user,
                session=session,
                id=task.label_branch_id,
            )
            label_branch = LabelsetBranchPublic.model_validate(branch_record)
            import_labels_to_db(
                root=root,
                sequences=[task.sequence],
                current_user=user,
                session=session,
                label_branch=label_branch,
                labels_by_id=task.labels_by_id,
                learning_map=task.learning_map,
                import_segmentation=task.import_segmentation,
                import_bbox=task.import_bbox,
                frame_index_offset=task.first_frame_index,
                show_progress=True,
                label_batch_bytes=task.label_batch_bytes,
            )

        session.commit()

    return SequenceImportResult(
        sequence=task.sequence,
        frame_count=len(data_info_rows),
    )


def object_class_has_external_references(session: Session, objclass_id: int) -> bool:
    """Check references which would make deleting an imported class unsafe."""
    reference_columns = (
        ObjectClassSelectionAssociation.objclass_id,
        LabelInstance.gt_class_id,
        LabelSelection.perceived_class_id,
        LabelTrack.gt_class_id,
        LabelBox.perceived_class_id,
    )
    return any(
        session.exec(select(column).where(column == objclass_id).limit(1)).first() is not None
        for column in reference_columns
    )


def cleanup_failed_import(
    *,
    config_path: Path,
    user_id: int,
    source_group_id: int,
    label_group_id: int | None,
    created_objclass_ids: set[int],
) -> set[int]:
    """Delete committed import resources, retaining newly shared classes."""
    config = load_app_config(config_path)

    with app_ctx(config), session_ctx(config) as session:
        user_record = session.get(User, user_id)
        if user_record is None:
            msg = f"Cannot find cleanup user #{user_id}"
            raise RuntimeError(msg)
        user = UserPublic.model_validate(user_record)

        retained_objclass_ids = cleanup_failed_import_in_session(
            current_user=user,
            session=session,
            source_group_id=source_group_id,
            label_group_id=label_group_id,
            created_objclass_ids=created_objclass_ids,
        )
        session.commit()

    return retained_objclass_ids


def cleanup_failed_import_in_session(
    *,
    current_user: UserPublic,
    session: Session,
    source_group_id: int,
    label_group_id: int | None,
    created_objclass_ids: set[int],
) -> set[int]:
    """Delete failed-import resources in the caller's transaction."""
    retained_objclass_ids: set[int] = set()

    if label_group_id is not None:
        objclass_selection = objclass_selections_domain.read_spec_in_group(
            current_user=current_user,
            session=session,
            group_id=label_group_id,
        )
        if objclass_selection is not None:
            objclass_selections_domain.delete_spec(
                current_user=current_user,
                session=session,
                id=objclass_selection.id,
            )
        delete_label_group(
            current_user=current_user,
            session=session,
            id=label_group_id,
        )
    delete_source_group(
        current_user=current_user,
        session=session,
        id=source_group_id,
    )

    # Flush group cascades before checking whether a class is still used by
    # data or selections outside this import.
    session.flush()
    for objclass_id in sorted(created_objclass_ids):
        if object_class_has_external_references(session, objclass_id):
            retained_objclass_ids.add(objclass_id)
            continue
        objclass_definitions.delete_objclass(
            current_user=current_user,
            session=session,
            id=objclass_id,
        )

    return retained_objclass_ids


def run_sequence_imports(
    tasks: list[SequenceImportTask], workers: int
) -> list[SequenceImportResult]:
    if workers == 1:
        return [import_sequence_worker(task) for task in tasks]

    results: list[SequenceImportResult] = []
    # Spawn prevents workers from inheriting the coordinator's SQLAlchemy
    # engine connections or application context.
    process_context = get_context("spawn")
    worker_counter = process_context.Value("i", 0)
    with ProcessPoolExecutor(
        max_workers=workers,
        mp_context=process_context,
        initializer=initialize_import_worker,
        initargs=(worker_counter,),
    ) as executor:
        futures = {executor.submit(import_sequence_worker, task): task.sequence for task in tasks}
        try:
            for future in as_completed(futures):
                results.append(future.result())
        except BaseException:
            for pending in futures:
                pending.cancel()
            raise

    return sorted(results, key=lambda result: result.sequence)


@click.command()
@click.argument(
    "data_dir",
    type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path),
    required=True,
)
@get_config_path_option()
@click.option(
    "--sequence",
    "--sequences",
    "raw_sequences",
    multiple=True,
    default=DEFAULT_SEQUENCES,
    show_default="00-10",
    help="Sequence ID to import. Repeat option or pass comma-separated IDs.",
)
@click.option(
    "--source-group-name",
    default="SemanticKITTI",
    help="Name of the new source group to create for imported point clouds.",
)
@click.option(
    "--label-group-name",
    default="SemanticKITTI",
    help="Name of the new label group to create for imported labels.",
)
@click.option(
    "--label-branch-name",
    default="main",
    help="Name of the new label branch to create for imported labels.",
)
@click.option(
    "--skip-labels",
    is_flag=True,
    help="Skip importing labels (i.e., only import point clouds).",
)
@click.option(
    "--label-type",
    "label_types",
    type=click.Choice(LABEL_TYPE_CHOICES, case_sensitive=False),
    multiple=True,
    help="Label type to import when labels are enabled. Repeat to import multiple types.",
)
@click.option(
    "--learning-map",
    is_flag=True,
    help="Map raw SemanticKITTI classes to the 20 learning classes.",
)
@click.option(
    "--workers",
    type=click.IntRange(min=1),
    default=8,
    show_default=True,
    help="Import complete sequences using this many worker processes.",
)
@click.option(
    "--label-batch-mib",
    type=click.IntRange(min=1),
    default=DEFAULT_LABEL_BATCH_MIB,
    show_default=True,
    help="Flush a label batch after approximately this many MiB of segmentation WKB.",
)
@click.option(
    "--point-metadata-batch-rows",
    type=click.IntRange(min=1),
    default=DEFAULT_POINT_METADATA_BATCH_ROWS,
    show_default=True,
    help="Flush point-cloud metadata after this many rows.",
)
def cli(
    data_dir: Path,
    raw_sequences: tuple[str, ...],
    config_path: str | Path,
    source_group_name: str,
    label_group_name: str,
    label_branch_name: str,
    *,
    skip_labels: bool,
    label_types: tuple[str, ...],
    learning_map: bool,
    workers: int,
    label_batch_mib: int,
    point_metadata_batch_rows: int,
) -> None:
    """
    Import SemanticKITTI point clouds and labels from DATA_DIR into ST Annotator.

    DATA_DIR is the directory that contains the sequences/ sub-directory.
    """
    if isinstance(config_path, str):
        config_path = Path(config_path)

    config = load_app_config(config_path)
    fs_root = config.fs_config.root
    labels_by_id = SEMANTIC_KITTI_LEARNING_LABELS if learning_map else SEMANTIC_KITTI_LABELS
    selected_label_types = {label_type.lower() for label_type in label_types} or set(
        DEFAULT_LABEL_TYPES
    )
    validate_data_dir(data_dir, fs_root)

    sequences = parse_sequences(raw_sequences)
    # Validate every sequence and establish deterministic serial-order offsets
    # before committing any database resources that might require cleanup.
    offsets = sequence_frame_offsets(data_dir, sequences)
    validate_point_files(data_dir, sequences)

    created_objclass_ids: set[int] = set()
    label_group_id: int | None = None
    label_branch_id: int | None = None

    # Commit shared resources before workers start so every worker can load the
    # same groups, specifications, branch, and commit in an independent session.
    with app_ctx(config), session_ctx(config) as session:
        user = prompt_login(session)
        source_group = create_point_cloud_import_group(
            current_user=user,
            session=session,
            name=source_group_name,
        )
        if not skip_labels:
            label_branch = create_label_import_branch(
                current_user=user,
                session=session,
                group_name=label_group_name,
                branch_name=label_branch_name,
                labels_by_id=labels_by_id,
                created_objclass_ids=created_objclass_ids,
            )
            label_group_id = label_branch.group_id
            label_branch_id = label_branch.id

        user_id = user.id
        source_group_id = source_group.id
        session.commit()

    click.echo(f"Source group: {source_group_name} (ID: {source_group_id})")
    if label_group_id is None:
        click.echo("Label group: not created (--skip-labels)")
    else:
        click.echo(f"Label group: {label_group_name} (ID: {label_group_id})")

    tasks = [
        SequenceImportTask(
            config_path=str(config_path.absolute()),
            data_dir=str(data_dir.absolute()),
            sequence=sequence,
            first_frame_index=offsets[sequence],
            source_group_id=source_group_id,
            label_branch_id=label_branch_id,
            user_id=user_id,
            labels_by_id=labels_by_id,
            learning_map=learning_map,
            import_segmentation="segmentation" in selected_label_types,
            import_bbox="bbox" in selected_label_types,
            label_batch_bytes=label_batch_mib * 1024 * 1024,
            point_metadata_batch_rows=point_metadata_batch_rows,
        )
        for sequence in sequences
    ]

    try:
        results = run_sequence_imports(tasks, workers)
    except BaseException as import_error:
        try:
            retained_objclass_ids = cleanup_failed_import(
                config_path=config_path,
                user_id=user_id,
                source_group_id=source_group_id,
                label_group_id=label_group_id,
                created_objclass_ids=created_objclass_ids,
            )
        except BaseException as cleanup_error:
            msg = (
                f"Import failed: {import_error}. Cleanup also failed: {cleanup_error}. "
                f"source_group_id={source_group_id}, label_group_id={label_group_id}, "
                f"created_objclass_ids={sorted(created_objclass_ids)}"
            )
            raise click.ClickException(msg) from import_error

        retained_note = (
            ""
            if not retained_objclass_ids
            else f" Retained externally referenced object classes: {sorted(retained_objclass_ids)}."
        )
        msg = f"Import failed and its groups were deleted: {import_error}.{retained_note}"
        raise click.ClickException(msg) from import_error

    for result in results:
        click.echo(f"Imported sequence {result.sequence}: {result.frame_count} frames")

    click.echo("Done!")


if __name__ == "__main__":
    cli()
