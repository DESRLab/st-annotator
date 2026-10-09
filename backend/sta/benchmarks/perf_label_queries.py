from __future__ import annotations

import random
import time
import uuid
from collections.abc import Callable
from concurrent.futures import Executor, Future, ProcessPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from functools import partial
from pathlib import Path
from typing import Any, Literal, TypeAlias, get_args
from typing_extensions import assert_never

import click
from tqdm import tqdm

import numpy as np
import pandas as pd

from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session

from ..common.database import PostgresDatabaseConfig
from ..common.spatial import DecimalCoord3
from ..common.testing import PerformanceCounter
from ..common.utils.json import JSONType
from ..services.config import AppConfig, AppConfigArgs
from ..services.domain import users as user_domain
from ..services.domain.label import groups
from ..services.domain.label.data import LabelElementDomain, LabelEntityDomain
from ..services.domain.label.repo import branches, graph as repo_graph
from ..services.domain.label.repo.ops import (
    CreateBase,
    DeleteBase,
    Operation,
    OperationRegistry,
    UpdateBase,
)
from ..services.domain.label.repo.ops.special import register_special_ops
from ..services.entrypoints import test_app_ctx
from ..services.models.label.group import LabelGroupCreate, LabelGroupPublic
from ..services.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommit,
    LabelsetCommitInstruction,
)
from ..services.models.user import Role, UserCreate, UserPublic
from ..services.session import session_ctx
from .database_utils import explain, labels_nbytes

LabelType: TypeAlias = Literal['element', 'entity']
CommitMode: TypeAlias = Literal['new-branch', 'extend-branch']
PluginName: TypeAlias = Literal['bbox', 'segmentation']
LabelOpName: TypeAlias = Literal['create', 'update']

VALID_PLUGINS = get_args(PluginName)


@dataclass(frozen=True)
class HistoryItem:
    step: int

    num_branches: int
    num_commits: int

    num_entities: int
    num_elements: int

@dataclass(frozen=True)
class HistoryLabelSelectItem(HistoryItem):
    select_target: LabelType

    query_closest_states_seconds: float
    total_seconds: float

    result_size: int

@dataclass(frozen=True)
class HistoryLabelCreateItem(HistoryItem):
    create_target: LabelType

    insert_hash_to_distance_seconds: float
    add_seconds: float
    val_seconds: float
    total_seconds: float

@dataclass(frozen=True)
class HistoryLabelUpdateItem(HistoryItem):
    update_target: LabelType

    insert_hash_to_distance_seconds: float
    query_closest_states_seconds: float
    add_seconds: float
    val_seconds: float
    total_seconds: float

@dataclass(frozen=True)
class HistoryLabelDeleteItem(HistoryItem):
    delete_target: LabelType

    insert_hash_to_distance_seconds: float
    query_closest_states_seconds: float
    add_seconds: float
    total_seconds: float


@dataclass(frozen=True)
class LabelRecordStorageUsage:
    label_entity_records_size_bytes: int
    label_element_records_size_bytes: int

    @property
    def label_records_size_bytes(self) -> int:
        return self.label_entity_records_size_bytes + self.label_element_records_size_bytes


@dataclass(frozen=True)
class PerfHistory:
    items: list[HistoryItem] = field(default_factory=list)

    commit_hashes: list[str] = field(default_factory=list)
    branch_ids: list[int] = field(default_factory=list)

    entity_plans_by_step: dict[int, str]= field(default_factory=dict)
    element_plans_by_step: dict[int, str] = field(default_factory=dict)
    storage_usages_by_step: dict[int, LabelRecordStorageUsage] = field(default_factory=dict)

    @property
    def num_steps(self) -> int:
        return len(self.items)

    @property
    def num_commits(self) -> int:
        return len(self.commit_hashes)

    @property
    def num_branches(self) -> int:
        return len(self.branch_ids)

    def add_select_history(
        self,
        *,
        step: int,
        num_entities: int,
        num_elements: int,
        select_target: LabelType,
        query_closest_states_perf: PerformanceCounter,
        select_perf: PerformanceCounter,
        result_size: int,
    ) -> None:
        self.items.append(HistoryLabelSelectItem(
            step=step,
            num_branches=self.num_branches,
            num_commits=self.num_commits,
            num_entities=num_entities,
            num_elements=num_elements,
            select_target=select_target,
            query_closest_states_seconds=query_closest_states_perf.total_seconds,
            total_seconds=select_perf.total_seconds,
            result_size=result_size,
        ))

    def add_create_history(
        self,
        *,
        step: int,
        num_entities: int,
        num_elements: int,
        create_target: LabelType,
        insert_hash_to_distance_perf: PerformanceCounter,
        add_perf: PerformanceCounter,
        val_perf: PerformanceCounter | None = None,
        create_perf: PerformanceCounter,
    ) -> None:
        self.items.append(HistoryLabelCreateItem(
            step=step,
            num_branches=self.num_branches,
            num_commits=self.num_commits,
            num_entities=num_entities,
            num_elements=num_elements,
            create_target=create_target,
            insert_hash_to_distance_seconds=insert_hash_to_distance_perf.total_seconds,
            add_seconds=add_perf.total_seconds,
            val_seconds=0 if val_perf is None else val_perf.total_seconds,
            total_seconds=create_perf.total_seconds,
        ))

    def add_update_history(
        self,
        *,
        step: int,
        num_entities: int,
        num_elements: int,
        update_target: LabelType,
        insert_hash_to_distance_perf: PerformanceCounter,
        query_closest_states_perf: PerformanceCounter,
        add_perf: PerformanceCounter,
        val_perf: PerformanceCounter | None = None,
        update_perf: PerformanceCounter,
    ) -> None:
        self.items.append(HistoryLabelUpdateItem(
            step=step,
            num_branches=self.num_branches,
            num_commits=self.num_commits,
            num_entities=num_entities,
            num_elements=num_elements,
            update_target=update_target,
            insert_hash_to_distance_seconds=insert_hash_to_distance_perf.total_seconds,
            query_closest_states_seconds=query_closest_states_perf.total_seconds,
            add_seconds=add_perf.total_seconds,
            val_seconds=0 if val_perf is None else val_perf.total_seconds,
            total_seconds=update_perf.total_seconds,
        ))

    def add_delete_history(
        self,
        *,
        step: int,
        num_entities: int,
        num_elements: int,
        delete_target: LabelType,
        insert_hash_to_distance_perf: PerformanceCounter,
        query_closest_states_perf: PerformanceCounter,
        add_perf: PerformanceCounter,
        delete_perf: PerformanceCounter,
    ) -> None:
        self.items.append(HistoryLabelDeleteItem(
            step=step,
            num_branches=self.num_branches,
            num_commits=self.num_commits,
            num_entities=num_entities,
            num_elements=num_elements,
            delete_target=delete_target,
            insert_hash_to_distance_seconds=insert_hash_to_distance_perf.total_seconds,
            query_closest_states_seconds=query_closest_states_perf.total_seconds,
            add_seconds=add_perf.total_seconds,
            total_seconds=delete_perf.total_seconds,
        ))

    def set_entity_plan(
        self,
        *,
        step: int,
        plan: str,
    ) -> None:
        self.entity_plans_by_step[step] = plan

    def set_element_plan(
        self,
        *,
        step: int,
        plan: str,
    ) -> None:
        self.element_plans_by_step[step] = plan

    def set_storage_usage(
        self,
        *,
        step: int,
        usage: LabelRecordStorageUsage,
    ) -> None:
        self.storage_usages_by_step[step] = usage


class PerfOperationParams(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    step: int
    num_entities: int
    num_elements: int

    history: PerfHistory = Field(exclude=True)
    insert_hash_to_distance_perf: PerformanceCounter = Field(exclude=True)


# Cannot subscript the inner type because it breaks Pydantic
@dataclass(frozen=True)
class EntityOperationParamsBuilders:
    create_op: type[CreateBase]  # pyright: ignore[reportMissingTypeArgument]
    create: Callable[[], BaseModel]

    update_op: type[UpdateBase]  # pyright: ignore[reportMissingTypeArgument]
    update: Callable[[uuid.UUID], BaseModel]

    delete_op: type[DeleteBase]  # pyright: ignore[reportMissingTypeArgument]
    delete: Callable[[uuid.UUID], BaseModel]


@dataclass(frozen=True)
class ElementOperationParamsBuilders:
    create_op: type[CreateBase]  # pyright: ignore[reportMissingTypeArgument]
    create: Callable[[uuid.UUID], BaseModel]

    update_op: type[UpdateBase]  # pyright: ignore[reportMissingTypeArgument]
    update: Callable[[uuid.UUID, uuid.UUID], BaseModel]

    delete_op: type[DeleteBase]  # pyright: ignore[reportMissingTypeArgument]
    delete: Callable[[uuid.UUID], BaseModel]


@dataclass(frozen=True)
class OperationParamsBuilders:
    entity: EntityOperationParamsBuilders
    element: ElementOperationParamsBuilders


class PerfCreateEntityParams(PerfOperationParams):
    builders: EntityOperationParamsBuilders = Field(exclude=True)


class PerfCreateEntity(Operation[PerfCreateEntityParams]):

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> uuid.UUID:
        params = self.params
        base_op_type = params.builders.create_op
        insert_hash_to_distance_perf = params.insert_hash_to_distance_perf

        base_domain = base_op_type.get_domain()
        assert isinstance(base_domain, LabelEntityDomain)

        with PerformanceCounter(init_seconds=insert_hash_to_distance_perf.total_seconds) as create_perf:
            base_params = params.builders.create()
            add_perf = PerformanceCounter()

            entity = base_domain.create_data(
                current_user=current_user,
                session=session,
                data=base_op_type.get_data(commit, base_params),
                add_perf=add_perf,
            )

        self.params.history.add_create_history(
            step=self.params.step,
            num_entities=self.params.num_entities,
            num_elements=self.params.num_elements,
            create_target='entity',
            insert_hash_to_distance_perf=insert_hash_to_distance_perf,
            add_perf=add_perf,
            create_perf=create_perf,
        )

        return entity.id


class PerfUpdateEntityParams(PerfOperationParams):
    builders: EntityOperationParamsBuilders = Field(exclude=True)
    entity_id: uuid.UUID



class PerfUpdateEntity(Operation[PerfUpdateEntityParams]):

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        params = self.params
        base_op_type = params.builders.update_op
        insert_hash_to_distance_perf = params.insert_hash_to_distance_perf

        base_domain = base_op_type.get_domain()
        assert isinstance(base_domain, LabelEntityDomain)

        with PerformanceCounter(init_seconds=insert_hash_to_distance_perf.total_seconds) as update_perf:
            base_params = params.builders.update(params.entity_id)
            query_closest_states_perf = PerformanceCounter()
            add_perf = PerformanceCounter()

            base_domain.update_data(
                current_user=current_user,
                session=session,
                id=base_op_type.get_id(base_params),
                group_id=commit.group_id,
                commit_hash=commit.hash,
                data=base_op_type.get_data(base_params),
                query_closest_states_perf=query_closest_states_perf,
                add_perf=add_perf,
            )

        self.params.history.add_update_history(
            step=self.params.step,
            num_entities=self.params.num_entities,
            num_elements=self.params.num_elements,
            update_target='entity',
            insert_hash_to_distance_perf=insert_hash_to_distance_perf,
            query_closest_states_perf=query_closest_states_perf,
            add_perf=add_perf,
            update_perf=update_perf,
        )


class PerfDeleteEntityParams(PerfOperationParams):
    builders: EntityOperationParamsBuilders = Field(exclude=True)
    entity_id: uuid.UUID


class PerfDeleteEntity(Operation[PerfDeleteEntityParams]):

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        params = self.params
        base_op_type = params.builders.delete_op
        insert_hash_to_distance_perf = params.insert_hash_to_distance_perf

        base_domain = base_op_type.get_domain()
        assert isinstance(base_domain, LabelEntityDomain)

        with PerformanceCounter(init_seconds=insert_hash_to_distance_perf.total_seconds) as delete_perf:
            base_params = params.builders.delete(params.entity_id)
            query_closest_states_perf = PerformanceCounter()
            add_perf = PerformanceCounter()

            base_domain.delete_data(
                current_user=current_user,
                session=session,
                id=base_op_type.get_id(base_params),
                group_id=commit.group_id,
                commit_hash=commit.hash,
                query_closest_states_perf=query_closest_states_perf,
                add_perf=add_perf,
            )

        self.params.history.add_delete_history(
            step=self.params.step,
            num_entities=self.params.num_entities,
            num_elements=self.params.num_elements,
            delete_target='entity',
            insert_hash_to_distance_perf=insert_hash_to_distance_perf,
            query_closest_states_perf=query_closest_states_perf,
            add_perf=add_perf,
            delete_perf=delete_perf,
        )


class PerfCreateElementParams(PerfOperationParams):
    builders: ElementOperationParamsBuilders = Field(exclude=True)
    entity_id: uuid.UUID


class PerfCreateElement(Operation[PerfCreateElementParams]):

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> uuid.UUID:
        params = self.params
        base_op_type = params.builders.create_op
        insert_hash_to_distance_perf = params.insert_hash_to_distance_perf

        base_domain = base_op_type.get_domain()
        assert isinstance(base_domain, LabelElementDomain)

        with PerformanceCounter(init_seconds=insert_hash_to_distance_perf.total_seconds) as create_perf:
            base_params = params.builders.create(params.entity_id)
            add_perf = PerformanceCounter()
            val_perf = PerformanceCounter()

            entity = base_domain.create_data(
                current_user=current_user,
                session=session,
                data=base_op_type.get_data(commit, base_params),
                add_perf=add_perf,
                val_perf=val_perf,
            )

        self.params.history.add_create_history(
            step=self.params.step,
            num_entities=self.params.num_entities,
            num_elements=self.params.num_elements,
            create_target='element',
            insert_hash_to_distance_perf=insert_hash_to_distance_perf,
            add_perf=add_perf,
            val_perf=val_perf,
            create_perf=create_perf,
        )

        return entity.id


class PerfUpdateElementParams(PerfOperationParams):
    builders: ElementOperationParamsBuilders = Field(exclude=True)
    element_id: uuid.UUID
    entity_id: uuid.UUID


class PerfUpdateElement(Operation[PerfUpdateElementParams]):

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        params = self.params
        base_op_type = params.builders.update_op
        insert_hash_to_distance_perf = params.insert_hash_to_distance_perf

        base_domain = base_op_type.get_domain()
        assert isinstance(base_domain, LabelElementDomain)

        with PerformanceCounter(init_seconds=insert_hash_to_distance_perf.total_seconds) as update_perf:
            base_params = params.builders.update(params.element_id, params.entity_id)
            query_closest_states_perf = PerformanceCounter()
            add_perf = PerformanceCounter()
            val_perf = PerformanceCounter()

            base_domain.update_data(
                current_user=current_user,
                session=session,
                id=base_op_type.get_id(base_params),
                group_id=commit.group_id,
                commit_hash=commit.hash,
                data=base_op_type.get_data(base_params),
                query_closest_states_perf=query_closest_states_perf,
                add_perf=add_perf,
            )

        self.params.history.add_update_history(
            step=self.params.step,
            num_entities=self.params.num_entities,
            num_elements=self.params.num_elements,
            update_target='element',
            insert_hash_to_distance_perf=insert_hash_to_distance_perf,
            query_closest_states_perf=query_closest_states_perf,
            add_perf=add_perf,
            val_perf=val_perf,
            update_perf=update_perf,
        )

class PerfDeleteElementParams(PerfOperationParams):
    builders: ElementOperationParamsBuilders = Field(exclude=True)
    element_id: uuid.UUID


class PerfDeleteElement(Operation[PerfDeleteElementParams]):

    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        params = self.params
        base_op_type = params.builders.delete_op
        insert_hash_to_distance_perf = params.insert_hash_to_distance_perf

        base_domain = base_op_type.get_domain()
        assert isinstance(base_domain, LabelElementDomain)

        with PerformanceCounter(init_seconds=insert_hash_to_distance_perf.total_seconds) as delete_perf:
            base_params = params.builders.delete(params.element_id)
            query_closest_states_perf = PerformanceCounter()
            add_perf = PerformanceCounter()

            base_domain.delete_data(
                current_user=current_user,
                session=session,
                id=base_op_type.get_id(base_params),
                group_id=commit.group_id,
                commit_hash=commit.hash,
                query_closest_states_perf=query_closest_states_perf,
                add_perf=add_perf,
            )

        self.params.history.add_delete_history(
            step=self.params.step,
            num_entities=self.params.num_entities,
            num_elements=self.params.num_elements,
            delete_target='element',
            insert_hash_to_distance_perf=insert_hash_to_distance_perf,
            query_closest_states_perf=query_closest_states_perf,
            add_perf=add_perf,
            delete_perf=delete_perf,
        )

class PerfOperations(str, Enum):
    ENTITY_CREATE = 'perf-entity-create'
    ENTITY_UPDATE = 'perf-entity-update'
    ENTITY_DELETE = 'perf-entity-delete'
    ELEMENT_CREATE = 'perf-element-create'
    ELEMENT_UPDATE = 'perf-element-update'
    ELEMENT_DELETE = 'perf-element-delete'


def random_points(size: int):
    arr = np.random.rand(size, 3).round(6)  # noqa: NPY002
    return [DecimalCoord3(x=x, y=y, z=z) for x, y, z in arr]


def get_bbox_op_params_builders() -> OperationParamsBuilders:
    from sta_bbox.domain.label.repo.ops import box as box_ops, track as track_ops
    from sta_bbox.models.label.data import BoxType, TruncDecimalCoord3, TruncDecimalSize3

    def build_create_entity_params():
        return track_ops.CreateParams(is_black=False)

    def build_update_entity_params(entity_id: uuid.UUID):
        return track_ops.AssignIsBlackParams(
            track_id=entity_id,
            is_black=int(entity_id) % 2 == 0,
        )

    def build_delete_entity_params(entity_id: uuid.UUID):
        return track_ops.DeleteParams(track_id=entity_id)

    def build_create_element_params(entity_id: uuid.UUID):
        return box_ops.CreateParams(
            type=BoxType.CUBOID,
            center=TruncDecimalCoord3.zeros(),
            angle=Decimal(0),
            size=TruncDecimalSize3.ones(),
            timestamp=datetime.now().astimezone(),
            entity_id=entity_id,
        )

    def build_update_element_params(element_id: uuid.UUID, entity_id: uuid.UUID):
        return box_ops.AssignEntityParams(
            box_id=element_id,
            entity_id=entity_id,
        )

    def build_delete_element_params(element_id: uuid.UUID):
        return box_ops.DeleteParams(box_id=element_id)

    return OperationParamsBuilders(
        entity=EntityOperationParamsBuilders(
            create_op=track_ops.Create,
            create=build_create_entity_params,
            update_op=track_ops.AssignIsBlack,
            update=build_update_entity_params,
            delete_op=track_ops.Delete,
            delete=build_delete_entity_params,
        ),
        element=ElementOperationParamsBuilders(
            create_op=box_ops.Create,
            create=build_create_element_params,
            update_op=box_ops.AssignEntity,
            update=build_update_element_params,
            delete_op=box_ops.Delete,
            delete=build_delete_element_params,
        ),
    )


def get_segmentation_op_params_builders() -> OperationParamsBuilders:
    from sta_segmentation.domain.label.repo.ops import (
        instance as instance_ops,
        selection as selection_ops,
    )

    def build_create_entity_params():
        return instance_ops.CreateParams(is_black=False)

    def build_update_entity_params(entity_id: uuid.UUID):
        return instance_ops.AssignIsBlackParams(
            instance_id=entity_id,
            is_black=int(entity_id) % 2 == 0,
        )

    def build_delete_entity_params(entity_id: uuid.UUID):
        return instance_ops.DeleteParams(instance_id=entity_id)

    def build_create_element_params(entity_id: uuid.UUID):
        return selection_ops.CreateParams(
            points=random_points(500),
            timestamp=datetime.now().astimezone(),
            entity_id=entity_id,
        )

    def build_update_element_params(element_id: uuid.UUID, entity_id: uuid.UUID):
        return selection_ops.AssignEntityParams(
            selection_id=element_id,
            entity_id=entity_id,
        )

    def build_delete_element_params(element_id: uuid.UUID):
        return selection_ops.DeleteParams(selection_id=element_id)

    return OperationParamsBuilders(
        entity=EntityOperationParamsBuilders(
            create_op=instance_ops.Create,
            create=build_create_entity_params,
            update_op=instance_ops.AssignIsBlack,
            update=build_update_entity_params,
            delete_op=instance_ops.Delete,
            delete=build_delete_entity_params,
        ),
        element=ElementOperationParamsBuilders(
            create_op=selection_ops.Create,
            create=build_create_element_params,
            update_op=selection_ops.AssignEntity,
            update=build_update_element_params,
            delete_op=selection_ops.Delete,
            delete=build_delete_element_params,
        ),
    )


def get_op_params_builders(plugin: PluginName) -> OperationParamsBuilders:
    if plugin == "bbox":
        return get_bbox_op_params_builders()
    if plugin == "segmentation":
        return get_segmentation_op_params_builders()

    assert_never(plugin)


def create_benchmark_users(
    *,
    root_user: UserPublic,
    session: Session,
    user_count: int,
    password: str,
) -> list[UserPublic]:
    benchmark_users = [root_user]

    for user_idx in range(1, user_count):
        benchmark_user = UserPublic.model_validate(
            user_domain.create_user(
                current_user=root_user,
                session=session,
                data=UserCreate(
                    username=f'perf_user_{user_idx}',
                    password=password,
                    roles={Role.DATA_MANAGER},
                ),
            ),
        )
        benchmark_users.append(benchmark_user)

    return benchmark_users


def get_label_record_storage_usage(
    session: Session,
    *,
    plugin: PluginName,
    group_id: int,
) -> LabelRecordStorageUsage:
    if plugin == 'bbox':
        entity_table_name = 'label_track'
        element_table_name = 'label_box'
    elif plugin == 'segmentation':
        entity_table_name = 'label_instance'
        element_table_name = 'label_selection'
    else:
        assert_never(plugin)

    entity_records_nbytes = session.execute(
        labels_nbytes(entity_table_name, group_id=group_id),
    ).scalar_one()
    element_records_nbytes = session.execute(
        labels_nbytes(element_table_name, group_id=group_id),
    ).scalar_one()

    return LabelRecordStorageUsage(
        label_entity_records_size_bytes=int(entity_records_nbytes),
        label_element_records_size_bytes=int(element_records_nbytes),
    )


def format_storage_usage(num_bytes: int) -> str:
    units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    size = float(num_bytes)

    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f'{size:.2f} {unit}'
        size /= 1024

    raise NotImplementedError


def format_storage_metric(name: str, num_bytes: int) -> str:
    return f'{name}: {format_storage_usage(num_bytes)} ({num_bytes} bytes)'


def write_history(
    history_path: Path,
    history: PerfHistory,
    *,
    baseline_label_record_storage_usage: LabelRecordStorageUsage | None,
) -> None:
    history_df = pd.DataFrame([asdict(row) for row in history.items])

    if baseline_label_record_storage_usage is not None:
        step_storage_usage = history_df['step'].map(
            lambda step: history.storage_usages_by_step.get(
                step,
                baseline_label_record_storage_usage,
            ),
        )
        history_df['label_entity_records_size_bytes'] = (
            step_storage_usage.map(lambda usage: usage.label_entity_records_size_bytes)
            - baseline_label_record_storage_usage.label_entity_records_size_bytes
        )
        history_df['label_element_records_size_bytes'] = (
            step_storage_usage.map(lambda usage: usage.label_element_records_size_bytes)
            - baseline_label_record_storage_usage.label_element_records_size_bytes
        )
        history_df['label_records_size_bytes'] = step_storage_usage.map(
            lambda usage: usage.label_records_size_bytes,
        )
    else:
        for column_name in [
            'label_entity_records_size_bytes',
            'label_element_records_size_bytes',
            'label_records_size_bytes',
        ]:
            history_df[column_name] = pd.Series(dtype='int64')

    history_df.to_csv(history_path)

    output_dir = history_path.parent

    for step, entity_plan in history.entity_plans_by_step.items():
        entity_plan_file = output_dir / f"plan_entity_{step=}.txt"
        entity_plan_file.write_text(entity_plan)

    for step, element_plan in history.element_plans_by_step.items():
        element_plan_file = output_dir / f"plan_element_{step=}.txt"
        element_plan_file.write_text(element_plan)


def get_import_func(
    op_builders: OperationParamsBuilders,
    init_label_count: int,
    label_entity_prob: float,
):

    def import_func(
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ):
        if init_label_count > 0:
            init_entity_count = max(int(init_label_count * label_entity_prob), 1)
            init_element_count = init_label_count - init_entity_count

            if init_entity_count > 0:
                entity_create_op = op_builders.entity.create_op
                entity_domain = entity_create_op.get_domain()
                entity_op_params = [
                    op_builders.entity.create()
                    for _ in range(init_entity_count)
                ]

                entity_domain.bulk_create_datas(
                    current_user=current_user,
                    session=session,
                    data=[
                        entity_create_op.get_data(commit, p)
                        for p in entity_op_params
                    ],
                )
                init_entities = entity_domain.list_datas(
                    current_user=current_user,
                    session=session,
                    group_id=commit.group_id,
                    commit_hash=commit.hash,
                )

                if init_element_count > 0:
                    element_create_op = op_builders.element.create_op
                    element_domain = element_create_op.get_domain()
                    element_op_params = [
                        op_builders.element.create(entity_id)
                        for entity_id in random.choices(
                            [entity.id for entity in init_entities],
                            k=init_element_count,
                        )
                    ]

                    element_domain.bulk_create_datas(
                        current_user=current_user,
                        session=session,
                        data=[
                            element_create_op.get_data(commit, p)
                            for p in element_op_params
                        ],
                    )

    return import_func


def init_op_registry():
    op_registry = OperationRegistry()
    register_special_ops(op_registry)

    op_registry.register(PerfOperations.ENTITY_CREATE, PerfCreateEntity, PerfCreateEntityParams)
    op_registry.register(PerfOperations.ENTITY_UPDATE, PerfUpdateEntity, PerfUpdateEntityParams)
    op_registry.register(PerfOperations.ENTITY_DELETE, PerfDeleteEntity, PerfDeleteEntityParams)
    op_registry.register(PerfOperations.ELEMENT_CREATE, PerfCreateElement, PerfCreateElementParams)
    op_registry.register(PerfOperations.ELEMENT_UPDATE, PerfUpdateElement, PerfUpdateElementParams)
    op_registry.register(PerfOperations.ELEMENT_DELETE, PerfDeleteElement, PerfDeleteElementParams)

    return op_registry


class DummyExecutor(Executor):

    def submit(
        self,
        fn: Callable[..., Any],
        /,
        *args: Any,
        **kwargs: Any,
    ) -> Future[Any]:
        future: Future[Any] = Future()

        try:
            future.set_result(fn(*args, **kwargs))
        except Exception as exc:
            future.set_exception(exc)

        return future


def apply_init_repo(
    *,
    op_registry: OperationRegistry,
    plugin: PluginName,
    root_user: UserPublic,
    benchmark_users: list[UserPublic],
    session: Session,
    group_id: int,
    init_label_count: int,
    label_entity_prob: float,
    history_per_user: list[PerfHistory],
):
    op_builders = get_op_params_builders(plugin)

    init_branch = LabelsetBranchPublic.model_validate(
        repo_graph.init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=repo_graph.LabelsetBranchInit(
                name='Initial Branch (Root)',
                group_id=group_id,
                perm_lv_by_user_id={},
            ),
        ),
    )

    repo_graph.import_data(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=init_branch.id,
        import_func=get_import_func(
            op_builders=op_builders,
            init_label_count=init_label_count,
            label_entity_prob=label_entity_prob,
        ),
    )

    # Each user gets their own branch to avoid merge conflicts
    for user, history in zip(benchmark_users, history_per_user, strict=True):
        new_branch = LabelsetBranchPublic.model_validate(
            repo_graph.init_branch(
                current_user=user,
                session=session,
                op_registry=op_registry,
                data=repo_graph.LabelsetBranchInit(
                    group_id=group_id,
                    commit_hash=init_branch.head.hash,
                    name=f'Initial Branch (User {user.username})',
                    perm_lv_by_user_id={},
                ),
            ),
        )

        history.commit_hashes.append(new_branch.head.hash)
        history.branch_ids.append(new_branch.id)

def apply_new_branch(
    *,
    op_registry: OperationRegistry,
    user: UserPublic,
    session: Session,
    step: int,
    group_id: int,
    history: PerfHistory,
):
    commit_hash = random.choice(history.commit_hashes)

    new_branch = LabelsetBranchPublic.model_validate(
        repo_graph.init_branch(
            current_user=user,
            session=session,
            op_registry=op_registry,
            data=repo_graph.LabelsetBranchInit(
                group_id=group_id,
                commit_hash=commit_hash,
                name=f'Branch (Step {step})',
                perm_lv_by_user_id={},
            ),
        ),
    )

    history.branch_ids.append(new_branch.id)


def apply_extend_branch(
    *,
    op_registry: OperationRegistry,
    op_builders: OperationParamsBuilders,
    user: UserPublic,
    session: Session,
    step: int,
    label_entity_prob: float,
    label_create_prob: float,
    label_delete_prob: float,
    history: PerfHistory,
    query_plan: bool,
):
    branch_id = random.choice(history.branch_ids)
    branch = LabelsetBranchPublic.model_validate(
        branches.read_branch(
            current_user=user,
            session=session,
            id=branch_id,
        ),
    )

    entity_domain = op_builders.entity.create_op.get_domain()
    element_domain = op_builders.element.create_op.get_domain()

    if query_plan:
        entity_q = entity_domain._build_list_query(
            current_user=user,
            session=session,
            group_id=branch.group_id,
            commit_hash=branch.head_hash,
        )
        entity_plan = session.execute(explain(entity_q)).scalars()

        history.set_entity_plan(
            step=step,
            plan="\n".join(entity_plan),
        )

        element_q = element_domain._build_list_query(
            current_user=user,
            session=session,
            group_id=branch.group_id,
            commit_hash=branch.head_hash,
        )
        element_plan = session.execute(explain(element_q)).scalars()

        history.set_element_plan(
            step=step,
            plan="\n".join(element_plan),
        )

    insert_hash_to_distance_perf = PerformanceCounter()

    with PerformanceCounter() as entity_select_perf:
        entity_query_closest_states_perf = PerformanceCounter()

        entity_ids = [
            entity.id
            for entity in entity_domain.list_datas(
                current_user=user,
                session=session,
                group_id=branch.group_id,
                commit_hash=branch.head_hash,
                query_closest_states_perf=entity_query_closest_states_perf,
            )
        ]

    with PerformanceCounter() as element_select_perf:
        element_query_closest_states_perf = PerformanceCounter()

        element_ids = [
            element.id
            for element in element_domain.list_datas(
                current_user=user,
                session=session,
                group_id=branch.group_id,
                commit_hash=branch.head_hash,
                query_closest_states_perf=element_query_closest_states_perf,
            )
        ]

    history.add_select_history(
        step=step,
        num_entities=len(entity_ids),
        num_elements=len(element_ids),
        select_target='entity',
        query_closest_states_perf=entity_query_closest_states_perf,
        select_perf=entity_select_perf,
        result_size=len(entity_ids),
    )

    history.add_select_history(
        step=step,
        num_entities=len(entity_ids),
        num_elements=len(element_ids),
        select_target='element',
        query_closest_states_perf=element_query_closest_states_perf,
        select_perf=element_select_perf,
        result_size=len(element_ids),
    )

    if len(entity_ids) == 0 or random.random() < label_entity_prob:
        op_type_v = random.random()
        if len(entity_ids) == 0 or op_type_v < label_create_prob:
            op_name = PerfOperations.ENTITY_CREATE
            op_params = PerfCreateEntityParams(
                step=step,
                num_entities=len(entity_ids),
                num_elements=len(element_ids),
                history=history,
                insert_hash_to_distance_perf=insert_hash_to_distance_perf,
                builders=op_builders.entity,
            )
        elif op_type_v < label_create_prob + label_delete_prob:
            op_name = PerfOperations.ENTITY_DELETE
            op_params = PerfDeleteEntityParams(
                step=step,
                num_entities=len(entity_ids),
                num_elements=len(element_ids),
                entity_id=random.choice(entity_ids),
                history=history,
                insert_hash_to_distance_perf=insert_hash_to_distance_perf,
                builders=op_builders.entity,
            )
        else:
            op_name = PerfOperations.ENTITY_UPDATE
            op_params = PerfUpdateEntityParams(
                step=step,
                num_entities=len(entity_ids),
                num_elements=len(element_ids),
                entity_id=random.choice(entity_ids),
                history=history,
                insert_hash_to_distance_perf=insert_hash_to_distance_perf,
                builders=op_builders.entity,
            )
    else:
        op_type_v = random.random()
        if len(element_ids) == 0 or op_type_v < label_create_prob:
            op_name = PerfOperations.ELEMENT_CREATE
            op_params = PerfCreateElementParams(
                step=step,
                num_entities=len(entity_ids),
                num_elements=len(element_ids),
                entity_id=random.choice(entity_ids),
                history=history,
                insert_hash_to_distance_perf=insert_hash_to_distance_perf,
                builders=op_builders.element,
            )
        elif op_type_v < label_create_prob + label_delete_prob:
            op_name = PerfOperations.ELEMENT_DELETE
            op_params = PerfDeleteElementParams(
                step=step,
                num_entities=len(entity_ids),
                num_elements=len(element_ids),
                element_id=random.choice(element_ids),
                history=history,
                insert_hash_to_distance_perf=insert_hash_to_distance_perf,
                builders=op_builders.element,
            )
        else:
            op_name = PerfOperations.ELEMENT_UPDATE
            op_params = PerfUpdateElementParams(
                step=step,
                num_entities=len(entity_ids),
                num_elements=len(element_ids),
                element_id=random.choice(element_ids),
                entity_id=random.choice(entity_ids),
                history=history,
                insert_hash_to_distance_perf=insert_hash_to_distance_perf,
                builders=op_builders.element,
            )

    repo_graph.push_commits(
        current_user=user,
        session=session,
        op_registry=op_registry,
        branch_id=branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(op_name=op_name, op_params=op_params),
        ],
        insert_hash_to_distance_perf=insert_hash_to_distance_perf,
    )
    branch = LabelsetBranchPublic.model_validate(
        branches.read_branch(
            current_user=user,
            session=session,
            id=branch.id,
        ),
    )
    history.commit_hashes.append(branch.head_hash)


def run_user_step(
    *,
    app_config: AppConfig,
    op_registry: OperationRegistry,
    op_builders: OperationParamsBuilders,
    current_user: UserPublic,
    step: int,
    commit_mode: CommitMode,
    group_id: int,
    plugin: PluginName,
    label_entity_prob: float,
    label_create_prob: float,
    label_delete_prob: float,
    query_plan: bool,
    log_storage: bool,
    history: PerfHistory,
):
    with session_ctx(app_config) as session:
        if commit_mode == 'new-branch':
            apply_new_branch(
                op_registry=op_registry,
                user=current_user,
                session=session,
                step=step,
                group_id=group_id,
                history=history,
            )
        elif commit_mode == 'extend-branch':
            apply_extend_branch(
                op_registry=op_registry,
                op_builders=op_builders,
                user=current_user,
                session=session,
                step=step,
                label_entity_prob=label_entity_prob,
                label_create_prob=label_create_prob,
                label_delete_prob=label_delete_prob,
                query_plan=query_plan,
                history=history,
            )
        else:
            assert_never(commit_mode)

        if log_storage:
            history.set_storage_usage(
                step=step,
                usage=get_label_record_storage_usage(
                    session,
                    plugin=plugin,
                    group_id=group_id,
                ),
            )

        session.commit()


def run_user(
    *,
    app_config: AppConfig,
    op_registry: OperationRegistry,
    op_builders: OperationParamsBuilders,
    current_user: UserPublic,
    commit_count: int,
    group_id: int,
    plugin: PluginName,
    branching_prob: float,
    label_entity_prob: float,
    label_create_prob: float,
    label_delete_prob: float,
    query_plan: bool,
    log_storage: bool,
    history: PerfHistory,
    on_step: Callable[[PerfHistory, int], None],
) -> PerfHistory:
    with tqdm(
        total=commit_count,
        desc=f'Generating commits for {current_user.username}',
        leave=False,
    ) as progbar:
        # NOTE: step=0 represents the root commit
        step = 1

        while history.num_commits < commit_count:
            commit_mode = 'new-branch' if random.random() < branching_prob else 'extend-branch'

            run_user_step(
                app_config=app_config,
                op_registry=op_registry,
                op_builders=op_builders,
                current_user=current_user,
                step=step,
                commit_mode=commit_mode,
                group_id=group_id,
                plugin=plugin,
                label_entity_prob=label_entity_prob,
                label_create_prob=label_create_prob,
                label_delete_prob=label_delete_prob,
                query_plan=query_plan,
                log_storage=log_storage,
                history=history,
            )

            progbar.update(history.num_commits - progbar.n)
            on_step(history, step)

            step += 1

    return history


def run_user_worker(
    current_user: UserPublic,
    history: PerfHistory,
    write_checkpoints: bool,
    *,
    app_config: AppConfig,
    op_registry: OperationRegistry,
    plugin: PluginName,
    commit_count: int,
    group_id: int,
    branching_prob: float,
    label_entity_prob: float,
    label_create_prob: float,
    label_delete_prob: float,
    query_plan: bool,
    log_storage: bool,
    history_path: Path,
    baseline_label_record_storage_usage: LabelRecordStorageUsage | None,
) -> PerfHistory:
    op_builders = get_op_params_builders(plugin)

    def on_step(current_history: PerfHistory, step: int) -> None:
        if write_checkpoints and step % 500 == 0:
            write_history(
                history_path,
                current_history,
                baseline_label_record_storage_usage=baseline_label_record_storage_usage,
            )

    return run_user(
        app_config=app_config,
        op_registry=op_registry,
        op_builders=op_builders,
        current_user=current_user,
        commit_count=commit_count,
        group_id=group_id,
        plugin=plugin,
        branching_prob=branching_prob,
        label_entity_prob=label_entity_prob,
        label_create_prob=label_create_prob,
        label_delete_prob=label_delete_prob,
        query_plan=query_plan,
        log_storage=log_storage,
        history=history,
        on_step=on_step,
    )


def perf_label_queries(
    *,
    config_path: str,
    plugin: PluginName,
    user_count: int,
    commit_count: int,
    branching_prob: float, label_entity_prob: float, label_create_prob: float, label_delete_prob: float,
    init_label_count: int,
    output_dir: Path,
    overwrite: bool | None = None,
    seed: int | None = None,
    query_plan: bool = False,
    log_storage: bool = False,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    history_path = output_dir / "history.csv"
    if history_path.exists():
        if overwrite is not None:
            if not overwrite:
                click.echo(f'A file already exists at the path ({history_path}). Aborting...')
                raise click.exceptions.Exit(1)
        else:
            if not click.confirm(f'A file already exists at the path ({history_path}). Are you sure you want to overwrite that file?'):
                raise click.exceptions.Exit(1)

    if user_count < 1:
        msg = 'Number of users should be positive'
        raise ValueError(msg)
    if commit_count < 0:
        msg = 'Number of commits should be non-negative'
        raise ValueError(msg)
    if not (0 <= branching_prob <= 1):
        msg = 'Branching probability should be in the interval `[0, 1]`'
        raise ValueError(msg)
    if not (0 <= label_entity_prob <= 1):
        msg = 'Label entity probability should be in the interval `[0, 1]`'
        raise ValueError(msg)
    if not (0 <= label_create_prob <= 1):
        msg = 'Label create probability should be in the interval `[0, 1]`'
        raise ValueError(msg)
    if not (0 <= label_delete_prob <= 1):
        msg = 'Label delete probability should be in the interval `[0, 1]`'
        raise ValueError(msg)

    label_update_prob = 1 - label_create_prob - label_delete_prob
    if not (0 <= label_update_prob <= 1):
        msg = 'Label update probability should be in the interval `[0, 1]`'
        raise ValueError(msg)

    click.echo('[Parameters]')
    click.echo(f'Number of concurrent users: {user_count}')
    click.echo(f'Number of commits per user: {commit_count}')
    click.echo(f'Branching probability: {branching_prob:.3f}')
    click.echo(f'Label entity probability: {label_entity_prob:.3f} | Label element probability: {1 - label_entity_prob:.3f}')
    click.echo(f'Label create probability: {label_create_prob:.3f} | Label delete probability: {label_delete_prob:.3f} | Label update probability: {label_update_prob:.3f}')
    click.echo(f'Number of initial labels: {init_label_count}')
    click.echo(f'Random seed: {seed}')
    click.echo()

    app_config = AppConfigArgs.from_file(config_path).as_config()

    db_config = app_config.db_config
    if not isinstance(db_config, PostgresDatabaseConfig):
        msg = f'The configuration should refer to a remote database. Found: {type(db_config)}'
        raise TypeError(msg)

    db_config._database += '_perf'  # Use a separate database

    username = password = 'perf_user_0'

    with test_app_ctx(
        app_config=app_config,
        root_username=username,
        root_password=password,
    ) as root_user:
        with session_ctx(app_config) as session:
            benchmark_users = create_benchmark_users(
                root_user=root_user,
                session=session,
                user_count=user_count,
                password=password,
            )

            label_group = LabelGroupPublic.model_validate(
                groups.create_group(
                    current_user=root_user,
                    session=session,
                    data=LabelGroupCreate(name='Test group for performance analysis'),
                ),
            )

            if log_storage:
                baseline_label_record_storage_usage = get_label_record_storage_usage(
                    session,
                    plugin=plugin,
                    group_id=label_group.id,
                )
            else:
                baseline_label_record_storage_usage = None

            session.commit()

        op_registry = init_op_registry()
        history_per_user = [PerfHistory() for _ in benchmark_users]
        final_label_record_storage_usage = baseline_label_record_storage_usage

        try:
            with PerformanceCounter() as run_counter:
                with session_ctx(app_config) as session:
                    apply_init_repo(
                        op_registry=op_registry,
                        plugin=plugin,
                        root_user=root_user,
                        benchmark_users=benchmark_users,
                        session=session,
                        group_id=label_group.id,
                        init_label_count=init_label_count,
                        label_entity_prob=label_entity_prob,
                        history_per_user=history_per_user,
                    )
                    session.commit()

                worker_fn = partial(
                    run_user_worker,
                    app_config=app_config,
                    op_registry=op_registry,
                    plugin=plugin,
                    commit_count=commit_count,
                    group_id=label_group.id,
                    branching_prob=branching_prob,
                    label_entity_prob=label_entity_prob,
                    label_create_prob=label_create_prob,
                    label_delete_prob=label_delete_prob,
                    query_plan=query_plan,
                    log_storage=log_storage,
                    history_path=history_path,
                    baseline_label_record_storage_usage=baseline_label_record_storage_usage,
                )
                write_checkpoints_per_user = [index == 0 for index in range(len(benchmark_users))]

                with (
                    DummyExecutor() if user_count == 1 else ProcessPoolExecutor(max_workers=user_count)
                ) as pool:
                    history_per_user = list(pool.map(
                        worker_fn,
                        benchmark_users,
                        history_per_user,
                        write_checkpoints_per_user,
                    ))

                if log_storage:
                    with session_ctx(app_config) as session:
                        final_label_record_storage_usage = get_label_record_storage_usage(
                            session,
                            plugin=plugin,
                            group_id=label_group.id,
                        )

            click.echo()
        finally:
            with session_ctx(app_config) as session:
                groups.delete_group(
                    current_user=root_user,
                    session=session,
                    id=label_group.id,
                )
                session.commit()

        write_history(
            history_path,
            history_per_user[0],
            baseline_label_record_storage_usage=baseline_label_record_storage_usage,
        )

        click.echo('[Metrics]')
        click.echo(f'Time elapsed: {run_counter.total_seconds:3f} secs')

        for user, history in zip(benchmark_users, history_per_user, strict=True):
            click.echo(f'Number of steps for {user.username}: {history.num_steps}')

        if (
            baseline_label_record_storage_usage is not None
            and final_label_record_storage_usage is not None
        ):
            total_baseline_bytes = baseline_label_record_storage_usage.label_records_size_bytes
            total_final_bytes = final_label_record_storage_usage.label_records_size_bytes
            click.echo(format_storage_metric('Total label record size delta', total_final_bytes - total_baseline_bytes))

        click.echo()

        # Make sure the sessions of other users have exited
        time.sleep(10)
