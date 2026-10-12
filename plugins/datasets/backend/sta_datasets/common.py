"""Shared geometry, label resources, and failure cleanup for dataset importers."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from decimal import ROUND_DOWN, Decimal
from pathlib import Path
from typing import Any, TypeVar
from uuid import UUID

import click

import numpy as np
import numpy.typing as npt

from shapely.geometry import MultiPoint

from sqlmodel import Session, select

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.config import AppConfigArgs
from sta.domain.label.groups import (
    create_group as create_label_group,
    delete_group as delete_label_group,
)
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OP_REGISTRY
from sta.domain.label.spec.objclass import (
    definitions as objclass_definitions,
    selections as objclass_selections_domain,
)
from sta.domain.source.groups import delete_group as delete_source_group
from sta.entrypoints import app_ctx
from sta.models.label.group import LabelGroupCreate
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.label.spec.objclass import (
    ObjectClassCreate,
    ObjectClassSelectionAssociation,
    ObjectClassSelectionCreate,
)
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
    TruncDecimalCoord3,
    TruncDecimalSize3,
)
from sta_segmentation.domain.label.data import (
    element as segmentation_element_domain,
    entity as segmentation_entity_domain,
)
from sta_segmentation.models.label.data import (
    LabelInstance,
    LabelSelection,
    SelectionType,
)

DUMMY_TIMESTAMP_START = datetime(1970, 1, 1, tzinfo=timezone.utc)

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


def dummy_frame_timestamp(frame_idx: int) -> datetime:
    return DUMMY_TIMESTAMP_START + timedelta(seconds=frame_idx)


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
    description: str = "SemanticKITTI object labels",
    objclass_description: str = "SemanticKITTI object classes",
):
    label_group = create_label_group(
        current_user=current_user,
        session=session,
        data=LabelGroupCreate(
            name=group_name,
            description=description,
        ),
    )
    session.flush([label_group])
    assert label_group.id is not None

    objclasses = [
        get_or_create_object_class(
            current_user=current_user,
            session=session,
            name=name,
            created_ids=created_objclass_ids,
        )
        for _, name in sorted(labels_by_id.items())
    ]

    objclass_ids: list[int] = []
    for objclass in objclasses:
        assert objclass.id is not None
        objclass_ids.append(objclass.id)

    objclass_selections_domain.create_spec(
        current_user=current_user,
        session=session,
        data=ObjectClassSelectionCreate(
            name=f"{group_name} object classes",
            description=objclass_description,
            group_ids=[label_group.id],
            objclass_ids=objclass_ids,
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


def label_selection_from_xyz(
    *,
    id: UUID,
    group_id: int,
    commit_hash: str,
    xyz: npt.NDArray[Any],
    timestamp: datetime,
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


def best_fit_cuboid_from_xyz(xyz: npt.NDArray[Any]):
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
    return center, decimal_bbox_coord(heading), size


def label_box_from_xyz(
    *,
    id: UUID,
    group_id: int,
    commit_hash: str,
    xyz: npt.NDArray[Any],
    timestamp: datetime,
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


F = TypeVar("F", bound=Callable[..., Any])


def config_path_option() -> Callable[[F], F]:
    """Accept a local config path or inherit it from ``sta plugins``."""
    return click.option(
        "-c",
        "--config",
        "config_path",
        type=click.Path(exists=True, dir_okay=False, path_type=Path),
        help="Application configuration; inherited when called through sta plugins.",
    )


def resolve_config_path(config_path: str | Path | None) -> Path | None:
    """Find the configuration path without coupling importers to their CLI host."""
    if config_path is not None:
        return Path(config_path)
    context = click.get_current_context(silent=True)
    while context is not None:
        inherited = context.params.get("config_path")
        if inherited is not None:
            return Path(inherited)
        context = context.parent
    return None
