"""Save batches with new endpoint IDs, relation IDs, and later permanent IDs."""

import uuid

import pytest

from sta.common.spatial import DecimalCoord3
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OP_REGISTRY
from sta.models.label.repo import LabelsetCommitInstruction
from sta_bbox.domain.label.data import element as boxes
from sta_relation.domain.classes import definitions, selections
from sta_relation.domain.data import domain as relations
from sta_relation.models.classes import RelationClassCreate, RelationClassSelectionCreate
from sta_segmentation.domain.label.data import element as selections_data
from sta_vector.domain.label.data import element as vectors


@pytest.mark.parametrize("source_type", ["box", "vector", "selection"])
def test_save_new_endpoints_and_relation_then_delete_endpoint(
    session, root_user, labelset_branch, object_class_selection, source_type
):
    group_id = labelset_branch.group.id
    class_id = object_class_selection.objclasses[0].id
    definition = definitions.create_relclass(
        current_user=root_user, session=session, data=RelationClassCreate(name="supports")
    )
    selections.create_spec(
        current_user=root_user,
        session=session,
        data=RelationClassSelectionCreate(
            name="relations", group_ids=[group_id], relclass_ids=[definition.id]
        ),
    )
    session.commit()
    keys = {
        name: "{" + str(uuid.uuid4()) + "}" for name in ("entity", "source", "target", "relation")
    }
    points = [
        {"x": "0.125", "y": "-0.500001", "z": "0.875"},
        {"x": "1.625", "y": "2.125", "z": "3.375"},
    ]
    expected_points = [DecimalCoord3.model_validate(point) for point in points]
    vector_params = {"vertices": {"type": "LineString", "coords": points}, "gt_class_id": class_id}
    instructions = []
    if source_type != "vector":
        instructions.append(
            LabelsetCommitInstruction(
                op_name="track-create" if source_type == "box" else "instance-create",
                op_params={"gt_class_id": class_id},
                result_placeholder_key=keys["entity"],
            )
        )
    if source_type == "box":
        source_params = {
            "type": "cuboid",
            "center": points[0],
            "size": points[1],
            "angle": "0",
            "entity_id": keys["entity"],
            "perceived_class_id": class_id,
        }
    elif source_type == "selection":
        source_params = {
            "points": points,
            "entity_id": keys["entity"],
            "perceived_class_id": class_id,
        }
    else:
        source_params = vector_params
    instructions.extend(
        [
            LabelsetCommitInstruction(
                op_name=f"{source_type}-create",
                op_params=source_params,
                result_placeholder_key=keys["source"],
            ),
            LabelsetCommitInstruction(
                op_name="vector-create",
                op_params=vector_params,
                result_placeholder_key=keys["target"],
            ),
            LabelsetCommitInstruction(
                op_name="relation-create",
                op_params={
                    "source": {"type": source_type, "id": keys["source"]},
                    "target": {"type": "vector", "id": keys["target"]},
                    "relation_class_id": definition.id,
                },
                result_placeholder_key=keys["relation"],
            ),
            LabelsetCommitInstruction(
                op_name="relation-update",
                op_params={
                    "relation_id": keys["relation"],
                    "source": {"type": "vector", "id": keys["target"]},
                    "target": {"type": source_type, "id": keys["source"]},
                    "relation_class_id": definition.id,
                },
            ),
        ]
    )
    used_keys = [
        instruction.result_placeholder_key
        for instruction in instructions
        if instruction.result_placeholder_key is not None
    ]
    results = push_commits(
        current_user=root_user,
        session=session,
        op_registry=OP_REGISTRY,
        branch_id=labelset_branch.id,
        last_fetched_head_hash=labelset_branch.head.hash,
        commit_instrs=instructions,
        placeholder_keys=used_keys,
    )
    session.commit()
    session.expire_all()
    source_id, target_id, relation_id = results[-4:-1]
    assert all(isinstance(value, uuid.UUID) for value in (source_id, target_id, relation_id))
    head = read_branch(current_user=root_user, session=session, id=labelset_branch.id).head_hash
    source_domain = {"box": boxes, "vector": vectors, "selection": selections_data}[source_type]
    source = source_domain.read_data(
        current_user=root_user, session=session, id=source_id, group_id=group_id, commit_hash=head
    )
    if source_type == "vector":
        assert source.gt_class_id == class_id
        assert list(source.vertices.coords) == expected_points
    elif source_type == "selection":
        assert list(source.points) == expected_points
        assert source.entity_id == results[0]
        assert source.perceived_class_id == class_id
    else:
        # Bbox coordinates deliberately truncate to five decimal places.
        assert source.center == DecimalCoord3.model_validate({**points[0], "y": "-0.5"})
        assert source.size.model_dump() == expected_points[1].model_dump()
        assert source.angle == 0
        assert source.entity_id == results[0]
        assert source.perceived_class_id == class_id
    target = vectors.read_data(
        current_user=root_user,
        session=session,
        id=target_id,
        group_id=group_id,
        commit_hash=head,
    )
    assert target.gt_class_id == class_id
    assert list(target.vertices.coords) == expected_points
    saved_relation = relations.read_data(
        current_user=root_user, session=session, id=relation_id, group_id=group_id, commit_hash=head
    )
    assert saved_relation.source_type == "vector"
    assert saved_relation.target_type == source_type
    assert saved_relation.relation_class_id == definition.id
    assert saved_relation.source_id == target_id
    assert saved_relation.target_id == source_id
    # A later save uses permanent IDs, with no placeholder declarations.
    push_commits(
        current_user=root_user,
        session=session,
        op_registry=OP_REGISTRY,
        branch_id=labelset_branch.id,
        last_fetched_head_hash=head,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=f"{source_type}-delete", op_params={f"{source_type}_id": str(source_id)}
            )
        ],
    )
    session.commit()
    session.expire_all()
    deleted_head = read_branch(
        current_user=root_user, session=session, id=labelset_branch.id
    ).head_hash
    assert not relations.list_datas(
        current_user=root_user, session=session, group_id=group_id, commit_hash=deleted_head
    )
    assert (
        relations.read_data(
            current_user=root_user,
            session=session,
            id=relation_id,
            group_id=group_id,
            commit_hash=head,
        ).id
        == relation_id
    )
