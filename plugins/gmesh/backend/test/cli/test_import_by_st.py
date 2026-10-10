from pathlib import Path

from sqlmodel import select

import pytest

from sta.common.database.execution import sql_column
from sta.config import AppConfig
from sta.domain.jobs import run_pending_jobs
from sta.models.job import Job
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta.testing.plugin_import import (
    import_by_st_command,
    invoke_source_import,
    write_data_info,
)
from sta_gmesh.domain.source.data import metadata as metadata_domain
from sta_gmesh.domain.source.data.data import BOUNDS_CONFIG_IDENTITY
from sta_gmesh.plugin import register


def test_import_by_st_reads_ground_mesh_and_creates_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
):
    mesh_path = tmp_path / "ground.obj"
    mesh_path.write_text(
        "\n".join(
            [
                "v 0 0 0",
                "v 1 0 0",
                "v 0 1 0",
                "f 1 2 3",
            ],
        ),
        encoding="utf-8",
    )
    data_info_path = write_data_info(tmp_path, mesh_path)

    result = invoke_source_import(
        monkeypatch,
        import_by_st_command("gmesh", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        source_group=source_group,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        (metadata,) = metadata_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=source_group.id,
        )

    assert metadata.uri == "ground.obj"
    assert metadata.min_x == 0
    assert metadata.max_x == 1
    assert metadata.min_timestamp == metadata.max_timestamp


def test_import_by_st_attests_the_boxes_it_already_derived(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
):
    """A mesh import must not queue a sweep to re-read every mesh it just read.

    The importer reads each mesh and applies its transform exactly as the derivation does,
    and a mesh has no reading configuration that could later disagree with the result, so
    the boxes it stores can be vouched for. Without that attestation an import would leave
    one sweep pending per group, and the first thing the worker would do is reopen all of
    them -- turning a bulk import into two full passes over the dataset for no change.
    """
    mesh_path = tmp_path / "attested.obj"
    mesh_path.write_text(
        "\n".join(["v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3"]),
        encoding="utf-8",
    )
    data_info_path = write_data_info(tmp_path, mesh_path)

    result = invoke_source_import(
        monkeypatch,
        import_by_st_command("gmesh", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        source_group=source_group,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        (metadata,) = metadata_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=source_group.id,
        )

        assert metadata.bounds_config_hash == BOUNDS_CONFIG_IDENTITY
        assert metadata.bounds_error is None
        assert not metadata_domain.pending_bounds_group_ids(
            session=session, group_ids={source_group.id}
        )
        assert (
            session.exec(
                select(Job.id).where(sql_column(Job.kind) == metadata_domain.reconcile_kind)
            ).all()
            == []
        ), "nothing was queued, so there is no second pass over the files"

        # The attestation is a claim about the stored box, so deleting the file afterwards
        # must not disturb it: had the record been left pending, a drain would now fail on
        # the missing mesh rather than leave the box alone.
        mesh_path.unlink()
        assert run_pending_jobs(session=session) == 0
        assert (
            metadata_domain.read_data(current_user=root_user, session=session, id=metadata.id).max_x
            == 1
        )
