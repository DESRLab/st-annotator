"""Relations connect independently registered bbox and vector elements."""

import uuid
from decimal import Decimal

import pytest

from sta.common.spatial import DecimalCoord3
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OP_REGISTRY
from sta.models.label.repo import LabelsetCommitInstruction
from sta_bbox.domain.label.data import element as boxes
from sta_bbox.models.label.data import BoxType, LabelBox, TruncDecimalCoord3, TruncDecimalSize3
from sta_relation.domain.classes import definitions, selections
from sta_relation.domain.data import domain as relations
from sta_relation.models.classes import RelationClassCreate, RelationClassSelectionCreate
from sta_vector.domain.label.data import element as vectors
from sta_vector.models.label.data import LabelVector, PolylineVertices, VectorType


@pytest.mark.parametrize("delete_mode", ["operation", "bulk", "update"])
def test_cross_plugin_endpoint_deletion_preserves_previous_commit(
    session,
    root_user,
    labelset_branch,
    delete_mode,
):
    group = labelset_branch.group.id
    head = labelset_branch.head.hash
    definition = definitions.create_relclass(
        current_user=root_user, session=session, data=RelationClassCreate(name="supports")
    )
    selections.create_spec(
        current_user=root_user,
        session=session,
        data=RelationClassSelectionCreate(
            name="relations", group_ids=[group], relclass_ids=[definition.id]
        ),
    )
    box = boxes.create_data(
        current_user=root_user,
        session=session,
        data=LabelBox.from_bbox(
            group_id=group,
            commit_hash=head,
            type=BoxType.CUBOID,
            center=TruncDecimalCoord3.zeros(),
            angle=Decimal(0),
            size=TruncDecimalSize3.ones(),
            timestamp=None,
            entity_id=None,
        ),
    )
    vector = vectors.create_data(
        current_user=root_user,
        session=session,
        data=LabelVector.from_vertices(
            group_id=group,
            commit_hash=head,
            vertices=PolylineVertices(
                type=VectorType.POLYLINE, coords=[DecimalCoord3.zeros(), DecimalCoord3.ones()]
            ),
            timestamp=None,
            entity_id=None,
        ),
    )
    session.commit()
    (relation_id,) = push_commits(
        current_user=root_user,
        session=session,
        op_registry=OP_REGISTRY,
        branch_id=labelset_branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name="relation-create",
                op_params={
                    "source": {"type": "box", "id": str(box.id)},
                    "target": {"type": "vector", "id": str(vector.id)},
                    "relation_class_id": definition.id,
                },
            )
        ],
    )
    assert isinstance(relation_id, uuid.UUID)
    session.commit()
    created_head = read_branch(
        current_user=root_user, session=session, id=labelset_branch.id
    ).head_hash
    if delete_mode == "operation":
        push_commits(
            current_user=root_user,
            session=session,
            op_registry=OP_REGISTRY,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name="vector-delete", op_params={"vector_id": str(vector.id)}
                )
            ],
        )
        deleted_head = read_branch(
            current_user=root_user, session=session, id=labelset_branch.id
        ).head_hash
        assert not relations.read_data(
            current_user=root_user,
            session=session,
            id=relation_id,
            group_id=group,
            commit_hash=created_head,
        ).is_deleted
    else:
        deleted_head = created_head
        if delete_mode == "bulk":
            vectors.bulk_delete_datas(
                current_user=root_user,
                session=session,
                ids={vector.id},
                group_id=group,
                commit_hash=deleted_head,
            )
        else:
            vectors.update_data(
                current_user=root_user,
                session=session,
                id=vector.id,
                group_id=group,
                commit_hash=deleted_head,
                data=vectors.update_cls(is_deleted=True),
            )
    session.commit()
    assert not relations.list_datas(
        current_user=root_user, session=session, group_id=group, commit_hash=deleted_head
    )
    assert (
        boxes.read_data(
            current_user=root_user,
            session=session,
            id=box.id,
            group_id=group,
            commit_hash=deleted_head,
        ).id
        == box.id
    )
