"""Import Argoverse 2 Sensor LiDAR sweeps and static vector maps."""

from __future__ import annotations

import json
import os
import shutil
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from multiprocessing import get_context
from pathlib import Path
from tempfile import mkdtemp
from typing import Any
from uuid import NAMESPACE_URL, uuid5

import click
from pyarrow import feather
from tqdm import tqdm

import numpy as np
import numpy.typing as npt

from sqlmodel import Session

from sta.cli.prompts import prompt_login
from sta.common.spatial import DecimalCoord3, Transform
from sta.domain.label.spec.objclass import (
    definitions as objclass_definitions,
    selections as objclass_selections,
)
from sta.domain.source.groups import create_group
from sta.entrypoints import app_ctx
from sta.models.source.group import SourceGroupCreate
from sta.models.user import User, UserPublic
from sta.session import dispose_engine, session_ctx
from sta_pcd.domain.source.data import metadata as pcd_metadata
from sta_pcd.domain.source.spec import specs as pcd_specs
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.source.data import PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudSpecCreate
from sta_vector.domain.label.data import element as vector_domain
from sta_vector.models.label.data import (
    LabelVector,
    PolygonVertices,
    PolylineVertices,
    VectorType,
)

from .common import (
    config_path_option,
    create_label_import_branch,
    decimal_coord,
    get_or_create_object_class,
    load_app_config,
    object_class_has_external_references,
    resolve_config_path,
)

CHANNELS = ["x", "y", "z", "intensity"]
POSE_COLUMNS = ["timestamp_ns", "qw", "qx", "qy", "qz", "tx_m", "ty_m", "tz_m"]


@dataclass(frozen=True)
class MapVector:
    key: str
    class_name: str
    kind: VectorType
    xyz: npt.NDArray[np.float64]


@dataclass(frozen=True)
class LogImportTask:
    config_path: str
    log_dir: str
    sweep_names: tuple[str, ...]
    name: str
    user_id: int
    skip_labels: bool


def import_log_worker(task: LogImportTask) -> str:
    """Import one log with a worker-owned application context and transaction."""
    config = load_app_config(Path(task.config_path))
    log = Path(task.log_dir)
    try:
        with app_ctx(config), session_ctx(config) as session:
            record = session.get(User, task.user_id)
            if record is None:
                msg = f"Cannot find import user #{task.user_id}"
                raise RuntimeError(msg)
            import_log(
                log=log,
                sweeps=[log / "sensors" / "lidar" / name for name in task.sweep_names],
                vectors=[] if task.skip_labels else read_map(log),
                fs_root=Path(os.path.normpath(config.fs_config.root.absolute())),
                name=task.name,
                user=UserPublic.model_validate(record),
                session=session,
            )
    finally:
        dispose_engine(config)
    return str(log)


def run_log_imports(tasks: list[LogImportTask], workers: int) -> list[str]:
    """Run complete logs serially or in spawned processes, joining before cleanup."""
    if workers == 1:
        return [import_log_worker(task) for task in tasks]
    results: list[str] = []
    with ProcessPoolExecutor(max_workers=workers, mp_context=get_context("spawn")) as executor:
        futures = [executor.submit(import_log_worker, task) for task in tasks]
        try:
            for future in tqdm(as_completed(futures), total=len(tasks), desc="Importing logs"):
                results.append(future.result())
        except BaseException:
            for pending in futures:
                pending.cancel()
            raise
    return sorted(results)


def select_logs(root: Path, requested: tuple[str, ...]) -> list[Path]:
    """Find extracted logs directly under ROOT or its train/val/test splits."""
    if (root / "sensors" / "lidar").is_dir():
        candidates = [root]
    else:
        candidates = sorted(
            {
                path.parent.parent
                for pattern in ("*/sensors/lidar", "*/*/sensors/lidar")
                for path in root.glob(pattern)
                if path.is_dir()
            }
        )
    wanted = {value for option in requested for value in option.replace(",", " ").split()}
    missing = wanted - {path.name for path in candidates}
    if missing:
        msg = f"Missing extracted sensor logs: {', '.join(sorted(missing))}"
        raise click.ClickException(msg)
    selected = [path for path in candidates if not wanted or path.name in wanted]
    if not selected:
        msg = f"No extracted Argoverse 2 sensor logs found under {root}"
        raise click.ClickException(msg)
    return selected


def select_sweeps(log: Path, stride: int, max_frames: int | None) -> list[Path]:
    paths = sorted((log / "sensors" / "lidar").glob("*.feather"), key=lambda p: int(p.stem))
    paths = paths[::stride][:max_frames]
    if not paths:
        msg = f"No LiDAR sweeps found in {log}"
        raise ValueError(msg)
    return paths


def read_poses(log: Path) -> dict[int, tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]]]:
    """Read city_SE3_egovehicle, using AV2's scalar-first quaternions."""
    rows = feather.read_table(log / "city_SE3_egovehicle.feather", columns=POSE_COLUMNS).to_pylist()
    poses = {}
    for row in rows:
        quaternion = np.array([row[name] for name in POSE_COLUMNS[1:5]], dtype=np.float64)
        norm = np.linalg.norm(quaternion)
        if not np.isfinite(norm) or norm == 0:
            msg = f"Invalid pose quaternion in {log.name} at {row['timestamp_ns']}"
            raise ValueError(msg)
        w, x, y, z = quaternion / norm
        rotation = np.array(
            [
                [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
            ]
        )
        translation = np.array([row[name] for name in POSE_COLUMNS[5:]], dtype=np.float64)
        if not np.isfinite(translation).all():
            msg = f"Invalid pose translation in {log.name} at {row['timestamp_ns']}"
            raise ValueError(msg)
        poses[int(row["timestamp_ns"])] = (rotation, translation)
    return poses


def read_points(path: Path) -> npt.NDArray[np.float64]:
    table = feather.read_table(path, columns=CHANNELS)
    points = np.column_stack([table[name].to_numpy() for name in CHANNELS]).astype(np.float64)
    if len(points) == 0 or not np.isfinite(points).all():
        msg = f"Empty or non-finite LiDAR sweep: {path}"
        raise ValueError(msg)
    return points


def _positions(values: list[dict[str, Any]], minimum: int) -> npt.NDArray[np.float64]:
    xyz = np.array(
        [[point[axis] for axis in ("x", "y", "z")] for point in values], dtype=np.float64
    )
    if xyz.shape != (len(values), 3) or len(xyz) < minimum or not np.isfinite(xyz).all():
        msg = "Invalid vector map coordinates"
        raise ValueError(msg)
    return xyz


def read_map(log: Path) -> list[MapVector]:
    """Read native AV2 JSON without requiring the full AV2 SDK."""
    paths = sorted((log / "map").glob("log_map_archive_*.json"))
    if len(paths) != 1:
        msg = f"Expected one map/log_map_archive_*.json in {log}; found {len(paths)}"
        raise ValueError(msg)
    data = json.loads(paths[0].read_text())
    vectors = []
    # Boundaries shared by adjacent lanes are represented only once per class.
    boundaries: set[tuple[str, bytes]] = set()
    for key, lane in sorted(data["lane_segments"].items()):
        for side in ("left", "right"):
            xyz = _positions(lane[f"{side}_lane_boundary"], 2)
            name = f"lane-boundary/{lane[f'{side}_lane_mark_type'].lower()}"
            signature = (name, min(xyz.tobytes(), xyz[::-1].tobytes()))
            if signature in boundaries:
                continue
            boundaries.add(signature)
            vectors.append(MapVector(f"lane/{key}/{side}", name, VectorType.POLYLINE, xyz))
    for key, crossing in sorted(data["pedestrian_crossings"].items()):
        first = _positions(crossing["edge1"], 2)
        second = _positions(crossing["edge2"], 2)
        xyz = np.concatenate([first, second[::-1]])
        vectors.append(MapVector(f"crosswalk/{key}", "crosswalk", VectorType.POLYGON, xyz))
    for key, area in sorted(data["drivable_areas"].items()):
        xyz = _positions(area["area_boundary"], 3)
        vectors.append(MapVector(f"drivable/{key}", "drivable-area", VectorType.POLYGON, xyz))
    return vectors


def frame_timestamp(timestamp_ns: int) -> datetime:
    # Avoid rounding through a float; the application's timestamp precision is microseconds.
    return datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(microseconds=timestamp_ns // 1000)


def aligned_points(
    path: Path,
    pose: tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]],
    origin: npt.NDArray[np.float64],
) -> npt.NDArray[np.float32]:
    points = read_points(path)
    rotation, translation = pose
    points[:, :3] = points[:, :3] @ rotation.T + translation - origin
    return points.astype("<f4")


def import_log(
    *,
    log: Path,
    sweeps: list[Path],
    vectors: list[MapVector],
    fs_root: Path,
    name: str,
    user: UserPublic,
    session: Session,
) -> None:
    """Commit one complete log; rollback and remove its converted files on failure."""
    poses = read_poses(log)
    origin = poses[int(sweeps[0].stem)][1]
    output_parent = log / ".sta-imports"
    output_parent.mkdir(exist_ok=True)
    output = Path(mkdtemp(prefix="pointclouds-", dir=output_parent))
    try:
        group_name = f"{name} {log.name}"
        source = create_group(
            current_user=user,
            session=session,
            data=SourceGroupCreate(name=group_name, description="Argoverse 2 Sensor LiDAR"),
        )
        session.flush([source])
        assert source.id is not None
        pcd_specs.create_spec(
            current_user=user,
            session=session,
            data=PointCloudSpecCreate(
                name=f"{group_name} point cloud",
                group_ids=[source.id],
                config=PointCloudConfig.default(),
            ),
        )
        if vectors:
            branch = create_label_import_branch(
                current_user=user,
                session=session,
                group_name=group_name,
                branch_name="main",
                labels_by_id=dict(enumerate(sorted({v.class_name for v in vectors}))),
                description="Argoverse 2 static vector map",
                objclass_description="Argoverse 2 map classes",
            )
            spec = objclass_selections.read_spec_in_group(
                current_user=user,
                session=session,
                group_id=branch.group_id,
            )
            assert spec is not None
            classes = {objclass.name: objclass.id for objclass in spec.objclasses}
            # Bound batches by number of vectors rather than holding a whole map's ORM rows.
            for start in range(0, len(vectors), 100):
                labels = []
                for vector in vectors[start : start + 100]:
                    coords = [
                        DecimalCoord3(x=decimal_coord(x), y=decimal_coord(y), z=decimal_coord(z))
                        for x, y, z in vector.xyz - origin
                    ]
                    vertices = (
                        PolylineVertices(type=VectorType.POLYLINE, coords=coords)
                        if vector.kind is VectorType.POLYLINE
                        else PolygonVertices(type=VectorType.POLYGON, coords=coords)
                    )
                    labels.append(
                        LabelVector.from_vertices(
                            id=uuid5(NAMESPACE_URL, f"argoverse2:{log.name}:{vector.key}"),
                            group_id=branch.group_id,
                            commit_hash=branch.head.hash,
                            vertices=vertices,
                            timestamp=None,
                            gt_class_id=classes[vector.class_name],
                        )
                    )
                vector_domain.bulk_create_datas(current_user=user, session=session, data=labels)
        for path in tqdm(sweeps, desc=f"Importing {log.name}"):
            points = aligned_points(path, poses[int(path.stem)], origin)
            destination = output / f"{path.stem}.bin"
            points.tofile(destination)
            xyz = points[:, :3]
            minimum, maximum = xyz.min(axis=0), xyz.max(axis=0)
            timestamp = frame_timestamp(int(path.stem))
            pcd_metadata.bulk_create_datas(
                current_user=user,
                session=session,
                data=[
                    PointCloudMetadataCreate(
                        group_id=source.id,
                        uri=destination.relative_to(fs_root).as_posix(),
                        auto_bounds=False,
                        weather=None,
                        min_x=decimal_coord(minimum[0]),
                        min_y=decimal_coord(minimum[1]),
                        min_z=decimal_coord(minimum[2]),
                        max_x=decimal_coord(maximum[0]),
                        max_y=decimal_coord(maximum[1]),
                        max_z=decimal_coord(maximum[2]),
                        min_timestamp=timestamp,
                        max_timestamp=timestamp,
                    ).update_from_transform(Transform.from_optional())
                ],
            )
        session.commit()
    except BaseException:
        session.rollback()
        shutil.rmtree(output)
        raise
    click.echo(
        f"Imported {log.name}: {len(sweeps)} frames, {len(vectors)} vectors; source group #{source.id}"
    )


@click.command()
@click.argument("data_dir", type=click.Path(exists=True, file_okay=False, path_type=Path))
@config_path_option()
@click.option("--log", "logs", multiple=True, help="Log ID; repeat or use comma-separated IDs.")
@click.option("--name", default="Argoverse 2", show_default=True, help="Group name prefix.")
@click.option("--stride", type=click.IntRange(min=1), default=1, show_default=True)
@click.option(
    "--max-frames", type=click.IntRange(min=1), help="Maximum sweeps per log after stride."
)
@click.option("--skip-labels", is_flag=True, help="Import point clouds only; no map required.")
@click.option(
    "--workers",
    type=click.IntRange(min=1),
    default=8,
    show_default=True,
    help="Import complete logs using this many worker processes.",
)
@click.option(
    "--dry-run", is_flag=True, help="Validate without login, database writes, or conversion files."
)
def cli(
    data_dir: Path,
    config_path: Path | None,
    logs: tuple[str, ...],
    name: str,
    stride: int,
    max_frames: int | None,
    workers: int,
    *,
    skip_labels: bool,
    dry_run: bool,
) -> None:
    """Import extracted Argoverse 2 Sensor logs from DATA_DIR.

    Each log gets separate source and label groups. Sweeps and static maps share
    city axes with the first selected sweep's vehicle position as their origin.
    """
    try:
        data_dir = Path(os.path.normpath(data_dir.absolute()))
        selected = select_logs(data_dir, logs)
        config_path = resolve_config_path(config_path)
        if config_path is None and not dry_run:
            msg = "--config is required unless --dry-run is used"
            raise click.UsageError(msg)
        # Validate selections, maps and all exact pose matches before creating resources.
        prepared = []
        class_names: set[str] = set()
        for log in selected:
            sweeps = select_sweeps(log, stride, max_frames)
            vectors = [] if skip_labels else read_map(log)
            poses = read_poses(log)
            for path in sweeps:
                if int(path.stem) not in poses:
                    msg = f"Missing exact vehicle pose for {path}"
                    raise ValueError(msg)
                if dry_run:
                    read_points(path)
            class_names.update(vector.class_name for vector in vectors)
            # Workers read maps locally instead of pickling or retaining every map.
            prepared.append((log, sweeps))
            click.echo(f"{log.name}: {len(sweeps)} selected frames, {len(vectors)} map vectors")
        if dry_run:
            click.echo(f"Validated {len(prepared)} logs")
            return
        assert config_path is not None
        config = load_app_config(config_path)
        fs_root = Path(os.path.normpath(config.fs_config.root.absolute()))
        if not data_dir.is_relative_to(fs_root):
            msg = "Argoverse 2 data must be inside the configured filesystem root"
            raise click.ClickException(msg)
        with app_ctx(config), session_ctx(config) as session:
            user = prompt_login(session)
            created_ids: set[int] = set()
            # Shared classes must be visible before workers create their per-log
            # branches, otherwise concurrent logs can race on the unique class name.
            for class_name in sorted(class_names):
                get_or_create_object_class(
                    current_user=user,
                    session=session,
                    name=class_name,
                    created_ids=created_ids,
                )
            session.commit()
        tasks = [
            LogImportTask(
                config_path=str(config_path.absolute()),
                log_dir=str(log),
                sweep_names=tuple(path.name for path in sweeps),
                name=name,
                user_id=user.id,
                skip_labels=skip_labels,
            )
            for log, sweeps in prepared
        ]
        try:
            run_log_imports(tasks, workers)
        finally:
            # Pool shutdown joins running workers before we decide which classes
            # their committed logs still reference. Match the other importers'
            # retirement policy so a retry can reactivate unused classes.
            try:
                if created_ids:
                    with app_ctx(config), session_ctx(config) as session:
                        for class_id in sorted(created_ids):
                            if not object_class_has_external_references(session, class_id):
                                objclass_definitions.delete_objclass(
                                    current_user=user,
                                    session=session,
                                    id=class_id,
                                )
                        session.commit()
            finally:
                dispose_engine(config)
    except (OSError, ValueError, KeyError) as error:
        raise click.ClickException(str(error)) from error


if __name__ == "__main__":
    cli()
