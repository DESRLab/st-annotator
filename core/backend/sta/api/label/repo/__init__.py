import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from sta.common.utils.json import JSONType

from ....domain.label.repo import graph as domain
from ....domain.label.repo.ops import OP_REGISTRY, OperationRegistry
from ....models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommitInstruction,
    LabelsetPushResult,
)
from ....session import Session, get_session
from ...users import UserPublic, get_current_user
from . import branches, commits

router = APIRouter(prefix="/repo", tags=["repo"])

router.include_router(branches.router)
router.include_router(commits.router)


def get_op_registry():
    return OP_REGISTRY


@router.post("/init", response_model=LabelsetBranchPublic)
def init_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    op_registry: Annotated[OperationRegistry, Depends(get_op_registry)],
    data: domain.LabelsetBranchInit,
):
    record = domain.init_branch(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        data=data,
    )

    session.commit()
    session.refresh(record)

    return record


@router.post("/checkpoint", response_model=list[JSONType | uuid.UUID])
def checkpoint(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    op_registry: Annotated[OperationRegistry, Depends(get_op_registry)],
    branch_id: int,
):
    result = domain.checkpoint(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
    )

    session.commit()

    return result


@router.post("/push", response_model=LabelsetPushResult)
def push_commits(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    op_registry: Annotated[OperationRegistry, Depends(get_op_registry)],
    branch_id: int,
    last_fetched_head_hash: str,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str] | None = None,
):
    branch, op_results = domain.push_commits_with_branch(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch_id,
        last_fetched_head_hash=last_fetched_head_hash,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys,
    )

    session.commit()

    # `branch` was snapshotted from the row this transaction committed, so the
    # caller can adopt the returned head without a follow-up read of its own.
    return LabelsetPushResult(branch=branch, op_results=op_results)


@router.get("/graph", response_model=domain.CommitGraphPublic)
def read_graph(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    branch_id: int,
):
    return domain.read_graph(
        current_user=current_user,
        session=session,
        branch_id=branch_id,
    )


def setup_router():
    push_commits.__annotations__["commit_instrs"] = list[
        get_op_registry().create_instruction_type()
    ]

    return router
