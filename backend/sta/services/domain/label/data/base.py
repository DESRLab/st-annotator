import os
import uuid
from collections.abc import Sequence, Set
from contextlib import nullcontext
from datetime import datetime
from http import HTTPStatus
from itertools import groupby
from typing import Any, Generic, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlalchemy.sql.expression import Select
from sqlalchemy.sql.schema import Column
from sqlmodel import Session, func, insert, literal, select, update

from sta.common.spatial import PartialSTBounds
from sta.common.testing import PerformanceCounter

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
from ....models.label.repo import GraphDistance
from ....models.user import Role, UserPublic
from ...auth import require_role
from ..groups import get_valid_group_ids

__all__ = ["LabelDataDomain", "LabelElementDomain", "LabelEntityDomain"]


_FALSEY_ENV_VALUES = {"", "0", "false", "no", "off"}


def _use_delta_encoding() -> bool:
    value = os.getenv("STA_USE_DELTA_ENCODING")
    if value is None:
        return True

    return value.strip().lower() not in _FALSEY_ENV_VALUES


_T = TypeVar("_T", bound=LabelDataTableLike, covariant=True)
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

        table_cls = self.table_cls
        assert isinstance(table_cls.group_id, QueryableAttribute)

        return [table_cls.group_id.in_(get_valid_group_ids(user, session))]

    def can_read_data(self, user: UserPublic, session: Session, data: _T):
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return True

        return data.group_id in get_valid_group_ids(user, session)

    def require_data_writer(self, user: UserPublic, session: Session, data: _T | None = None):
        if data is None or not self.can_read_data(user, session, data):
            return require_role(user, Role.DATA_MANAGER)

        return True

    def _select(self, group_id: int, commit_hash: str):
        table_cls = self.table_cls
        assert isinstance(table_cls.is_deleted, QueryableAttribute)

        return self.select_states(group_id, commit_hash)

    def _select_closest_states(
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
        table_cls = self.table_cls
        h2d = GraphDistance

        dist_by_id_hash = select(table_cls.id, table_cls.group_id, table_cls.commit_hash, h2d.distance) \
            .join(h2d, (h2d.group_id == table_cls.group_id) & (h2d.src_hash == table_cls.commit_hash)) \
            .where(h2d.group_id == group_id) \
            .where(h2d.dst_hash == commit_hash) \
            .cte()

        min_dist_by_id = select(dist_by_id_hash.c.id, dist_by_id_hash.c.group_id, func.min(dist_by_id_hash.c.distance).label('min_distance')) \
            .group_by(dist_by_id_hash.c.id, dist_by_id_hash.c.group_id) \
            .subquery()

        # Merge commits prevent the situation where multiple commits have the same closest distance
        closest_hash_by_id = select(dist_by_id_hash.c.id, dist_by_id_hash.c.group_id, dist_by_id_hash.c.commit_hash) \
            .join(min_dist_by_id, (min_dist_by_id.c.id == dist_by_id_hash.c.id) & (min_dist_by_id.c.group_id == dist_by_id_hash.c.group_id) & (min_dist_by_id.c.min_distance == dist_by_id_hash.c.distance)) \
            .subquery()

        return select(table_cls).join(closest_hash_by_id, (closest_hash_by_id.c.id == table_cls.id) & (closest_hash_by_id.c.group_id == table_cls.group_id) & (closest_hash_by_id.c.commit_hash == table_cls.commit_hash))

    def _select_commit_states(
        self,
        group_id: int,
        commit_hash: str,
    ):
        table_cls = self.table_cls
        assert isinstance(table_cls.group_id, QueryableAttribute)
        assert isinstance(table_cls.commit_hash, QueryableAttribute)

        return select(table_cls) \
            .where(table_cls.group_id == group_id) \
            .where(table_cls.commit_hash == commit_hash)

    def _has_stored_states(
        self,
        *,
        session: Session,
        group_id: int,
        commit_hash: str,
    ) -> bool:
        table_cls = self.table_cls
        assert isinstance(table_cls.group_id, QueryableAttribute)
        assert isinstance(table_cls.commit_hash, QueryableAttribute)

        q = select(literal(True)) \
            .select_from(table_cls) \
            .where(table_cls.group_id == group_id) \
            .where(table_cls.commit_hash == commit_hash) \
            .limit(1)  # noqa: FBT003

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
            session.execute(q)

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
        q_names = [desc['name'] for desc in q.column_descriptions]

        return insert(table_cls).from_select(q_names, q)

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _C,
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_data_writer(current_user, session)
        self.prepare_commit_states(
            session=session,
            group_id=data.group_id,
            commit_hash=data.commit_hash,
            add_perf=add_perf,
        )

        with add_perf or nullcontext():
            record = self.table_cls.model_validate(data)

            session.add(record)
            session.flush([record])

        session.refresh(record)

        return record

    def _build_list_query(
        self,
        current_user: UserPublic,
        session: Session,
        *,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
    ):
        table_cls = self.table_cls
        assert isinstance(table_cls.id, QueryableAttribute)

        q = self._select(group_id, commit_hash).offset(offset)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)
        if limit is not None:
            q = q.limit(limit)
        if ids is not None:
            q = q.where(table_cls.id.in_(ids))

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
            if missing_ids := {record.id for record in records}:
                raise HTTPException(
                    status_code=HTTPStatus.NOT_FOUND,
                    detail=f"Cannot find {exc_noun} ({missing_ids=}) in commit ({group_id=}, {commit_hash=})",
                )

        active_records = [record for record in records if not record.is_deleted]

        if ids is not None:
            if missing_ids := {record.id for record in records}:
                raise HTTPException(
                    status_code=HTTPStatus.NOT_FOUND,
                    detail=f"The {exc_noun} ({missing_ids=}) have been deleted as of commit ({group_id=}, {commit_hash=})",
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
        q = self._build_list_query(
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

        q = self._build_list_query(
            current_user,
            session,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
        )
        q = q.where(table_cls.is_deleted.is_(False))

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
            record = self.table_cls(**{
                **record.model_dump(),
                "commit_hash": commit_hash,
            })

        self.require_data_writer(current_user, session, record)

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
            record = self.table_cls(**{
                **record.model_dump(),
                "commit_hash": commit_hash,
            })

        self.require_data_writer(current_user, session, record)

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
        data: list[_C],
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_data_writer(current_user, session)

        for item_group_id, item_commit_hash in {(item.group_id, item.commit_hash) for item in data}:
            self.prepare_commit_states(
                session=session,
                group_id=item_group_id,
                commit_hash=item_commit_hash,
                add_perf=add_perf,
            )

        with add_perf or nullcontext():
            session.execute(
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
        self.require_data_writer(current_user, session)
        self.prepare_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        table_cls = self.table_cls
        assert isinstance(table_cls.id, QueryableAttribute)

        if _use_delta_encoding():
            prev_states = self.select_states(group_id, commit_hash) \
                .where(table_cls.id.in_(ids)) \
                .where(table_cls.commit_hash != commit_hash)
            q = self.insert_states(prev_states, group_id, commit_hash)

            with add_perf or nullcontext():
                session.execute(q)

        data_to_update = data.model_dump(exclude_unset=True)
        if data_to_update:
            q = update(table_cls.id) \
                .where(table_cls.id.in_(ids)) \
                .where(table_cls.group_id == group_id) \
                .where(table_cls.commit_hash == commit_hash) \
                .values(**data_to_update)

            with add_perf or nullcontext():
                session.execute(q)

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
        self.require_data_writer(current_user, session)
        self.prepare_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        table_cls = self.table_cls
        assert isinstance(table_cls.id, QueryableAttribute)

        if _use_delta_encoding():
            prev_states = self.select_states(group_id, commit_hash) \
                .where(table_cls.id.in_(ids)) \
                .where(table_cls.commit_hash != commit_hash)
            q = self.insert_states(prev_states, group_id, commit_hash)

            with add_perf or nullcontext():
                session.execute(q)

        q = update(table_cls.id) \
            .where(table_cls.id.in_(ids)) \
            .where(table_cls.group_id == group_id) \
            .where(table_cls.commit_hash == commit_hash) \
            .values(is_deleted=True)

        with add_perf or nullcontext():
            session.execute(q)

    def refresh_states(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_id: int,
        commit_hash: str,
        add_perf: PerformanceCounter | None = None,
    ):
        self.require_data_writer(current_user, session)
        self._prepare_own_commit_states(
            session=session,
            group_id=group_id,
            commit_hash=commit_hash,
            add_perf=add_perf,
        )

        if _use_delta_encoding():
            q = self.insert_states(
                self.select_states(group_id, commit_hash),
                group_id,
                commit_hash,
            )

            with add_perf or nullcontext():
                session.execute(q)


_NT = TypeVar("_NT", bound=LabelEntityTableLike, covariant=True)
_NC = TypeVar("_NC", bound=LabelEntitySQLModel)
_NP = TypeVar("_NP", bound=LabelEntityPublicLike)
_NU = TypeVar("_NU", bound=LabelEntityUpdateLike)
_NBU = TypeVar("_NBU", bound=LabelEntityUpdateLike)


class LabelEntityDomain(LabelDataDomain[_NT, _NC, _NP, _NU, _NBU]):
    pass


_ET = TypeVar("_ET", bound=LabelElementTableLike, covariant=True)
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
        entity_domain: LabelEntityDomain[LabelEntityTableLike, Any, Any, Any, Any] | None = None,
    ):
        super().__init__(
            table_cls=table_cls,
            create_cls=create_cls,
            public_cls=public_cls,
            update_cls=update_cls,
            bulk_update_cls=bulk_update_cls,
        )

        self.entity_domain = entity_domain

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
                self.entity_domain.read_data(
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
                self.entity_domain.list_datas(
                    current_user=current_user,
                    session=session,
                    ids=entity_ids,
                    group_id=group_id,
                    commit_hash=commit_hash,
                    exc_noun="parent entities",
                )
            except HTTPException:
                raise

    def _build_list_query(
        self,
        current_user: UserPublic,
        session: Session,
        *,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[uuid.UUID] | None = None,
        group_id: int,
        commit_hash: str,
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        entity_id: int | None = None,
    ):
        table_cls = self.table_cls

        q = super()._build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
        )
        if min_x is not None:
            assert isinstance(table_cls.max_x, QueryableAttribute)
            q = q.where(table_cls.max_x.is_(None) | (table_cls.max_x >= min_x))
        if min_y is not None:
            assert isinstance(table_cls.max_y, QueryableAttribute)
            q = q.where(table_cls.max_y.is_(None) | (table_cls.max_y >= min_y))
        if min_z is not None:
            assert isinstance(table_cls.max_z, QueryableAttribute)
            q = q.where(table_cls.max_z.is_(None) | (table_cls.max_z >= min_z))
        if max_x is not None:
            assert isinstance(table_cls.min_x, QueryableAttribute)
            q = q.where(table_cls.min_x.is_(None) | (table_cls.min_x <= max_x))
        if max_y is not None:
            assert isinstance(table_cls.min_y, QueryableAttribute)
            q = q.where(table_cls.min_y.is_(None) | (table_cls.min_y <= max_y))
        if max_z is not None:
            assert isinstance(table_cls.min_z, QueryableAttribute)
            q = q.where(table_cls.min_z.is_(None) | (table_cls.min_z <= max_z))
        if min_timestamp is not None:
            assert isinstance(table_cls.max_timestamp, QueryableAttribute)
            q = q.where(table_cls.max_timestamp.is_(None) | (table_cls.max_timestamp >= min_timestamp))
        if max_timestamp is not None:
            assert isinstance(table_cls.min_timestamp, QueryableAttribute)
            q = q.where(table_cls.min_timestamp.is_(None) | (table_cls.min_timestamp <= max_timestamp))
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
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        entity_id: int | None = None,
        exc_noun: str = "item",
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> Sequence[_ET]:
        q = self._build_list_query(
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
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        entity_id: int | None = None,
        query_closest_states_perf: PerformanceCounter | None = None,
    ) -> int:
        table_cls = self.table_cls

        q = self._build_list_query(
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
        q = q.where(table_cls.is_deleted.is_(False))

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
        entity_id: int | None = None,
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
            min_x=None if st_bounds is None else st_bounds.min_x,
            min_y=None if st_bounds is None else st_bounds.min_y,
            min_z=None if st_bounds is None else st_bounds.min_z,
            max_x=None if st_bounds is None else st_bounds.max_x,
            max_y=None if st_bounds is None else st_bounds.max_y,
            max_z=None if st_bounds is None else st_bounds.max_z,
            min_timestamp=None if st_bounds is None else st_bounds.min_timestamp,
            max_timestamp=None if st_bounds is None else st_bounds.max_timestamp,
            entity_id=entity_id,
            exc_noun=exc_noun,
            query_closest_states_perf=query_closest_states_perf,
        )

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _EC,
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
        record = super().update_data(
            current_user=current_user,
            session=session,
            id=id,
            group_id=group_id,
            commit_hash=commit_hash,
            data=data,
            query_closest_states_perf=query_closest_states_perf,
            add_perf=add_perf,
        )

        with val_perf or nullcontext():
            self._validate_entity_id(current_user, session, record)

        return record

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
        super().bulk_update_datas(
            current_user=current_user,
            session=session,
            ids=ids,
            group_id=group_id,
            commit_hash=commit_hash,
            data=data,
            add_perf=add_perf,
        )

        if self.entity_domain:
            with val_perf or nullcontext():
                table_cls = self.table_cls
                assert isinstance(table_cls.id, QueryableAttribute)

                q = self._select(group_id, commit_hash).where(table_cls.id.in_(ids))
                records = session.exec(q).all()

                self._validate_entity_ids(current_user, session, records)
