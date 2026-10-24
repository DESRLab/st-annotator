"""Specification batch deletes preserve single-record rules and commit atomically."""

from fastapi import HTTPException
from sqlmodel import Session, select

import pytest

from sta.api.label.spec.objclass.definitions import bulk_delete_objclasses
from sta.api.label.spec.objclass.selections import bulk_delete_selections
from sta.domain.label.spec.objclass import selections as selections_domain
from sta.models.label.group import LabelGroupPublic
from sta.models.label.spec import ObjectClass, ObjectClassSelection, ObjectClassSelectionCreate
from sta.models.user import Role, UserPublic

pytestmark = [pytest.mark.in_memory_db, pytest.mark.no_plugins]


@pytest.fixture
def specification_ids(session: Session, root_user: UserPublic, label_group: LabelGroupPublic):
    """Keep two selections with loaded group/class memberships in the session."""
    definitions = [ObjectClass(name="first"), ObjectClass(name="second")]
    session.add_all(definitions)
    session.flush()
    definition_ids = [record.id for record in definitions]
    selections = [
        selections_domain.create_spec(
            current_user=root_user,
            session=session,
            data=ObjectClassSelectionCreate(
                name=f"selection-{index}",
                group_ids=[label_group.id] if index == 0 else [],
                objclass_ids=definition_ids,
            ),
        )
        for index in range(2)
    ]
    session.commit()
    selection_ids = [record.id for record in selections]
    for record in selections:
        assert len(record.objclasses) == 2
        list(record.group_links)
    return definition_ids, selection_ids


def test_definition_batch_delete_preserves_historical_records(
    session: Session, root_user: UserPublic, specification_ids
):
    """Definitions are soft-deleted; their historical associations stay stored."""
    definition_ids, selection_ids = specification_ids
    result = bulk_delete_objclasses(current_user=root_user, session=session, ids=definition_ids)
    assert result.success
    assert all(session.get(ObjectClass, id).is_deleted for id in definition_ids)
    assert all(session.get(ObjectClassSelection, id) is not None for id in selection_ids)
    association = ObjectClassSelection.get_association_cls()
    assert len(session.exec(select(association)).all()) == 4


def test_selection_batch_delete_removes_all_loaded_links(
    session: Session, root_user: UserPublic, specification_ids
):
    """Every deleted selection loses both its group and object-class links."""
    definition_ids, selection_ids = specification_ids
    result = bulk_delete_selections(current_user=root_user, session=session, ids=selection_ids)
    assert result.success
    assert all(session.get(ObjectClassSelection, id) is None for id in selection_ids)
    assert all(not session.get(ObjectClass, id).is_deleted for id in definition_ids)
    assert session.exec(select(ObjectClassSelection.get_association_cls())).all() == []
    assert session.exec(select(ObjectClassSelection.get_group_links_cls())).all() == []


@pytest.mark.parametrize("kind", ["definitions", "selections"])
def test_batch_delete_does_not_commit_a_partial_failure(
    session: Session, root_user: UserPublic, specification_ids, kind: str
):
    """A missing later record leaves the entire batch available after rollback."""
    definition_ids, selection_ids = specification_ids
    endpoint = bulk_delete_objclasses if kind == "definitions" else bulk_delete_selections
    ids = definition_ids if kind == "definitions" else selection_ids
    with pytest.raises(HTTPException) as exc:
        endpoint(current_user=root_user, session=session, ids=[ids[0], 999999])
    assert exc.value.status_code == 404
    session.rollback()
    assert all(not session.get(ObjectClass, id).is_deleted for id in definition_ids)
    assert all(session.get(ObjectClassSelection, id) is not None for id in selection_ids)
    assert len(session.exec(select(ObjectClassSelection.get_association_cls())).all()) == 4


@pytest.mark.parametrize("endpoint", [bulk_delete_objclasses, bulk_delete_selections])
def test_batch_delete_requires_data_manager(
    session: Session, root_user: UserPublic, specification_ids, endpoint
):
    """An annotator cannot delete any of the selected specifications."""
    definition_ids, selection_ids = specification_ids
    reader = root_user.model_copy(update={"roles": {Role.ANNOTATOR}})
    ids = definition_ids if endpoint is bulk_delete_objclasses else selection_ids
    with pytest.raises(HTTPException) as exc:
        endpoint(current_user=reader, session=session, ids=ids)
    assert exc.value.status_code == 403
    assert all(not session.get(ObjectClass, id).is_deleted for id in definition_ids)
    assert all(session.get(ObjectClassSelection, id) is not None for id in selection_ids)
