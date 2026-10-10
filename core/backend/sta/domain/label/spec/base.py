from collections.abc import Sequence, Set
from http import HTTPStatus
from typing import Any, Generic, TypeVar, cast

from fastapi import HTTPException
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlmodel import Session, delete, func, insert, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit

from ....models.label.spec import (
    LabelSpecCreateLike,
    LabelSpecPublicLike,
    LabelSpecTableLike,
    LabelSpecUpdateLike,
)
from ....models.user import Role, UserPublic
from ...auth import require_role
from ...querying import SortDirection, apply_sort, filter_contains, filter_range
from ..groups import get_valid_group_ids

__all__ = ["LabelSpecDomain"]


_T = TypeVar("_T", bound=LabelSpecTableLike)
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

    def can_read_spec(self, user: UserPublic, session: Session, spec: _T) -> bool:
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return True

        valid_group_ids = get_valid_group_ids(user, session)
        return any(group.id in valid_group_ids for group in spec.groups)

    def can_read_spec_filters(self, user: UserPublic, session: Session):
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return []

        groups_cls = self.table_cls.get_group_links_cls()
        readable_spec_ids = select(groups_cls.spec_id).where(
            sql_column(groups_cls.group_id).in_(get_valid_group_ids(user, session)),
        )
        return [sql_column(self.table_cls.id).in_(readable_spec_ids)]

    def _sanitize_spec_groups(self, user: UserPublic, session: Session, specs: Sequence[_T]):
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return

        valid_group_ids = get_valid_group_ids(user, session)
        for spec in specs:
            # Build a response-only relationship projection without creating
            # ORM history that could mutate association rows on commit.
            set_committed_value(
                spec,
                "group_links",
                [link for link in spec.group_links if link.group_id in valid_group_ids],
            )

    def _get_load_options(self) -> tuple[Any, ...]:
        groups_cls = self.table_cls.get_group_links_cls()
        return (
            selectinload(cast(Any, self.table_cls).group_links).selectinload(
                cast(Any, groups_cls).group,
            ),
        )

    def require_spec_writer(self, user: UserPublic, session: Session, spec: _T | None = None):
        # The mirror of `SourceSpecDomain.require_spec_writer`: a write replaces
        # every group link from the submitted `group_ids`, and
        # `_sanitize_spec_groups` truncates that collection for any role outside
        # the DATA_MANAGER/PROJECT_MANAGER pair. Widening either gate past the
        # roles that bypass the sanitiser lets a writer save a specification and
        # silently unassign the groups it could not see; the same coupling is
        # pinned for both bases by test/domain/test_specs.py.
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

        execute_statement(session, insert(groups_cls), values)

    # Fast-path check only; it is not what makes the invariant hold. `group_id`
    # is declared `unique=True` in the generated link table
    # (models/label/spec/base.py), so the DDL enforces at most one spec of this type per
    # group and a losing concurrent writer here gets an IntegrityError, surfaced
    # as a 400 by api/root.py's handler. Running the SELECT first is what
    # produces the friendlier 409 that names the offending group ids.
    def _validate_group_assignments(
        self,
        session: Session,
        spec_ids: Set[int],
        group_ids: list[int],
    ) -> None:
        groups_cls = self.table_cls.get_group_links_cls()
        if len(spec_ids) > 1 and group_ids:
            raise HTTPException(
                HTTPStatus.CONFLICT,
                "A group can have only one specification of this type.",
            )
        q = select(groups_cls.group_id).where(
            sql_column(groups_cls.group_id).in_(set(group_ids)),
            sql_column(groups_cls.spec_id).not_in(spec_ids),
        )
        conflicts = set(session.exec(q).all())
        if conflicts:
            raise HTTPException(
                HTTPStatus.CONFLICT,
                f"Groups already have a specification of this type: {sorted(conflicts)}",
            )

    def _bulk_delete_groups(
        self,
        session: Session,
        spec_ids: Set[int],
    ) -> None:
        groups_cls = self.table_cls.get_group_links_cls()
        q = delete(groups_cls).where(sql_column(groups_cls.spec_id).in_(spec_ids))
        # synchronize_session=False: if a spec's group_links collection was
        # loaded earlier in this session, the default synchronization would
        # mark those link objects deleted and break the later ORM add/flush.
        # No caller relies on synchronized state after this delete:
        # update_spec refreshes the record (expiring its relationships),
        # delete_spec deletes it, and bulk_update_specs never reads the
        # collections.
        execute_statement(session, q.execution_options(synchronize_session=False))

    def create_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _C,
    ):
        self.require_spec_writer(current_user, session)
        self._validate_group_assignments(session, set(), data.group_ids)

        record = self.table_cls.model_validate(data)

        session.add(record)
        session.flush([record])

        session.refresh(record)  # Get the new ID
        assert record.id is not None

        self._bulk_insert_groups(session, {record.id}, data.group_ids)

        session.refresh(record)

        return record

    def get_sort_columns(self):
        table_cls = self.table_cls

        return {
            "id": table_cls.id,
            "name": table_cls.name,
        }

    def list_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int | None = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        id: int | None = None,
        id_ge: int | None = None,
        id_le: int | None = None,
        name: str | None = None,
        name_contains: str | None = None,
        sort_by: str | None = None,
        sort_dir: SortDirection = "asc",
    ) -> Sequence[_T]:
        q = self._build_list_specs_query(
            current_user=current_user,
            session=session,
            offset=offset,
            limit=limit,
            ids=ids,
            id=id,
            id_ge=id_ge,
            id_le=id_le,
            name=name,
            name_contains=name_contains,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )

        records = session.exec(q).all()
        self._sanitize_spec_groups(current_user, session, records)
        return records

    def _build_list_specs_query(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int | None = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        id: int | None = None,
        id_ge: int | None = None,
        id_le: int | None = None,
        name: str | None = None,
        name_contains: str | None = None,
        sort_by: str | None = None,
        sort_dir: SortDirection = "asc",
    ):
        table_cls = self.table_cls

        q = select(table_cls).options(*self._get_load_options())
        for cond in self.can_read_spec_filters(current_user, session):
            q = q.where(cond)
        if offset is not None:
            q = q.offset(offset)
        if limit is not None:
            q = q.limit(limit)
        if name is not None:
            q = q.where(table_cls.name == name)
        if ids is not None:
            q = q.where(sql_column(table_cls.id).in_(ids))
        if id is not None:
            q = q.where(table_cls.id == id)
        q = filter_range(q, table_cls.id, ge=id_ge, le=id_le)
        q = filter_contains(q, table_cls.name, name_contains)
        q = apply_sort(q, self.get_sort_columns(), sort_by, sort_dir)

        return q

    def count_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int] | None = None,
        id: int | None = None,
        id_ge: int | None = None,
        id_le: int | None = None,
        name: str | None = None,
        name_contains: str | None = None,
    ) -> int:
        q = self._build_list_specs_query(
            current_user=current_user,
            session=session,
            offset=None,
            limit=None,
            ids=ids,
            id=id,
            id_ge=id_ge,
            id_le=id_le,
            name=name,
            name_contains=name_contains,
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

        q = select(table_cls).options(*self._get_load_options()).where(table_cls.id == id)
        for cond in self.can_read_spec_filters(current_user, session):
            q = q.where(cond)

        record = session.exec(q).one_or_none()
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        self._sanitize_spec_groups(current_user, session, [record])

        return record

    def read_spec_in_group(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_id: int,
    ):
        if not current_user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            if group_id not in get_valid_group_ids(current_user, session):
                return None

        specs_cls = self.table_cls
        groups_cls = specs_cls.get_group_links_cls()

        q = (
            select(specs_cls)
            .options(*self._get_load_options())
            .join(groups_cls, sql_column(groups_cls.spec_id) == specs_cls.id)
            .filter(sql_column(groups_cls.group_id) == group_id)
        )
        for cond in self.can_read_spec_filters(current_user, session):
            q = q.where(cond)

        record = session.exec(q).one_or_none()
        if record is not None:
            self._sanitize_spec_groups(current_user, session, [record])

        return record

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
        record.check_edit_conflict(data_to_update)

        if "group_ids" in data_to_update:
            group_ids = data_to_update.pop("group_ids")
            if group_ids is None:
                raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "group_ids cannot be null")
            self._validate_group_assignments(session, {id}, group_ids)

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
        # Expire the link collection (if it was loaded) so the delete below
        # does not try to blank out the foreign keys of link rows that the
        # bulk delete already removed.
        session.expire(record, ["group_links"])

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
        has_updates = stamp_bulk_edit(data_to_update)

        if "group_ids" in data_to_update:
            group_ids = data_to_update.pop("group_ids")
            if group_ids is None:
                raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "group_ids cannot be null")
            self._validate_group_assignments(session, ids, group_ids)

            self._bulk_delete_groups(session, ids)
            self._bulk_insert_groups(session, ids, group_ids)

        table_cls = self.table_cls
        if has_updates:
            q = update(table_cls).where(sql_column(table_cls.id).in_(ids)).values(**data_to_update)
            execute_statement(session, q)
