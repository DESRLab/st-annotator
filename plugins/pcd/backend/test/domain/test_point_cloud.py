import logging
from collections.abc import Iterator
from decimal import Decimal

import numpy as np
from numpy.testing import assert_array_equal

from sqlmodel import Session, select

import pytest

from sta.common.database.execution import sql_column
from sta.common.filesystem import FileSystemPath
from sta.common.spatial import OptionalVector3, Transform
from sta.config import AppConfig
from sta.domain.jobs import run_pending_jobs
from sta.domain.source.groups import create_group
from sta.filesystem import filesystem_ctx
from sta.models.job import Job, JobState
from sta.models.source.group import SourceGroupCreate, SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta_pcd.domain.source.data import metadata as metadata_domain
from sta_pcd.domain.source.data.data import bounds_config_identity, open_data
from sta_pcd.domain.source.spec import specs as specs_domain
from sta_pcd.filesystem import PointCloudData
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.configs.pcd import CropBoxConfig
from sta_pcd.models.source.data import (
    PointCloudMetadataBulkUpdate,
    PointCloudMetadataCreate,
    PointCloudMetadataPublic,
    PointCloudMetadataUpdate,
)
from sta_pcd.models.source.spec import (
    PointCloudSpecBulkUpdate,
    PointCloudSpecCreate,
    PointCloudSpecUpdate,
)
from sta_pcd.ops.preprocessing import CropBoxParams, PreprocessingOperationType

from ..register_plugin import register_pcd_once

BOUNDS_FIELDS = ("min_x", "min_y", "min_z", "max_x", "max_y", "max_z")


@pytest.fixture
def sta_logs(caplog) -> Iterator:
    """Captures records from the ``sta`` logger, which deliberately does not propagate."""
    logger = logging.getLogger("sta")
    caplog.set_level(logging.WARNING, logger="sta")
    logger.addHandler(caplog.handler)
    try:
        yield caplog
    finally:
        logger.removeHandler(caplog.handler)


def _assert_point_cloud_data(
    point_cloud_data: PointCloudData, *, expected: list[list[float]]
) -> None:
    assert point_cloud_data.channel_headers == ("x", "y", "z", "intensity")
    assert_array_equal(
        point_cloud_data.pointwise_data,
        np.array(expected, dtype=np.float64),
    )


def _bounds(point_cloud: PointCloudMetadataPublic) -> dict[str, float]:
    return {field: float(getattr(point_cloud, field)) for field in BOUNDS_FIELDS}


def _crop_box_config(*, box_min: tuple[float, float, float], box_max: tuple[float, float, float]):
    return PointCloudConfig(
        channel_headers=["x", "y", "z", "intensity"],
        dtype="float32",
        preprocessors=[
            CropBoxConfig(
                op_name=PreprocessingOperationType.CROP_BOX,
                op_params=CropBoxParams(
                    keep=True,
                    box_min=OptionalVector3(x=box_min[0], y=box_min[1], z=box_min[2]),
                    box_max=OptionalVector3(x=box_max[0], y=box_max[1], z=box_max[2]),
                ),
            ),
        ],
    )


def test_register_point_cloud_and_update_processing_and_transform(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
):
    _ = source_group

    # File I/O happens under the tmp-rooted filesystem; the DB session stays on test_app_config.
    with filesystem_ctx(plugin_import_app_config):
        point_cloud_path = FileSystemPath.from_uri("sample.npy")
        point_cloud_path.parent.mkdir(parents=True, exist_ok=True)
        with point_cloud_path.open("wb") as point_cloud_file:
            np.save(
                point_cloud_file,
                np.array(
                    [
                        [0, 0, 0, 0],
                        [1, 1, 1, 0],
                        [3, 3, 3, 0],
                    ],
                    dtype=np.float32,
                ),
            )

        with session_ctx(test_app_config) as session:
            target_group = create_group(
                current_user=root_user,
                session=session,
                data=SourceGroupCreate(name="secondary"),
            )
            session.commit()

            point_cloud_source, _ = specs_domain.create_spec(
                current_user=root_user,
                session=session,
                data=PointCloudSpecCreate(
                    name="test point cloud",
                    description="",
                    group_ids=[target_group.id],
                    config=PointCloudConfig.default(),
                ),
            )
            session.commit()

            point_cloud = metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=PointCloudMetadataCreate(
                    uri=point_cloud_path.as_uri(),
                    group_id=target_group.id,
                    weather=None,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            _assert_point_cloud_data(
                open_data(root_user, session, point_cloud),
                expected=[
                    [0, 0, 0, 0],
                    [1, 1, 1, 0],
                    [3, 3, 3, 0],
                ],
            )

            point_cloud_config = PointCloudConfig(
                channel_headers=["x", "y", "z", "intensity"],
                dtype="float32",
                preprocessors=[
                    CropBoxConfig(
                        op_name=PreprocessingOperationType.CROP_BOX,
                        op_params=CropBoxParams(
                            keep=True,
                            box_min=OptionalVector3(x=0.5, y=0.5, z=0.5),
                            box_max=OptionalVector3(x=1.5, y=1.5, z=1.5),
                        ),
                    ),
                ],
            )
            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=point_cloud_source.id,
                data=PointCloudSpecUpdate(config=point_cloud_config),
            )
            session.commit()

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            _assert_point_cloud_data(
                open_data(root_user, session, point_cloud),
                expected=[
                    [1, 1, 1, 0],
                ],
            )

            point_cloud = metadata_domain.update_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
                data=PointCloudMetadataUpdate(
                    translate_x=Decimal("10"),
                    translate_y=Decimal("20"),
                    translate_z=Decimal("30"),
                ),
            )
            session.commit()

            _assert_point_cloud_data(
                open_data(root_user, session, point_cloud),
                expected=[
                    [11, 21, 31, 0],
                ],
            )


def test_metadata_only_spec_update_does_not_reload_linked_scans(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    with filesystem_ctx(plugin_import_app_config):
        point_cloud_path = FileSystemPath.from_uri("metadata-only.npy")
        with point_cloud_path.open("wb") as point_cloud_file:
            np.save(point_cloud_file, np.array([[0, 0, 0, 0]], dtype=np.float32))

        with session_ctx(test_app_config) as session:
            group = create_group(
                current_user=root_user,
                session=session,
                data=SourceGroupCreate(name="metadata-only-group"),
            )
            spec, _ = specs_domain.create_spec(
                current_user=root_user,
                session=session,
                data=PointCloudSpecCreate(
                    name="before rename",
                    description="preserve me",
                    group_ids=[group.id],
                    config=PointCloudConfig.default(),
                ),
            )
            metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=PointCloudMetadataCreate(
                    uri=point_cloud_path.as_uri(),
                    group_id=group.id,
                    weather=None,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()
            point_cloud_path.unlink()

            updated, _ = specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(name="after rename"),
            )

            assert updated.name == "after rename"
            assert updated.description == "preserve me"


def test_crop_that_removes_every_point_preserves_bounds_and_warns(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    sta_logs,
):
    """A crop area that retains zero points must not fail the group-wide bounds refresh.

    The stored source bounds are kept as-is (neither zeroed nor inverted) and the skip is
    surfaced as a warning naming the metadata and its source file.
    """
    _ = source_group

    with filesystem_ctx(plugin_import_app_config):
        point_cloud_path = FileSystemPath.from_uri("empty-after-crop.npy")
        point_cloud_path.parent.mkdir(parents=True, exist_ok=True)
        with point_cloud_path.open("wb") as point_cloud_file:
            np.save(
                point_cloud_file,
                np.array(
                    [
                        [20, 20, 20, 0],
                        [30, 30, 30, 0],
                    ],
                    dtype=np.float32,
                ),
            )

        with session_ctx(test_app_config) as session:
            target_group = create_group(
                current_user=root_user,
                session=session,
                data=SourceGroupCreate(name="empty after crop"),
            )
            session.commit()

            point_cloud_source, _ = specs_domain.create_spec(
                current_user=root_user,
                session=session,
                data=PointCloudSpecCreate(
                    name="point cloud cropped to nothing",
                    description="",
                    group_ids=[target_group.id],
                    config=PointCloudConfig.default(),
                ),
            )
            session.commit()

            point_cloud = metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=PointCloudMetadataCreate(
                    uri=point_cloud_path.as_uri(),
                    group_id=target_group.id,
                    weather=None,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            expected_bounds = {
                "min_x": 20.0,
                "min_y": 20.0,
                "min_z": 20.0,
                "max_x": 30.0,
                "max_y": 30.0,
                "max_z": 30.0,
            }
            assert _bounds(point_cloud) == expected_bounds

            # The crop area excludes the whole scan, so no point survives preprocessing.
            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=point_cloud_source.id,
                data=PointCloudSpecUpdate(
                    config=_crop_box_config(box_min=(0.0, 0.0, 0.0), box_max=(10.0, 10.0, 10.0)),
                ),
            )
            session.commit()

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            assert open_data(root_user, session, point_cloud).num_points == 0
            assert _bounds(point_cloud) == expected_bounds
            assert sta_logs.text == "", "the save must not have read the scan yet"
            assert point_cloud.bounds_config_hash is None

            assert _reconcile(session) == 1

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            assert _bounds(point_cloud) == expected_bounds
            assert "Skipped bounds recalculation" in sta_logs.text
            assert str(point_cloud.id) in sta_logs.text
            assert str(point_cloud_path.as_uri()) in sta_logs.text
            assert point_cloud.bounds_config_hash is None, (
                "nothing was derived, so the record claims nothing"
            )
            assert "no points" in (point_cloud.bounds_error or "")

            # An unrelated edit neither re-reads the scan nor disturbs what it awaits.
            metadata_domain.update_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
                data=PointCloudMetadataUpdate(weather="sunny"),
            )
            session.commit()

            point_cloud = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=point_cloud.id,
            )
            assert point_cloud.weather == "sunny"
            assert _bounds(point_cloud) == expected_bounds
            assert point_cloud.bounds_config_hash is None


SCAN_POINTS = np.array([[0.0, 0.0, 0.0, 0.0], [1.0, 2.0, 3.0, 1.0]], dtype=np.float32)


def _record_scan(
    *,
    session,
    current_user: UserPublic,
    group_id: int,
    uri_stem: str,
):
    """Writes a two-point scan under the test filesystem root and registers it."""
    path = FileSystemPath.from_uri(f"{uri_stem}.npy")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as point_cloud_file:
        np.save(point_cloud_file, SCAN_POINTS)

    record = metadata_domain.create_data(
        current_user=current_user,
        session=session,
        data=PointCloudMetadataCreate(
            uri=path.as_uri(),
            group_id=group_id,
            weather=None,
        ).update_from_transform(Transform.from_optional()),
    )

    return path, record


def _create_group(*, session, current_user: UserPublic, name: str):
    return create_group(
        current_user=current_user,
        session=session,
        data=SourceGroupCreate(name=name),
    )


def _create_spec(
    *,
    session,
    current_user: UserPublic,
    name: str,
    group_ids: list[int],
    config: PointCloudConfig | None = None,
):
    # A fixture helper: the caller wants the record, and the sweeps a save may have
    # started are the subject of other tests, not of this one.
    record, _ = specs_domain.create_spec(
        current_user=current_user,
        session=session,
        data=PointCloudSpecCreate(
            name=name,
            group_ids=group_ids,
            config=config or PointCloudConfig.default(),
        ),
    )
    return record


# A config that differs from the default only in fields nothing reads. The old gate
# compared whole configs and so re-derived a group for this; the marker must not.
RESHAPED_CONFIG = PointCloudConfig(
    channel_headers=["x", "y", "z", "intensity"],
    dtype="float32",
    width=2,
    height=1,
)

# A config the derivation reads differently, so a save that posts it owes a re-derivation.
CHANGED_CONFIG = _crop_box_config(box_min=(-5.0, -5.0, -5.0), box_max=(5.0, 5.0, 5.0))

SCAN_BOUNDS = {
    "min_x": 0.0,
    "min_y": 0.0,
    "min_z": 0.0,
    "max_x": 1.0,
    "max_y": 2.0,
    "max_z": 3.0,
}


def _sweeps(session: Session, *, group_id: int | None = None) -> list[Job]:
    """The bounds sweeps the writes so far have queued, oldest first."""
    queued = session.exec(
        select(Job)
        .where(sql_column(Job.kind) == metadata_domain.reconcile_kind)
        .order_by(sql_column(Job.id))
    ).all()

    if group_id is None:
        return list(queued)

    return [job for job in queued if job.payload["group_id"] == group_id]


def _reconcile(session: Session) -> int:
    """Run the queue the way the worker would; returns how many jobs ran."""
    register_pcd_once()

    return run_pending_jobs(session=session)


def test_a_configuration_change_queues_a_sweep_instead_of_reading_the_group(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """Saving a specification must not read a single scan inside the request.

    The scan's file is removed before the save: the old fan-out failed the request from
    inside it, which is exactly what deferral forbids. What the save owes instead is a
    cleared marker on the record and one queued sweep that reports the unreadable file on
    the record it could not derive.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            group = _create_group(session=session, current_user=root_user, name="deferred-group")
            spec = _create_spec(
                session=session,
                current_user=root_user,
                name="deferred config",
                group_ids=[group.id],
            )
            path, scan = _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="deferred-scan",
            )
            session.commit()

            derived = metadata_domain.read_data(current_user=root_user, session=session, id=scan.id)
            assert derived.bounds_config_hash == bounds_config_identity(PointCloudConfig.default())

            path.unlink()
            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(config=CHANGED_CONFIG),
            )
            session.commit()

            stale = metadata_domain.read_data(current_user=root_user, session=session, id=scan.id)
            assert stale.bounds_config_hash is None
            assert _bounds(stale) == SCAN_BOUNDS, "the box stays until a sweep replaces it"
            assert [job.payload["group_id"] for job in _sweeps(session)] == [group.id]

            assert _reconcile(session) == 1

            reported = metadata_domain.read_data(
                current_user=root_user, session=session, id=scan.id
            )
            assert reported.bounds_config_hash is None
            assert "FileNotFoundError" in (reported.bounds_error or "")
            assert _sweeps(session)[0].state == JobState.SUCCEEDED


def test_an_unchanged_configuration_save_queues_nothing(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """The specification form posts its config on every save, so an identical payload is free.

    The other half of the rule is asserted here too: posting a configuration that differs
    only in fields the derivation never reads must cost nothing either, while the first save
    that changes what a scan is read *as* queues exactly one sweep.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            group = _create_group(session=session, current_user=root_user, name="unchanged-config")
            spec = _create_spec(
                session=session,
                current_user=root_user,
                name="unchanged config",
                group_ids=[group.id],
            )
            _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="unchanged-config",
            )
            session.commit()

            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(name="renamed", config=PointCloudConfig.default()),
            )
            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(config=PointCloudConfig.default()),
            )
            session.commit()

            assert _sweeps(session) == []

            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(config=RESHAPED_CONFIG),
            )
            session.commit()

            assert _sweeps(session) == [], "a field the derivation never reads changes nothing"

            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(config=CHANGED_CONFIG),
            )
            session.commit()

            assert len(_sweeps(session)) == 1, "a reading that changed makes the group stale"


def test_a_bulk_spec_edit_queues_one_sweep_per_group(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """The batch form replaces every selected specification's links from one payload.

    So the groups to reconcile come from the link rows before and after the write, not from
    the request: this posts an unchanged config to two specifications and queues nothing,
    then posts a changed one and gets exactly one sweep per group.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            groups = [
                _create_group(session=session, current_user=root_user, name=f"bulk-{index}")
                for index in (1, 2)
            ]
            specs = [
                _create_spec(
                    session=session,
                    current_user=root_user,
                    name=f"bulk spec {index}",
                    group_ids=[group.id],
                )
                for index, group in enumerate(groups, start=1)
            ]
            for index, group in enumerate(groups, start=1):
                _record_scan(
                    session=session,
                    current_user=root_user,
                    group_id=group.id,
                    uri_stem=f"bulk-spec-scan-{index}",
                )
            session.commit()

            specs_domain.bulk_update_specs(
                current_user=root_user,
                session=session,
                ids={spec.id for spec in specs},
                data=PointCloudSpecBulkUpdate(
                    description="batched", config=PointCloudConfig.default()
                ),
            )
            session.commit()

            assert _sweeps(session) == []

            specs_domain.bulk_update_specs(
                current_user=root_user,
                session=session,
                ids={spec.id for spec in specs},
                data=PointCloudSpecBulkUpdate(config=CHANGED_CONFIG),
            )
            session.commit()

            assert [job.payload["group_id"] for job in _sweeps(session)] == [
                groups[0].id,
                groups[1].id,
            ]

            assert _reconcile(session) == 2
            for group in groups:
                assert (
                    metadata_domain.list_pending_bounds(
                        current_user=root_user, session=session, group_id=group.id
                    )
                    == []
                )


def test_unassigning_a_group_marks_its_records_and_queues_only_them(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """The case a membership diff could never express: a group the specification dropped.

    Both groups were derived under the same configuration, so the departing group's marker
    still matches it and no comparison of *configurations* between the old and new membership
    can find it -- and re-reading its scans through a specification they no longer have is
    impossible anyway. What the marker records instead is the relation the diff was blind to:
    the group's records now await a configuration they do not have, reported one record at a
    time, while the group the specification kept is left entirely alone.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            kept = _create_group(session=session, current_user=root_user, name="kept-group")
            dropped = _create_group(session=session, current_user=root_user, name="dropped-group")
            spec = _create_spec(
                session=session,
                current_user=root_user,
                name="two groups",
                group_ids=[kept.id, dropped.id],
            )
            _kept_path, kept_scan = _record_scan(
                session=session,
                current_user=root_user,
                group_id=kept.id,
                uri_stem="kept-group-scan",
            )
            _dropped_path, dropped_scan = _record_scan(
                session=session,
                current_user=root_user,
                group_id=dropped.id,
                uri_stem="dropped-group-scan",
            )
            session.commit()

            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(group_ids=[kept.id], config=PointCloudConfig.default()),
            )
            session.commit()

            stayed = metadata_domain.read_data(
                current_user=root_user, session=session, id=kept_scan.id
            )
            assert stayed.bounds_config_hash is not None, "the kept group keeps its marker"

            left = metadata_domain.read_data(
                current_user=root_user, session=session, id=dropped_scan.id
            )
            assert left.bounds_config_hash is None
            assert [job.payload["group_id"] for job in _sweeps(session)] == [dropped.id]

            _reconcile(session)

            orphaned = metadata_domain.read_data(
                current_user=root_user, session=session, id=dropped_scan.id
            )
            assert "No point cloud source defined" in (orphaned.bounds_error or "")
            assert orphaned.bounds_config_hash is None
            assert _bounds(orphaned) == SCAN_BOUNDS, "an un-derivable scan keeps its last box"


def test_acquiring_a_group_derives_its_records_under_the_new_configuration(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """Losing a specification is recoverable: the sweep runs when a group gains one again."""
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            first = _create_group(session=session, current_user=root_user, name="acquiring-group")
            second = _create_group(session=session, current_user=root_user, name="acquired-group")
            spec = _create_spec(
                session=session,
                current_user=root_user,
                name="acquiring spec",
                group_ids=[first.id],
            )
            second_spec = _create_spec(
                session=session,
                current_user=root_user,
                name="acquired spec",
                group_ids=[second.id],
            )
            _record_scan(
                session=session,
                current_user=root_user,
                group_id=first.id,
                uri_stem="acquiring-scan",
            )
            _record_scan(
                session=session,
                current_user=root_user,
                group_id=second.id,
                uri_stem="acquired-scan",
            )
            _acquired_path, acquired = _record_scan(
                session=session,
                current_user=root_user,
                group_id=second.id,
                uri_stem="acquired-second-scan",
            )
            session.commit()

            specs_domain.delete_spec(current_user=root_user, session=session, id=second_spec.id)
            session.commit()

            assert len(_sweeps(session, group_id=second.id)) == 1
            _reconcile(session)
            assert (
                "No point cloud source defined"
                in metadata_domain.read_data(
                    current_user=root_user, session=session, id=acquired.id
                ).bounds_error
                or ""
            )

            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(
                    group_ids=[first.id, second.id],
                    config=PointCloudConfig.default(),
                ),
            )
            session.commit()

            assert _sweeps(session, group_id=second.id)
            _reconcile(session)

            derived = metadata_domain.read_data(
                current_user=root_user, session=session, id=acquired.id
            )
            assert derived.bounds_config_hash == bounds_config_identity(PointCloudConfig.default())
            assert derived.bounds_error is None
            assert _bounds(derived) == SCAN_BOUNDS


def test_bulk_edits_queue_only_when_the_box_could_have_moved(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """A batch of weather labels reads no files; a batch of transforms re-derives them all.

    The transform half is asserted positively -- the recorded box actually moves -- because
    the old proof that a re-read had happened was a missing file raising inside the request,
    which is no longer where the reading occurs.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            group = _create_group(
                session=session, current_user=root_user, name="bulk-metadata-group"
            )
            _create_spec(
                session=session,
                current_user=root_user,
                name="bulk metadata",
                group_ids=[group.id],
            )
            _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="bulk-metadata-scan",
            )
            _path, scan = _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="bulk-transform-scan",
            )
            session.commit()

            metadata_domain.bulk_update_datas(
                current_user=root_user,
                session=session,
                ids={scan.id},
                data=PointCloudMetadataBulkUpdate(weather="rainy"),
            )
            session.commit()

            edited = metadata_domain.read_data(current_user=root_user, session=session, id=scan.id)
            assert edited.weather == "rainy"
            assert edited.bounds_config_hash is not None, "an unrelated edit leaves the marker"
            assert _sweeps(session) == []

            metadata_domain.bulk_update_datas(
                current_user=root_user,
                session=session,
                ids={scan.id},
                data=PointCloudMetadataBulkUpdate(translate_x=Decimal("10")),
            )
            session.commit()

            moved = metadata_domain.read_data(current_user=root_user, session=session, id=scan.id)
            assert moved.bounds_config_hash is None
            assert [job.payload["group_id"] for job in _sweeps(session)] == [group.id]

            _reconcile(session)

            swept = metadata_domain.read_data(current_user=root_user, session=session, id=scan.id)
            assert _bounds(swept) == {
                "min_x": 10.0,
                "min_y": 0.0,
                "min_z": 0.0,
                "max_x": 11.0,
                "max_y": 2.0,
                "max_z": 3.0,
            }
            assert swept.bounds_config_hash is not None
            assert swept.bounds_error is None


def test_a_pinned_record_is_never_queued(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """Hand-set bounds stay out of the pending set, however the configuration moves.

    Supplying coordinates pins the box, and a pinned record is derivation-less by choice: it
    must not be swept, marked, or listed as awaiting anything. The group's other records still
    queue, so the rule is per record and not a group-wide exemption.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            group = _create_group(session=session, current_user=root_user, name="pinned-group")
            spec = _create_spec(
                session=session,
                current_user=root_user,
                name="pinned spec",
                group_ids=[group.id],
            )
            _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="pinned-first-scan",
            )
            _path, pinned = _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="pinned-scan",
            )
            session.commit()

            metadata_domain.update_data(
                current_user=root_user,
                session=session,
                id=pinned.id,
                data=PointCloudMetadataUpdate(min_x=Decimal("-100"), max_x=Decimal("100")),
            )
            session.commit()

            assert (
                metadata_domain.read_data(
                    current_user=root_user, session=session, id=pinned.id
                ).auto_bounds
                is False
            )

            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(config=CHANGED_CONFIG),
            )
            session.commit()

            pending = metadata_domain.list_pending_bounds(
                current_user=root_user, session=session, group_id=group.id
            )
            assert pinned.id not in {record.id for record in pending}
            assert len(pending) == 1

            assert _reconcile(session) == 1
            assert (
                metadata_domain.read_data(
                    current_user=root_user, session=session, id=pinned.id
                ).bounds_config_hash
                is None
            )


def test_the_pending_filter_partitions_a_group(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """`bounds_pending` is how a reader finds the records a sweep has not reached.

    Asserted both ways: the derived record is pending and the pinned one is not, so the
    inverted filter finds exactly the boxes no derivation will ever touch -- the difference
    between work in progress and work deliberately declined.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            group = _create_group(session=session, current_user=root_user, name="pending-filter")
            spec = _create_spec(
                session=session,
                current_user=root_user,
                name="pending filter",
                group_ids=[group.id],
            )
            _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="pending-filter-derived",
            )
            _path, pinned = _record_scan(
                session=session,
                current_user=root_user,
                group_id=group.id,
                uri_stem="pending-filter-pinned",
            )
            session.commit()

            metadata_domain.update_data(
                current_user=root_user,
                session=session,
                id=pinned.id,
                data=PointCloudMetadataUpdate(min_x=Decimal("-100"), max_x=Decimal("100")),
            )
            specs_domain.update_spec(
                current_user=root_user,
                session=session,
                id=spec.id,
                data=PointCloudSpecUpdate(config=CHANGED_CONFIG),
            )
            session.commit()

            awaiting = metadata_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=group.id,
                bounds_pending=True,
            )
            assert len(awaiting) == 1
            assert awaiting[0].id != pinned.id

            settled = metadata_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=group.id,
                bounds_pending=False,
            )
            assert [record.id for record in settled] == [pinned.id]

            assert (
                metadata_domain.count_datas(
                    current_user=root_user,
                    session=session,
                    group_id=group.id,
                    bounds_pending=True,
                )
                == 1
            )


def test_a_derivation_that_produced_no_box_leaves_no_claim(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
):
    """A record cannot keep a claim that no successful read produced.

    The create payload carries the two internal bounds columns, so a caller may hand in a
    derivation marker of its own. The branch that finds no points to bound must clear it --
    otherwise the row asserts that its box reflects the group's configuration while never
    having been read, and stays out of the pending set for good.
    """
    with filesystem_ctx(plugin_import_app_config):
        with session_ctx(test_app_config) as session:
            group = _create_group(session=session, current_user=root_user, name="empty-crop")
            _create_spec(
                session=session,
                current_user=root_user,
                name="crop away everything",
                group_ids=[group.id],
                config=_crop_box_config(box_min=(10.0, 10.0, 10.0), box_max=(20.0, 20.0, 20.0)),
            )
            path = FileSystemPath.from_uri("empty-crop-scan.npy")
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("wb") as scan:
                np.save(scan, SCAN_POINTS)

            record = metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=PointCloudMetadataCreate(
                    uri=path.as_uri(),
                    group_id=group.id,
                    weather=None,
                    bounds_config_hash="0" * 40,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            stored = metadata_domain.read_data(
                current_user=root_user, session=session, id=record.id
            )
            assert stored.bounds_config_hash is None
            assert "no points" in (stored.bounds_error or "")
            assert stored.min_x is None, "nothing was ever derived for this record"
            assert _sweeps(session) == [], "a record derived inline cannot also be queued"
