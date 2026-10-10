from collections.abc import Callable, Sequence, Set
from datetime import datetime
from functools import reduce
from http import HTTPStatus
from operator import or_
from time import perf_counter
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from fastapi.routing import APIRoute
from pydantic import TypeAdapter
from sqlmodel import Session, select

from sta.common.database.execution import sql_column
from sta.common.logging import get_logger
from sta.common.utils.json import JSONType

from ..domain.editor.loader import LABEL_DATA_LOADERS, SOURCE_DATA_LOADERS, DataLoader
from ..domain.frames import (
    can_read_frame_filters,
    list_frames,
    update_frame,
)
from ..domain.label.repo.branches import list_branches as list_label_branches, read_branch
from ..domain.label.repo.graph import (
    CommitGraphPublic,
    LabelsetCommitInstruction,
    push_commits_with_branch,
    read_graph,
)
from ..domain.label.repo.ops import OperationRegistry
from ..domain.projects import read_project
from ..domain.source.groups import list_groups as list_source_groups
from ..domain.tasks import (
    get_assigned_task_ids_query,
    list_tasks,
    read_task,
)
from ..models.frame import Frame, FramePublic, FrameUpdate
from ..models.label.repo import LabelsetBranchPublic, LabelsetPushResult
from ..models.project import ProjectConfig
from ..models.source.group import SourceGroupPublic
from ..models.task import Task, TaskPublic, WorkType
from ..models.user import UserPublic
from ..session import get_session
from .auth import get_current_user
from .label.repo import get_op_registry

router = APIRouter(
    prefix="/editor",
    tags=["editor"],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)
logger = get_logger()

_JSON_RESPONSE_ADAPTER = TypeAdapter(object)
SLOW_LABEL_LOAD_SECONDS = 30


@router.get("/config", response_model=ProjectConfig)
def read_project_config(
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


@router.get("/tasks", response_model=list[TaskPublic])
def list_project_tasks(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    project_id: int,
    work_type: WorkType,
):
    tasks = list_tasks(
        current_user=current_user,
        session=session,
        project_id=project_id,
    )

    assigned_ids = set(
        session.exec(
            get_assigned_task_ids_query(current_user, work_type),
        ).all(),
    )
    return [task for task in tasks if task.id in assigned_ids]


@router.get("/task/source/groups", response_model=list[SourceGroupPublic])
def list_task_source_groups(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
    work_type: WorkType,
):
    read_task(
        current_user=current_user,
        session=session,
        id=task_id,
    )

    group_ids = {
        group_id
        for group_id in session.exec(
            select(Frame.source_group_id)
            .where(Frame.task_id == task_id)
            .where(Frame.work_type == work_type)
            .where(sql_column(Frame.source_group_id).is_not(None)),
        ).all()
        if group_id is not None
    }

    return list_source_groups(
        current_user=current_user,
        session=session,
        ids=group_ids,
    )


@router.get("/task/label/branches", response_model=list[LabelsetBranchPublic])
def list_task_label_branches(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
    work_type: WorkType,
):
    read_task(
        current_user=current_user,
        session=session,
        id=task_id,
    )

    branch_ids = {
        branch_id
        for branch_id in session.exec(
            select(Frame.label_branch_id)
            .where(Frame.task_id == task_id)
            .where(Frame.work_type == work_type)
            .where(sql_column(Frame.label_branch_id).is_not(None)),
        ).all()
        if branch_id is not None
    }

    return list_label_branches(
        current_user=current_user,
        session=session,
        ids=branch_ids,
    )


@router.get("/task/frames", response_model=list[FramePublic])
def list_task_frames(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    task_id: int,
    work_type: WorkType,
    source_group_id: int | None = None,
    label_branch_id: int | None = None,
):
    # Raise if the user's assignment has been removed from the task hierarchy
    read_task(
        current_user=current_user,
        session=session,
        id=task_id,
    )

    return list_frames(
        current_user=current_user,
        session=session,
        task_id=task_id,
        work_type=work_type,
        source_group_ids=[source_group_id] if source_group_id is not None else None,
        label_branch_ids=[label_branch_id] if label_branch_id is not None else None,
    )


def _require_frames(
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    frame_ids: Sequence[int],
    project_id: int,
):
    unique_ids = list(dict.fromkeys(frame_ids))
    if not unique_ids:
        return []

    q = (
        select(Frame)
        .join(Task)
        .where(sql_column(Frame.id).in_(unique_ids))
        .where(Task.project_id == project_id)
    )
    for cond in can_read_frame_filters(current_user):
        q = q.where(cond)

    frames = {frame.id: frame for frame in session.exec(q).all() if frame.id is not None}

    missing_ids = set(unique_ids) - frames.keys()
    if missing_ids:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail=f"Frames #{missing_ids} cannot be accessed",
        )

    return [FramePublic.model_validate(frames[frame_id]) for frame_id in frame_ids]


def _get_data_loader(loaders: dict[str, DataLoader], key: str) -> DataLoader:
    """Resolve a plugin loader without exposing a registry ``KeyError`` as a 500."""
    try:
        return loaders[key]
    except KeyError:
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail=f"Unknown data loader: {key}",
        ) from None


def _count_unbounded_time_frames(frames: Sequence[FramePublic]) -> int:
    """Count frames whose missing time bounds would select the whole revision."""
    return sum(
        frame.st_bounds.min_timestamp is None and frame.st_bounds.max_timestamp is None
        for frame in frames
    )


def _warn_slow_label_load(
    *, key: str, frame_count: int, elapsed: float, response_bytes: int
) -> None:
    """Warn when a bulk label response exceeds the established load threshold."""
    if elapsed <= SLOW_LABEL_LOAD_SECONDS:
        return
    logger.warning(
        "Took too long to load label data",
        extra={
            "event": "label_data_bulk_loaded",
            "key": key,
            "frame_count": frame_count,
            "total_seconds": elapsed,
            "response_bytes": response_bytes,
        },
    )


@router.post("/source/data/bulk")
def read_source_data_bulk(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    project_id: int,
    key: str,
    frame_ids: Annotated[list[int], Query()],
    other_args: Annotated[JSONType, Body()],
):
    data_loader = _get_data_loader(SOURCE_DATA_LOADERS, key)

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


@router.post("/label/data/bulk")
def read_label_data_bulk(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    project_id: int,
    key: str,
    frame_ids: Annotated[list[int], Query()],
    other_args: Annotated[JSONType, Body()],
):
    started = perf_counter()
    data_loader = _get_data_loader(LABEL_DATA_LOADERS, key)

    frames = _require_frames(
        current_user=current_user,
        session=session,
        frame_ids=frame_ids,
        project_id=project_id,
    )
    unbounded_time_frames = _count_unbounded_time_frames(frames)
    if unbounded_time_frames:
        logger.warning(
            "Label load %s includes %s frame(s) without timestamp bounds",
            key,
            unbounded_time_frames,
        )

    result = data_loader.get_data_bulk(
        current_user=current_user,
        session=session,
        frames=frames,
        other_args=other_args,
    )
    if isinstance(result, Response):
        return result
    # The label payload is a Pydantic envelope; serialize it directly to avoid
    # converting every packed coordinate array into intermediate Python objects.
    response = Response(
        content=_JSON_RESPONSE_ADAPTER.dump_json(result),
        media_type="application/json",
    )
    _warn_slow_label_load(
        key=key,
        frame_count=len(frames),
        elapsed=perf_counter() - started,
        response_bytes=len(response.body),
    )
    return response


@router.get("/labelset/branch", response_model=LabelsetBranchPublic)
def read_labelset_branch(
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


@router.get("/labelset/graph", response_model=CommitGraphPublic)
def read_labelset_graph(
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


@router.post("/labelset/push", response_model=LabelsetPushResult)
def push_labelset_commits(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    op_registry: Annotated[OperationRegistry, Depends(get_op_registry)],
    label_branch_id: int,
    last_fetched_head_hash: str,
    commit_instrs: list[LabelsetCommitInstruction],
    placeholder_keys: list[str] | None = None,
):
    branch, op_results = push_commits_with_branch(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=label_branch_id,
        last_fetched_head_hash=last_fetched_head_hash,
        commit_instrs=commit_instrs,
        placeholder_keys=placeholder_keys,
    )

    session.commit()

    # `branch` was snapshotted from the row this transaction committed, so the
    # editor can adopt the returned head without a follow-up read of its own.
    return LabelsetPushResult(branch=branch, op_results=op_results)


@router.post("/frame/last_viewed_at")
def touch_frame_last_viewed_at(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    frame_id: int,
):
    record = update_frame(
        current_user=current_user,
        session=session,
        id=frame_id,
        data=FrameUpdate(last_viewed_at=datetime.now().astimezone()),
    )

    session.commit()
    session.refresh(record)

    return record


@router.post("/frame/is_complete")
def update_frame_is_complete(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    frame_id: int,
    is_complete: bool,
):
    record = update_frame(
        current_user=current_user,
        session=session,
        id=frame_id,
        data=FrameUpdate(
            last_viewed_at=datetime.now().astimezone(),
            is_complete=is_complete,
        ),
    )

    session.commit()
    session.refresh(record)

    return record


def _create_key_type(keys: Set[str]):
    if not keys:
        return str  # Fallback

    return Literal[tuple(keys)]


def _set_response_model(endpoint: Callable[..., Any], response_model: Any) -> None:
    """
    Re-registers the routes of `endpoint` with an explicit response model.

    The routes were created before the plugin loaders registered their data
    models, so their response model could not be set at decoration time.
    """
    prefix = router.prefix or ""
    bulk_routes = [
        route
        for route in router.routes
        if isinstance(route, APIRoute) and route.endpoint is endpoint
    ]
    for route in bulk_routes:
        router.routes.remove(route)
        path = route.path[len(prefix) :] if prefix and route.path.startswith(prefix) else route.path
        router.add_api_route(
            path,
            endpoint,
            methods=route.methods,
            name=route.name,
            status_code=route.status_code,
            response_model=response_model,
        )


def setup_router():
    # Plugin loader keys are unavailable when this module is imported. Apply
    # their Literal types immediately before route registration/re-registration
    # so FastAPI exposes the supported values in OpenAPI.
    read_source_data_bulk.__annotations__["key"] = _create_key_type(SOURCE_DATA_LOADERS.keys())
    read_label_data_bulk.__annotations__["key"] = _create_key_type(LABEL_DATA_LOADERS.keys())

    label_data_models = tuple(
        loader.data_model for loader in LABEL_DATA_LOADERS.values() if loader.data_model is not None
    )
    if label_data_models:
        _set_response_model(read_label_data_bulk, list[reduce(or_, label_data_models)])

    push_labelset_commits.__annotations__["commit_instrs"] = list[
        get_op_registry().create_instruction_type()
    ]

    return router
