"""Import 3RScan point clouds, object geometry, and 3DSSG relationships."""

from __future__ import annotations

import json
import os
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from multiprocessing import get_context
from pathlib import Path
from typing import Any

import click
from tqdm import tqdm

import numpy as np
import numpy.typing as npt

from plyfile import PlyData, PlyParseError

from sqlmodel import Session, select

from sta.cli.prompts import prompt_login
from sta.common.spatial import Transform
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.spec.objclass import selections as objclass_selections
from sta.domain.source.groups import create_group
from sta.entrypoints import app_ctx
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.source.group import SourceGroupCreate
from sta.models.user import User, UserPublic
from sta.session import dispose_engine, session_ctx
from sta_bbox.models.label.data import LabelTrack
from sta_pcd.domain.source.data import metadata as pcd_metadata
from sta_pcd.domain.source.spec import specs as pcd_specs
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.source.data import PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudSpecCreate
from sta_relation.domain.classes import (
    definitions as relclass_definitions,
    selections as relclass_selections,
)
from sta_relation.domain.data import domain as relation_domain
from sta_relation.models.classes import (
    RelationClass,
    RelationClassBulkUpdate,
    RelationClassCreate,
    RelationClassSelectionAssociation,
    RelationClassSelectionCreate,
)
from sta_relation.models.data import Relation
from sta_segmentation.models.label.data import LabelInstance

from .common import (
    cleanup_failed_import_in_session,
    create_label_import_branch,
    decimal_coord,
    dummy_frame_timestamp,
    flush_label_batch,
    label_box_from_xyz,
    label_selection_from_xyz,
    load_app_config,
    resolve_config_path,
)

PLY_NAME = "labels.instances.annotated.v2.ply"
ANNOTATION_NAME = "semseg.v2.json"
# Vocabulary in https://www.campar.in.tum.de/public_datasets/3DSSG/3DSSG_subset/relationships.txt
RELATION_CLASSES = (
    "none",
    "supported by",
    "left",
    "right",
    "front",
    "behind",
    "close by",
    "inside",
    "bigger than",
    "smaller than",
    "higher than",
    "lower than",
    "same symmetry as",
    "same as",
    "attached to",
    "standing on",
    "lying on",
    "hanging on",
    "connected to",
    "leaning against",
    "part of",
    "belonging to",
    "build in",
    "standing in",
    "cover",
    "lying in",
    "hanging in",
)
CHANNELS = ["x", "y", "z", "red", "green", "blue"]


def select_scans(root: Path, scans: tuple[str, ...]) -> list[str]:
    """Select annotated scan directories in deterministic order."""
    available = {path.parent.name for path in root.glob(f"*/{PLY_NAME}")}
    requested = {scan for raw in scans for scan in raw.replace(",", " ").split()}
    missing = requested - available
    if missing:
        msg = f"Missing annotated PLY files for scans: {sorted(missing)}"
        raise click.ClickException(msg)
    selected = sorted(requested or available)
    if not selected:
        msg = f"No {PLY_NAME} files found under {root}"
        raise click.ClickException(msg)
    return selected


def read_annotations(path: Path) -> dict[int, str]:
    """Map scan-local object IDs to the dataset's original class names."""
    data = json.loads(path.read_text())
    labels: dict[int, str] = {}
    for group in data["segGroups"]:
        object_id, label = group["objectId"], group["label"]
        if (
            not isinstance(object_id, int)
            or object_id <= 0
            or not isinstance(label, str)
            or not label
        ):
            msg = f"Invalid objectId/label in {path}"
            raise ValueError(msg)
        if object_id in labels and labels[object_id] != label:
            msg = f"Conflicting labels for object {object_id} in {path}"
            raise ValueError(msg)
        labels[object_id] = label
    return labels


def read_relations(path: Path, scans: list[str]) -> dict[str, list[tuple[int, int, str]]]:
    """Read directed edges, merging and deduplicating scan subgraphs."""
    try:
        data = json.loads(path.read_text())
    except FileNotFoundError as error:
        download_root = "https://www.campar.in.tum.de/public_datasets/3DSSG/3DSSG_subset"
        msg = (
            f"Missing {path}. Download relationships.json from "
            f"{download_root}/relationships.json and save it to {path}, then rerun the import."
        )
        raise click.ClickException(msg) from error
    result: dict[str, set[tuple[int, int, str]]] = {scan: set() for scan in scans}
    for graph in data["scans"]:
        scan = graph["scan"]
        if scan not in result:
            continue
        for source, target, class_index, name in graph["relationships"]:
            if (
                not isinstance(class_index, int)
                or not 0 <= class_index < len(RELATION_CLASSES)
                or RELATION_CLASSES[class_index] != name
            ):
                msg = f"Invalid 3DSSG relation class in scan {scan}: {class_index}, {name}"
                raise ValueError(msg)
            if (
                not isinstance(source, int)
                or not isinstance(target, int)
                or source <= 0
                or target <= 0
            ):
                msg = f"Invalid 3DSSG relation endpoints in scan {scan}: {source}, {target}"
                raise ValueError(msg)
            if source == target:
                click.echo(
                    f"Skipping self-relation in scan {scan}: object {source}, {name}", err=True
                )
                continue
            result[scan].add((source, target, name))
    return {scan: sorted(edges) for scan, edges in result.items()}


def validate_relations(
    instances: npt.NDArray[Any], edges: list[tuple[int, int, str]], scan: str
) -> list[tuple[int, int, str]]:
    """Skip relationships whose endpoints have no imported geometry."""
    missing = {id for source, target, _ in edges for id in (source, target)} - set(
        map(int, np.unique(instances))
    )
    if missing:
        kept = [edge for edge in edges if edge[0] not in missing and edge[1] not in missing]
        click.echo(
            f"Skipping {len(edges) - len(kept)} relations in scan {scan}: "
            f"missing endpoint geometry for objects {sorted(missing)}",
            err=True,
        )
        return kept
    return edges


def read_points(path: Path) -> tuple[npt.NDArray[Any], npt.NDArray[Any]]:
    """Read vertex positions and object IDs from ASCII or binary annotated PLY."""
    vertices = PlyData.read(str(path))["vertex"].data
    required = {*CHANNELS, "objectId"}
    if not required.issubset(vertices.dtype.names or ()):
        msg = f"Missing annotated PLY vertex fields in {path}: {sorted(required - set(vertices.dtype.names or ()))}"
        raise ValueError(msg)
    xyz = np.column_stack([vertices[channel] for channel in CHANNELS[:3]])
    instances = np.asarray(vertices["objectId"])
    if len(xyz) == 0 or not np.isfinite(xyz).all():
        msg = f"Empty or non-finite point cloud: {path}"
        raise ValueError(msg)
    if not np.issubdtype(instances.dtype, np.integer) or np.any(instances < 0):
        msg = f"Invalid objectId values in {path}"
        raise ValueError(msg)
    return xyz, instances


def validate_instances(instances: npt.NDArray[Any], labels: dict[int, str], scan: str) -> None:
    missing = set(map(int, np.unique(instances))) - labels.keys() - {0}
    if missing:
        msg = f"Missing class labels for scan {scan}, objects {sorted(missing)}"
        raise ValueError(msg)


def label_uuid(kind: str, scan: str, object_id: int) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"3rscan:{kind}:{scan}:{object_id}")


def import_object_labels(
    *,
    scan: str,
    xyz: npt.NDArray[Any],
    instances: npt.NDArray[Any],
    labels: dict[int, str],
    class_ids: dict[str, int],
    branch: LabelsetBranchPublic,
    timestamp: datetime,
    user: UserPublic,
    session: Session,
    types: set[str],
) -> None:
    """Insert scan-local entities and their geometry, one object at a time."""
    # Sorting once avoids rescanning every vertex for every object.
    order = np.argsort(instances)
    sorted_ids = instances[order]
    starts = np.r_[0, np.flatnonzero(sorted_ids[1:] != sorted_ids[:-1]) + 1]
    ends = np.r_[starts[1:], len(order)]
    for start, end in zip(starts, ends, strict=True):
        object_id = int(sorted_ids[start])
        if object_id == 0:
            continue  # 3RScan uses zero for unannotated vertices.
        points = xyz[order[start:end]]
        class_id = class_ids[labels[object_id]]
        instance_id = label_uuid("instance", scan, object_id)
        track_id = label_uuid("track", scan, object_id)
        flush_label_batch(
            current_user=user,
            session=session,
            instance_items=[
                LabelInstance(
                    id=instance_id,
                    group_id=branch.group_id,
                    commit_hash=branch.head.hash,
                    is_black=False,
                    gt_class_id=class_id,
                )
            ]
            if "segmentation" in types
            else [],
            selection_items=[
                label_selection_from_xyz(
                    id=label_uuid("selection", scan, object_id),
                    entity_id=instance_id,
                    group_id=branch.group_id,
                    commit_hash=branch.head.hash,
                    xyz=points,
                    timestamp=timestamp,
                    perceived_class_id=class_id,
                )
            ]
            if "segmentation" in types
            else [],
            track_items=[
                LabelTrack(
                    id=track_id,
                    group_id=branch.group_id,
                    commit_hash=branch.head.hash,
                    is_black=False,
                    gt_class_id=class_id,
                )
            ]
            if "bbox" in types
            else [],
            box_items=[
                label_box_from_xyz(
                    id=label_uuid("box", scan, object_id),
                    entity_id=track_id,
                    group_id=branch.group_id,
                    commit_hash=branch.head.hash,
                    xyz=points,
                    timestamp=timestamp,
                    perceived_class_id=class_id,
                )
            ]
            if "bbox" in types
            else [],
        )


@dataclass(frozen=True)
class ScanImportTask:
    config_path: str
    data_dir: str
    scan: str
    frame_index: int
    source_group_id: int
    label_branch_id: int | None
    user_id: int
    labels: dict[int, str]
    edges: list[tuple[int, int, str]]
    relation_class_ids: dict[str, int]
    types: set[str]


def import_scan_worker(task: ScanImportTask) -> str:
    """Import one scan in a worker-owned application context and transaction."""
    config = load_app_config(Path(task.config_path))
    data_dir = Path(task.data_dir)
    fs_root = Path(os.path.normpath(config.fs_config.root.absolute()))
    scan, index = task.scan, task.frame_index
    source_id = task.source_group_id
    types = task.types
    relation_class_ids = task.relation_class_ids
    try:
        with app_ctx(config), session_ctx(config) as session:
            user_record = session.get(User, task.user_id)
            if user_record is None:
                msg = f"Cannot find import user #{task.user_id}"
                raise RuntimeError(msg)
            user = UserPublic.model_validate(user_record)
            branch = None
            class_ids: dict[str, int] = {}
            if task.label_branch_id is not None:
                branch = LabelsetBranchPublic.model_validate(
                    read_branch(current_user=user, session=session, id=task.label_branch_id)
                )
                spec = objclass_selections.read_spec_in_group(
                    current_user=user, session=session, group_id=branch.group_id
                )
                assert spec is not None
                for objclass in spec.objclasses:
                    assert objclass.id is not None
                    class_ids[objclass.name] = objclass.id
            try:
                path = data_dir / scan / PLY_NAME
                xyz, instances = read_points(path)
                if branch is not None:
                    validate_instances(instances, task.labels, scan)
                scan_edges = validate_relations(instances, task.edges, scan)
                timestamp = dummy_frame_timestamp(index)
                minimum, maximum = xyz.min(axis=0), xyz.max(axis=0)
                # Explicit bounds are exact for our identity transform and no preprocessors.
                pcd_metadata.bulk_create_datas(
                    current_user=user,
                    session=session,
                    data=[
                        PointCloudMetadataCreate(
                            group_id=source_id,
                            uri=path.relative_to(fs_root).as_posix(),
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
                if branch is not None:
                    import_object_labels(
                        scan=scan,
                        xyz=xyz,
                        instances=instances,
                        labels=task.labels,
                        class_ids=class_ids,
                        branch=branch,
                        timestamp=timestamp,
                        user=user,
                        session=session,
                        types=types,
                    )
                    if scan_edges:
                        kind = "selection" if "segmentation" in types else "box"
                        relation_domain.bulk_create_datas(
                            current_user=user,
                            session=session,
                            data=[
                                Relation.model_validate(
                                    {
                                        "id": uuid.uuid5(
                                            uuid.NAMESPACE_URL,
                                            f"3rscan:relation:{scan}:{source}:{target}:{relation_name}",
                                        ),
                                        "group_id": branch.group_id,
                                        "commit_hash": branch.head.hash,
                                        "source_type": kind,
                                        "source_id": label_uuid(kind, scan, source),
                                        "target_type": kind,
                                        "target_id": label_uuid(kind, scan, target),
                                        "relation_class_id": relation_class_ids[relation_name],
                                    }
                                )
                                for source, target, relation_name in scan_edges
                            ],
                        )
                session.commit()
            except BaseException:
                session.rollback()
                raise
    finally:
        dispose_engine(config)
    return scan


def run_scan_imports(tasks: list[ScanImportTask], workers: int) -> list[str]:
    """Import scans serially or with spawned processes, waiting before cleanup."""
    if workers == 1:
        return [import_scan_worker(task) for task in tqdm(tasks, desc="Importing scans")]

    results: list[str] = []
    # Spawn keeps coordinator database connections and application contexts out
    # of workers. Exiting the pool waits for running tasks before cleanup starts.
    with ProcessPoolExecutor(max_workers=workers, mp_context=get_context("spawn")) as executor:
        futures = [executor.submit(import_scan_worker, task) for task in tasks]
        try:
            for future in tqdm(as_completed(futures), total=len(tasks), desc="Importing scans"):
                results.append(future.result())
        except BaseException:
            for pending in futures:
                pending.cancel()
            raise
    return sorted(results)


@click.command()
@click.argument(
    "data_dir", type=click.Path(exists=True, file_okay=False, path_type=Path), default="data/3RScan"
)
@click.option(
    "-c",
    "--config",
    "config_path",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="Application configuration; required unless --dry-run.",
)
@click.option("--scan", "scans", multiple=True, help="Scan ID; repeat or comma-separate.")
@click.option(
    "--name", default="3rscan", show_default=True, help="New source and label group name."
)
@click.option(
    "--label-type",
    "label_types",
    multiple=True,
    type=click.Choice(["segmentation", "bbox", "relations"]),
    help="Repeat to combine types. Default: segmentation. Relations add segmentation unless bbox is selected.",
)
@click.option(
    "--workers",
    type=click.IntRange(min=1),
    default=8,
    show_default=True,
    help="Import complete scans using this many worker processes. Use 1 to run serially.",
)
@click.option("--skip-labels", is_flag=True, help="Import point-cloud sources only.")
@click.option(
    "--dry-run", is_flag=True, help="Validate selected scans without login or database writes."
)
def cli(
    data_dir: Path,
    config_path: Path | None,
    scans: tuple[str, ...],
    name: str,
    label_types: tuple[str, ...],
    *,
    skip_labels: bool,
    dry_run: bool,
    workers: int,
) -> None:
    """Import 3RScan annotated scans from DATA_DIR.

    Sources reference the original annotated PLY files. Their RGB values are
    annotation colors, not the textured mesh's photographic colors. Coordinates
    remain scan-local. RGB-D sequences, meshes and rescan registration are omitted.
    """
    try:
        config_path = resolve_config_path(config_path)
        if config_path is None and not dry_run:
            msg = "--config is required unless --dry-run is used"
            raise click.UsageError(msg)
        # Preserve filesystem symlinks while normalizing paths used with uv --directory.
        data_dir = Path(os.path.normpath(data_dir.absolute()))
        selected = select_scans(data_dir, scans)
        types = set(label_types) or {"segmentation"}
        if "relations" in types and not types & {"segmentation", "bbox"}:
            types.add("segmentation")
        edges_by_scan = (
            read_relations(data_dir / "relationships.json", selected)
            if "relations" in types and not skip_labels
            else {}
        )
        labels_by_scan: dict[str, dict[int, str]] = {}
        for scan in selected:
            labels_by_scan[scan] = (
                {} if skip_labels else read_annotations(data_dir / scan / ANNOTATION_NAME)
            )
        class_names = sorted(
            {label for labels in labels_by_scan.values() for label in labels.values()}
        )
        if dry_run:
            for scan in tqdm(selected, desc="Validating scans"):
                xyz, instances = read_points(data_dir / scan / PLY_NAME)
                if not skip_labels:
                    validate_instances(instances, labels_by_scan[scan], scan)
                    validate_relations(instances, edges_by_scan.get(scan, []), scan)
                click.echo(
                    f"{scan}: {len(xyz)} vertices, {len(labels_by_scan[scan])} annotated objects"
                )
            click.echo(f"Validated {len(selected)} scans and {len(class_names)} object classes")
            return
        assert config_path is not None
        config = load_app_config(config_path)
        fs_root = Path(os.path.normpath(config.fs_config.root.absolute()))
        if not data_dir.is_relative_to(fs_root):
            msg = (
                f"3RScan data must be accessible inside the configured filesystem root: {data_dir}"
            )
            raise click.ClickException(msg)
        created_ids: set[int] = set()
        created_relclass_ids: set[int] = set()
        relation_class_ids: dict[str, int] = {}
        # Workers load shared resources through independent sessions, so commit
        # them and close the coordinator session before starting the pool.
        with app_ctx(config), session_ctx(config) as session:
            user = prompt_login(session)
            source = create_group(
                current_user=user,
                session=session,
                data=SourceGroupCreate(name=name, description="3RScan annotated PLY point clouds"),
            )
            session.flush([source])
            assert source.id is not None
            pcd_specs.create_spec(
                current_user=user,
                session=session,
                data=PointCloudSpecCreate(
                    name=f"{name} point cloud",
                    group_ids=[source.id],
                    config=PointCloudConfig(channel_headers=CHANNELS, dtype="float32"),
                ),
            )
            branch = None
            if not skip_labels:
                branch = create_label_import_branch(
                    current_user=user,
                    session=session,
                    group_name=name,
                    branch_name="main",
                    labels_by_id=dict(enumerate(class_names)),
                    created_objclass_ids=created_ids,
                    description="3RScan object labels",
                    objclass_description="3RScan object classes",
                )
                if "relations" in types:
                    for class_name in RELATION_CLASSES:
                        record = session.exec(
                            select(RelationClass).where(RelationClass.name == class_name)
                        ).one_or_none()
                        if record is None:
                            record = relclass_definitions.create_relclass(
                                current_user=user,
                                session=session,
                                data=RelationClassCreate(
                                    name=class_name, description="3DSSG relation class"
                                ),
                            )
                            assert record.id is not None
                            created_relclass_ids.add(record.id)
                        elif record.is_deleted:
                            assert record.id is not None
                            if any(
                                session.exec(
                                    select(column).where(column == record.id).limit(1)
                                ).first()
                                is not None
                                for column in (
                                    RelationClassSelectionAssociation.relclass_id,
                                    Relation.relation_class_id,
                                )
                            ):
                                msg = f"Relation class is retired: {class_name}"
                                raise ValueError(msg)
                            relclass_definitions.bulk_update_relclasses(
                                current_user=user,
                                session=session,
                                ids={record.id},
                                data=RelationClassBulkUpdate(is_deleted=False),
                            )
                            created_relclass_ids.add(record.id)
                        assert record.id is not None
                        relation_class_ids[class_name] = record.id
                    relclass_selections.create_spec(
                        current_user=user,
                        session=session,
                        data=RelationClassSelectionCreate(
                            name=f"{name} relation classes",
                            group_ids=[branch.group_id],
                            relclass_ids=list(relation_class_ids.values()),
                        ),
                    )
            source_id = source.id
            label_id = None if branch is None else branch.group_id
            session.commit()
            user_id = user.id
            branch_id = None if branch is None else branch.id
        tasks = [
            ScanImportTask(
                config_path=str(config_path.absolute()),
                data_dir=str(data_dir),
                scan=scan,
                frame_index=index,
                source_group_id=source_id,
                label_branch_id=branch_id,
                user_id=user_id,
                labels=labels_by_scan[scan],
                edges=edges_by_scan.get(scan, []),
                relation_class_ids=relation_class_ids,
                types=types,
            )
            for index, scan in enumerate(selected)
        ]
        try:
            run_scan_imports(tasks, workers)
        except BaseException as import_error:
            try:
                with app_ctx(config), session_ctx(config) as session:
                    if label_id is not None and "relations" in types:
                        relation_spec = relclass_selections.read_spec_in_group(
                            current_user=user, session=session, group_id=label_id
                        )
                        if relation_spec is not None:
                            relclass_selections.delete_spec(
                                current_user=user, session=session, id=relation_spec.id
                            )
                    cleanup_failed_import_in_session(
                        current_user=user,
                        session=session,
                        source_group_id=source_id,
                        label_group_id=label_id,
                        created_objclass_ids=created_ids,
                    )
                    for id in created_relclass_ids:
                        if any(
                            session.exec(select(column).where(column == id).limit(1)).first()
                            is not None
                            for column in (
                                RelationClassSelectionAssociation.relclass_id,
                                Relation.relation_class_id,
                            )
                        ):
                            continue
                        relclass_definitions.delete_relclass(
                            current_user=user, session=session, id=id
                        )
                    session.commit()
            except BaseException as cleanup_error:
                msg = (
                    f"Import failed: {import_error}. Cleanup failed: {cleanup_error}. "
                    f"Source group #{source_id}, label group {label_id} require cleanup."
                )
                raise click.ClickException(msg) from import_error
            msg = f"Import failed and its groups were deleted: {import_error}"
            raise click.ClickException(msg) from import_error
        click.echo(
            f"Imported {len(selected)} scans. Source group #{source_id}; label group {label_id}."
        )
    except (OSError, ValueError, KeyError, PlyParseError) as error:
        raise click.ClickException(str(error)) from error


if __name__ == "__main__":
    cli()
