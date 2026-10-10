from decimal import Decimal

import numpy as np
from numpy.testing import assert_array_equal

from sqlmodel import select

from sta.common.database.execution import sql_column
from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.config import AppConfig
from sta.domain.jobs import run_pending_jobs
from sta.filesystem import filesystem_ctx
from sta.models.job import Job
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.plugin import load_plugins
from sta.session import session_ctx
from sta_gmesh.domain.source.data import metadata as metadata_domain
from sta_gmesh.domain.source.data.data import BOUNDS_CONFIG_IDENTITY, open_data
from sta_gmesh.filesystem import GroundMeshData
from sta_gmesh.models.source.data import (
    GroundMeshMetadataBulkUpdate,
    GroundMeshMetadataCreate,
    GroundMeshMetadataUpdate,
)

BOUNDS_FIELDS = ("min_x", "min_y", "min_z")


def _bounds(record) -> dict[str, float]:
    return {field: float(getattr(record, field)) for field in BOUNDS_FIELDS}


def _assert_ground_mesh_data(data: GroundMeshData, *, expected_xyz: list[list[float]]) -> None:
    assert_array_equal(
        data.xyz,
        np.array(expected_xyz, dtype=np.float64),
    )
    assert_array_equal(
        data.faces,
        np.array([[0, 1, 2]], dtype=np.int32),
    )


def test_register_ground_mesh_and_update_transform(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
) -> None:
    # File I/O happens under the tmp-rooted filesystem; the DB session stays on test_app_config.
    with filesystem_ctx(plugin_import_app_config):
        mesh_path = FileSystemPath.from_uri("sample_mesh.obj")
        mesh_path.parent.mkdir(parents=True, exist_ok=True)
        with mesh_path.open("w") as mesh_file:
            mesh_file.write("v 0 0 0\n")
            mesh_file.write("v 1 0 0\n")
            mesh_file.write("v 0 1 0\n")
            mesh_file.write("f 1 2 3\n")

        with session_ctx(test_app_config) as session:
            ground_mesh = metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=GroundMeshMetadataCreate(
                    uri=mesh_path.as_uri(),
                    group_id=source_group.id,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            ground_mesh = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=ground_mesh.id,
            )
            _assert_ground_mesh_data(
                open_data(root_user, session, ground_mesh),
                expected_xyz=[
                    [0, 0, 0],
                    [1, 0, 0],
                    [0, 1, 0],
                ],
            )

            ground_mesh = metadata_domain.update_data(
                current_user=root_user,
                session=session,
                id=ground_mesh.id,
                data=GroundMeshMetadataUpdate(
                    translate_x=Decimal("10"),
                    translate_y=Decimal("20"),
                    translate_z=Decimal("30"),
                ),
            )
            session.commit()

            _assert_ground_mesh_data(
                open_data(root_user, session, ground_mesh),
                expected_xyz=[
                    [10, 20, 30],
                    [11, 20, 30],
                    [10, 21, 30],
                ],
            )


def _write_mesh(uri_stem: str) -> FileSystemPath:
    """Writes a single-triangle mesh under the test filesystem root and returns its path."""
    mesh_path = FileSystemPath.from_uri(f"{uri_stem}.obj")
    mesh_path.parent.mkdir(parents=True, exist_ok=True)
    with mesh_path.open("w") as mesh_file:
        mesh_file.write("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")

    return mesh_path


def _sweeps(session) -> list[Job]:
    """The bounds sweeps the writes so far have queued, oldest first."""
    return list(
        session.exec(
            select(Job)
            .where(sql_column(Job.kind) == metadata_domain.reconcile_kind)
            .order_by(sql_column(Job.id))
        ).all()
    )


def _reconcile(session) -> int:
    """Run the queue the way a deployment's worker would; returns how many jobs ran."""
    load_plugins()

    return run_pending_jobs(session=session)


def test_bulk_ground_mesh_edit_queues_only_when_the_box_could_have_moved(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
) -> None:
    """A batch edit that cannot move the bounding box must not queue a re-read either.

    The mesh file is removed once its bounds are recorded, so the two halves stay
    distinguishable after deferral: the timestamp edit queues no work at all, while the
    transform edit -- which does change the box, because the transform is applied before the
    box is taken -- queues a sweep whose failure is then reported on the record rather than
    raised at whoever saved it.
    """
    with filesystem_ctx(plugin_import_app_config):
        mesh_path = _write_mesh("bulk-bounds")

        with session_ctx(test_app_config) as session:
            ground_mesh = metadata_domain.create_data(
                current_user=root_user,
                session=session,
                data=GroundMeshMetadataCreate(
                    uri=mesh_path.as_uri(),
                    group_id=source_group.id,
                ).update_from_transform(Transform.from_optional()),
            )
            session.commit()

            metadata_domain.bulk_update_datas(
                current_user=root_user,
                session=session,
                ids={ground_mesh.id},
                data=GroundMeshMetadataBulkUpdate(
                    min_timestamp="2026-01-01T00:00:00+00:00",
                    max_timestamp="2026-01-01T00:00:01+00:00",
                ),
            )
            session.commit()

            timed = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=ground_mesh.id,
            )
            assert timed.bounds_config_hash == BOUNDS_CONFIG_IDENTITY
            assert _sweeps(session) == [], "timestamps are never derived, so nothing is stale"

            mesh_path.unlink()
            metadata_domain.bulk_update_datas(
                current_user=root_user,
                session=session,
                ids={ground_mesh.id},
                data=GroundMeshMetadataBulkUpdate(translate_x=Decimal("10")),
            )
            session.commit()

            moved = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=ground_mesh.id,
            )
            assert moved.bounds_config_hash is None
            assert len(_sweeps(session)) == 1

            assert _reconcile(session) == 1

            reported = metadata_domain.read_data(
                current_user=root_user,
                session=session,
                id=ground_mesh.id,
            )
            assert reported.bounds_config_hash is None
            assert "FileNotFoundError" in (reported.bounds_error or "")
            assert _bounds(reported) == {"min_x": 0.0, "min_y": 0.0, "min_z": 0.0}
