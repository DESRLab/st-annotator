"""Revision-aware references to dynamically registered element types."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ValidationError

import pytest

from sta.domain.label.data import LabelElementDomain
from sta.domain.label.data.endpoints import register_element_domain
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import DeleteBase
from sta.models.label.data import LabelElementSQLModel
from sta.models.label.repo import LabelsetCommitInstruction
from sta_relation import plugin
from sta_relation.domain.classes import definitions, selections
from sta_relation.domain.data import delete_attached, domain
from sta_relation.domain.ops import (
    Create,
    Delete,
    DeleteParams,
    RelationParams,
    Update,
    UpdateParams,
)
from sta_relation.models.classes import (
    RelationClassCreate,
    RelationClassSelectionCreate,
    RelationClassSelectionUpdate,
    RelationClassUpdate,
)

pytestmark = pytest.mark.in_memory_db


class EndpointSQLModel(LabelElementSQLModel):
    pass


Endpoint = EndpointSQLModel.get_table_cls("relation_test_endpoint")
endpoint_domain = LabelElementDomain(
    table_cls=Endpoint,
    create_cls=EndpointSQLModel,
    public_cls=EndpointSQLModel.get_public_cls(),
    update_cls=EndpointSQLModel.get_update_cls(),
    bulk_update_cls=EndpointSQLModel.get_update_cls(),
)


class EndpointDeleteParams(BaseModel):
    id: uuid.UUID


class EndpointDelete(DeleteBase[EndpointDeleteParams]):
    @classmethod
    def get_domain(cls):
        return endpoint_domain

    @classmethod
    def get_id(cls, params):
        return params.id


@pytest.fixture
def relation_fixture(session, root_user, labelset_branch, monkeypatch, op_registry):
    monkeypatch.setattr("sta.domain.label.data.endpoints.ELEMENT_DOMAINS", {})
    monkeypatch.setattr(
        "sta.domain.label.data.endpoints.ELEMENT_DELETE_LISTENERS", [delete_attached]
    )
    op_registry.register("relation-create", Create, RelationParams)
    op_registry.register("relation-update", Update, UpdateParams)
    op_registry.register("relation-delete", Delete, DeleteParams)
    op_registry.register("endpoint-delete", EndpointDelete, EndpointDeleteParams)
    register_element_domain("fake-a", endpoint_domain)
    register_element_domain("fake-b", endpoint_domain)
    group_id = labelset_branch.group.id
    head = labelset_branch.head.hash
    definition = definitions.create_relclass(
        current_user=root_user,
        session=session,
        data=RelationClassCreate(name="supports", color_rgb=0x123456),
    )
    selection = selections.create_spec(
        current_user=root_user,
        session=session,
        data=RelationClassSelectionCreate(
            name="relations", group_ids=[group_id], relclass_ids=[definition.id]
        ),
    )
    first = endpoint_domain.create_data(
        current_user=root_user,
        session=session,
        data=EndpointSQLModel(group_id=group_id, commit_hash=head),
    )
    second = endpoint_domain.create_data(
        current_user=root_user,
        session=session,
        data=EndpointSQLModel(group_id=group_id, commit_hash=head),
    )
    session.commit()
    params = {
        "source": {"type": "fake-a", "id": str(first.id)},
        "target": {"type": "fake-b", "id": str(second.id)},
        "relation_class_id": definition.id,
    }

    def push(name, data):
        (result,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[LabelsetCommitInstruction(op_name=name, op_params=data)],
        )
        session.commit()
        return result

    return params, push, first.id, second.id, group_id, head, selection.id, labelset_branch.id


def test_cross_type_relation_history_and_endpoint_deletion(session, root_user, relation_fixture):
    params, push, first, _, group, initial_head, _, branch_id = relation_fixture
    relation_id = push("relation-create", params)
    assert isinstance(relation_id, uuid.UUID)
    branch = read_branch(current_user=root_user, session=session, id=branch_id)
    created_head = branch.head_hash
    relation = domain.read_data(
        current_user=root_user,
        session=session,
        id=relation_id,
        group_id=group,
        commit_hash=created_head,
    )
    assert relation.source_type == "fake-a" and relation.target_type == "fake-b"
    assert relation.relation_class_id == params["relation_class_id"]
    push("endpoint-delete", {"id": str(first)})
    deleted_head = read_branch(current_user=root_user, session=session, id=branch_id).head_hash
    # read_data refuses tombstones, but the snapshot remains in its commit.
    assert session.get(domain.table_cls, (group, deleted_head, relation_id)).is_deleted
    assert not domain.read_data(
        current_user=root_user,
        session=session,
        id=relation_id,
        group_id=group,
        commit_hash=created_head,
    ).is_deleted
    assert (
        domain.list_datas(
            current_user=root_user, session=session, group_id=group, commit_hash=initial_head
        )
        == []
    )


@pytest.mark.parametrize("mutation", ["unknown", "missing", "self", "class", "relation"])
def test_invalid_reference_is_rejected_and_rolls_back(session, relation_fixture, mutation):
    params, push, _, _, _, _, _, _ = relation_fixture
    if mutation == "unknown":
        params["target"]["type"] = "absent-plugin"
    if mutation == "missing":
        params["target"]["id"] = str(uuid.uuid4())
    if mutation == "self":
        params["target"] = params["source"]
    if mutation == "class":
        params["relation_class_id"] = 999999
    if mutation == "relation":
        params["target"]["type"] = "relation"
    with pytest.raises(HTTPException) as exc:
        push("relation-create", params)
    assert exc.value.status_code in {404, 422}
    session.rollback()


def test_membership_omission_preserves_and_null_is_rejected(session, root_user, relation_fixture):
    params, _, _, _, group, _, selection_id, _ = relation_fixture
    selection = selections.update_spec(
        current_user=root_user,
        session=session,
        id=selection_id,
        data=RelationClassSelectionUpdate(description="updated"),
    )
    assert [item.id for item in selection.relclasses] == [params["relation_class_id"]]
    assert [item.id for item in selection.groups] == [group]
    with pytest.raises(HTTPException):
        selections.update_spec(
            current_user=root_user,
            session=session,
            id=selection_id,
            data=RelationClassSelectionUpdate(relclass_ids=None),
        )
    with pytest.raises(ValidationError):
        RelationClassUpdate(name=None)


def test_class_authorization_preserves_rows_and_scopes_selections(
    session, root_user, principal_profiles, relation_fixture
):
    params, _, _, _, _, _, selection_id, _ = relation_fixture
    class_id = params["relation_class_id"]
    assert (
        definitions.read_relclass(
            current_user=principal_profiles.no_roles, session=session, id=class_id
        ).name
        == "supports"
    )
    with pytest.raises(HTTPException) as denied:
        definitions.update_relclass(
            current_user=principal_profiles.project_manager,
            session=session,
            id=class_id,
            data=RelationClassUpdate(name="forbidden"),
        )
    assert denied.value.status_code == 403
    assert (
        definitions.read_relclass(current_user=root_user, session=session, id=class_id).name
        == "supports"
    )
    with pytest.raises(HTTPException) as hidden:
        selections.read_spec(
            current_user=principal_profiles.no_roles, session=session, id=selection_id
        )
    assert hidden.value.status_code == 404
    assert (
        selections.read_spec(current_user=root_user, session=session, id=selection_id).id
        == selection_id
    )


def test_loader_only_includes_relations_with_both_endpoints_in_frame(
    session, root_user, relation_fixture
):
    from sta.models.frame import FramePublic
    from sta_relation.domain.loader import RelationLoader

    params, push, first, second, group, head, _, branch_id = relation_fixture
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for id, x in ((first, 0), (second, 10)):
        endpoint_domain.update_data(
            current_user=root_user,
            session=session,
            id=id,
            group_id=group,
            commit_hash=head,
            data=EndpointSQLModel.get_update_cls()(
                min_x=x,
                max_x=x,
                min_timestamp=start + timedelta(seconds=x),
                max_timestamp=start + timedelta(seconds=x),
            ),
        )
    relation_id = push("relation-create", params)
    frames = [
        FramePublic(
            id=id,
            task_id=1,
            account_id=1,
            work_type="annotate",
            source_group_id=None,
            label_branch_id=branch_id,
            min_x=0,
            max_x=max_x,
        )
        for id, max_x in ((1, 5), (2, 10))
    ]
    frames.append(
        frames[1].model_copy(
            update={
                "id": 3,
                "min_timestamp": start,
                "max_timestamp": start + timedelta(seconds=5),
            }
        )
    )
    narrow, wide, temporal = RelationLoader().get_data_bulk(
        current_user=root_user, session=session, frames=frames, other_args={}
    )
    assert narrow.relations == []
    assert temporal.relations == []
    assert [relation.id for relation in wide.relations] == [relation_id]


@pytest.mark.parametrize("delta,candidates", [("1", "1"), ("1", "0"), ("0", "1")])
def test_empty_frame_does_not_resolve_relation_history(
    session, root_user, relation_fixture, monkeypatch, delta, candidates
):
    from sta.models.frame import FramePublic
    from sta_relation.domain.loader import RelationLoader

    monkeypatch.setenv("STA_USE_DELTA_ENCODING", delta)
    monkeypatch.setenv("STA_USE_ANCESTOR_CANDIDATES", candidates)
    _, _, first, second, group, head, _, branch_id = relation_fixture
    for id in (first, second):
        endpoint_domain.update_data(
            current_user=root_user,
            session=session,
            id=id,
            group_id=group,
            commit_hash=head,
            data=EndpointSQLModel.get_update_cls()(min_x=20, max_x=20),
        )

    def unexpected_relation_query(*args, **kwargs):
        pytest.fail("An empty frame must not resolve branch-wide relation history")

    monkeypatch.setattr(domain, "build_list_query", unexpected_relation_query)
    frame = FramePublic(
        id=1,
        task_id=1,
        account_id=1,
        work_type="annotate",
        source_group_id=None,
        label_branch_id=branch_id,
        min_x=0,
        max_x=5,
    )
    [data] = RelationLoader().get_data_bulk(
        current_user=root_user, session=session, frames=[frame], other_args={}
    )
    assert data.relations == []
    assert len(data.classes) == 1


@pytest.mark.parametrize("delta,candidates", [("1", "1"), ("1", "0"), ("0", "1")])
def test_relation_candidates_are_rechecked_at_the_visible_revision(
    session, root_user, relation_fixture, monkeypatch, delta, candidates
):
    from sta.models.frame import FramePublic
    from sta_relation.domain.loader import RelationLoader

    monkeypatch.setenv("STA_USE_DELTA_ENCODING", delta)
    monkeypatch.setenv("STA_USE_ANCESTOR_CANDIDATES", candidates)
    params, push, first, second, group, head, _, branch_id = relation_fixture
    for id in (first, second):
        endpoint_domain.update_data(
            current_user=root_user,
            session=session,
            id=id,
            group_id=group,
            commit_hash=head,
            data=EndpointSQLModel.get_update_cls()(min_x=0, max_x=0),
        )
    outside = endpoint_domain.create_data(
        current_user=root_user,
        session=session,
        data=EndpointSQLModel(group_id=group, commit_hash=head, min_x=20, max_x=20),
    )
    visible_id = push("relation-create", params)
    outside_params = {**params, "target": {"type": "fake-b", "id": str(outside.id)}}
    outside_id = push("relation-create", outside_params)
    frame = FramePublic(
        id=1,
        task_id=1,
        account_id=1,
        work_type="annotate",
        source_group_id=None,
        label_branch_id=branch_id,
        min_x=0,
        max_x=5,
    )

    def load_ids():
        [data] = RelationLoader().get_data_bulk(
            current_user=root_user, session=session, frames=[frame], other_args={}
        )
        return {relation.id for relation in data.relations}

    if delta == candidates == "1":
        original = domain._select_closest_states

        def narrowed_states(group_id, commit_hash, candidate_ids=None):
            assert candidate_ids is not None
            assert set(session.exec(candidate_ids).all()) == {visible_id}
            return original(group_id, commit_hash, candidate_ids)

        with monkeypatch.context() as patch:
            patch.setattr(domain, "_select_closest_states", narrowed_states)
            assert load_ids() == {visible_id}
    else:
        assert load_ids() == {visible_id}
    assert outside_id not in load_ids()

    # The older matching relation is a candidate, but its visible endpoints no longer match.
    def advance_target(target_id):
        # Seed changed endpoint states in a new revision independently of operation payloads.
        push("relation-create", outside_params)
        branch = read_branch(current_user=root_user, session=session, id=branch_id)
        session.merge(
            domain.table_cls(
                id=visible_id,
                group_id=group,
                commit_hash=branch.head_hash,
                source_type="fake-a",
                source_id=first,
                target_type="fake-b",
                target_id=target_id,
                relation_class_id=params["relation_class_id"],
            )
        )
        session.commit()

    advance_target(outside.id)
    assert load_ids() == set()
    advance_target(second)
    assert load_ids() == {visible_id}
    push("endpoint-delete", {"id": str(second)})
    assert load_ids() == set()


def test_plugin_registers_new_names_and_reads_legacy_operations(monkeypatch, op_registry):
    monkeypatch.setattr(plugin.data, "router", APIRouter())
    monkeypatch.setattr(plugin.spec, "router", APIRouter())
    monkeypatch.setattr(plugin, "OP_REGISTRY", op_registry)
    monkeypatch.setattr(plugin, "LABEL_DATA_LOADERS", {})
    monkeypatch.setattr(plugin, "ELEMENT_DELETE_LISTENERS", [])
    plugin.register()
    assert set(plugin.LABEL_DATA_LOADERS) == {"relation"}
    for mode, operation in [("create", Create), ("update", Update), ("delete", Delete)]:
        assert op_registry.get_op_type(f"relation-{mode}") is operation
    assert domain.table_cls.__tablename__ == "label_relation"


def test_relation_update_persists_endpoints_and_class(session, root_user, relation_fixture):
    params, push, _, _, group, _, selection_id, branch_id = relation_fixture
    relation_id = push("relation-create", params)
    created_head = read_branch(current_user=root_user, session=session, id=branch_id).head_hash
    definition = definitions.create_relclass(
        current_user=root_user, session=session, data=RelationClassCreate(name="behind")
    )
    selections.update_spec(
        current_user=root_user,
        session=session,
        id=selection_id,
        data=RelationClassSelectionUpdate(
            relclass_ids=[params["relation_class_id"], definition.id]
        ),
    )
    session.commit()
    push(
        "relation-update",
        {
            "relation_id": str(relation_id),
            "source": params["target"],
            "target": params["source"],
            "relation_class_id": definition.id,
        },
    )
    session.expire_all()
    updated_head = read_branch(current_user=root_user, session=session, id=branch_id).head_hash
    updated = domain.read_data(
        current_user=root_user,
        session=session,
        id=relation_id,
        group_id=group,
        commit_hash=updated_head,
    )
    assert updated.source_type == params["target"]["type"]
    assert str(updated.source_id) == params["target"]["id"]
    assert updated.target_type == params["source"]["type"]
    assert str(updated.target_id) == params["source"]["id"]
    assert updated.relation_class_id == definition.id
    original = domain.read_data(
        current_user=root_user,
        session=session,
        id=relation_id,
        group_id=group,
        commit_hash=created_head,
    )
    assert original.source_type == params["source"]["type"]
    assert original.relation_class_id == params["relation_class_id"]


@pytest.mark.parametrize("include_total", [True, False])
def test_relation_page_can_skip_exact_count(monkeypatch, session, root_user, include_total):
    from unittest.mock import Mock

    from sta.domain.querying import Pagination
    from sta_relation.api.data import list_relations

    listing = Mock(return_value=[])
    monkeypatch.setattr(domain, "list_datas", listing)
    count = Mock(return_value=234606)
    monkeypatch.setattr(domain, "count_datas", count)
    response = Response()
    assert (
        list_relations(
            response,
            current_user=root_user,
            session=session,
            pagination=Pagination(offset=25, limit=26),
            group_id=1,
            commit_hash="head",
            include_total=include_total,
            filters='[{"columnId":"relation_class_id","searchTerms":[42]}]',
        )
        == []
    )
    assert (
        response.headers["content-range"] == f"relations 25-25/{234606 if include_total else '*'}"
    )
    assert count.call_count == int(include_total)

    assert (
        listing.call_args.kwargs["filters"]
        == '[{"columnId":"relation_class_id","searchTerms":[42]}]'
    )


def test_plugin_filters_reach_the_snapshot_query():
    from unittest.mock import Mock

    user = Mock()
    user.has_role.return_value = True
    query = domain.build_list_query(
        user,
        Mock(),
        group_id=7,
        commit_hash="head",
        offset=25,
        limit=26,
        filters='[{"columnId":"relation_class_id","searchTerms":[2]}]',
    )
    compiled = query.compile()
    assert "relation_class_id IN" in str(compiled)
    assert [2] in compiled.params.values()
