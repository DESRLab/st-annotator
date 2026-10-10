from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session

import pytest

from sta.domain.frames import create_frame
from sta.domain.projects import create_project
from sta.domain.source.data.base import (
    SourceDataDomain,
    SourceMetadataDomain,
    imply_bounds_override,
)
from sta.domain.source.groups import create_group as create_source_group, get_valid_group_ids
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.frame import FrameCreate, WorkType
from sta.models.project import ProjectCreate
from sta.models.source.data import SourceMetadataSQLModel
from sta.models.source.group import SourceGroupCreate
from sta.models.task import TaskCreate
from sta.models.user import Role, UserCreate, UserPublic

pytestmark = pytest.mark.in_memory_db


class MockSourceMetadataSQLModel(SourceMetadataSQLModel):
    """A minimal metadata model relying on the inherited uri/bounds columns."""


MockSourceMetadata = MockSourceMetadataSQLModel.get_table_cls("test_source_data_metadata")
MockSourceMetadataCreate = MockSourceMetadataSQLModel.get_create_cls()
MockSourceMetadataPublic = MockSourceMetadataSQLModel.get_public_cls()
MockSourceMetadataUpdate = MockSourceMetadataSQLModel.get_update_cls()

metadata_domain = SourceMetadataDomain(
    table_cls=MockSourceMetadata,
    create_cls=MockSourceMetadataCreate,
    public_cls=MockSourceMetadataPublic,
    update_cls=MockSourceMetadataUpdate,
    bulk_update_cls=MockSourceMetadataUpdate,
)


def test_readable_source_data_still_requires_data_manager_to_write(
    session: Session,
):
    reader = UserPublic(id=123, username="source-reader", roles={Role.ANNOTATOR})
    domain = SourceDataDomain(
        table_cls=object,
        create_cls=object,
        public_cls=object,
        update_cls=object,
        bulk_update_cls=object,
    )
    # This reproduces the vulnerable branch: the record is readable by the
    # annotator, but source-data ownership remains with DATA_MANAGER.
    domain.can_read_data = lambda user, current_session, data: True

    with pytest.raises(HTTPException) as exc_info:
        domain.require_data_writer(reader, session, object())

    assert exc_info.value.status_code == 403


def _assign_annotator_to_source_group(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    source_group_id: int,
) -> UserPublic:
    """Make ``source_group_id`` reachable for a new annotator through a frame.

    Same wiring as ``test_annotator_with_frame_can_write_readable_group_only``
    in test_label_data.py: project member, task annotator, and an ANNOTATE frame
    pointing at the group.
    """
    annotator = UserPublic.model_validate(
        create_user(
            current_user=root_user,
            session=session,
            data=UserCreate(username=username, password="password", roles={Role.ANNOTATOR}),
        )
    )

    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(
            name=f"{username}-project",
            member_ids=[root_user.id, annotator.id],
        ),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name=f"{username}-task",
            project_id=project.id,
            annotator_ids=[annotator.id],
        ),
    )
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=annotator.id,
            source_group_id=source_group_id,
            # No labelset branch: only the source side of the frame carries
            # source-group reachability.
            label_branch_id=None,
            work_type=WorkType.ANNOTATE,
        ),
    )
    session.commit()

    return annotator


def test_reachable_source_group_still_requires_data_manager_for_every_write(
    session: Session,
    root_user: UserPublic,
):
    """
    Reading a source group grants no write on its data rows.

    ``create_data`` passes the record under construction to
    :meth:`SourceDataDomain.require_data_writer` for call-site symmetry with the
    label domain, and the guard ignores it: a user whose frame makes the group
    reachable is still refused on create, update and delete alike. The label
    domain takes the opposite policy (see
    ``test_annotator_with_frame_can_write_readable_group_only``), so this is the
    check that keeps a future reader from treating the unused ``data`` parameter
    as an invitation to honour it.
    """
    group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="reachable-source-group"),
    )
    session.commit()

    annotator = _assign_annotator_to_source_group(
        session,
        root_user,
        username="source-annotator",
        source_group_id=group.id,
    )
    assert not annotator.has_role(Role.DATA_MANAGER)

    # The refusal below cannot be attributed to visibility: this is exactly the
    # reachability that lets the same user write label data.
    assert group.id in get_valid_group_ids(annotator, session)
    assert (
        metadata_domain.list_datas(current_user=annotator, session=session, group_id=group.id) == []
    )

    with pytest.raises(HTTPException) as exc_info:
        metadata_domain.create_data(
            current_user=annotator,
            session=session,
            data=MockSourceMetadataCreate(group_id=group.id, uri="data/denied.pcd"),
        )
    assert exc_info.value.status_code == 403

    record = metadata_domain.create_data(
        current_user=root_user,
        session=session,
        data=MockSourceMetadataCreate(group_id=group.id, uri="data/seed.pcd"),
    )
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        metadata_domain.update_data(
            current_user=annotator,
            session=session,
            id=record.id,
            data=MockSourceMetadataUpdate(uri="data/overwritten.pcd"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        metadata_domain.delete_data(current_user=annotator, session=session, id=record.id)
    assert exc_info.value.status_code == 403

    assert record.uri == "data/seed.pcd"
    assert (
        metadata_domain.count_datas(current_user=root_user, session=session, group_id=group.id) == 1
    )

    session.rollback()


def test_bulk_create_datas_empty_is_noop(
    session: Session,
    root_user: UserPublic,
):
    """A batch with no items must change nothing.

    Without an early return the empty list is handed to ``execute_statement`` as
    ``params=[]``, and SQLAlchemy does not skip the statement for an empty parameter
    list: it emits a single INSERT using only server/column defaults, which fails the
    NOT NULL ``group_id``/``uri`` columns of the metadata table. The reserved-id return
    is likewise empty rather than a silent ``None``.
    """
    group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="empty-batch-source-group"),
    )
    session.commit()

    ids = metadata_domain.bulk_create_datas(
        current_user=root_user,
        session=session,
        data=[MockSourceMetadataCreate(group_id=group.id, uri="data/seed.pcd")],
    )
    session.commit()
    assert len(ids) == 1

    assert (
        metadata_domain.bulk_create_datas(
            current_user=root_user,
            session=session,
            data=[],
        )
        == []
    )
    session.commit()

    # Callers (the plugin domains) feed the reserved ids back into ``list_datas``.
    # An empty id set selects nothing rather than everything, so the no-op batch
    # cannot make them re-touch unrelated rows.
    assert metadata_domain.list_datas(current_user=root_user, session=session, ids=set()) == []

    assert (
        metadata_domain.count_datas(current_user=root_user, session=session, group_id=group.id) == 1
    )


class TestImplyBoundsOverride:
    """A payload carrying its own spatial box must pin it against re-derivation.

    Exercised through the update class, whose fields are all optional: the create class
    is the metadata model itself and validates ``uri`` against the active filesystem.
    """

    def test_supplying_a_coordinate_pins_the_box(self):
        data = MockSourceMetadataUpdate(min_x=1)

        imply_bounds_override(data)

        assert data.auto_bounds is False
        # Recorded as a stated field, so the write actually persists the pin.
        assert "auto_bounds" in data.model_fields_set

    def test_supplying_only_a_max_coordinate_pins_the_box(self):
        data = MockSourceMetadataUpdate(max_z=1)

        imply_bounds_override(data)

        assert data.auto_bounds is False

    def test_supplying_nothing_leaves_the_stored_mode_alone(self):
        data = MockSourceMetadataUpdate(group_id=1)

        imply_bounds_override(data)

        # Neither stated nor implied, so the persisted flag governs this record.
        assert "auto_bounds" not in data.model_fields_set

    def test_timestamps_are_caller_owned_and_do_not_pin_the_box(self):
        data = MockSourceMetadataUpdate(min_timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc))

        imply_bounds_override(data)

        assert "auto_bounds" not in data.model_fields_set

    def test_an_explicit_mode_wins_over_the_implied_one(self):
        # Switching derivation back on may restate the box in the same write; the
        # stated flag must still win, or the mode could never be turned back on.
        data = MockSourceMetadataUpdate(auto_bounds=True, min_x=1)

        imply_bounds_override(data)

        assert data.auto_bounds is True
