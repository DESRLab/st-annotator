from collections.abc import Sequence, Set
from datetime import datetime
from http import HTTPStatus
from typing import Generic, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, func, insert, select, update

from sta.common.spatial import PartialSTBounds

from ....models.source.data import (
    SourceDataPublicLike,
    SourceDataSQLModel,
    SourceDataTableLike,
    SourceDataUpdateLike,
    SourceMetadataPublicLike,
    SourceMetadataSQLModel,
    SourceMetadataTableLike,
    SourceMetadataUpdateLike,
)
from ....models.user import Role, UserPublic
from ...auth import require_role
from ...ops import reserve_bulk_insert_ids
from ..groups import get_valid_group_ids

__all__ = ["SourceDataDomain", "SourceMetadataDomain"]


_T = TypeVar("_T", bound=SourceDataTableLike, covariant=True)
_C = TypeVar("_C", bound=SourceDataSQLModel)
_P = TypeVar("_P", bound=SourceDataPublicLike, covariant=True)
_U = TypeVar("_U", bound=SourceDataUpdateLike)
_BU = TypeVar("_BU", bound=SourceDataUpdateLike)


class SourceDataDomain(Generic[_T, _C, _P, _U, _BU]):

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

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _C,
    ):
        self.require_data_writer(current_user, session)

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
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
    ):
        table_cls = self.table_cls

        q = select(table_cls).offset(offset)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)
        if limit is not None:
            q = q.limit(limit)
        if ids is not None:
            q = q.where(table_cls.id.in_(ids))
        if group_id is not None:
            q = q.where(table_cls.group_id == group_id)
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

        return q

    def list_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
    ) -> Sequence[_T]:
        q = self._build_list_query(
            current_user,
            session,
            offset=offset,
            ids=ids,
            limit=limit,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
        )

        return session.exec(q).all()

    def count_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
    ) -> int:
        q = self._build_list_query(
            current_user,
            session,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
        )

        return session.exec(select(func.count()).select_from(q.subquery())).one()

    def list_datas_in_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int,
        st_bounds: PartialSTBounds | None = None,
    ) -> Sequence[_T]:
        return self.list_datas(
            current_user=current_user,
            session=session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=None if st_bounds is None else st_bounds.min_x,
            min_y=None if st_bounds is None else st_bounds.min_y,
            min_z=None if st_bounds is None else st_bounds.min_z,
            max_x=None if st_bounds is None else st_bounds.max_x,
            max_y=None if st_bounds is None else st_bounds.max_y,
            max_z=None if st_bounds is None else st_bounds.max_z,
            min_timestamp=None if st_bounds is None else st_bounds.min_timestamp,
            max_timestamp=None if st_bounds is None else st_bounds.max_timestamp,
        )

    def read_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
    ):
        table_cls = self.table_cls

        q = select(table_cls).where(table_cls.id == id)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)

        record = session.exec(q).one_or_none()
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        return record

    def update_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
        data: _U,
    ):
        record = session.get(self.table_cls, id)
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        self.require_data_writer(current_user, session, record)

        data_to_update = data.model_dump(exclude_unset=True)

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
        id: int,
    ):
        record = session.get(self.table_cls, id)
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        self.require_data_writer(current_user, session, record)

        session.delete(record)
        session.flush([record])

    def bulk_create_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: list[_C],
    ) -> list[int]:
        self.require_data_writer(current_user, session)

        ids = reserve_bulk_insert_ids(
            session=session,
            table_cls=self.table_cls,
            count=len(data),
        )

        session.execute(
            insert(self.table_cls),
            [
                {'id': record_id, **item.model_dump()}
                for record_id, item in zip(ids, data, strict=True)
            ],
        )

        return ids

    def bulk_update_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: _BU,
    ):
        self.require_data_writer(current_user, session)

        data_to_update = data.model_dump(exclude_unset=True)

        table_cls = self.table_cls
        assert isinstance(table_cls.id, QueryableAttribute)

        if data_to_update:
            q = update(table_cls).where(table_cls.id.in_(ids)).values(**data_to_update)
            session.execute(q)

    def bulk_delete_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
    ):
        self.require_data_writer(current_user, session)

        table_cls = self.table_cls
        assert isinstance(table_cls.id, QueryableAttribute)

        q = delete(table_cls).where(table_cls.id.in_(ids))
        session.execute(q)


_MT = TypeVar("_MT", bound=SourceMetadataTableLike, covariant=True)
_MC = TypeVar("_MC", bound=SourceMetadataSQLModel)
_MP = TypeVar("_MP", bound=SourceMetadataPublicLike, covariant=True)
_MU = TypeVar("_MU", bound=SourceMetadataUpdateLike)
_MBU = TypeVar("_MBU", bound=SourceMetadataUpdateLike)


class SourceMetadataDomain(SourceDataDomain[_MT, _MC, _MP, _MU, _MBU]):

    def _build_list_query(
        self,
        current_user: UserPublic,
        session: Session,
        *,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        uri: str | None = None,
    ):
        table_cls = self.table_cls

        q = super()._build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
        )
        if uri is not None:
            q = q.where(table_cls.uri == uri)

        return q

    def list_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        uri: str | None = None,
    ) -> Sequence[_MT]:
        q = self._build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            uri=uri,
        )

        return session.exec(q).all()

    def count_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: float | None = None,
        min_y: float | None = None,
        min_z: float | None = None,
        max_x: float | None = None,
        max_y: float | None = None,
        max_z: float | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        uri: str | None = None,
    ) -> int:
        q = self._build_list_query(
            current_user,
            session,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            uri=uri,
        )

        return session.exec(select(func.count()).select_from(q.subquery())).one()

    def list_datas_in_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int,
        st_bounds: PartialSTBounds | None = None,
        uri: str | None = None,
    ) -> Sequence[_MT]:
        return self.list_datas(
            current_user=current_user,
            session=session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=None if st_bounds is None else st_bounds.min_x,
            min_y=None if st_bounds is None else st_bounds.min_y,
            min_z=None if st_bounds is None else st_bounds.min_z,
            max_x=None if st_bounds is None else st_bounds.max_x,
            max_y=None if st_bounds is None else st_bounds.max_y,
            max_z=None if st_bounds is None else st_bounds.max_z,
            min_timestamp=None if st_bounds is None else st_bounds.min_timestamp,
            max_timestamp=None if st_bounds is None else st_bounds.max_timestamp,
            uri=uri,
        )
