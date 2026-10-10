"""Serves the e2e app backed by a fully synthetic fixture.

The fixture generates its own point clouds and bounding boxes instead of
importing an external dataset, so the with-data e2e suite runs anywhere
(including CI) without downloading data. Everything is deterministic: no
PRNG, no environment-specific paths beyond ``FILESYSTEM_ROOT``.
"""

import argparse
import asyncio
import math
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from decimal import ROUND_DOWN, Decimal
from pathlib import Path
from uuid import UUID

import uvicorn

import numpy as np

from sqlmodel import Session

from sta.api.cors import resolve_frontend_url
from sta.api.root import build_api
from sta.common.filesystem import FileSystemPath
from sta.common.spatial import DecimalCoord3, Transform
from sta.config import AppConfig
from sta.domain.frames import bulk_create_frames
from sta.domain.label.groups import create_group as create_label_group
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OP_REGISTRY
from sta.domain.label.spec.objclass import (
    definitions as objclass_definitions,
    selections as objclass_selections_domain,
)
from sta.domain.projects import create_project
from sta.domain.source.groups import create_group as create_source_group
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.entrypoints import test_app_ctx
from sta.models.frame import FrameCreate
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import BranchPermissionLevel, LabelsetBranchPublic
from sta.models.label.spec.objclass import ObjectClassCreate, ObjectClassSelectionCreate
from sta.models.project import ProjectCreate
from sta.models.source.group import SourceGroupCreate, SourceGroupPublic
from sta.models.task import TaskCreate, WorkType
from sta.models.user import Role, UserCreate, UserPublic
from sta.session import get_engine
from sta_bbox.domain.label.data import element as bbox_element_domain, entity as bbox_entity_domain
from sta_bbox.models.label.data import (
    BoxType,
    LabelBox,
    LabelTrack,
    TruncDecimalCoord,
    TruncDecimalCoord3,
    TruncDecimalSize3,
)
from sta_gmesh.domain.source.data import metadata as gmesh_metadata_domain
from sta_gmesh.models.source.data import GroundMeshMetadataCreate
from sta_pcd.domain.source.data import metadata as pcd_metadata_domain
from sta_pcd.domain.source.spec import specs as pcd_specs_domain
from sta_pcd.models.source.data import PointCloudMetadata, PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudConfig, PointCloudSpecCreate
from sta_segmentation.domain.label.data import element as seg_element_domain
from sta_segmentation.models.label.data import LabelSelection
from sta_vector.domain.label.data import element as vector_element_domain
from sta_vector.models.label.data import LabelVector, PolylineVertices, VectorType

FIXTURE_PROJECT_NAME = "E2E Editor"
FIXTURE_TASK_NAME = "E2E Annotation"
ALTERNATE_TASK_NAME = "E2E Review"
FIXTURE_SOURCE_GROUP_NAME = "E2E Point Clouds"
FIXTURE_LABEL_GROUP_NAME = "E2E Labels"
FIXTURE_BRANCH_NAME = "main"
DEFAULT_SIZE_CLASS_NAME = "E2E Box with Default Size"

# The fixture's own object classes. The class ids only need to be distinct;
# the default-size class takes the next free id.
E2E_CLASS_CAR = 1
E2E_CLASS_PEDESTRIAN = 2
E2E_LABEL_CLASSES = {
    E2E_CLASS_CAR: "car",
    E2E_CLASS_PEDESTRIAN: "pedestrian",
}
DEFAULT_SIZE_CLASS_ID = max(E2E_LABEL_CLASSES) + 1

# Every file this fixture writes lives under this fs-root-relative directory,
# so its whole on-disk footprint can be removed on shutdown (the temporary
# database is dropped by test_app_ctx, but these files are not).
SYNTHETIC_DIR_URI = "e2e/synthetic"

FRAME_COUNT = 5
TIMESTAMP_START = datetime(1970, 1, 1, tzinfo=timezone.utc)

# Scene layout. The ground grid covers the editor's default top-down camera
# extent (~+-30 m around the origin) densely enough that any brush/lasso/box
# query or assistant click in the central screen regions hits points. The
# grid spacing also keeps every pointer position within the 0.25
# world-unit raycast threshold the label layers use to start draws
# (worst-case distance to the nearest grid point is spacing * sqrt(2) / 2).
# The ground follows the seeded ground-mesh height profile (see
# e2e_ground_height) so each frame's z-bounds span the mesh heights that
# label draws and ground-relative transforms occupy; a small deterministic
# undulation keeps every drawn box's footprint at a nonzero vertical point
# spread, because bbox creation fits a new box's vertical size to the points
# inside its footprint (autoContainY) and rejects boxes with a sub-millimeter
# vertical extent. Object clusters sit well outside the origin so the
# pointer-target seeds (which anchor within x <= 8, see
# seed_e2e_pointer_targets) never collide with the seeded boxes.
GROUND_MIN = -40.0
GROUND_MAX = 40.0
GROUND_STEP = 0.25
CLUSTER_SPACING = 0.3

# (class id, center x, center y)
E2E_INSTANCES = (
    (E2E_CLASS_CAR, 24.0, -12.0),
    (E2E_CLASS_CAR, 26.0, -4.0),
    (E2E_CLASS_CAR, 26.0, 4.0),
    (E2E_CLASS_CAR, 24.0, 12.0),
    (E2E_CLASS_PEDESTRIAN, 29.0, -8.0),
    (E2E_CLASS_PEDESTRIAN, 29.0, 8.0),
)

# Cluster dimensions per class: (x, y, z) sizes. Cluster heights are chosen so
# the scan's z extent keeps the pointer-target seed quantiles exact: seeds
# clamp to [min_z + 0.05, max_z - 0.05], which must contain -0.5 (boxes) and
# -1 (polyline/selection), see seed_e2e_pointer_targets.
E2E_CLASS_SIZES = {
    E2E_CLASS_CAR: (4.5, 1.8, 1.6),
    E2E_CLASS_PEDESTRIAN: (0.6, 0.6, 1.7),
}
E2E_CLASS_INTENSITY = {
    E2E_CLASS_CAR: 0.6,
    E2E_CLASS_PEDESTRIAN: 0.9,
}

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


def stable_uuid_int(*parts: object) -> int:
    key = ":".join(str(part) for part in parts)
    return uuid.uuid5(uuid.NAMESPACE_URL, f"e2e-fixture:{key}").int


def frame_timestamp(frame_idx: int) -> datetime:
    # Frames are 1-second instants; the specs assert t_i+1 - t_i == 1000 ms.
    return TIMESTAMP_START + timedelta(seconds=frame_idx)


def parse_http(value: str) -> tuple[str, int]:
    try:
        host, port = value.split(":", maxsplit=1)
        return host, int(port)
    except ValueError as exc:
        msg = "--http must be in the form HOST:PORT"
        raise argparse.ArgumentTypeError(msg) from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve the e2e app with a synthetic editor fixture.",
    )
    parser.add_argument("--http", type=parse_http, default=("localhost", 8000))
    parser.add_argument(
        "--frontend-url",
        default=None,
        help="Expected frontend origin for CORS.",
    )
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args()


def e2e_ground_height(x):
    """
    Height of the seeded ground mesh (mirrored by the spec's `groundHeightDb`):
    z=-2 for x <= 10, rising 0.2/m to z=+2 at x = 30, and flat beyond.

    Accepts scalars and arrays. Label draws start on this mesh (`#initBox`
    raycasts the ground mesh), and ground-relative transforms ride it, so the
    point cloud — and therefore each frame's z-bounds, which gate label
    creation/updates — follows the same profile; a cloud that did not reach
    the mesh height would leave every new label outside its frame.
    """
    x = np.asarray(x, dtype=np.float64)
    return np.where(x <= 10.0, -2.0, np.where(x >= 30.0, 2.0, -2.0 + (x - 10.0) * 0.2))


def write_e2e_ground_mesh(mesh_path: FileSystemPath) -> None:
    """
    Writes a triangulated ground grid over x,y in [-60, 60].

    The height is z=-2 for x <= 10, rises 0.2/m until z=+2 at x = 30, and is
    z=+2 beyond. The grid columns pass through the slope breakpoints, so the
    reference points used by the e2e specs interpolate exactly: (0, 0) at
    height -2 and (40, 0) at height +2 (delta +4).
    """
    xs = (-60, 10, 30, 60)
    ys = (-60, 0, 60)
    lines = [f"v {x} {y} {float(e2e_ground_height(x)):g}" for y in ys for x in xs]
    for row in range(len(ys) - 1):
        for col in range(len(xs) - 1):
            a = row * len(xs) + col + 1
            lines.append(f"f {a} {a + 1} {a + len(xs) + 1}")
            lines.append(f"f {a} {a + len(xs) + 1} {a + len(xs)}")

    with mesh_path.open("w") as mesh_file:
        mesh_file.write("\n".join(lines) + "\n")


def _linspace(extent: float) -> np.ndarray:
    count = max(2, int(extent / CLUSTER_SPACING) + 1)
    return np.linspace(-extent / 2, extent / 2, count)


def cuboid_surface_points(
    *, center: tuple[float, float, float], size: tuple[float, float, float]
) -> np.ndarray:
    """
    Deterministic point lattice over the six faces of a cuboid.

    Gives each imported box visible geometry without any PRNG, so reseeding
    reproduces byte-identical scans.
    """
    cx, cy, cz = center
    sx, sy, sz = size
    xs = _linspace(sx)
    ys = _linspace(sy)
    zs = _linspace(sz)
    xy_x, xy_y = np.meshgrid(xs, ys, indexing="ij")
    xz_x, xz_z = np.meshgrid(xs, zs, indexing="ij")
    yz_y, yz_z = np.meshgrid(ys, zs, indexing="ij")

    faces = (
        # top / bottom (xy plane)
        np.column_stack((xy_x.ravel(), xy_y.ravel(), np.full(xy_x.size, sz / 2))),
        np.column_stack((xy_x.ravel(), xy_y.ravel(), np.full(xy_x.size, -sz / 2))),
        # front / back (xz plane)
        np.column_stack((xz_x.ravel(), np.full(xz_x.size, sy / 2), xz_z.ravel())),
        np.column_stack((xz_x.ravel(), np.full(xz_x.size, -sy / 2), xz_z.ravel())),
        # left / right (yz plane)
        np.column_stack((np.full(yz_y.size, sx / 2), yz_y.ravel(), yz_z.ravel())),
        np.column_stack((np.full(yz_y.size, -sx / 2), yz_y.ravel(), yz_z.ravel())),
    )
    points = np.concatenate(faces, axis=0)
    points[:, 0] += cx
    points[:, 1] += cy
    points[:, 2] += cz
    return points


def ground_z(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """
    Ground elevation: the mesh height profile plus a gentle deterministic
    undulation (max +-0.08 m).

    The undulation keeps every drawn box's footprint at a nonzero vertical
    point spread (see the scene-layout note) while staying far inside the seed
    z-window: the scan's z extent must keep [min_z + 0.05, max_z - 0.05]
    covering -0.5 and -1 (seed_e2e_pointer_targets).
    """
    return (
        e2e_ground_height(x)
        + 0.05 * np.sin(2 * np.pi * x / 8) * np.sin(2 * np.pi * y / 8)
        + 0.03 * np.sin(2 * np.pi * (x + y) / 13)
    )


def build_scan_points() -> np.ndarray:
    """Builds the float32 x/y/z/intensity rows of one scan (all frames share it)."""
    side = np.arange(GROUND_MIN, GROUND_MAX + GROUND_STEP / 2, GROUND_STEP)
    xg, yg = np.meshgrid(side, side, indexing="ij")
    ground = np.column_stack(
        (
            xg.ravel(),
            yg.ravel(),
            ground_z(xg, yg).ravel(),
            np.full(xg.size, 0.05),
        )
    )

    clusters = []
    for class_id, center_x, center_y in E2E_INSTANCES:
        size = E2E_CLASS_SIZES[class_id]
        ground_height = float(e2e_ground_height(center_x))
        xyz = cuboid_surface_points(
            center=(center_x, center_y, ground_height + size[2] / 2),
            size=size,
        )
        intensity = np.full(xyz.shape[0], E2E_CLASS_INTENSITY[class_id])
        clusters.append(np.column_stack((xyz, intensity)))

    return np.concatenate([ground, *clusters], axis=0).astype(np.float32)


def write_synthetic_scans() -> list[str]:
    """
    Writes one scan file per frame under the active filesystem root and
    returns the fs-root-relative URIs, indexed by frame.
    """
    points = build_scan_points()
    uris = []
    for frame_idx in range(FRAME_COUNT):
        uri = f"{SYNTHETIC_DIR_URI}/scan_{frame_idx:06d}.bin"
        scan_path = FileSystemPath.from_uri(uri)
        scan_path.parent.mkdir(parents=True, exist_ok=True)
        with scan_path.open("wb") as scan_file:
            scan_file.write(points.tobytes())
        uris.append(uri)
    return uris


def create_e2e_source_group(
    *,
    current_user: UserPublic,
    session: Session,
) -> SourceGroupPublic:
    source_group = create_source_group(
        current_user=current_user,
        session=session,
        data=SourceGroupCreate(
            name=FIXTURE_SOURCE_GROUP_NAME,
            description="Synthetic e2e point clouds",
        ),
    )
    session.flush([source_group])

    pcd_specs_domain.create_spec(
        current_user=current_user,
        session=session,
        data=PointCloudSpecCreate(
            name=f"{FIXTURE_SOURCE_GROUP_NAME} point cloud",
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
):
    existing = objclass_definitions.list_objclasses(
        current_user=current_user,
        session=session,
        name=name,
    )
    if existing:
        return existing[0]

    return objclass_definitions.create_objclass(
        current_user=current_user,
        session=session,
        data=ObjectClassCreate(name=name),
    )


def create_e2e_label_branch(
    *,
    current_user: UserPublic,
    annotator: UserPublic,
    session: Session,
    labels_by_id: dict[int, str],
) -> LabelsetBranchPublic:
    label_group = create_label_group(
        current_user=current_user,
        session=session,
        data=LabelGroupCreate(
            name=FIXTURE_LABEL_GROUP_NAME,
            description="Synthetic e2e labels",
        ),
    )
    session.flush([label_group])

    objclasses = [
        get_or_create_object_class(current_user=current_user, session=session, name=name)
        for _, name in sorted(labels_by_id.items())
    ]

    objclass_selections_domain.create_spec(
        current_user=current_user,
        session=session,
        data=ObjectClassSelectionCreate(
            name=f"{FIXTURE_LABEL_GROUP_NAME} object classes",
            description="Synthetic e2e object classes",
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
            name=FIXTURE_BRANCH_NAME,
            perm_lv_by_user_id={annotator.id: BranchPermissionLevel.WRITE},
        ),
    )

    return LabelsetBranchPublic.model_validate(branch)


def seed_point_metadata(
    *,
    current_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    scan_uris: list[str],
    scan_points: np.ndarray,
) -> None:
    min_coords = scan_points[:, :3].min(axis=0)
    max_coords = scan_points[:, :3].max(axis=0)

    pcd_items = []
    for frame_idx, uri in enumerate(scan_uris):
        timestamp = frame_timestamp(frame_idx)
        pcd_items.append(
            PointCloudMetadataCreate(
                min_x=decimal_coord(float(min_coords[0])),
                min_y=decimal_coord(float(min_coords[1])),
                min_z=decimal_coord(float(min_coords[2])),
                max_x=decimal_coord(float(max_coords[0])),
                max_y=decimal_coord(float(max_coords[1])),
                max_z=decimal_coord(float(max_coords[2])),
                min_timestamp=timestamp,
                max_timestamp=timestamp,
                uri=uri,
                group_id=source_group.id,
                weather=None,
            ).update_from_transform(Transform.from_optional())
        )

    pcd_metadata_domain.bulk_create_datas(
        current_user=current_user,
        session=session,
        data=pcd_items,
    )


def seed_e2e_boxes(
    *,
    current_user: UserPublic,
    session: Session,
    group_id: int,
    commit_hash: str,
    objclass_ids_by_class: dict[int, int],
) -> None:
    """
    Seeds one track per object instance with one box in every frame.

    Box ids are deterministic so reseeding is stable; they must never match
    the pointer-target seed signature (2x2x2 cuboid, angle 0, center z -0.5),
    which the pointer-routing specs discover by geometry.
    """
    track_items = []
    box_items = []
    for instance_idx, (class_id, center_x, center_y) in enumerate(E2E_INSTANCES):
        size = E2E_CLASS_SIZES[class_id]
        track_id = UUID(int=stable_uuid_int("e2e-box-track", instance_idx))
        track_items.append(
            LabelTrack(
                id=track_id,
                group_id=group_id,
                commit_hash=commit_hash,
                is_black=False,
                gt_class_id=None,
            )
        )

        center_z = float(e2e_ground_height(center_x)) + size[2] / 2
        for frame_idx in range(FRAME_COUNT):
            box_items.append(
                LabelBox.from_bbox(
                    id=UUID(int=stable_uuid_int("e2e-box-box", instance_idx, frame_idx)),
                    group_id=group_id,
                    commit_hash=commit_hash,
                    type=BoxType.CUBOID,
                    center=TruncDecimalCoord3(
                        x=decimal_bbox_coord(center_x),
                        y=decimal_bbox_coord(center_y),
                        z=decimal_bbox_coord(center_z),
                    ),
                    angle=TruncDecimalCoord(decimal_bbox_coord(0.0)),
                    size=TruncDecimalSize3(
                        x=decimal_bbox_size(size[0]),
                        y=decimal_bbox_size(size[1]),
                        z=decimal_bbox_size(size[2]),
                    ),
                    timestamp=frame_timestamp(frame_idx),
                    entity_id=track_id,
                    perceived_class_id=objclass_ids_by_class[class_id],
                    distinctive_lv=None,
                    occlusion_lv=None,
                )
            )

    bbox_entity_domain.bulk_create_datas(
        current_user=current_user,
        session=session,
        data=track_items,
    )
    bbox_element_domain.bulk_create_datas(
        current_user=current_user,
        session=session,
        data=box_items,
    )


def seed_synthetic_data(
    *,
    config: AppConfig,
    session: Session,
    root_user: UserPublic,
    annotator: UserPublic,
):
    scan_uris = write_synthetic_scans()
    scan_points = build_scan_points()

    source_group = create_e2e_source_group(
        current_user=root_user,
        session=session,
    )
    seed_point_metadata(
        current_user=root_user,
        session=session,
        source_group=source_group,
        scan_uris=scan_uris,
        scan_points=scan_points,
    )

    # Seed a real mesh in the same spatial region as the point clouds. This is
    # deliberately simple, but it gives browser tests observable geometry for
    # wireframe, opacity, color blending, transforms, and ground-relative bbox
    # behavior instead of merely checking that those controls exist. The mesh
    # includes a sloped region so maintain-elevation drags have a known
    # ground-height delta to assert against (see write_e2e_ground_mesh). The
    # mesh lives in the same synthetic directory as the scans so the whole
    # fixture's on-disk footprint is removed together on shutdown.
    mesh_path = FileSystemPath.from_uri(f"{SYNTHETIC_DIR_URI}/ground_mesh.obj")
    mesh_path.parent.mkdir(parents=True, exist_ok=True)
    write_e2e_ground_mesh(mesh_path)
    gmesh_metadata_domain.create_data(
        current_user=root_user,
        session=session,
        data=GroundMeshMetadataCreate(
            uri=mesh_path.as_uri(),
            group_id=source_group.id,
        ).update_from_transform(Transform.from_optional()),
    )

    labels_by_id = dict(E2E_LABEL_CLASSES)
    # The editor's bbox `G` hotkey default-size path needs one class with
    # default box dimensions. Database XYZ=(2, 3, 4) maps to the editor's
    # Three.js XYZ=(3, 4, 2). Create it (with its defaults) before the label
    # group's class selection so get_or_create_object_class reuses it instead
    # of creating a bare class without default sizes.
    objclass_definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(
            name=DEFAULT_SIZE_CLASS_NAME,
            description="E2E class with explicit bbox defaults.",
            default_size_x=2,
            default_size_y=3,
            default_size_z=4,
        ),
    )
    labels_by_id[DEFAULT_SIZE_CLASS_ID] = DEFAULT_SIZE_CLASS_NAME
    label_branch = create_e2e_label_branch(
        current_user=root_user,
        annotator=annotator,
        session=session,
        labels_by_id=labels_by_id,
    )

    objclass_ids_by_class = {
        class_id: get_or_create_object_class(
            current_user=root_user,
            session=session,
            name=name,
        ).id
        for class_id, name in E2E_LABEL_CLASSES.items()
    }
    seed_e2e_boxes(
        current_user=root_user,
        session=session,
        group_id=label_branch.group_id,
        commit_hash=label_branch.head.hash,
        objclass_ids_by_class=objclass_ids_by_class,
    )

    return source_group, label_branch


def create_editor_fixture(
    *,
    session: Session,
    root_user: UserPublic,
    annotator: UserPublic,
    project_manager: UserPublic,
    source_group_id: int,
    label_branch_id: int,
    label_group_id: int,
    label_commit_hash: str,
) -> list[PointCloudMetadata]:
    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name=FIXTURE_PROJECT_NAME,
            description="Synthetic fixture for annotation editor e2e tests.",
            member_ids=[root_user.id, annotator.id, project_manager.id],
        ),
    )
    session.flush([project])
    assert project.id is not None

    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name=FIXTURE_TASK_NAME,
            description="Point cloud and bounding box control checks.",
            project_id=project.id,
            parent_id=None,
            supervisor_ids=[root_user.id],
            annotator_ids=[root_user.id, annotator.id],
        ),
    )
    session.flush([task])
    assert task.id is not None

    metadatas = sorted(
        pcd_metadata_domain.list_datas_in_bounds(
            current_user=root_user,
            session=session,
            group_id=source_group_id,
        ),
        key=lambda metadata: (metadata.min_timestamp, metadata.id),
    )

    frame_candidates = []
    for metadata in metadatas:
        boxes = bbox_element_domain.list_datas_in_bounds(
            current_user=root_user,
            session=session,
            group_id=label_group_id,
            commit_hash=label_commit_hash,
            st_bounds=metadata.st_bounds,
            limit=1,
        )
        if boxes:
            frame_candidates.append(metadata)
        if len(frame_candidates) >= FRAME_COUNT:
            break

    if not frame_candidates:
        msg = "The synthetic fixture produced no bounding boxes for the e2e frames."
        raise RuntimeError(msg)

    frame_ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                work_type=WorkType.ANNOTATE,
                task_id=task.id,
                account_id=annotator.id,
                source_group_id=source_group_id,
                label_branch_id=label_branch_id,
                min_x=metadata.min_x,
                min_y=metadata.min_y,
                min_z=metadata.min_z,
                max_x=metadata.max_x,
                max_y=metadata.max_y,
                max_z=metadata.max_z,
                min_timestamp=metadata.min_timestamp,
                max_timestamp=metadata.max_timestamp,
            )
            for metadata in frame_candidates
        ],
    )

    alternate_task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name=ALTERNATE_TASK_NAME,
            description="Alternate editor task used to verify task-selector navigation.",
            project_id=project.id,
            parent_id=None,
            supervisor_ids=[root_user.id],
            annotator_ids=[root_user.id, annotator.id],
        ),
    )
    session.flush([alternate_task])
    assert alternate_task.id is not None

    alternate_frame_ids = bulk_create_frames(
        current_user=root_user,
        session=session,
        data=[
            FrameCreate(
                work_type=WorkType.ANNOTATE,
                task_id=alternate_task.id,
                account_id=annotator.id,
                source_group_id=source_group_id,
                label_branch_id=label_branch_id,
                min_x=frame_candidates[0].min_x,
                min_y=frame_candidates[0].min_y,
                min_z=frame_candidates[0].min_z,
                max_x=frame_candidates[0].max_x,
                max_y=frame_candidates[0].max_y,
                max_z=frame_candidates[0].max_z,
                min_timestamp=frame_candidates[0].min_timestamp,
                max_timestamp=frame_candidates[0].max_timestamp,
            ),
        ],
    )

    print(
        f"Seeded editor fixture project_id={project.id} task_id={task.id} frame_ids={frame_ids} "
        f"alternate_task_id={alternate_task.id} alternate_frame_ids={alternate_frame_ids}",
        flush=True,
    )

    return frame_candidates


# E2E pointer-target seeds (see seed_e2e_pointer_targets): 200 points in a
# disk of radius 0.8 is dense enough that the editor's 0.5 world-unit hover
# raycast always finds a point near the projected cluster center.
E2E_SELECTION_POINT_COUNT = 200
E2E_SELECTION_RADIUS = Decimal("0.8")
E2E_GOLDEN_ANGLE = math.pi * (3 - math.sqrt(5))


def clamp_decimal(value: Decimal, lo: Decimal, hi: Decimal) -> Decimal:
    if lo > hi:
        # Degenerate range (e.g. an unusually small frame): stay deterministic.
        return (lo + hi) / Decimal(2)
    return min(max(value, lo), hi)


def e2e_selection_points(
    *,
    center_x: Decimal,
    center_y: Decimal,
    z: Decimal,
) -> list[DecimalCoord3]:
    # Deterministic sunflower disk: no PRNG state that could drift between
    # reseeds.
    points = list[DecimalCoord3]()
    radius = float(E2E_SELECTION_RADIUS)
    for index in range(E2E_SELECTION_POINT_COUNT):
        point_radius = radius * math.sqrt(index / (E2E_SELECTION_POINT_COUNT - 1))
        angle = index * E2E_GOLDEN_ANGLE
        points.append(
            DecimalCoord3(
                x=decimal_coord(float(center_x) + point_radius * math.cos(angle)),
                y=decimal_coord(float(center_y) + point_radius * math.sin(angle)),
                z=z,
            )
        )
    return points


def seed_e2e_pointer_targets(
    *,
    session: Session,
    root_user: UserPublic,
    label_group_id: int,
    label_commit_hash: str,
    frame_metadatas: list[PointCloudMetadata],
) -> None:
    """
    Seeds deterministic pointer-target labels for the with-data editor e2e
    specs, in the same session/commit as the seeded boxes.

    Discovery contract
    ------------------
    Tests address these labels by their deterministic ids (`SEED_IDS` /
    `seededLabelId` in tests/frontend/with-data/editor-helpers.ts), read
    through the single-element label API — never by result order, "first
    label", or parsing bulk payloads captured during navigation.

    Frames are instants: frame_metadatas[i] is t_i, so a label timestamped
    t_i is returned only for frame i. Every seed below is visible from frame
    2 (its own timestamp t2 always lies in frame 2's label window; the
    earlier/later seeds also require the time-path range widened to
    >= 1, which a layer settings commit does).

    Tests resolve the fixture frames through `loadEditorFixture`, which reads
    `/frames/` sorted by `min_timestamp` so `frames[i]` = the frame at t_i.
    Keep that explicit sort on any `/frames/` read (the listing's default is a
    stable spatiotemporal-bounds order, but the invariant tests rely on is
    timestamp order); a frame read that resolves to the wrong frame silently
    excludes these timestamped seeds from the opened frame's label window.
    (Only `/frames/recent` orders by last-viewed date.)

    Anchor O = (ox, oy): the seeded frame-2 box with the smallest id,
    quantized to the bbox coordinate grid, then clamped so that each seed is
    returned by the bulk loaders (inside frame 2's spatial bounds), inside the
    default top-down camera extent (~+-30 m around the origin), and at ox <= 8
    so every seed sits in the flat z=-2 region of the seeded ground mesh (see
    write_e2e_ground_mesh).

    Box centers are stored in decimal columns and are exact. The stored
    extent columns keep the exact values.

    - Transform box: cuboid, size (2, 2, 2), angle 0, center (ox, oy, -0.5) =
      ground (-2) + 1.5, timestamp t2, in its own dedicated track. This is
      the bbox transform/ground-relative drag target.
    - Earlier box: same size/angle/z, center (ox - 9, oy), timestamp t1, own
      track. 9 m from the transform box, so hover raycasts cannot confuse the
      two.
    - Later box: same size/angle/z, center (ox, oy + 9), timestamp t3, own
      track. 9 m from the transform box, in a different direction.
    - Polyline: 3 vertices 5 m apart at z=-1 (1 m above the flat ground),
      timestamp t2, vertices (ox + 3, oy - 4), (ox + 7, oy - 7), (ox + 11,
      oy - 10). It does not intersect any seeded box.
    - Selection: 200 points in a disk of radius 0.8 centered at (ox - 4,
      oy - 6, -1), timestamp t2, a few meters from every other seed. The
      payload keeps all 200 points.

    Ground-mesh reference points for maintain-elevation drags: (0, 0) height
    -2 and (40, 0) height +2 (delta +4).

    All ids are derived from stable_uuid_int, so reseeding reproduces the
    same UUIDs.
    """
    if len(frame_metadatas) < FRAME_COUNT:
        msg = f"The e2e pointer targets need the {FRAME_COUNT} fixture frames (t0..t4)."
        raise RuntimeError(msg)

    t1 = frame_metadatas[1].min_timestamp
    t2 = frame_metadatas[2].min_timestamp
    t3 = frame_metadatas[3].min_timestamp
    assert t1 is not None and t2 is not None and t3 is not None

    # Anchor the seeds at the frame-2 box with the smallest id: it is
    # guaranteed to be inside frame 2's spatial bounds, unlike an arbitrary
    # fixed coordinate.
    frame_bounds = frame_metadatas[2].st_bounds
    dataset_boxes = bbox_element_domain.list_datas_in_bounds(
        current_user=root_user,
        session=session,
        group_id=label_group_id,
        commit_hash=label_commit_hash,
        st_bounds=frame_bounds,
    )
    if not dataset_boxes:
        msg = "No seeded boxes in frame 2 to anchor the e2e pointer targets."
        raise RuntimeError(msg)
    anchor = min(dataset_boxes, key=lambda box: box.id).center

    # Clamp the anchor so the seeded boxes stay inside frame 2's spatial
    # bounds and inside the flat ground region the specs assume.
    anchor_x = clamp_decimal(
        decimal_bbox_coord(float(anchor.x)),
        max(frame_bounds.min_coords.x + Decimal(11), Decimal(-18)),
        min(frame_bounds.max_coords.x - Decimal(12), Decimal(8)),
    )
    anchor_y = clamp_decimal(
        decimal_bbox_coord(float(anchor.y)),
        max(frame_bounds.min_coords.y + Decimal(11), Decimal(-18)),
        min(frame_bounds.max_coords.y - Decimal(11), Decimal(18)),
    )
    z_lo = frame_bounds.min_coords.z + Decimal("0.05")
    z_hi = frame_bounds.max_coords.z - Decimal("0.05")
    box_z = clamp_decimal(Decimal("-0.5"), z_lo, z_hi)
    polyline_z = clamp_decimal(Decimal("-1"), z_lo, z_hi)
    selection_z = clamp_decimal(Decimal("-1"), z_lo, z_hi)

    # Tracks must exist before their boxes: element creation validates the
    # entity within the same group/commit.
    box_specs = (
        ("transform", anchor_x, anchor_y, t2),
        ("earlier", anchor_x - Decimal(9), anchor_y, t1),
        ("later", anchor_x, anchor_y + Decimal(9), t3),
    )
    track_ids = dict[str, UUID]()
    box_ids = dict[str, UUID]()
    for name, center_x, center_y, timestamp in box_specs:
        track_id = UUID(int=stable_uuid_int("e2e-bbox-track", name))
        bbox_entity_domain.create_data(
            current_user=root_user,
            session=session,
            data=LabelTrack(
                id=track_id,
                group_id=label_group_id,
                commit_hash=label_commit_hash,
                is_black=False,
                gt_class_id=None,
            ),
        )
        track_ids[name] = track_id
        box_ids[name] = UUID(int=stable_uuid_int("e2e-bbox-box", name))
        bbox_element_domain.create_data(
            current_user=root_user,
            session=session,
            data=LabelBox.from_bbox(
                id=box_ids[name],
                group_id=label_group_id,
                commit_hash=label_commit_hash,
                type=BoxType.CUBOID,
                center=TruncDecimalCoord3(
                    x=center_x,
                    y=center_y,
                    z=box_z,
                ),
                angle=TruncDecimalCoord(Decimal(0)),
                size=TruncDecimalSize3(
                    x=Decimal(2),
                    y=Decimal(2),
                    z=Decimal(2),
                ),
                timestamp=timestamp,
                entity_id=track_id,
                perceived_class_id=None,
                distinctive_lv=None,
                occlusion_lv=None,
            ),
        )

    polyline_id = UUID(int=stable_uuid_int("e2e-vector-polyline"))
    vector_element_domain.create_data(
        current_user=root_user,
        session=session,
        data=LabelVector.from_vertices(
            id=polyline_id,
            group_id=label_group_id,
            commit_hash=label_commit_hash,
            timestamp=t2,
            vertices=PolylineVertices(
                type=VectorType.POLYLINE,
                coords=[
                    DecimalCoord3(
                        x=anchor_x + Decimal(3),
                        y=anchor_y - Decimal(4),
                        z=polyline_z,
                    ),
                    DecimalCoord3(
                        x=anchor_x + Decimal(7),
                        y=anchor_y - Decimal(7),
                        z=polyline_z,
                    ),
                    DecimalCoord3(
                        x=anchor_x + Decimal(11),
                        y=anchor_y - Decimal(10),
                        z=polyline_z,
                    ),
                ],
            ),
        ),
    )

    selection_center_x = anchor_x - Decimal(4)
    selection_center_y = anchor_y - Decimal(6)
    selection_id = UUID(int=stable_uuid_int("e2e-seg-selection"))
    seg_element_domain.create_data(
        current_user=root_user,
        session=session,
        data=LabelSelection.from_points(
            id=selection_id,
            group_id=label_group_id,
            commit_hash=label_commit_hash,
            points=e2e_selection_points(
                center_x=selection_center_x,
                center_y=selection_center_y,
                z=selection_z,
            ),
            timestamp=t2,
            entity_id=None,
            perceived_class_id=None,
            distinctive_lv=None,
            occlusion_lv=None,
        ),
    )

    print(
        f"Seeded e2e pointer targets "
        f"anchor=({anchor_x}, {anchor_y}) "
        f"transform_track_id={track_ids['transform']} transform_box_id={box_ids['transform']} "
        f"transform_box_center=({anchor_x}, {anchor_y}, {box_z}) "
        f"earlier_track_id={track_ids['earlier']} earlier_box_id={box_ids['earlier']} "
        f"earlier_box_center=({anchor_x - Decimal(9)}, {anchor_y}, {box_z}) "
        f"later_track_id={track_ids['later']} later_box_id={box_ids['later']} "
        f"later_box_center=({anchor_x}, {anchor_y + Decimal(9)}, {box_z}) "
        f"timestamps=(t1={t1.isoformat()}, t2={t2.isoformat()}, t3={t3.isoformat()}) "
        f"polyline_id={polyline_id} polyline_vertex_count=3 "
        f"selection_id={selection_id} selection_point_count={E2E_SELECTION_POINT_COUNT} "
        f"selection_center=({selection_center_x}, {selection_center_y}, {selection_z})",
        flush=True,
    )


def seed_fixture(config: AppConfig, root_user: UserPublic) -> None:
    engine = get_engine(config)
    with Session(engine) as session:
        annotator_record = create_user(
            current_user=root_user,
            session=session,
            data=UserCreate(
                username="e2e-annotator",
                password="password",
                roles={Role.ANNOTATOR},
            ),
        )
        session.flush([annotator_record])
        annotator = UserPublic.model_validate(annotator_record)
        data_manager_record = create_user(
            current_user=root_user,
            session=session,
            data=UserCreate(
                username="e2e-data-manager",
                password="password",
                roles={Role.DATA_MANAGER},
            ),
        )
        project_manager_record = create_user(
            current_user=root_user,
            session=session,
            data=UserCreate(
                username="e2e-project-manager",
                password="password",
                roles={Role.PROJECT_MANAGER},
            ),
        )
        session.flush([data_manager_record, project_manager_record])
        project_manager = UserPublic.model_validate(project_manager_record)
        source_group, label_branch = seed_synthetic_data(
            config=config,
            session=session,
            root_user=root_user,
            annotator=annotator,
        )
        frame_metadatas = create_editor_fixture(
            session=session,
            root_user=root_user,
            annotator=annotator,
            project_manager=project_manager,
            source_group_id=source_group.id,
            label_branch_id=label_branch.id,
            label_group_id=label_branch.group_id,
            label_commit_hash=label_branch.head.hash,
        )
        seed_e2e_pointer_targets(
            session=session,
            root_user=root_user,
            label_group_id=label_branch.group_id,
            label_commit_hash=label_branch.head.hash,
            frame_metadatas=frame_metadatas,
        )
        session.commit()


def remove_synthetic_data(config: AppConfig) -> None:
    """Removes the files this fixture wrote under the filesystem root.

    ``test_app_ctx`` drops the temporary database on exit, but the seeded
    scans and ground mesh persist unless removed here. Best-effort: a failure
    to clean up must not mask the real outcome of the run.
    """
    synthetic_dir = Path(config.fs_config.root) / SYNTHETIC_DIR_URI
    shutil.rmtree(synthetic_dir, ignore_errors=True)


def main() -> None:
    args = parse_args()

    app_config = AppConfig.test()
    frontend_url = resolve_frontend_url(args.frontend_url)
    host, port = args.http

    try:
        with test_app_ctx(app_config, debug=args.debug) as root_user:
            seed_fixture(app_config, root_user)
            api = build_api(frontend_url=frontend_url)
            # Uvicorn's ASGI lifespan shutdown runs when Playwright terminates
            # the web server. Clean up there instead of relying solely on
            # control returning from ``server.serve()`` through its launcher.
            api.add_event_handler(
                "shutdown",
                lambda: remove_synthetic_data(app_config),
            )
            server_config = uvicorn.Config(api, host=host, port=port)
            server_config.load()
            server = uvicorn.Server(server_config)
            asyncio.run(server.serve())
    finally:
        remove_synthetic_data(app_config)


if __name__ == "__main__":
    main()
