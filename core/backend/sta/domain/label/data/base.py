import os
import uuid
from collections.abc import Sequence, Set
from contextlib import nullcontext
from datetime import datetime
from http import HTTPStatus
from itertools import groupby
from typing import Any, Generic, TypeVar, cast

from fastapi import HTTPException
from sqlalchemy.sql.expression import Select
from sqlalchemy.sql.schema import Column
from sqlmodel import Session, and_, func, insert, literal, or_, select, update

from sta.common.database.execution import execute_statement, sql_column
from sta.common.perf import PerformanceCounter
from sta.common.spatial import DecimalCoord, PartialSTBounds
from sta.envs import STA_USE_ANCESTOR_CANDIDATES, STA_USE_DELTA_ENCODING

from ....models.label.data import (
    LabelDataPublicLike,
    LabelDataSQLModel,
    LabelDataTableLike,
    LabelDataUpdateLike,
    LabelElementPublicLike,
    LabelElementSQLModel,
    LabelElementTableLike,
    LabelElementUpdateLike,
    LabelEntityPublicLike,
    LabelEntitySQLModel,
    LabelEntityTableLike,
    LabelEntityUpdateLike,
)
from ....models.label.repo import BranchPermissionLevel, GraphDistance, LabelsetBranch
from ....models.user import Role, UserPublic
from ..groups import get_valid_group_ids
from ..repo.branches import can_access_branch

__all__ = ["LabelDataDomain", "LabelElementDomain", "LabelEntityDomain"]


_FALSEY_ENV_VALUES = {"", "0", "false", "no", "off"}
CoordFilter = float | DecimalCoord


def _env_flag(name: str) -> bool:
    value = os.getenv(name)
    if value is None:
        return True

    return value.strip().lower() not in _FALSEY_ENV_VALUES


def _use_delta_encoding() -> bool:
    return _env_flag(STA_USE_DELTA_ENCODING)


def _use_ancestor_candidates() -> bool:
    return _use_delta_encoding() and _env_flag(STA_USE_ANCESTOR_CANDIDATES)


_T = TypeVar("_T", bound=LabelDataTableLike)
_C = TypeVar("_C", bound=LabelDataSQLModel)
_P = TypeVar("_P", bound=LabelDataPublicLike, covariant=True)
_U = TypeVar("_U", bound=LabelDataUpdateLike)
_BU = TypeVar("_BU", bound=LabelDataUpdateLike)


class LabelDataDomain(Generic[_T, _C, _P, _U, _BU]):
    _instances = dict[  # noqa: RUF012
        type[LabelDataTableLike],
        "LabelDataDomain[Any, Any, Any, Any, Any]",
    ]()

    @staticmethod
    def iter_cruds():
        yield from LabelDataDomain._instances.items()

    @classmethod
    def domain_registry(cls):
        """Return the mutable registry used to coordinate label-data domains."""
        return cls._instances

    def __init__(
        self,
        *,
        table_cls: type[_T],
        create_cls: type[_C],
        public_cls: type[_P],
        update_cls: type[_U],
        bulk_update_cls: type[_BU],
    ):
        super().__init__()

        self._instances[table_cls] = self

        self.table_cls = table_cls
        self.create_cls = create_cls
        self.public_cls = public_cls
        self.update_cls = update_cls
        self.bulk_update_cls = bulk_update_cls

    def can_read_data_filters(self, user: UserPublic, session: Session):
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return []

        return [sql_column(self.table_cls.group_id).in_(get_valid_group_ids(user, session))]

    def can_read_data(self, user: UserPublic, session: Session, data: _T | _C) -> bool:
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return True

        return data.group_id in get_valid_group_ids(user, session)

    def require_write_data_branch(
        self,
        user: UserPublic,
        session: Session,
        *,
        group_id: int,
        commit_hash: str,
    ) -> bool:
        """Require WRITE on a branch whose current head is the target commit."""
        branch_ids = session.exec(
            select(sql_column(LabelsetBranch.id))
            .where(LabelsetBranch.group_id == group_id)
            .where(LabelsetBranch.head_hash == commit_hash)
        ).all()
        if not any(
            can_access_branch(
                user,
                session,
                id=branch_id,
                perm_lv=BranchPermissionLevel.WRITE,
            )
            for branch_id in branch_ids
        ):
            raise HTTPException(
                status_code=HTTPStatus.FORBIDDEN,
                detail="You need WRITE access to a branch at the target commit.",
            )
        return True

    def _select(self, group_id: int, commit_hash: str):
        return self.select_states(group_id, commit_hash)

    def _select_closest_states(
        self,
        group_id: int,
        commit_hash: str,
        candidate_ids: Select[Any] | None = None,
    ):
        """
        Get the state of each existing object as of a commit.

        Parameters
        ----------
        group_id : int
            The unique identifier of the label group of the query commit.
        commit_hash : str
            The hash of the query commit.
        """
        table_cls = self.table_cls
        h2d = GraphDistance

        dist_query = (
            select(table_cls.id, table_cls.group_id, table_cls.commit_hash, h2d.distance)
            .join(
                h2d,
                (sql_column(h2d.group_id) == table_cls.group_id)
                & (sql_column(h2d.src_hash) == table_cls.commit_hash),
            )
            .where(h2d.group_id == group_id)
            .where(h2d.dst_hash == commit_hash)
        )

        if candidate_ids is not None:
            # This CTE has two consumers. Filter it here so materialization does
            # not enumerate every historical state before the outer WHERE runs.
            dist_query = dist_query.where(sql_column(table_cls.id).in_(candidate_ids))

        dist_by_id_hash = dist_query.cte()

        min_dist_by_id = (
            select(
                dist_by_id_hash.c.id,
                dist_by_id_hash.c.group_id,
                func.min(dist_by_id_hash.c.distance).label("min_distance"),
            )
            .group_by(dist_by_id_hash.c.id, dist_by_id_hash.c.group_id)
            .subquery()
        )

        # Merge commits prevent the situation where multiple commits have the same closest distance
        closest_hash_by_id = (
            select(dist_by_id_hash.c.id, dist_by_id_hash.c.group_id, dist_by_id_hash.c.commit_hash)
            .join(
                min_dist_by_id,
                (min_dist_by_id.c.id == dist_by_id_hash.c.id)
                & (min_dist_by_id.c.group_id == dist_by_id_hash.c.group_id)
                & (min_dist_by_id.c.min_distance == dist_by_id_hash.c.distance),
            )
            .subquery()
        )

        return select(table_cls).join(
            closest_hash_by_id,
            (closest_hash_by_id.c.id == sql_column(table_cls.id))
            & (closest_hash_by_id.c.group_id == table_cls.group_id)
            & (closest_hash_by_id.c.commit_hash == table_cls.commit_hash),
        )

    def _select_ancestor_ids_matching(
        self,
        group_id: int,
        commit_hash: str,
        *filters: Any,
    ):
        """Select IDs with an ancestor state matching all supplied filters.

        This is a safe candidate set for a filtered closest-state query: if an
        object's visible state matches, that state is itself an ancestor of the
        requested commit and therefore contributes its ID. The caller must still
        apply the filters to the resolved state because an older matching state
        does not imply that the visible state matches.
        """
        table_cls = self.table_cls
        distance = GraphDistance
        return (
            select(sql_column(table_cls.id))
            .join(
                distance,
                (sql_column(distance.group_id) == table_cls.group_id)
                & (sql_column(distance.src_hash) == table_cls.commit_hash),
            )
            .where(sql_column(table_cls.group_id) == group_id)
            .where(distance.dst_hash == commit_hash)
            .where(*filters)
            .distinct()
        )

    def _select_commit_states(
        self,
        group_id: int,
        commit_hash: str,
    ):
        table_cls = self.table_cls
        return (
            select(table_cls)
            .where(sql_column(table_cls.group_id) == group_id)
            .where(sql_column(table_cls.commit_hash) == commit_hash)
        )

    def _has_stored_states(
        self,
        *,
        session: Session,
        group_id: int,
        commit_hash: str,
    ) -> bool:
        table_cls = self.table_cls
        q = (
            select(literal(True))  # noqa: FBT003
            .select_from(table_cls)
            .where(sql_column(table_cls.group_id) == group_id)
            .where(sql_column(table_cls.commit_hash) == commit_hash)
            .limit(1)
        )

        return session.exec(q).one_or_none() is not None

    def _prepare_own_commit_states(
        self,
        *,
        session: Session,
        group_id: int,
        commit_hash: str,
        add_perf: PerformanceCounter | None = None,
    ):
        if _use_delta_encoding() or self._has_stored_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
        ):
            return

        q = self.insert_states(
            self._select_closest_states(group_id, commit_hash),
            group_id,
            commit_hash,
        )

        with add_perf or nullcontext():
            execute_statement(session, q)

    def prepare_commit_states(
        self,
        *,
        session: Session,
        group_id: int,
        commit_hash: str,
        add_perf: PerformanceCounter | None = None,
    ):
        if _use_delta_encoding():
            return

        for _, crud in self.iter_cruds():
            crud._prepare_own_commit_states(
                session=session,
                group_id=group_id,
                commit_hash=commit_hash,
                add_perf=add_perf,
            )

    def select_states(
        self,
        group_id: int,
        commit_hash: str,
    ):
        """
        Get the state of each existing object as of a commit.

        Parameters
        ----------
        group_id : int
            The unique identifier of the label group of the query commit.
        commit_hash : str
            The hash of the query commit.
        """
        if _use_delta_encoding():
            return self._select_closest_states(group_id, commit_hash)

        return self._select_commit_states(group_id, commit_hash)

    def insert_states(
        self,
        states: Select[tuple[_T]],
        group_id: int,
        commit_hash: str,
    ):
        """
        Insert a collection of states for a commit.

        Parameters
        ----------
        states : Select[tuple[_T]]
            The existing states, expressed in terms of a SELECT query.
        group_id : int
            The unique identifier of the label group of the destination commit.
        commit_hash : str
            The hash of the destination commit.
        """
        table_cls = self.table_cls
        subq = states.subquery()

        def get_col(col: Column[Any]):
            if col.key == "group_id":
                return literal(group_id, type_=col.type).label(col.key)
            if col.key == "commit_hash":
                return literal(commit_hash, type_=col.type).label(col.key)

            return getattr(subq.c, col.key)

        q = select(*(get_col(col) for col in table_cls.__table__.columns))
        q_names = [desc["name"] for desc in q.column_descriptions]

        return insert(table_cls).from_select(q_names, q)

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _C | _T,
        add_perf: PerformanceCounter | None = None,
    ) -> _T:
        """
        Create a new record.

        Parameters
        ----------
        data : _C | _T
            The data to create. Table-model instances are inserted as-is;
            any other model (e.g. a Create model) is validated into a new
            table instance first.
        """
        self.require_write_data_branch(
            current_user,
            session,
            group_id=data.group_id,
            commit_hash=data.commit_hash,
        )
        self.prepare_commit_states(
            session=session,
            group_id=data.group_id,
            commit_hash=data.commit_hash,
            add_perf=add_perf,
        )

        with add_perf or nullcontext():
            # Use a table-model instance as-is: model_validate would resolve
            # its unloaded relationships to None, blanking the FK columns that
            # overlap the composite primary key on flush.
            table_cls = self.table_cls
            record = data if isinstance(data, table_cls) else table_cls.model_validate(data)

            session.add(record)
            session.flush([record])

        session.refresh(record)

        return record

    def build_list_query(
        self,
        current_user: UserPublic,
        session: Session,
        *,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        candidate_ids: Select[Any] | None = None,
    ):
        table_cls = self.table_cls
        # Filter tombstones and establish stable order before pagination;
        # otherwise pages can be short, overlapping, or skip live records.
        states = (
            self._select_closest_states(group_id, commit_hash, candidate_ids)
            if candidate_ids is not None and _use_delta_encoding()
            else self._select(group_id, commit_hash)
        )
        q = states.order_by(sql_column(table_cls.id))
        # Explicit-ID reads retain tombstones so validation can distinguish a
        # deleted item from one that never existed. Collection pagination must
        # remove tombstones in SQL before applying offset/limit.
        if ids is None:
            q = q.where(sql_column(table_cls.is_deleted).is_(False))
        q = q.offset(offset)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)
        if limit is not None:
            q = q.limit(limit)
        if ids is not None:
            q = q.where(sql_column(table_cls.id).in_(ids))

        return q

    def _validate_records(
        self,
        records: Sequence[_T],
        ids: Set[uuid.UUID] | None,
        group_id: int,
        commit_hash: str,
        exc_noun: str,
    ):
        if ids is not None:
            record_ids = {record.id for record in records}
            if missing_ids := ids - record_ids:
                raise HTTPException(
                    status_code=HTTPStatus.NOT_FOUND,
                    detail=f"Cannot find {exc_noun} ({missing_ids=}) in commit ({group_id=}, {commit_hash=})",
                )

        active_records = [record for record in records if not record.is_deleted]

        if ids is not None:
            active_record_ids = {record.id for record in active_records}
            if deleted_ids := ids - active_record_ids:
                raise HTTPException(
                    status_code=HTTPStatus.NOT_FOUND,
                    detail=f"The {exc_noun} ({deleted_ids=}) have been deleted as of commit ({group_id=}, {commit_hash=})",
                )

        return active_records

    def list_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        exc_noun: str = "items",
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> Sequence[_T]:
        q = self.build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
        )

        with query_closest_states_perf or nullcontext():
            records = session.exec(q).all()

        return self._validate_records(records, ids, group_id, commit_hash, exc_noun)

    def count_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> int:
        table_cls = self.table_cls

        q = self.build_list_query(
            current_user,
            session,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
        )
        q = q.where(sql_column(table_cls.is_deleted).is_(False))

        with query_closest_states_perf or nullcontext():
            return session.exec(select(func.count()).select_from(q.subquery())).one()

    def read_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: uuid.UUID,
        group_id: int,
        commit_hash: str,
        exc_noun: str = "item",
        query_closest_states_perf: PerformanceCounter | None = None,
    ):
        table_cls = self.table_cls

        q = self._select(group_id, commit_hash).where(table_cls.id == id)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)

        with query_closest_states_perf or nullcontext():
            record = session.exec(q).one_or_none()

        if not record:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND,
                detail=f"Cannot find {exc_noun} ({id=}) in commit ({group_id=}, {commit_hash=})",
            )

        active_record = None if record.is_deleted else record

        if not active_record:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND,
                detail=f"The {exc_noun} ({id=}) has been deleted as of commit ({group_id=}, {commit_hash=})",
            )

        return active_record

    def _read_closest_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: uuid.UUID,
        group_id: int,
        commit_hash: str,
        exc_noun: str = "item",
    ) -> _T:
        """Read inherited state without materializing destination commit."""
        table_cls = self.table_cls
        # Validation runs before non-delta snapshots are materialized. Read the
        # inherited state directly so rejecting an operation performs no label
        # data writes.
        q = self._select_closest_states(group_id, commit_hash).where(table_cls.id == id)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)

        record = session.exec(q).one_or_none()
        if record is None:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND,
                detail=f"Cannot find {exc_noun} ({id=}) in commit ({group_id=}, {commit_hash=})",
            )
        if record.is_deleted:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND,
                detail=f"The {exc_noun} ({id=}) has been deleted as of commit ({group_id=}, {commit_hash=})",
            )
        return record

    def read_data_for_operation(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: uuid.UUID,
        group_id: int,
        commit_hash: str,
        exc_noun: str = "item",
    ) -> _T:
        """Read the inherited state needed before an operation writes its commit.

        Unlike :meth:`read_data`, this works before a non-delta snapshot has been
        materialized for the operation's new commit and performs no writes.
        """
        return self._read_closest_data(
            current_user=current_user,
            session=session,
            id=id,
            group_id=group_id,
            commit_hash=commit_hash,
            exc_noun=exc_noun,
        )

    def _list_closest_datas_for_validation(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[uuid.UUID],
        group_id: int,
        commit_hash: str,
        exc_noun: str,
    ) -> Sequence[_T]:
        """Read inherited states for validation without writing a snapshot."""
        table_cls = self.table_cls
        q = self._select_closest_states(group_id, commit_hash).where(
            sql_column(table_cls.id).in_(ids),
        )
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)
        records = session.exec(q).all()
        return self._validate_records(records, ids, group_id, commit_hash, exc_noun)

    def update_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: uuid.UUID,
        group_id: int,
        commit_hash: str,
        data: _U,
        query_closest_states_perf: PerformanceCounter | None = None,
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_write_data_branch(
            current_user, session, group_id=group_id, commit_hash=commit_hash
        )
        self.prepare_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        record = self.read_data(
            current_user=current_user,
            session=session,
            id=id,
            group_id=group_id,
            commit_hash=commit_hash,
            query_closest_states_perf=query_closest_states_perf,
        )
        if record.commit_hash != commit_hash:
            record = self.table_cls(
                **{
                    **record.model_dump(),
                    "commit_hash": commit_hash,
                }
            )

        data_to_update = data.model_dump(exclude_unset=True)

        with add_perf or nullcontext():
            record.sqlmodel_update(data_to_update)
            session.add(record)
            session.flush([record])

        session.refresh(record)

        return record

    def delete_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: uuid.UUID,
        group_id: int,
        commit_hash: str,
        query_closest_states_perf: PerformanceCounter | None = None,
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_write_data_branch(
            current_user, session, group_id=group_id, commit_hash=commit_hash
        )
        self.prepare_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        record = self.read_data(
            current_user=current_user,
            session=session,
            id=id,
            group_id=group_id,
            commit_hash=commit_hash,
            query_closest_states_perf=query_closest_states_perf,
        )
        if record.commit_hash != commit_hash:
            record = self.table_cls(
                **{
                    **record.model_dump(),
                    "commit_hash": commit_hash,
                }
            )

        with add_perf or nullcontext():
            record.sqlmodel_update({"is_deleted": True})
            session.add(record)
            session.flush([record])

        session.refresh(record)

    def bulk_create_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: Sequence[_C | _T],
        add_perf: PerformanceCounter | None = None,
    ):
        # An empty parameter list is a no-op, not a bulk insert: SQLAlchemy does not skip the
        # statement for ``params=[]``, it emits a single INSERT using only server/column defaults,
        # which fails the NOT NULL constraints on the versioned key columns. Bail out before the
        # permission round trip so a batch that changes nothing cannot raise on permissions.
        if not data:
            return

        for group_id, commit_hash in {(item.group_id, item.commit_hash) for item in data}:
            self.require_write_data_branch(
                current_user, session, group_id=group_id, commit_hash=commit_hash
            )

        for item_group_id, item_commit_hash in {(item.group_id, item.commit_hash) for item in data}:
            self.prepare_commit_states(
                session=session,
                group_id=item_group_id,
                commit_hash=item_commit_hash,
                add_perf=add_perf,
            )

        with add_perf or nullcontext():
            execute_statement(
                session,
                insert(self.table_cls),
                [item.model_dump() for item in data],
            )

    def bulk_update_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[uuid.UUID],
        group_id: int,
        commit_hash: str,
        data: _BU,
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_write_data_branch(
            current_user, session, group_id=group_id, commit_hash=commit_hash
        )
        self.prepare_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        table_cls = self.table_cls
        id_column = sql_column(table_cls.id)

        if _use_delta_encoding():
            prev_states = (
                self.select_states(group_id, commit_hash)
                .where(id_column.in_(ids))
                .where(sql_column(table_cls.commit_hash) != commit_hash)
            )
            q = self.insert_states(prev_states, group_id, commit_hash)

            with add_perf or nullcontext():
                execute_statement(session, q)

        data_to_update = data.model_dump(exclude_unset=True)
        if data_to_update:
            q = (
                update(table_cls)
                .where(id_column.in_(ids))
                .where(sql_column(table_cls.group_id) == group_id)
                .where(sql_column(table_cls.commit_hash) == commit_hash)
                .values(**data_to_update)
            )

            with add_perf or nullcontext():
                execute_statement(session, q)

    def bulk_delete_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[uuid.UUID],
        group_id: int,
        commit_hash: str,
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_write_data_branch(
            current_user, session, group_id=group_id, commit_hash=commit_hash
        )
        self.prepare_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        table_cls = self.table_cls
        id_column = sql_column(table_cls.id)

        if _use_delta_encoding():
            prev_states = (
                self.select_states(group_id, commit_hash)
                .where(id_column.in_(ids))
                .where(sql_column(table_cls.commit_hash) != commit_hash)
            )
            q = self.insert_states(prev_states, group_id, commit_hash)

            with add_perf or nullcontext():
                execute_statement(session, q)

        q = (
            update(table_cls)
            .where(id_column.in_(ids))
            .where(sql_column(table_cls.group_id) == group_id)
            .where(sql_column(table_cls.commit_hash) == commit_hash)
            .values(is_deleted=True)
        )

        with add_perf or nullcontext():
            execute_statement(session, q)

    def refresh_states(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_id: int,
        commit_hash: str,
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_write_data_branch(
            current_user, session, group_id=group_id, commit_hash=commit_hash
        )
        self._prepare_own_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        # A refresh explicitly materializes a full snapshot even when normal
        # reads use non-delta storage (checkpointing depends on this). Copy only
        # inherited rows so repeated refreshes cannot collide with destination
        # rows already created by operations or an earlier refresh.
        q = self.insert_states(
            self.select_states(group_id, commit_hash).where(
                sql_column(self.table_cls.commit_hash) != commit_hash,
            ),
            group_id,
            commit_hash,
        )

        with add_perf or nullcontext():
            execute_statement(session, q)


_NT = TypeVar("_NT", bound=LabelEntityTableLike)
_NC = TypeVar("_NC", bound=LabelEntitySQLModel)
_NP = TypeVar("_NP", bound=LabelEntityPublicLike)
_NU = TypeVar("_NU", bound=LabelEntityUpdateLike)
_NBU = TypeVar("_NBU", bound=LabelEntityUpdateLike)


class LabelEntityDomain(LabelDataDomain[_NT, _NC, _NP, _NU, _NBU]):
    @staticmethod
    def has_children(entity: _NT) -> bool:
        """Return the table-only child-presence flag for an entity state."""
        return bool(cast(Any, entity).has_children)

    @staticmethod
    def initialize_has_children(entity: _NT, *, value: bool) -> None:
        """Initialize child presence before persisting a new entity table model.

        Use this method only while constructing import or bulk-create batches, when
        ``entity`` is a concrete table model that has not yet been persisted. It
        mutates that model in place and performs no authorization, revision lookup,
        session add, or flush. Use :meth:`set_has_children` when changing an entity
        that may already exist in the labelset repository.
        """
        cast(Any, entity).has_children = value

    def set_has_children(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: uuid.UUID,
        group_id: int,
        commit_hash: str,
        value: bool,
    ) -> None:
        """Set child presence on an existing entity in a labelset revision.

        Use this method from labelset operations after an element is created,
        deleted, or reassigned. It resolves the entity state visible at
        ``commit_hash``, creates a state in that commit when the visible state is
        inherited, and adds and flushes the updated state. For new, unpersisted
        table models in import or bulk-create batches, use
        :meth:`initialize_has_children` instead.
        """
        self.require_write_data_branch(
            current_user,
            session,
            group_id=group_id,
            commit_hash=commit_hash,
        )
        self.prepare_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
        )
        entity = self.read_data(
            current_user=current_user,
            session=session,
            id=id,
            group_id=group_id,
            commit_hash=commit_hash,
            exc_noun="parent entity",
        )
        if entity.commit_hash != commit_hash:
            entity = self.table_cls(**{**entity.model_dump(), "commit_hash": commit_hash})
        entity_with_children: Any = entity
        entity_with_children.has_children = value
        session.add(entity)
        session.flush([entity])

    def list_datas_for_element_window(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_id: int,
        commit_hash: str,
        referenced_ids: Set[uuid.UUID],
    ) -> Sequence[_NT]:
        """List referenced entities and entities without any live child elements."""
        entity_table = self.table_cls
        entity_filter = sql_column(entity_table.id).in_(referenced_ids) | sql_column(
            cast(Any, entity_table).has_children
        ).is_(False)
        candidate_ids = None
        if _use_ancestor_candidates():
            candidate_ids = self._select_ancestor_ids_matching(
                group_id,
                commit_hash,
                entity_filter,
            )
        q = self.build_list_query(
            current_user,
            session,
            group_id=group_id,
            commit_hash=commit_hash,
            candidate_ids=candidate_ids,
        )
        q = q.where(entity_filter)
        records = session.exec(q).all()
        return self._validate_records(records, None, group_id, commit_hash, "entities")


_ET = TypeVar("_ET", bound=LabelElementTableLike)
_EC = TypeVar("_EC", bound=LabelElementSQLModel)
_EP = TypeVar("_EP", bound=LabelElementPublicLike, covariant=True)
_EU = TypeVar("_EU", bound=LabelElementUpdateLike)
_EBU = TypeVar("_EBU", bound=LabelElementUpdateLike)


class LabelElementDomain(LabelDataDomain[_ET, _EC, _EP, _EU, _EBU]):
    def __init__(
        self,
        *,
        table_cls: type[_ET],
        create_cls: type[_EC],
        public_cls: type[_EP],
        update_cls: type[_EU],
        bulk_update_cls: type[_EBU],
        entity_domain: LabelEntityDomain[Any, Any, Any, Any, Any] | None = None,
    ):
        super().__init__(
            table_cls=table_cls,
            create_cls=create_cls,
            public_cls=public_cls,
            update_cls=update_cls,
            bulk_update_cls=bulk_update_cls,
        )

        self.entity_domain = entity_domain

    def has_live_children(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        entity_id: uuid.UUID,
        group_id: int,
        commit_hash: str,
    ) -> bool:
        """Return whether an entity has a live child in the requested revision."""
        q = self.build_list_query(
            current_user,
            session,
            group_id=group_id,
            commit_hash=commit_hash,
            entity_id=entity_id,
            limit=1,
        )
        return session.exec(q).one_or_none() is not None

    def _validate_entity_id(
        self,
        current_user: UserPublic,
        session: Session,
        element: _EC | _ET,
    ):
        if self.entity_domain is None:
            return

        if element.entity_id is not None:
            try:
                self.entity_domain._read_closest_data(
                    current_user=current_user,
                    session=session,
                    id=element.entity_id,
                    group_id=element.group_id,
                    commit_hash=element.commit_hash,
                    exc_noun="parent entity",
                )
            except HTTPException:
                raise

    def _validate_entity_ids(
        self,
        current_user: UserPublic,
        session: Session,
        elements: Sequence[_EC | _ET],
    ):
        if self.entity_domain is None:
            return
        if not elements:
            return

        for (group_id, commit_hash), elems in groupby(
            elements,
            key=lambda e: (e.group_id, e.commit_hash),
        ):
            entity_ids = {e.entity_id for e in elems if e.entity_id is not None}

            try:
                self.entity_domain._list_closest_datas_for_validation(
                    current_user=current_user,
                    session=session,
                    ids=entity_ids,
                    group_id=group_id,
                    commit_hash=commit_hash,
                    exc_noun="parent entities",
                )
            except HTTPException:
                raise

    def build_list_query(
        self,
        current_user: UserPublic,
        session: Session,
        *,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        candidate_ids: Any = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        entity_id: uuid.UUID | None = None,
    ):
        table_cls = self.table_cls

        q = super().build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
            candidate_ids=candidate_ids,
        )
        if min_x is not None:
            column = sql_column(table_cls.max_x)
            q = q.where(column.is_(None) | (column >= min_x))
        if min_y is not None:
            column = sql_column(table_cls.max_y)
            q = q.where(column.is_(None) | (column >= min_y))
        if min_z is not None:
            column = sql_column(table_cls.max_z)
            q = q.where(column.is_(None) | (column >= min_z))
        if max_x is not None:
            column = sql_column(table_cls.min_x)
            q = q.where(column.is_(None) | (column <= max_x))
        if max_y is not None:
            column = sql_column(table_cls.min_y)
            q = q.where(column.is_(None) | (column <= max_y))
        if max_z is not None:
            column = sql_column(table_cls.min_z)
            q = q.where(column.is_(None) | (column <= max_z))
        if min_timestamp is not None:
            column = sql_column(table_cls.max_timestamp)
            q = q.where(column.is_(None) | (column >= min_timestamp))
        if max_timestamp is not None:
            column = sql_column(table_cls.min_timestamp)
            q = q.where(column.is_(None) | (column <= max_timestamp))
        if entity_id is not None:
            q = q.where(table_cls.entity_id == entity_id)

        return q

    def list_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        entity_id: uuid.UUID | None = None,
        exc_noun: str = "item",
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> Sequence[_ET]:
        q = self.build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            entity_id=entity_id,
        )

        with query_closest_states_perf or nullcontext():
            records = session.exec(q).all()

        return self._validate_records(records, ids, group_id, commit_hash, exc_noun)

    def count_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        entity_id: uuid.UUID | None = None,
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> int:
        table_cls = self.table_cls

        q = self.build_list_query(
            current_user,
            session,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            entity_id=entity_id,
        )
        q = q.where(sql_column(table_cls.is_deleted).is_(False))

        with query_closest_states_perf or nullcontext():
            return session.exec(select(func.count()).select_from(q.subquery())).one()

    def list_datas_in_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        st_bounds: PartialSTBounds | None = None,
        entity_id: uuid.UUID | None = None,
        exc_noun: str = "item",
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> Sequence[_ET]:
        return self.list_datas(
            current_user=current_user,
            session=session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
            min_x=None if st_bounds is None else st_bounds.min_coords.x,
            min_y=None if st_bounds is None else st_bounds.min_coords.y,
            min_z=None if st_bounds is None else st_bounds.min_coords.z,
            max_x=None if st_bounds is None else st_bounds.max_coords.x,
            max_y=None if st_bounds is None else st_bounds.max_coords.y,
            max_z=None if st_bounds is None else st_bounds.max_coords.z,
            min_timestamp=None if st_bounds is None else st_bounds.min_timestamp,
            max_timestamp=None if st_bounds is None else st_bounds.max_timestamp,
            entity_id=entity_id,
            exc_noun=exc_noun,
            query_closest_states_perf=query_closest_states_perf,
        )

    def list_datas_in_any_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_id: int,
        commit_hash: str,
        st_bounds: Sequence[PartialSTBounds],
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> Sequence[_ET]:
        """List elements intersecting any supplied bound with one revision query."""
        if not st_bounds:
            return []

        table_cls = self.table_cls
        bounds_filters = []
        for bounds in st_bounds:
            filters = []
            for column_name, value, comparison in (
                ("max_x", bounds.min_coords.x, "min"),
                ("max_y", bounds.min_coords.y, "min"),
                ("max_z", bounds.min_coords.z, "min"),
                ("min_x", bounds.max_coords.x, "max"),
                ("min_y", bounds.max_coords.y, "max"),
                ("min_z", bounds.max_coords.z, "max"),
                ("max_timestamp", bounds.min_timestamp, "min"),
                ("min_timestamp", bounds.max_timestamp, "max"),
            ):
                if value is None:
                    continue
                column = sql_column(getattr(table_cls, column_name))
                filters.append(
                    column.is_(None) | (column >= value if comparison == "min" else column <= value)
                )
            if not filters:
                bounds_filters = []
                break
            bounds_filters.append(and_(*filters))

        candidate_ids = None
        bounds_filter = None
        if bounds_filters:
            bounds_filter = or_(*bounds_filters)
            if _use_ancestor_candidates():
                candidate_ids = self._select_ancestor_ids_matching(
                    group_id,
                    commit_hash,
                    bounds_filter,
                )

        q = super().build_list_query(
            current_user,
            session,
            group_id=group_id,
            commit_hash=commit_hash,
            candidate_ids=candidate_ids,
        )
        if bounds_filter is not None:
            q = q.where(bounds_filter)

        with query_closest_states_perf or nullcontext():
            records = session.exec(q).all()

        return self._validate_records(records, None, group_id, commit_hash, "items")

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _EC | _ET,
        add_perf: PerformanceCounter | None = None,
        val_perf: PerformanceCounter | None = None,
    ):
        self.prepare_commit_states(
            session=session,
            group_id=data.group_id,
            commit_hash=data.commit_hash,
            add_perf=add_perf,
        )

        with val_perf or nullcontext():
            self._validate_entity_id(current_user, session, data)

        return super().create_data(
            current_user=current_user,
            session=session,
            data=data,
            add_perf=add_perf,
        )

    def bulk_create_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: Sequence[_EC | _ET],
        add_perf: PerformanceCounter | None = None,
        val_perf: PerformanceCounter | None = None,
    ):
        with val_perf or nullcontext():
            self._validate_entity_ids(current_user, session, data)

        super().bulk_create_datas(
            current_user=current_user,
            session=session,
            data=data,
            add_perf=add_perf,
        )

    def update_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: uuid.UUID,
        group_id: int,
        commit_hash: str,
        data: _EU,
        query_closest_states_perf: PerformanceCounter | None = None,
        add_perf: PerformanceCounter | None = None,
        val_perf: PerformanceCounter | None = None,
    ):
        # Validate before update_data can materialize a non-delta snapshot. Do
        # not rebuild the full model: spatial database values are not always
        # accepted by their public-field validators.
        if self.entity_domain:
            current = self._read_closest_data(
                current_user=current_user,
                session=session,
                id=id,
                group_id=group_id,
                commit_hash=commit_hash,
            )
            entity_id = (
                data.entity_id if "entity_id" in data.model_fields_set else current.entity_id
            )
            if entity_id is not None:
                with val_perf or nullcontext():
                    self.entity_domain._read_closest_data(
                        current_user=current_user,
                        session=session,
                        id=entity_id,
                        group_id=group_id,
                        commit_hash=commit_hash,
                        exc_noun="parent entity",
                    )

        return super().update_data(
            current_user=current_user,
            session=session,
            id=id,
            group_id=group_id,
            commit_hash=commit_hash,
            data=data,
            query_closest_states_perf=query_closest_states_perf,
            add_perf=add_perf,
        )

    def bulk_update_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[uuid.UUID],
        group_id: int,
        commit_hash: str,
        data: _EBU,
        add_perf: PerformanceCounter | None = None,
        val_perf: PerformanceCounter | None = None,
    ):
        if self.entity_domain and data.model_fields_set:
            records = self._list_closest_datas_for_validation(
                current_user=current_user,
                session=session,
                ids=ids,
                group_id=group_id,
                commit_hash=commit_hash,
                exc_noun="items",
            )
            if "entity_id" in data.model_fields_set:
                entity_ids = set() if data.entity_id is None else {data.entity_id}
            else:
                entity_ids = {
                    record.entity_id for record in records if record.entity_id is not None
                }

            if entity_ids:
                with val_perf or nullcontext():
                    self.entity_domain._list_closest_datas_for_validation(
                        current_user=current_user,
                        session=session,
                        ids=entity_ids,
                        group_id=group_id,
                        commit_hash=commit_hash,
                        exc_noun="parent entities",
                    )

        super().bulk_update_datas(
            current_user=current_user,
            session=session,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
            data=data,
            add_perf=add_perf,
        )
