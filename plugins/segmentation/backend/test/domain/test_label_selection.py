import uuid
from http import HTTPStatus

from fastapi import HTTPException
from geoalchemy2.elements import WKBElement
from pydantic import TypeAdapter

import pytest

from sta.common.spatial import DecimalCoord3
from sta.config import AppConfig
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OperationRegistry
from sta.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommitInstruction,
)
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta_segmentation.domain.label.data import element as domain
from sta_segmentation.domain.label.repo.ops.instance import (
    CreateParams as InstanceCreateParams,
    DeleteParams as InstanceDeleteParams,
    InstanceOperationType,
    register_instance_ops,
)
from sta_segmentation.domain.label.repo.ops.selection import (
    AssignClassParams,
    AssignDistinctiveLvParams,
    AssignEntityParams,
    AssignOcclusionLvParams,
    CreateParams,
    DeleteParams,
    EditParams,
    SelectionOperationType,
    register_selection_ops,
)
from sta_segmentation.models.label.data import (
    DistinctiveLevel,
    LabelSelectionSQLModel,
    OcclusionLevel,
    SelectionType,
)


def test_selection_type_accepts_and_serializes_geoalchemy_wkb_element():
    selection = LabelSelectionSQLModel.from_points(
        points=[DecimalCoord3.zeros(), DecimalCoord3.ones()],
        timestamp=None,
        group_id=1,
        commit_hash="commit",
    )
    wkb_element = WKBElement(
        selection.selection.data,
        srid=selection.selection.srid,
        extended=selection.selection.extended,
    )

    parsed = TypeAdapter(SelectionType).validate_python(wkb_element)

    assert isinstance(parsed, SelectionType)
    assert parsed.desc == wkb_element.desc
    assert TypeAdapter(SelectionType).dump_python(parsed, mode="json") == selection.selection.desc


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_crud(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    register_selection_ops(op_registry)
    register_instance_ops(op_registry)

    zeros = [DecimalCoord3.zeros()] * 100
    ones = [DecimalCoord3.ones()] * 100
    perceived_class_id = object_class_selection.objclasses[0].id

    with session_ctx(test_app_config) as session:

        def commit_and_refresh():
            nonlocal labelset_branch

            session.commit()
            labelset_branch = LabelsetBranchPublic.model_validate(
                read_branch(
                    current_user=root_user,
                    session=session,
                    id=labelset_branch.id,
                ),
            )

        def read_selection():
            record = domain.read_data(
                current_user=root_user,
                session=session,
                id=element_id,
                group_id=labelset_branch.group.id,
                commit_hash=labelset_branch.head.hash,
            )

            assert isinstance(record, LabelSelectionSQLModel)

            return record

        (element_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.CREATE,
                    op_params=CreateParams(points=ones),
                ),
            ],
        )
        assert isinstance(element_id_raw, uuid.UUID)
        element_id = element_id_raw

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.points == ones

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.EDIT,
                    op_params=EditParams(
                        selection_id=element_id,
                        mode="replace",
                        points=zeros,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.points == zeros

        (entity_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.CREATE,
                    op_params=InstanceCreateParams(),
                ),
            ],
        )
        assert isinstance(entity_id_raw, uuid.UUID)
        entity_id = entity_id_raw

        commit_and_refresh()

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.ASSIGN_CLASS,
                    op_params=AssignClassParams(
                        selection_id=element_id,
                        perceived_class_id=perceived_class_id,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.perceived_class_id == perceived_class_id

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.ASSIGN_ENTITY,
                    op_params=AssignEntityParams(
                        selection_id=element_id,
                        entity_id=entity_id,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.entity_id == entity_id

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.ASSIGN_DISTINCTIVE_LV,
                    op_params=AssignDistinctiveLvParams(
                        selection_id=element_id,
                        distinctive_lv=DistinctiveLevel.SATISFACTORY,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.distinctive_lv == DistinctiveLevel.SATISFACTORY

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.ASSIGN_OCCLUSION_LV,
                    op_params=AssignOcclusionLvParams(
                        selection_id=element_id,
                        occlusion_lv=OcclusionLevel.POOR,
                    ),
                ),
            ],
        )

        commit_and_refresh()

        new_data = read_selection()
        assert new_data.occlusion_lv == OcclusionLevel.POOR

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.DELETE,
                    op_params=DeleteParams(selection_id=element_id),
                ),
            ],
        )

        commit_and_refresh()

        with pytest.raises(HTTPException) as exc_info:
            read_selection()

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()


@pytest.mark.parametrize("use_delta_encoding", [True, False])
def test_entity_id_validation(
    monkeypatch: pytest.MonkeyPatch,
    test_app_config: AppConfig,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    *,
    use_delta_encoding: bool,
):
    monkeypatch.setenv("STA_USE_DELTA_ENCODING", str(use_delta_encoding))
    register_selection_ops(op_registry)
    register_instance_ops(op_registry)

    ones = [DecimalCoord3.ones()]

    with session_ctx(test_app_config) as session:

        def commit_and_refresh():
            nonlocal labelset_branch

            session.commit()
            labelset_branch = LabelsetBranchPublic.model_validate(
                read_branch(
                    current_user=root_user,
                    session=session,
                    id=labelset_branch.id,
                ),
            )

        def read_selection():
            record = domain.read_data(
                current_user=root_user,
                session=session,
                id=element_id,
                group_id=labelset_branch.group.id,
                commit_hash=labelset_branch.head.hash,
            )

            assert isinstance(record, LabelSelectionSQLModel)

            return record

        (element_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=SelectionOperationType.CREATE,
                    op_params=CreateParams(points=ones),
                ),
            ],
        )
        assert isinstance(element_id_raw, uuid.UUID)
        element_id = element_id_raw

        commit_and_refresh()

        # Creating a selection for an unknown entity is rejected.
        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=SelectionOperationType.CREATE,
                        op_params=CreateParams(points=ones, entity_id=uuid.uuid4()),
                    ),
                ],
            )

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "parent entity" in str(exc_info.value.detail)
        session.rollback()

        records = domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=labelset_branch.group.id,
            commit_hash=labelset_branch.head.hash,
        )
        assert [record.id for record in records] == [element_id]

        # Assigning an unknown entity is rejected and leaves the selection untouched.
        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=SelectionOperationType.ASSIGN_ENTITY,
                        op_params=AssignEntityParams(
                            selection_id=element_id,
                            entity_id=uuid.uuid4(),
                        ),
                    ),
                ],
            )

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "parent entity" in str(exc_info.value.detail)
        session.rollback()

        assert read_selection().entity_id is None

        # Assigning a deleted entity is rejected as well.
        (entity_id_raw,) = push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.CREATE,
                    op_params=InstanceCreateParams(),
                ),
            ],
        )
        assert isinstance(entity_id_raw, uuid.UUID)
        entity_id = entity_id_raw

        commit_and_refresh()

        push_commits(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            branch_id=labelset_branch.id,
            commit_instrs=[
                LabelsetCommitInstruction(
                    op_name=InstanceOperationType.DELETE,
                    op_params=InstanceDeleteParams(instance_id=entity_id),
                ),
            ],
        )

        commit_and_refresh()

        with pytest.raises(HTTPException) as exc_info:
            push_commits(
                current_user=root_user,
                session=session,
                op_registry=op_registry,
                branch_id=labelset_branch.id,
                commit_instrs=[
                    LabelsetCommitInstruction(
                        op_name=SelectionOperationType.ASSIGN_ENTITY,
                        op_params=AssignEntityParams(
                            selection_id=element_id,
                            entity_id=entity_id,
                        ),
                    ),
                ],
            )

        assert exc_info.value.status_code == HTTPStatus.NOT_FOUND
        assert "deleted" in str(exc_info.value.detail).lower()
        session.rollback()

        assert read_selection().entity_id is None
