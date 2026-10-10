from collections.abc import Sequence, Set
from http import HTTPStatus
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value
from sqlmodel import Session, delete, func, insert, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit

from .....models.label.spec import (
    ObjectClassSelection,
    ObjectClassSelectionBulkUpdate,
    ObjectClassSelectionCreate,
    ObjectClassSelectionPublic,
    ObjectClassSelectionUpdate,
)
from .....models.user import UserPublic
from ....querying import filter_contains
from ..base import LabelSpecDomain


class ObjectClassSelectionDomain(
    LabelSpecDomain[
        ObjectClassSelection,
        ObjectClassSelectionCreate,
        ObjectClassSelectionPublic,
        ObjectClassSelectionUpdate,
        ObjectClassSelectionBulkUpdate,
    ],
):
    def _get_load_options(self) -> tuple[Any, ...]:
        return (
            *super()._get_load_options(),
            selectinload(cast(Any, self.table_cls).objclasses),
        )

    def _sanitize_spec_groups(
        self,
        user: UserPublic,
        session: Session,
        specs: Sequence[ObjectClassSelection],
    ) -> None:
        super()._sanitize_spec_groups(user, session, specs)
        for spec in specs:
            # Deleted definitions remain in the database for historical label
            # data, but must not remain selectable in current specifications.
            set_committed_value(
                spec,
                "objclasses",
                [objclass for objclass in spec.objclasses if not objclass.is_deleted],
            )

    def _bulk_insert_objclasses(
        self,
        session: Session,
        selection_ids: Set[int],
        objclass_ids: list[int],
    ) -> None:
        association_cls = self.table_cls.get_association_cls()

        values = [
            dict(selection_id=selection_id, objclass_id=objclass_id)
            for selection_id in selection_ids
            for objclass_id in set(objclass_ids)
        ]
        if not values:
            return

        execute_statement(session, insert(association_cls), values)

    def _bulk_delete_objclasses(
        self,
        session: Session,
        selection_ids: Set[int],
    ) -> None:
        association_cls = self.table_cls.get_association_cls()
        q = delete(association_cls).where(
            sql_column(association_cls.selection_id).in_(selection_ids),
        )
        # synchronize_session=False: if a selection's objclasses collection
        # was loaded earlier in this session, the default synchronization
        # would mark the association objects deleted and break the later ORM
        # add/flush. No caller relies on synchronized state after this
        # delete (see LabelSpecDomain._bulk_delete_groups).
        execute_statement(session, q.execution_options(synchronize_session=False))

    def create_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: ObjectClassSelectionCreate,
    ):
        self.require_spec_writer(current_user, session)
        self._validate_group_assignments(session, set(), data.group_ids)

        record = self.table_cls.model_validate(data)

        session.add(record)
        session.flush([record])

        session.refresh(record)  # Get the new ID
        assert record.id is not None

        self._bulk_insert_groups(session, {record.id}, data.group_ids)
        self._bulk_insert_objclasses(session, {record.id}, data.objclass_ids)

        session.refresh(record)

        return record

    def update_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
        data: ObjectClassSelectionUpdate,
    ):
        record = session.get(self.table_cls, id)
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        # Circumvent request parsing issue: normalize an explicitly-sent null
        # to "". Guard on model_fields_set so an omitted description stays
        # untouched instead of being cleared by the exclude_unset dump below.
        if "description" in data.model_fields_set and data.description is None:
            data.description = ""

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

        if "objclass_ids" in data_to_update:
            objclass_ids = data_to_update.pop("objclass_ids")
            if objclass_ids is None:
                raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "objclass_ids cannot be null")

            self._bulk_delete_objclasses(session, {id})
            self._bulk_insert_objclasses(session, {id}, objclass_ids)

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
        self._bulk_delete_objclasses(session, {id})
        # Expire the link collections (if they were loaded) so the delete
        # below does not try to blank out the foreign keys of link rows that
        # the bulk deletes already removed.
        session.expire(record, ["group_links", "objclasses"])

        session.delete(record)
        session.flush([record])

    def bulk_update_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: ObjectClassSelectionUpdate,
    ):
        # Mirror update_spec: normalize an explicitly-sent null to "" so it
        # does not write NULL into the NOT NULL description column.
        if "description" in data.model_fields_set and data.description is None:
            data.description = ""

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

        if "objclass_ids" in data_to_update:
            objclass_ids = data_to_update.pop("objclass_ids")
            if objclass_ids is None:
                raise HTTPException(HTTPStatus.UNPROCESSABLE_ENTITY, "objclass_ids cannot be null")

            self._bulk_delete_objclasses(session, ids)
            self._bulk_insert_objclasses(session, ids, objclass_ids)

        table_cls = self.table_cls
        if has_updates:
            q = update(table_cls).where(sql_column(table_cls.id).in_(ids)).values(**data_to_update)
            execute_statement(session, q)

    def get_sort_columns(self):
        return {
            **super().get_sort_columns(),
            "description": self.table_cls.description,
        }

    def _build_list_specs_query(
        self,
        *,
        description_contains: str | None = None,
        group_id: int | None = None,
        **kwargs: Any,
    ):
        q = super()._build_list_specs_query(**kwargs)

        if group_id is not None:
            links_cls = self.table_cls.get_group_links_cls()
            selection_ids = select(sql_column(links_cls.spec_id)).where(
                sql_column(links_cls.group_id) == group_id
            )
            q = q.where(sql_column(self.table_cls.id).in_(selection_ids))

        return filter_contains(q, self.table_cls.description, description_contains)

    def list_specs(
        self,
        *,
        session: Session,
        description_contains: str | None = None,
        **kwargs: Any,
    ) -> Sequence[ObjectClassSelection]:
        q = self._build_list_specs_query(
            session=session,
            description_contains=description_contains,
            **kwargs,
        )

        records = session.exec(q).all()
        self._sanitize_spec_groups(kwargs["current_user"], session, records)
        return records

    def count_specs(
        self,
        *,
        session: Session,
        description_contains: str | None = None,
        **kwargs: Any,
    ) -> int:
        q = self._build_list_specs_query(
            session=session,
            offset=None,
            limit=None,
            description_contains=description_contains,
            **kwargs,
        )

        return session.exec(select(func.count()).select_from(q.subquery())).one()
