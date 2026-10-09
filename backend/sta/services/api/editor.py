from collections.abc import Set
from datetime import datetime
from http import HTTPStatus
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session, exists, select

from sta.common.utils.json import JSONType

from ..domain.editor.loader import LABEL_DATA_LOADERS, SOURCE_DATA_LOADERS
from ..domain.frames import _build_list_query as list_frames_query, list_frames, update_frame
from ..domain.label.repo.branches import list_branches as list_label_branches, read_branch
from ..domain.label.repo.graph import (
    CommitGraphPublic,
    LabelsetCommitInstruction,
    push_commits,
    read_graph,
)
from ..domain.label.repo.ops import OperationRegistry
from ..domain.projects import read_project
from ..domain.source.groups import list_groups as list_source_groups
from ..domain.tasks import list_tasks
from ..models.frame import Frame, FramePublic, FrameUpdate
from ..models.label.repo import LabelsetBranchPublic
from ..models.project import ProjectConfig
from ..models.source.group import SourceGroupPublic
from ..models.task import TaskPublic
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .label.repo import get_op_registry

router = APIRouter(
    prefix='/editor',
    tags=['editor'],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)


@router.get('/config', response_model=ProjectConfig)
async def read_project_config(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    project_id: int,
):
    project = read_project(
        current_user=current_user,
        session=session,
        id=project_id,
    )

    return project.config


def _has_frames(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
):
    frames_query = list_frames_query(
        current_user=current_user,
        session=session,
        task_id=task_id,
    ).subquery()

    return session.exec(select(exists(frames_query))).one()


@router.get('/tasks', response_model=list[TaskPublic])
async def list_project_tasks(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    project_id: int,
):
    tasks = list_tasks(
        current_user=current_user,
        session=session,
        project_id=project_id,
    )

    return [
        task
        for task in tasks
        if _has_frames(
            current_user=current_user,
            session=session,
            task_id=task.id,
        )
    ]


def _get_source_group_ids(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
):
    frames_query = list_frames_query(
        current_user=current_user,
        session=session,
        task_id=task_id,
    ).subquery()

    q = select(frames_query.c.source_group_id).distinct()

    return session.exec(q).all()


def _get_label_branch_ids(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
):
    frames_query = list_frames_query(
        current_user=current_user,
        session=session,
        task_id=task_id,
    ).subquery()

    q = select(frames_query.c.label_branch_id).distinct()

    return session.exec(q).all()


@router.get('/task/source/groups', response_model=list[SourceGroupPublic])
async def list_task_source_groups(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
):
    source_group_ids = _get_source_group_ids(
        current_user=current_user,
        session=session,
        task_id=task_id,
    )

    return list_source_groups(
        current_user=current_user,
        session=session,
        ids=set(source_group_ids),
    )


@router.get('/task/label/branches', response_model=list[LabelsetBranchPublic])
async def list_task_label_branches(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
):
    label_branch_ids = _get_label_branch_ids(
        current_user=current_user,
        session=session,
        task_id=task_id,
    )

    return list_label_branches(
        current_user=current_user,
        session=session,
        ids=set(label_branch_ids),
    )


@router.get('/task/frames', response_model=list[LabelsetBranchPublic])
async def list_task_frames(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
    source_group_id: int,
    label_branch_id: int,
):
    return list_frames(
        current_user=current_user,
        session=session,
        task_id=task_id,
        source_group_id=source_group_id,
        label_branch_id=label_branch_id,
    )


def _require_frames(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    frame_ids: Set[int],
    project_id: int,
):
    frames: dict[int, Frame] = {}

    for task in list_tasks(
        current_user=current_user,
        session=session,
        project_id=project_id,
    ):
        for frame in list_frames(
            current_user=current_user,
            session=session,
            task_id=task.id,
        ):
            if frame.id is not None and frame.id in frame_ids:
                frames[frame.id] = frame

    missing_ids = frame_ids - frames.keys()
    if missing_ids:
        msg = f'Frames #{missing_ids} cannot be accessed'
        raise ValueError(msg)

    return [FramePublic.model_validate(f) for f in frames]


# Fetch API does not allow JSON body in GET request
@router.get('/source/data/bulk')
@router.post('/source/data/bulk')
async def read_source_data_bulk(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    project_id: int,
    key: str,
    frame_ids: set[int],
    other_args: JSONType,
):
    data_loader = SOURCE_DATA_LOADERS[key]

    frames = _require_frames(
        current_user=current_user,
        session=session,
        frame_ids=frame_ids,
        project_id=project_id,
    )

    return data_loader.get_data_bulk(
        current_user=current_user,
        session=session,
        frames=frames,
        other_args=other_args,
    )


# Fetch API does not allow JSON body in GET request
@router.get('/label/data/bulk')
@router.post('/label/data/bulk')
async def read_label_data_bulk(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    project_id: int,
    key: str,
    frame_ids: set[int],
    other_args: JSONType,
):
    data_loader = LABEL_DATA_LOADERS[key]

    frames = _require_frames(
        current_user=current_user,
        session=session,
        frame_ids=frame_ids,
        project_id=project_id,
    )

    return data_loader.get_data_bulk(
        current_user=current_user,
        session=session,
        frames=frames,
        other_args=other_args,
    )


@router.get('/labelset/branch', response_model=list[LabelsetBranchPublic])
async def read_labelset_branch(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    label_branch_id: int,
):
    return read_branch(
        current_user=current_user,
        session=session,
        id=label_branch_id,
    )


@router.get('/labelset/graph', response_model=CommitGraphPublic)
async def read_labelset_graph(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    label_branch_id: int,
):
    return read_graph(
        current_user=current_user,
        session=session,
        branch_id=label_branch_id,
    )


@router.post('/labelset/push', response_model=list[JSONType])
async def push_labelset_commits(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    op_registry: Annotated[OperationRegistry, Depends(get_op_registry)],
    label_branch_id: int,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str] | None = None,
):
    return push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=label_branch_id,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys,
    )


@router.post('/frame/last_viewed_at')
async def touch_frame_last_viewed_at(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    frame_id: int,
):
    return update_frame(
        current_user=current_user,
        session=session,
        id=frame_id,
        data=FrameUpdate(last_viewed_at=datetime.now().astimezone()),
    )


@router.post('/frame/is_complete')
async def update_frame_is_complete(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    frame_id: int,
    is_complete: bool,
):
    return update_frame(
        current_user=current_user,
        session=session,
        id=frame_id,
        data=FrameUpdate(
            last_viewed_at=datetime.now().astimezone(),
            is_complete=is_complete,
        ),
    )

def _create_key_type(keys: Set[str]):
    if not keys:
        return str  # Fallback

    return Literal[tuple(keys)]


def setup_router():
    read_source_data_bulk.__annotations__["key"] = _create_key_type(SOURCE_DATA_LOADERS.keys())
    read_label_data_bulk.__annotations__["key"] = _create_key_type(LABEL_DATA_LOADERS.keys())
    push_labelset_commits.__annotations__["commit_instrs"] = list[
        get_op_registry().create_instruction_type()
    ]

    return router
