from collections.abc import Sequence, Set
from http import HTTPStatus
from typing import Generic, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, func, insert, select, update

from ....models.label.spec import (
    LabelSpecCreateLike,
    LabelSpecPublicLike,
    LabelSpecTableLike,
    LabelSpecUpdateLike,
)
from ....models.user import Role, UserPublic
from ...auth import require_role
from ..groups import get_valid_group_ids

__all__ = ["LabelSpecDomain"]


_T = TypeVar("_T", bound=LabelSpecTableLike, covariant=True)
_C = TypeVar("_C", bound=LabelSpecCreateLike)
_P = TypeVar("_P", bound=LabelSpecPublicLike, covariant=True)
_U = TypeVar("_U", bound=LabelSpecUpdateLike)
_BU = TypeVar("_BU", bound=LabelSpecUpdateLike)


class LabelSpecDomain(Generic[_T, _C, _P, _U, _BU]):

    def __init__(
        self,
        *,
        table_cls: type[_T],
        create_cls: type[_C],
        public_cls: type[_P],
        update_cls: type[_U],
        bulk_update_cls: type[_BU],
    ) -> None:
        super().__init__()

        self.table_cls = table_cls
        self.create_cls = create_cls
        self.public_cls = public_cls
        self.update_cls = update_cls
        self.bulk_update_cls = bulk_update_cls

    def can_read_spec(self, user: UserPublic, session: Session, spec: _T):
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return True

        valid_group_ids = get_valid_group_ids(user, session)
        return any(group.id in valid_group_ids for group in spec.groups)

    def require_spec_writer(self, user: UserPublic, session: Session, spec: _T | None = None):
        return require_role(user, Role.DATA_MANAGER)

    def _bulk_insert_groups(
        self,
        session: Session,
        spec_ids: Set[int],
        group_ids: list[int],
    ) -> None:
        groups_cls = self.table_cls.get_group_links_cls()

        values = [
            dict(spec_id=spec_id, group_id=group_id)
            for spec_id in spec_ids
            for group_id in set(group_ids)
        ]
        if not values:
            return

        session.execute(insert(groups_cls), values)

    def _bulk_delete_groups(
        self,
        session: Session,
        spec_ids: Set[int],
    ) -> None:
        groups_cls = self.table_cls.get_group_links_cls()
        assert isinstance(groups_cls.spec_id, QueryableAttribute)

        q = delete(groups_cls).where(groups_cls.spec_id.in_(spec_ids))
        session.execute(q)

    def create_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _C,
    ):
        self.require_spec_writer(current_user, session)

        record = self.table_cls.model_validate(data)

        session.add(record)
        session.flush([record])

        session.refresh(record)  # Get the new ID
        assert record.id is not None

        self._bulk_insert_groups(session, {record.id}, data.group_ids)

        session.refresh(record)

        return record

    def list_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int | None = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        name: str | None = None,
    ) -> Sequence[_T]:
        q = self._build_list_specs_query(
            current_user=current_user,
            session=session,
            offset=offset,
            limit=limit,
            ids=ids,
            name=name,
        )

        return session.exec(q).all()

    def _build_list_specs_query(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int | None = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        name: str | None = None,
    ):
        table_cls = self.table_cls

        q = select(table_cls)
        if offset is not None:
            q = q.offset(offset)
        if limit is not None:
            q = q.limit(limit)
        if name is not None:
            q = q.where(table_cls.name == name)
        if ids is not None:
            q = q.where(table_cls.id.in_(ids))

        return q

    def count_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int] | None = None,
        name: str | None = None,
    ) -> int:
        q = self._build_list_specs_query(
            current_user=current_user,
            session=session,
            offset=None,
            limit=None,
            ids=ids,
            name=name,
        )

        return session.exec(select(func.count()).select_from(q.subquery())).one()

    def read_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
    ):
        table_cls = self.table_cls

        q = select(table_cls).where(table_cls.id == id)

        record = session.exec(q).one_or_none()
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        return record

    def read_spec_in_group(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_id: int,
    ):
        specs_cls = self.table_cls
        groups_cls = specs_cls.get_group_links_cls()

        return session.exec(
            select(specs_cls)
            .join(groups_cls, groups_cls.spec_id == specs_cls.id)
            .filter(groups_cls.group_id == group_id),
        ).one_or_none()

    def update_spec(
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

        self.require_spec_writer(current_user, session, record)

        data_to_update = data.model_dump(exclude_unset=True)

        if "group_ids" in data_to_update:
            group_ids = data_to_update.pop("group_ids")

            self._bulk_delete_groups(session, {id})
            self._bulk_insert_groups(session, {id}, group_ids)

        record.sqlmodel_update(data_to_update)
        session.add(record)
        session.flush([record])

        session.refresh(record)

        return record

    def delete_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
    ):
        record = session.get(self.table_cls, id)
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        self.require_spec_writer(current_user, session, record)

        self._bulk_delete_groups(session, {id})

        session.delete(record)
        session.flush([record])

    def bulk_update_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: _BU,
    ):
        self.require_spec_writer(current_user, session)

        data_to_update = data.model_dump(exclude_unset=True)

        if "group_ids" in data_to_update:
            group_ids = data_to_update.pop("group_ids")

            self._bulk_delete_groups(session, ids)
            self._bulk_insert_groups(session, ids, group_ids)

        table_cls = self.table_cls
        assert isinstance(table_cls.id, QueryableAttribute)

        if data_to_update:
            q = update(table_cls).where(table_cls.id.in_(ids)).values(**data_to_update)
            session.execute(q)
