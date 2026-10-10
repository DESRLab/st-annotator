"""Tests for the label and source spec domains.

Covers ``sta/domain/label/spec/objclass/definitions.py``, the real
``ObjectClassSelectionDomain`` singleton from
``sta/domain/label/spec/objclass`` and — because the selections domain
overrides every CRUD method — the surviving ``LabelSpecDomain`` base-class
paths via a test-only subclass backed by a minimal spec model (the same
approach covers the ``SourceSpecDomain`` base paths).
"""

from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

import pytest

from sta.domain.frames import create_frame
from sta.domain.label.groups import (
    create_group as create_label_group,
    get_valid_group_ids as get_valid_label_group_ids,
)
from sta.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.label.repo.ops.special import register_special_ops
from sta.domain.label.spec.base import LabelSpecDomain
from sta.domain.label.spec.objclass import definitions, selections
from sta.domain.projects import create_project
from sta.domain.source.groups import (
    create_group as create_source_group,
    get_valid_group_ids as get_valid_source_group_ids,
)
from sta.domain.source.spec.base import SourceSpecDomain
from sta.domain.tasks import create_task
from sta.domain.users import create_user
from sta.models.frame import FrameCreate, WorkType
from sta.models.label.group import LabelGroup, LabelGroupCreate
from sta.models.label.repo import BranchPermissionLevel
from sta.models.label.spec import (
    ObjectClass,
    ObjectClassBulkUpdate,
    ObjectClassCreate,
    ObjectClassUpdate,
)
from sta.models.label.spec.base import LabelSpecSQLModel
from sta.models.project import ProjectCreate
from sta.models.source.group import SourceGroup, SourceGroupCreate
from sta.models.source.spec.base import SourceSpecSQLModel
from sta.models.task import TaskCreate
from sta.models.user import Role, UserCreate, UserPublic

pytestmark = pytest.mark.in_memory_db


class MockSpecSQLModel(LabelSpecSQLModel):
    """A minimal spec model to exercise the base LabelSpecDomain implementation."""


MockSpec = MockSpecSQLModel.get_table_cls("test_specs_base_spec")
MockSpecCreate = MockSpecSQLModel.get_create_cls()
MockSpecPublic = MockSpecSQLModel.get_public_cls()
MockSpecUpdate = MockSpecSQLModel.get_update_cls()

base_spec_domain = LabelSpecDomain(
    table_cls=MockSpec,
    create_cls=MockSpecCreate,
    public_cls=MockSpecPublic,
    update_cls=MockSpecUpdate,
    bulk_update_cls=MockSpecUpdate,
)


class MockSourceSpecSQLModel(SourceSpecSQLModel):
    """A minimal spec model to exercise the base SourceSpecDomain implementation."""


MockSourceSpec = MockSourceSpecSQLModel.get_table_cls("test_specs_source_base_spec")
MockSourceSpecCreate = MockSourceSpecSQLModel.get_create_cls()
MockSourceSpecPublic = MockSourceSpecSQLModel.get_public_cls()
MockSourceSpecUpdate = MockSourceSpecSQLModel.get_update_cls()

base_source_spec_domain = SourceSpecDomain(
    table_cls=MockSourceSpec,
    create_cls=MockSourceSpecCreate,
    public_cls=MockSourceSpecPublic,
    update_cls=MockSourceSpecUpdate,
    bulk_update_cls=MockSourceSpecUpdate,
)


def _create_test_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    roles: set[Role],
) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=username,
            password="password",
            roles=roles,
        ),
    )

    return UserPublic.model_validate(record)


def _create_op_registry() -> OperationRegistry:
    registry = OperationRegistry()
    register_special_ops(registry)
    return registry


def _can_write_specs(spec_domain, user: UserPublic, session: Session) -> bool:
    try:
        spec_domain.require_spec_writer(user, session)
    except HTTPException:
        return False

    return True


def test_spec_reads_are_scoped_to_visible_groups(
    root_user: UserPublic,
    session: Session,
):
    reader = _create_test_user(
        session,
        root_user,
        username="scoped-spec-reader",
        roles={Role.ANNOTATOR},
    )
    visible_label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="visible-label-group"),
    )
    hidden_label_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="hidden-label-group"),
    )
    visible_source_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="visible-source-group"),
    )
    hidden_source_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="hidden-source-group"),
    )

    # One case per specification kind, each created through its own domain: a label spec
    # write answers with the record, a source spec write with the record beside the queue
    # rows it started. Both lists hold records, so the checks below stay shape-agnostic.
    spec_cases = [
        (
            base_spec_domain,
            visible_label_group,
            hidden_label_group,
            base_spec_domain.create_spec(
                current_user=root_user,
                session=session,
                data=MockSpecCreate(name="visible-label-spec", group_ids=[visible_label_group.id]),
            ),
            base_spec_domain.create_spec(
                current_user=root_user,
                session=session,
                data=MockSpecCreate(name="hidden-label-spec", group_ids=[hidden_label_group.id]),
            ),
        ),
        (
            base_source_spec_domain,
            visible_source_group,
            hidden_source_group,
            base_source_spec_domain.create_spec(
                current_user=root_user,
                session=session,
                data=MockSourceSpecCreate(
                    name="visible-source-spec",
                    group_ids=[visible_source_group.id],
                ),
            )[0],
            base_source_spec_domain.create_spec(
                current_user=root_user,
                session=session,
                data=MockSourceSpecCreate(
                    name="hidden-source-spec",
                    group_ids=[hidden_source_group.id],
                ),
            )[0],
        ),
    ]

    project = create_project(
        current_user=root_user,
        session=session,
        data=ProjectCreate(name="scoped-spec-project", member_ids=[reader.id]),
    )
    task = create_task(
        current_user=root_user,
        session=session,
        data=TaskCreate(
            name="scoped-spec-task",
            project_id=project.id,
            annotator_ids=[reader.id],
        ),
    )
    branch = init_branch(
        current_user=root_user,
        session=session,
        op_registry=_create_op_registry(),
        data=LabelsetBranchInit(
            group_id=visible_label_group.id,
            name="scoped-spec-visible-branch",
            # The frame owner must hold WRITE on the branch it is assigned to.
            perm_lv_by_user_id={reader.id: BranchPermissionLevel.WRITE},
        ),
    )
    create_frame(
        current_user=root_user,
        session=session,
        data=FrameCreate(
            task_id=task.id,
            account_id=reader.id,
            work_type=WorkType.ANNOTATE,
            source_group_id=visible_source_group.id,
            label_branch_id=branch.id,
        ),
    )
    session.commit()

    for spec_domain, visible_group, hidden_group, visible_spec, hidden_spec in spec_cases:
        visible_specs = spec_domain.list_specs(current_user=reader, session=session)
        assert [item.id for item in visible_specs] == [visible_spec.id]
        assert [group.id for group in visible_specs[0].groups] == [visible_group.id]
        assert spec_domain.count_specs(current_user=reader, session=session) == 1
        assert (
            spec_domain.read_spec(current_user=reader, session=session, id=visible_spec.id).id
            == visible_spec.id
        )
        with pytest.raises(HTTPException) as exc_info:
            spec_domain.read_spec(current_user=reader, session=session, id=hidden_spec.id)
        assert exc_info.value.status_code == 404
        assert (
            spec_domain.read_spec_in_group(
                current_user=reader,
                session=session,
                group_id=hidden_group.id,
            )
            is None
        )


@pytest.mark.parametrize(
    ("spec_domain", "group_model", "create_group", "group_cls", "get_valid_group_ids", "prefix"),
    [
        (
            base_spec_domain,
            LabelGroup,
            create_label_group,
            LabelGroupCreate,
            get_valid_label_group_ids,
            "label",
        ),
        (
            base_source_spec_domain,
            SourceGroup,
            create_source_group,
            SourceGroupCreate,
            get_valid_source_group_ids,
            "source",
        ),
    ],
)
def test_spec_writers_see_every_group_they_replace(
    root_user: UserPublic,
    session: Session,
    spec_domain,
    group_model,
    create_group,
    group_cls,
    get_valid_group_ids,
    prefix: str,
):
    """A write rebuilds the link rows from the submitted group ids, so a writer
    whose visible groups are a subset would persist a list missing the rest and
    unassign them without an error. Only roles that resolve to the complete group
    set may therefore write a specification.
    """
    create_group(
        current_user=root_user,
        session=session,
        data=group_cls(name=f"{prefix}-writer-coupling"),
    )
    all_group_ids = set(session.exec(select(group_model.id)).all())
    assert all_group_ids

    users = {
        role: UserPublic(id=index, username=f"{prefix}-{role.value}", roles={role})
        for index, role in enumerate(Role, start=10_000)
    }
    writable = [role for role in Role if _can_write_specs(spec_domain, users[role], session)]

    # Neither direction may be vacuous: the gate has to admit someone, and
    # visibility has to exclude someone, or the coupling below proves nothing.
    assert writable
    assert len(writable) < len(list(Role))

    for role in writable:
        assert get_valid_group_ids(users[role], session) == all_group_ids

    assert any(
        get_valid_group_ids(users[role], session) != all_group_ids
        for role in Role
        if role not in writable
    )


def test_label_group_has_at_most_one_spec_per_type(root_user: UserPublic, session: Session):
    first_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="label-unique-group-one"),
    )
    second_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="label-unique-group-two"),
    )
    first = base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="first", group_ids=[first_group.id]),
    )
    second = base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="second", group_ids=[second_group.id]),
    )

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.create_spec(
            current_user=root_user,
            session=session,
            data=MockSpecCreate(name="conflict", group_ids=[first_group.id]),
        )
    assert exc_info.value.status_code == 409

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.update_spec(
            current_user=root_user,
            session=session,
            id=second.id,
            data=MockSpecUpdate(group_ids=[first_group.id]),
        )
    assert exc_info.value.status_code == 409

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.bulk_update_specs(
            current_user=root_user,
            session=session,
            ids={first.id, second.id},
            data=MockSpecUpdate(group_ids=[first_group.id]),
        )
    assert exc_info.value.status_code == 409


def test_source_group_has_at_most_one_spec_per_type(root_user: UserPublic, session: Session):
    """The same constraint on the source side, whose writers also report what they queued."""
    first_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="source-unique-group-one"),
    )
    second_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="source-unique-group-two"),
    )
    first, first_jobs = base_source_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSourceSpecCreate(name="first", group_ids=[first_group.id]),
    )
    second, _ = base_source_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSourceSpecCreate(name="second", group_ids=[second_group.id]),
    )
    # The base domain has no reader for what a specification configures, so linking a group
    # cannot make a derived box stale and the report is empty by contract.
    assert first_jobs == []

    with pytest.raises(HTTPException) as exc_info:
        base_source_spec_domain.create_spec(
            current_user=root_user,
            session=session,
            data=MockSourceSpecCreate(name="conflict", group_ids=[first_group.id]),
        )
    assert exc_info.value.status_code == 409

    with pytest.raises(HTTPException) as exc_info:
        base_source_spec_domain.update_spec(
            current_user=root_user,
            session=session,
            id=second.id,
            data=MockSourceSpecUpdate(group_ids=[first_group.id]),
        )
    assert exc_info.value.status_code == 409

    with pytest.raises(HTTPException) as exc_info:
        base_source_spec_domain.bulk_update_specs(
            current_user=root_user,
            session=session,
            ids={first.id, second.id},
            data=MockSourceSpecUpdate(group_ids=[first_group.id]),
        )
    assert exc_info.value.status_code == 409


def test_label_link_table_uniquely_constrains_group_id(
    root_user: UserPublic,
    session: Session,
):
    """
    The database, not ``_validate_group_assignments``, is what makes at most one
    spec of a type per group hold: ``group_id`` carries ``unique=True`` in the
    generated link table, so a losing concurrent writer gets an IntegrityError
    instead of a second spec. The rows are inserted directly here because the
    domain check would reject the second assignment long before the statement is
    emitted, and deleting ``unique=True`` must fail this test.
    """
    shared_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="label-link-unique-shared-group"),
    )
    other_group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="label-link-unique-other-group"),
    )
    first = base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="first", group_ids=[shared_group.id]),
    )
    second = base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="second", group_ids=[other_group.id]),
    )
    session.commit()

    group_links_cls = base_spec_domain.table_cls.get_group_links_cls()

    # `first` already owns `shared_group`, so the row below is the duplicate.
    existing_links = session.exec(
        select(group_links_cls).where(group_links_cls.spec_id == first.id),
    ).all()
    assert [link.group_id for link in existing_links] == [shared_group.id]

    session.add(group_links_cls(spec_id=second.id, group_id=shared_group.id))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_source_link_table_uniquely_constrains_group_id(
    root_user: UserPublic,
    session: Session,
):
    """
    The same constraint on the source link table, for the same reason.

    Stated once in :func:`test_label_link_table_uniquely_constrains_group_id`: what is under
    test is the generated link table, which both specification kinds get from the same call,
    so this variant exists to prove the guarantee is not label-specific.
    """
    shared_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="source-link-unique-shared-group"),
    )
    other_group = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="source-link-unique-other-group"),
    )
    first, _ = base_source_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSourceSpecCreate(name="first", group_ids=[shared_group.id]),
    )
    second, _ = base_source_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSourceSpecCreate(name="second", group_ids=[other_group.id]),
    )
    session.commit()

    group_links_cls = base_source_spec_domain.table_cls.get_group_links_cls()

    existing_links = session.exec(
        select(group_links_cls).where(group_links_cls.spec_id == first.id),
    ).all()
    assert [link.group_id for link in existing_links] == [shared_group.id]

    session.add(group_links_cls(spec_id=second.id, group_id=shared_group.id))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_different_label_spec_types_can_share_group(root_user: UserPublic, session: Session):
    group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="shared-across-spec-types"),
    )
    objclass = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="shared-type-objclass"),
    )
    base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="base", group_ids=[group.id]),
    )
    selections.create_spec(
        current_user=root_user,
        session=session,
        data=selections.create_cls(
            name="selection",
            group_ids=[group.id],
            objclass_ids=[objclass.id],
        ),
    )


@pytest.mark.parametrize("field", ["group_ids", "objclass_ids"])
def test_selection_rejects_null_relationship_collections(
    root_user: UserPublic,
    session: Session,
    field: str,
):
    group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name=f"null-{field}-group"),
    )
    spec = selections.create_spec(
        current_user=root_user,
        session=session,
        data=selections.create_cls(name="null-links", group_ids=[group.id], objclass_ids=[]),
    )
    with pytest.raises(HTTPException) as exc_info:
        selections.update_spec(
            current_user=root_user,
            session=session,
            id=spec.id,
            data=selections.update_cls(**{field: None}),
        )
    assert exc_info.value.status_code == 422


def test_deleted_objclass_is_preserved_but_not_currently_selectable(
    root_user: UserPublic,
    session: Session,
):
    group = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="soft-delete-group"),
    )
    objclass = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="soft-delete-objclass"),
    )
    spec = selections.create_spec(
        current_user=root_user,
        session=session,
        data=selections.create_cls(
            name="soft-delete-selection",
            group_ids=[group.id],
            objclass_ids=[objclass.id],
        ),
    )
    definitions.delete_objclass(current_user=root_user, session=session, id=objclass.id)
    session.commit()

    stored = session.get(ObjectClass, objclass.id)
    assert stored is not None and stored.is_deleted is True
    association_cls = selections.table_cls.get_association_cls()
    assert (
        session.exec(
            select(association_cls).where(association_cls.objclass_id == objclass.id),
        )
        .one()
        .selection_id
        == spec.id
    )
    assert definitions.list_objclasses(current_user=root_user, session=session) == []
    assert (
        selections.read_spec(
            current_user=root_user,
            session=session,
            id=spec.id,
        ).objclasses
        == []
    )


def test_selection_list_serialization_has_bounded_query_count(
    root_user: UserPublic,
    session: Session,
):
    objclass = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="query-count-objclass"),
    )
    for index in range(3):
        group = create_label_group(
            current_user=root_user,
            session=session,
            data=LabelGroupCreate(name=f"query-count-group-{index}"),
        )
        selections.create_spec(
            current_user=root_user,
            session=session,
            data=selections.create_cls(
                name=f"query-count-selection-{index}",
                group_ids=[group.id],
                objclass_ids=[objclass.id],
            ),
        )
    session.commit()
    session.expunge_all()

    statements = 0

    def count_statement(*_args):
        nonlocal statements
        statements += 1

    engine = session.get_bind()
    event.listen(engine, "before_cursor_execute", count_statement)
    try:
        records = selections.list_specs(current_user=root_user, session=session)
        for record in records:
            selections.public_cls.model_validate(record)
    finally:
        event.remove(engine, "before_cursor_execute", count_statement)

    # Specs, group links, groups, and object classes are fetched in four
    # batched queries; serialization must issue no per-spec lazy queries.
    assert statements == 4


def test_objclass_crud_and_list_branches(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(session, root_user, username="objclass_crud_plain", roles=set())

    alpha = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="crud-alpha-objclass", description="alpha"),
    )
    beta = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="crud-beta-objclass", description="beta"),
    )
    session.commit()

    # Reading is unrestricted...
    assert (
        definitions.read_objclass(current_user=plain_user, session=session, id=alpha.id).id
        == alpha.id
    )

    # ...but writing requires DATA_MANAGER.
    with pytest.raises(HTTPException) as exc_info:
        definitions.update_objclass(
            current_user=plain_user,
            session=session,
            id=alpha.id,
            data=ObjectClassUpdate(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        definitions.delete_objclass(current_user=plain_user, session=session, id=alpha.id)
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        definitions.bulk_update_objclasses(
            current_user=plain_user,
            session=session,
            ids={alpha.id},
            data=ObjectClassBulkUpdate(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    # count + list branches.
    assert definitions.count_objclasses(current_user=root_user, session=session) == 2
    assert (
        definitions.count_objclasses(
            current_user=root_user,
            session=session,
            name="crud-beta-objclass",
        )
        == 1
    )
    assert len(definitions.list_objclasses(current_user=root_user, session=session, limit=1)) == 1
    assert [
        objclass.id
        for objclass in definitions.list_objclasses(
            current_user=root_user,
            session=session,
            id=beta.id,
        )
    ] == [beta.id]
    assert [
        objclass.id
        for objclass in definitions.list_objclasses(
            current_user=root_user,
            session=session,
            name="crud-alpha-objclass",
        )
    ] == [alpha.id]

    # An update that omits the description leaves the stored one untouched.
    updated = definitions.update_objclass(
        current_user=root_user,
        session=session,
        id=alpha.id,
        data=ObjectClassUpdate(name="crud-alpha-renamed"),
    )
    session.commit()
    assert updated.name == "crud-alpha-renamed"
    assert updated.description == "alpha"

    # An explicit value passes through...
    updated = definitions.update_objclass(
        current_user=root_user,
        session=session,
        id=alpha.id,
        data=ObjectClassUpdate(description="alpha updated"),
    )
    session.commit()
    assert updated.description == "alpha updated"

    # ...and an explicitly-sent null still normalizes to the empty string.
    updated = definitions.update_objclass(
        current_user=root_user,
        session=session,
        id=alpha.id,
        data=ObjectClassUpdate(description=None),
    )
    session.commit()
    assert updated.description == ""

    with pytest.raises(HTTPException) as exc_info:
        definitions.update_objclass(
            current_user=root_user,
            session=session,
            id=99999,
            data=ObjectClassUpdate(name="ghost"),
        )
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        definitions.read_objclass(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404

    # bulk update.
    definitions.bulk_update_objclasses(
        current_user=root_user,
        session=session,
        ids={alpha.id, beta.id},
        data=ObjectClassBulkUpdate(description="bulk description", color_rgb=255),
    )
    session.commit()
    assert session.get(ObjectClass, alpha.id).description == "bulk description"
    assert session.get(ObjectClass, beta.id).color_rgb == 255

    # A bulk update with an explicitly-sent null description normalizes to "".
    definitions.bulk_update_objclasses(
        current_user=root_user,
        session=session,
        ids={alpha.id},
        data=ObjectClassBulkUpdate(description=None),
    )
    session.commit()
    assert session.get(ObjectClass, alpha.id).description == ""

    # delete.
    definitions.delete_objclass(current_user=root_user, session=session, id=beta.id)
    session.commit()
    assert session.get(ObjectClass, beta.id).is_deleted is True

    with pytest.raises(HTTPException) as exc_info:
        definitions.delete_objclass(current_user=root_user, session=session, id=beta.id)
    assert exc_info.value.status_code == 404


def test_selection_crud_and_association_cleanup(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(session, root_user, username="selection_crud_plain", roles=set())

    group_alpha = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="selection-group-alpha"),
    )
    group_beta = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="selection-group-beta"),
    )
    objclass_alpha = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="selection-objclass-alpha"),
    )
    objclass_beta = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="selection-objclass-beta"),
    )

    spec = selections.create_spec(
        current_user=root_user,
        session=session,
        data=selections.create_cls(
            name="selection-crud-spec",
            description="original description",
            group_ids=[group_alpha.id],
            objclass_ids=[objclass_alpha.id],
        ),
    )
    session.commit()
    assert spec.id is not None

    # Writing requires DATA_MANAGER.
    with pytest.raises(HTTPException) as exc_info:
        selections.update_spec(
            current_user=plain_user,
            session=session,
            id=spec.id,
            data=selections.update_cls(name="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        selections.delete_spec(current_user=plain_user, session=session, id=spec.id)
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        selections.bulk_update_specs(
            current_user=plain_user,
            session=session,
            ids={spec.id},
            data=selections.update_cls(description="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        selections.update_spec(
            current_user=root_user,
            session=session,
            id=99999,
            data=selections.update_cls(name="selection-crud-ghost"),
        )
    assert exc_info.value.status_code == 404

    # An update that omits the description leaves the stored one untouched.
    updated = selections.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=selections.update_cls(name="selection-crud-renamed"),
    )
    session.commit()

    assert updated.name == "selection-crud-renamed"
    assert updated.description == "original description"

    # An explicitly-sent null description normalizes to ""; field update plus
    # group/objclass relinking.
    updated = selections.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=selections.update_cls(
            description=None,
            group_ids=[group_beta.id],
            objclass_ids=[objclass_beta.id],
        ),
    )
    session.commit()

    assert updated.description == ""
    assert {group.id for group in updated.groups} == {group_beta.id}
    assert {objclass.id for objclass in updated.objclasses} == {objclass_beta.id}

    # An explicit description value passes through.
    updated = selections.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=selections.update_cls(description="selection description updated"),
    )
    session.commit()

    assert updated.description == "selection description updated"

    # read_spec / read_spec_in_group.
    assert selections.read_spec(current_user=root_user, session=session, id=spec.id).id == spec.id

    with pytest.raises(HTTPException) as exc_info:
        selections.read_spec(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404

    assert (
        selections.read_spec_in_group(
            current_user=root_user,
            session=session,
            group_id=group_beta.id,
        ).id
        == spec.id
    )
    assert (
        selections.read_spec_in_group(
            current_user=root_user,
            session=session,
            group_id=group_alpha.id,
        )
        is None
    )
    assert [
        selection.id
        for selection in selections.list_specs(
            current_user=root_user,
            session=session,
            group_id=group_beta.id,
        )
    ] == [spec.id]
    assert (
        selections.count_specs(current_user=root_user, session=session, group_id=group_beta.id) == 1
    )
    assert (
        selections.list_specs(current_user=root_user, session=session, group_id=group_alpha.id)
        == []
    )
    assert (
        selections.count_specs(current_user=root_user, session=session, group_id=group_alpha.id)
        == 0
    )

    assert selections.count_specs(current_user=root_user, session=session) == 1

    # Bulk update replaces scalar fields and the many-to-many object classes.
    # Group links remain distinct because a group has one spec per type.
    second_spec = selections.create_spec(
        current_user=root_user,
        session=session,
        data=selections.create_cls(
            name="selection-crud-second-spec",
            group_ids=[group_alpha.id],
            objclass_ids=[objclass_alpha.id],
        ),
    )
    selections.bulk_update_specs(
        current_user=root_user,
        session=session,
        ids={spec.id, second_spec.id},
        data=selections.update_cls(
            description="bulk description",
            objclass_ids=[objclass_alpha.id],
        ),
    )
    session.commit()

    association_cls = selections.table_cls.get_association_cls()
    group_links_cls = selections.table_cls.get_group_links_cls()

    assert session.get(selections.table_cls, spec.id).description == "bulk description"
    assert session.get(selections.table_cls, second_spec.id).description == "bulk description"
    # Each group still has one spec, while both specs use objclass_alpha.
    assert (
        len(
            session.exec(
                select(group_links_cls).where(group_links_cls.group_id == group_alpha.id),
            ).all(),
        )
        == 1
    )
    assert (
        len(
            session.exec(
                select(association_cls).where(association_cls.objclass_id == objclass_alpha.id),
            ).all(),
        )
        == 2
    )

    # Clearing objclass_ids empties the association table (empty-insert guard);
    # the omitted description is left untouched.
    updated = selections.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=selections.update_cls(objclass_ids=[]),
    )
    session.commit()
    assert updated.objclasses == []
    assert updated.description == "bulk description"

    # A bulk update with an explicitly-sent null description normalizes to "".
    selections.bulk_update_specs(
        current_user=root_user,
        session=session,
        ids={second_spec.id},
        data=selections.update_cls(description=None),
    )
    session.commit()
    assert session.get(selections.table_cls, second_spec.id).description == ""

    # can_read_spec: manager bypass vs. user without any valid groups.
    assert selections.can_read_spec(root_user, session, spec) is True
    assert selections.can_read_spec(plain_user, session, spec) is False

    # delete cleans up both association tables.
    selections.delete_spec(current_user=root_user, session=session, id=second_spec.id)
    session.commit()

    assert session.get(selections.table_cls, second_spec.id) is None
    assert (
        session.exec(
            select(group_links_cls).where(group_links_cls.spec_id == second_spec.id),
        ).all()
        == []
    )
    assert (
        session.exec(
            select(association_cls).where(association_cls.selection_id == second_spec.id),
        ).all()
        == []
    )

    with pytest.raises(HTTPException) as exc_info:
        selections.delete_spec(current_user=root_user, session=session, id=second_spec.id)
    assert exc_info.value.status_code == 404


def test_base_spec_domain_paths(root_user: UserPublic, session: Session):
    """Exercise the LabelSpecDomain base bodies that selections overrides.

    The real ObjectClassSelectionDomain overrides create/list/count/update/
    delete/bulk, so those base implementations are only reachable through a
    domain that does not override them — hence this test-only subclass.
    """
    plain_user = _create_test_user(session, root_user, username="base_spec_plain", roles=set())

    group_alpha = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="base-spec-group-alpha"),
    )
    group_beta = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="base-spec-group-beta"),
    )

    spec = base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="base-spec-first", group_ids=[group_alpha.id]),
    )
    session.commit()
    assert spec.id is not None

    # Guards.
    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.update_spec(
            current_user=plain_user,
            session=session,
            id=spec.id,
            data=MockSpecUpdate(name="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.delete_spec(current_user=plain_user, session=session, id=spec.id)
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.bulk_update_specs(
            current_user=plain_user,
            session=session,
            ids={spec.id},
            data=MockSpecUpdate(name="member attempt"),
        )
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.update_spec(
            current_user=root_user,
            session=session,
            id=99999,
            data=MockSpecUpdate(name="base-spec-ghost"),
        )
    assert exc_info.value.status_code == 404

    # Update with group relinking.
    updated = base_spec_domain.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=MockSpecUpdate(name="base-spec-renamed", group_ids=[group_beta.id]),
    )
    session.commit()

    assert updated.name == "base-spec-renamed"
    assert {group.id for group in updated.groups} == {group_beta.id}

    # Read paths.
    assert (
        base_spec_domain.read_spec(current_user=root_user, session=session, id=spec.id).id
        == spec.id
    )

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.read_spec(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404

    assert (
        base_spec_domain.read_spec_in_group(
            current_user=root_user,
            session=session,
            group_id=group_beta.id,
        ).id
        == spec.id
    )
    assert (
        base_spec_domain.read_spec_in_group(
            current_user=root_user,
            session=session,
            group_id=group_alpha.id,
        )
        is None
    )

    # list/count branches; empty group_ids covers the _bulk_insert_groups guard.
    second_spec = base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="base-spec-second", group_ids=[]),
    )
    session.commit()

    assert base_spec_domain.count_specs(current_user=root_user, session=session) == 2
    assert (
        base_spec_domain.count_specs(
            current_user=root_user,
            session=session,
            name="base-spec-second",
        )
        == 1
    )
    assert len(base_spec_domain.list_specs(current_user=root_user, session=session, limit=1)) == 1
    assert [
        record.id
        for record in base_spec_domain.list_specs(
            current_user=root_user,
            session=session,
            id=second_spec.id,
        )
    ] == [second_spec.id]
    assert {
        record.id
        for record in base_spec_domain.list_specs(
            current_user=root_user,
            session=session,
            ids={spec.id, second_spec.id},
        )
    } == {spec.id, second_spec.id}
    assert [
        record.id
        for record in base_spec_domain.list_specs(
            current_user=root_user,
            session=session,
            name="base-spec-renamed",
        )
    ] == [spec.id]

    # Bulk scalar updates leave the distinct group links unchanged.
    base_spec_domain.bulk_update_specs(
        current_user=root_user,
        session=session,
        ids={spec.id, second_spec.id},
        data=MockSpecUpdate(name="base-spec-bulk"),
    )
    session.commit()

    group_links_cls = MockSpec.get_group_links_cls()

    assert session.get(MockSpec, spec.id).name == "base-spec-bulk"
    assert session.get(MockSpec, second_spec.id).name == "base-spec-bulk"
    # Neither existing group assignment is changed by the scalar update.
    assert (
        len(
            session.exec(
                select(group_links_cls).where(group_links_cls.group_id == group_alpha.id),
            ).all(),
        )
        == 0
    )

    # can_read_spec: manager bypass vs. user without valid groups.
    assert base_spec_domain.can_read_spec(root_user, session, spec) is True
    assert base_spec_domain.can_read_spec(plain_user, session, spec) is False

    # Delete cleans up the group links.
    base_spec_domain.delete_spec(current_user=root_user, session=session, id=second_spec.id)
    session.commit()

    assert session.get(MockSpec, second_spec.id) is None
    assert (
        session.exec(
            select(group_links_cls).where(group_links_cls.spec_id == second_spec.id),
        ).all()
        == []
    )

    with pytest.raises(HTTPException) as exc_info:
        base_spec_domain.delete_spec(current_user=root_user, session=session, id=second_spec.id)
    assert exc_info.value.status_code == 404


def test_selection_spec_mutation_with_loaded_collections(root_user: UserPublic, session: Session):
    """Regression: update_spec/delete_spec must work when the spec's
    groups/objclasses relationships were loaded earlier in the SAME session.

    The domains delete link rows with core DELETE statements and then re-add
    ORM objects; with default session synchronization, preloaded link
    collections were marked deleted and the mutation raised
    InvalidRequestError/AssertionError ("Instance ... has been deleted").
    """
    group_alpha = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="loaded-sel-group-alpha"),
    )
    group_beta = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="loaded-sel-group-beta"),
    )
    objclass_alpha = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="loaded-sel-objclass-alpha"),
    )
    objclass_beta = definitions.create_objclass(
        current_user=root_user,
        session=session,
        data=ObjectClassCreate(name="loaded-sel-objclass-beta"),
    )

    spec = selections.create_spec(
        current_user=root_user,
        session=session,
        data=selections.create_cls(
            name="loaded-collections-spec",
            group_ids=[group_alpha.id],
            objclass_ids=[objclass_alpha.id],
        ),
    )
    session.commit()
    assert spec.id is not None

    # Load both relationship collections, then relink them in the same session.
    assert {group.id for group in spec.groups} == {group_alpha.id}
    assert {objclass.id for objclass in spec.objclasses} == {objclass_alpha.id}

    updated = selections.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=selections.update_cls(
            group_ids=[group_beta.id],
            objclass_ids=[objclass_beta.id],
        ),
    )
    session.commit()

    assert {group.id for group in updated.groups} == {group_beta.id}
    assert {objclass.id for objclass in updated.objclasses} == {objclass_beta.id}

    # Load the collections again, then delete the spec in the same session.
    assert {group.id for group in updated.groups} == {group_beta.id}
    assert {objclass.id for objclass in updated.objclasses} == {objclass_beta.id}

    selections.delete_spec(current_user=root_user, session=session, id=spec.id)
    session.commit()

    assert session.get(selections.table_cls, spec.id) is None
    group_links_cls = selections.table_cls.get_group_links_cls()
    association_cls = selections.table_cls.get_association_cls()
    assert (
        session.exec(
            select(group_links_cls).where(group_links_cls.spec_id == spec.id),
        ).all()
        == []
    )
    assert (
        session.exec(
            select(association_cls).where(association_cls.selection_id == spec.id),
        ).all()
        == []
    )


def test_base_spec_mutation_with_loaded_collections(root_user: UserPublic, session: Session):
    """Regression: same as above for the LabelSpecDomain base bodies."""
    group_alpha = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="loaded-base-group-alpha"),
    )
    group_beta = create_label_group(
        current_user=root_user,
        session=session,
        data=LabelGroupCreate(name="loaded-base-group-beta"),
    )

    spec = base_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSpecCreate(name="loaded-base-spec", group_ids=[group_alpha.id]),
    )
    session.commit()
    assert spec.id is not None

    # Load the relationship collection, then relink it in the same session.
    assert {group.id for group in spec.groups} == {group_alpha.id}

    updated = base_spec_domain.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=MockSpecUpdate(group_ids=[group_beta.id]),
    )
    session.commit()

    assert {group.id for group in updated.groups} == {group_beta.id}

    # Load the collection again, then delete the spec in the same session.
    assert {group.id for group in updated.groups} == {group_beta.id}

    base_spec_domain.delete_spec(current_user=root_user, session=session, id=spec.id)
    session.commit()

    assert session.get(MockSpec, spec.id) is None
    group_links_cls = MockSpec.get_group_links_cls()
    assert (
        session.exec(
            select(group_links_cls).where(group_links_cls.spec_id == spec.id),
        ).all()
        == []
    )


def test_source_spec_mutation_with_loaded_collections(root_user: UserPublic, session: Session):
    """Regression: same as above for the SourceSpecDomain base bodies."""
    group_alpha = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="loaded-source-group-alpha"),
    )
    group_beta = create_source_group(
        current_user=root_user,
        session=session,
        data=SourceGroupCreate(name="loaded-source-group-beta"),
    )

    spec, queued = base_source_spec_domain.create_spec(
        current_user=root_user,
        session=session,
        data=MockSourceSpecCreate(name="loaded-source-spec", group_ids=[group_alpha.id]),
    )
    session.commit()
    assert spec.id is not None
    # The base domain queues nothing: it has no reader for the data a specification
    # configures, so the report it hands back is empty by contract.
    assert queued == []

    # Load the relationship collection, then relink it in the same session.
    assert {group.id for group in spec.groups} == {group_alpha.id}

    updated, _ = base_source_spec_domain.update_spec(
        current_user=root_user,
        session=session,
        id=spec.id,
        data=MockSourceSpecUpdate(group_ids=[group_beta.id]),
    )
    session.commit()

    assert {group.id for group in updated.groups} == {group_beta.id}

    # Load the collection again, then delete the spec in the same session.
    assert {group.id for group in updated.groups} == {group_beta.id}

    base_source_spec_domain.delete_spec(current_user=root_user, session=session, id=spec.id)
    session.commit()

    assert session.get(MockSourceSpec, spec.id) is None
    group_links_cls = MockSourceSpec.get_group_links_cls()
    assert (
        session.exec(
            select(group_links_cls).where(group_links_cls.spec_id == spec.id),
        ).all()
        == []
    )
