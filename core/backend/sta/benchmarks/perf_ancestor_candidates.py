"""Query-plan comparison for the ancestor-candidate predicate.

`_select_ancestor_ids_matching` pre-narrows the closest-state CTE of a filtered
revision read, and `STA_USE_ANCESTOR_CANDIDATES` switches it off. This benchmark
seeds a deep linear commit graph in a scratch database and runs each affected read
with the predicate on and off, reporting what the driver actually sends, Postgres'
block and spill counters at the configured `work_mem` and at a deliberately small
one, and the client-side allocation of the result.

Two reads consume the predicate (`list_datas_in_any_bounds`,
`list_datas_for_element_window`); two more are reported as controls because they
resolve closest states without it (`has_live_children`, `read_data`), and those are
the reads every element create, delete and reassign pays.

Whether narrowing helps or hurts the element read depends on how stored states are
spread across objects and commits, which can flip the chosen plan. Read the output
as a probe of that mechanism rather than as the production figure.
"""

from __future__ import annotations

import json
import os
import tracemalloc
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Any

import click

from pydantic import BaseModel
from sqlalchemy import event, text as sa_text
from sqlmodel import Session

from ..common.database import PostgresDatabaseConfig
from ..common.spatial import OptionalDecimalCoord3, PartialSTBounds
from ..common.utils.json import JSONType
from ..config import AppConfigArgs
from ..domain.label import groups
from ..domain.label.data import LabelElementDomain, LabelEntityDomain
from ..domain.label.repo import graph as repo_graph
from ..domain.label.repo.branches import read_branch
from ..domain.label.repo.ops import Operation, OperationRegistry
from ..domain.label.repo.ops.special import register_special_ops
from ..entrypoints import test_app_ctx
from ..models.label.data import LabelElementSQLModel, LabelEntitySQLModel
from ..models.label.group import LabelGroupCreate, LabelGroupPublic
from ..models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommit,
    LabelsetCommitInstruction,
)
from ..models.user import UserPublic
from ..session import session_ctx

_T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
_STAT_KEYS = (
    "execution_ms",
    "planning_ms",
    "shared_hit_blocks",
    "shared_read_blocks",
    "temp_read_blocks",
    "temp_written_blocks",
    "result_rows",
)
_TIGHT_KEYS = ("execution_ms", "temp_read_blocks", "temp_written_blocks")


class ProfileEntitySQLModel(LabelEntitySQLModel):
    """Entity model for the benchmark graph."""


class ProfileElementSQLModel(LabelElementSQLModel):
    """Element model relying on the inherited bounds columns."""


ProfileEntity = ProfileEntitySQLModel.get_table_cls("perf_ancestor_entity")
ProfileElement = ProfileElementSQLModel.get_table_cls("perf_ancestor_element")
ProfileEntityCreate = ProfileEntitySQLModel.get_create_cls()
ProfileElementCreate = ProfileElementSQLModel.get_create_cls()
ProfileEntityUpdate = ProfileEntitySQLModel.get_update_cls()
ProfileElementUpdate = ProfileElementSQLModel.get_update_cls()

entity_domain = LabelEntityDomain(
    table_cls=ProfileEntity,
    create_cls=ProfileEntityCreate,
    public_cls=ProfileEntitySQLModel.get_public_cls(),
    update_cls=ProfileEntityUpdate,
    bulk_update_cls=ProfileEntityUpdate,
)
element_domain = LabelElementDomain(
    table_cls=ProfileElement,
    create_cls=ProfileElementCreate,
    public_cls=ProfileElementSQLModel.get_public_cls(),
    update_cls=ProfileElementUpdate,
    bulk_update_cls=ProfileElementUpdate,
    entity_domain=entity_domain,
)


class ProfileOperationType(str, Enum):
    NO_OP = "perf-ancestor-no-op"


class ProfileNoOpParams(BaseModel):
    pass


class ProfileNoOpOperation(Operation[ProfileNoOpParams]):
    def apply(
        self,
        current_user: UserPublic,
        session: Session,
        commit: LabelsetCommit,
    ) -> JSONType:
        pass


@contextmanager
def _env(name: str, value: str):
    previous = os.environ.get(name)
    os.environ[name] = value

    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = previous


def _push_no_op(
    *,
    current_user: UserPublic,
    session: Session,
    op_registry: OperationRegistry,
    branch: LabelsetBranchPublic,
) -> LabelsetBranchPublic:
    repo_graph.push_commits(
        current_user=current_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=ProfileOperationType.NO_OP,
                op_params=ProfileNoOpParams(),
            ),
        ],
    )
    session.commit()

    return LabelsetBranchPublic.model_validate(
        read_branch(current_user=current_user, session=session, id=branch.id),
    )


def _seed(
    *,
    session: Session,
    current_user: UserPublic,
    op_registry: OperationRegistry,
    branch: LabelsetBranchPublic,
    depth: int,
    width: int,
    entity_count: int,
) -> tuple[str, list[Any]]:
    """Grow a linear history of `depth` commits carrying `width` element states."""
    group_id = branch.group_id
    entities = [
        entity_domain.create_data(
            current_user=current_user,
            session=session,
            data=ProfileEntityCreate(group_id=group_id, commit_hash=branch.head_hash),
        )
        for _ in range(entity_count)
    ]
    session.commit()

    # Entities grown by editor ops keep a childless first state, so the
    # element-window filter matches nearly all of them; only a tenth get children.
    for entity in entities[::10]:
        entity_domain.set_has_children(
            current_user=current_user,
            session=session,
            id=entity.id,
            group_id=group_id,
            commit_hash=branch.head_hash,
            value=True,
        )
    session.commit()

    elements: list[Any] = []

    for step in range(depth):
        branch = _push_no_op(
            current_user=current_user,
            session=session,
            op_registry=op_registry,
            branch=branch,
        )

        if len(elements) < width:
            elements.append(
                element_domain.create_data(
                    current_user=current_user,
                    session=session,
                    data=ProfileElementCreate(
                        group_id=group_id,
                        commit_hash=branch.head_hash,
                        entity_id=entities[step % len(entities)].id,
                        min_x=Decimal(step),
                        max_x=Decimal(step + 1),
                        min_y=Decimal(0),
                        max_y=Decimal(10),
                        min_z=Decimal(0),
                        max_z=Decimal(10),
                        min_timestamp=_T0 + timedelta(seconds=step),
                        max_timestamp=_T0 + timedelta(seconds=step + 1),
                    ),
                ),
            )
            session.commit()

        # Churn the first element at every commit so states accumulate along the chain.
        element_domain.update_data(
            current_user=current_user,
            session=session,
            id=elements[0].id,
            group_id=group_id,
            commit_hash=branch.head_hash,
            data=ProfileElementUpdate(min_y=Decimal(0), max_y=Decimal(10)),
        )
        session.commit()

    return branch.head_hash, [entity.id for entity in entities]


def _explain_json(
    session: Session,
    statement: str,
    params: dict[str, Any],
    work_mem: str | None = None,
) -> dict[str, Any]:
    prefixed = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {statement}"
    conn = session.connection()
    if work_mem is not None:
        conn.execute(sa_text(f"SET LOCAL work_mem = '{work_mem}'"))

    # The captured statement already carries the driver's own pyformat binds, and
    # text() would escape its `%`, so hand it to the driver unparsed.
    payload = conn.exec_driver_sql(prefixed, params).scalar_one()

    if isinstance(payload, str):
        payload = json.loads(payload)

    return payload[0] if isinstance(payload, list) else payload


def _walk(node: dict[str, Any]) -> Iterator[dict[str, Any]]:
    yield node
    yield from (child for plan in node.get("Plans", []) for child in _walk(plan))


def _stats(plan: dict[str, Any]) -> dict[str, float]:
    nodes = list(_walk(plan["Plan"]))

    def total(key: str) -> int:
        return sum(node.get(key, 0) for node in nodes)

    return {
        "execution_ms": plan["Execution Time"],
        "planning_ms": plan.get("Planning Time", 0.0),
        "shared_hit_blocks": total("Shared Hit Blocks"),
        "shared_read_blocks": total("Shared Read Blocks"),
        "temp_read_blocks": total("Temp Read Blocks"),
        "temp_written_blocks": total("Temp Written Blocks"),
        "result_rows": plan["Plan"]["Actual Rows"],
    }


def _measure(
    label: str,
    session: Session,
    run: Callable[[], Sequence[Any]],
    *,
    tight_work_mem: str,
) -> None:
    """Run one read twice, reporting the driver statement of the second, warmed, pass."""
    captured: list[tuple[str, dict[str, Any]]] = []
    engine = session.get_bind()

    def _listen(
        _conn: Any,
        _cursor: Any,
        statement: str,
        parameters: dict[str, Any],
        _context: Any,
        _executemany: Any,
    ) -> None:
        if "distance_matrix" in statement:
            captured.append((statement, parameters))

    event.listen(engine, "before_cursor_execute", _listen)
    try:
        run()
        captured.clear()
        tracemalloc.start()
        try:
            records = run()
            _current, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
    finally:
        event.remove(engine, "before_cursor_execute", _listen)

    statement, params = captured[-1]
    stats = _stats(_explain_json(session, statement, params))
    session.rollback()
    tight = _stats(_explain_json(session, statement, params, work_mem=tight_work_mem))
    session.rollback()

    lines = [
        f"--- {label} ---",
        f"  sql chars             : {len(statement)}",
        f"  bind params           : {len(params)}",
        f"  distance_matrix refs  : {statement.count('distance_matrix')}",
        f"  client peak alloc KiB : {peak / 1024:.1f}",
        f"  rows returned         : {len(records)}",
    ]
    lines += [f"  {'work_mem=default ' + key:<26}: {stats[key]:>12,.0f}" for key in _STAT_KEYS]
    lines += [
        f"  {'work_mem=' + tight_work_mem + ' ' + key:<26}: {tight[key]:>12,.0f}"
        for key in _TIGHT_KEYS
    ]

    click.echo("\n".join(lines))
    click.echo()


def perf_ancestor_candidates(
    *,
    config_path: str,
    depth: int,
    width: int,
    entity_count: int,
    tight_work_mem: str,
) -> None:
    """Compare the filtered closest-state reads with and without candidate narrowing."""
    if depth < 1:
        msg = "Depth should be positive"
        raise ValueError(msg)
    if width < 1:
        msg = "Width should be positive; the seeded graph churns an existing element"
        raise ValueError(msg)
    if entity_count < 1:
        msg = "Entity count should be positive"
        raise ValueError(msg)

    app_config = AppConfigArgs.from_file(config_path).as_config()
    db_config = app_config.db_config
    if not isinstance(db_config, PostgresDatabaseConfig):
        msg = f"The configuration should refer to a remote database. Found: {type(db_config)}"
        raise TypeError(msg)

    # A dedicated suffix: the label-query benchmark owns `_perf` and its surviving
    # data, and neither run should drop the other's database.
    app_config = replace(app_config, db_config=db_config.with_db_suffix("_ancestors"))

    click.echo("[Parameters]")
    click.echo(f"Commits per branch: {depth}")
    click.echo(f"Element states: {width} elements, first one churned at every commit")
    click.echo(f"Entities: {entity_count}")
    click.echo(f"Constrained work_mem: {tight_work_mem}")
    click.echo()

    op_registry = OperationRegistry()
    register_special_ops(op_registry)
    op_registry.register(ProfileOperationType.NO_OP, ProfileNoOpOperation, ProfileNoOpParams)

    username = password = "perf_ancestor"

    with test_app_ctx(
        app_config=app_config,
        with_plugins=False,
        root_username=username,
        root_password=password,
    ) as root_user:
        with session_ctx(app_config) as session:
            label_group = LabelGroupPublic.model_validate(
                groups.create_group(
                    current_user=root_user,
                    session=session,
                    data=LabelGroupCreate(name="Ancestor-candidate benchmark group"),
                ),
            )
            branch = LabelsetBranchPublic.model_validate(
                repo_graph.init_branch(
                    current_user=root_user,
                    session=session,
                    op_registry=op_registry,
                    data=repo_graph.LabelsetBranchInit(
                        name="Benchmark branch",
                        group_id=label_group.id,
                        perm_lv_by_user_id={},
                    ),
                ),
            )
            session.commit()

            head, entity_ids = _seed(
                session=session,
                current_user=root_user,
                op_registry=op_registry,
                branch=branch,
                depth=depth,
                width=width,
                entity_count=entity_count,
            )
            group_id = label_group.id

            state_counts = sa_text(
                "SELECT (SELECT count(*) FROM perf_ancestor_element),"
                " (SELECT count(*) FROM perf_ancestor_entity),"
                " (SELECT count(*) FROM distance_matrix WHERE group_id = :g)"
            ).bindparams(g=group_id)
            counts = session.connection().execute(state_counts).one()
            click.echo("[Graph]")
            click.echo(f"  commits             : {depth:,}")
            click.echo(f"  element states      : {counts[0]:,}")
            click.echo(f"  entity states       : {counts[1]:,}")
            click.echo(f"  distance_matrix rows: {counts[2]:,}")
            click.echo()

            referenced_ids = {
                element.id
                for element in element_domain.list_datas(
                    current_user=root_user,
                    session=session,
                    group_id=group_id,
                    commit_hash=head,
                )[:5]
            }
            bounds = [
                PartialSTBounds(
                    min_coords=OptionalDecimalCoord3(
                        x=Decimal(0), y=Decimal(-1000), z=Decimal(-1000)
                    ),
                    max_coords=OptionalDecimalCoord3(
                        x=Decimal(width // 20), y=Decimal(1000), z=Decimal(1000)
                    ),
                    min_timestamp=_T0 - timedelta(days=1),
                    max_timestamp=_T0 + timedelta(days=1),
                ),
            ]

            for narrowing_on in (True, False):
                with _env("STA_USE_ANCESTOR_CANDIDATES", "1" if narrowing_on else "0"):
                    state = "on" if narrowing_on else "off"

                    def element_window() -> Sequence[Any]:
                        return element_domain.list_datas_in_any_bounds(
                            current_user=root_user,
                            session=session,
                            group_id=group_id,
                            commit_hash=head,
                            st_bounds=bounds,
                        )

                    def entity_window() -> Sequence[Any]:
                        return entity_domain.list_datas_for_element_window(
                            current_user=root_user,
                            session=session,
                            group_id=group_id,
                            commit_hash=head,
                            referenced_ids=referenced_ids,
                        )

                    # Un-narrowed controls: the two closest-state reads that every
                    # element create, delete and reassign pays.
                    def has_live_children() -> Sequence[Any]:
                        return [
                            element_domain.has_live_children(
                                current_user=root_user,
                                session=session,
                                entity_id=entity_ids[0],
                                group_id=group_id,
                                commit_hash=head,
                            ),
                        ]

                    def entity_read() -> Sequence[Any]:
                        return [
                            entity_domain.read_data(
                                current_user=root_user,
                                session=session,
                                id=entity_ids[0],
                                group_id=group_id,
                                commit_hash=head,
                                exc_noun="parent entity",
                            ),
                        ]

                    for label, run in (
                        (f"element window read, candidates={state}", element_window),
                        (f"entity window read, candidates={state}", entity_window),
                        (f"has_live_children (un-narrowed), candidates={state}", has_live_children),
                        (f"entity read_data (un-narrowed), candidates={state}", entity_read),
                    ):
                        _measure(label, session, run, tight_work_mem=tight_work_mem)

        with session_ctx(app_config) as session:
            groups.delete_group(
                current_user=root_user,
                session=session,
                id=label_group.id,
            )
            session.commit()
