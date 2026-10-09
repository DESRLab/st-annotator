from collections.abc import Set
from http import HTTPStatus

from fastapi import HTTPException
from sqlalchemy.orm import QueryableAttribute
from sqlmodel import Session, delete, insert, update

from .....models.label.spec import (
    ObjectClassSelection,
    ObjectClassSelectionBulkUpdate,
    ObjectClassSelectionCreate,
    ObjectClassSelectionPublic,
    ObjectClassSelectionUpdate,
)
from .....models.user import UserPublic
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

        session.execute(insert(association_cls), values)

    def _bulk_delete_objclasses(
        self,
        session: Session,
        selection_ids: Set[int],
    ) -> None:
        association_cls = self.table_cls.get_association_cls()
        assert isinstance(association_cls.selection_id, QueryableAttribute)

        q = delete(association_cls).where(association_cls.selection_id.in_(selection_ids))
        session.execute(q)

    def create_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: ObjectClassSelectionCreate,
    ):
        self.require_spec_writer(current_user, session)

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

        # Circumvent request parsing issue
        if data.description is None:
            data.description = ""

        self.require_spec_writer(current_user, session, record)

        data_to_update = data.model_dump(exclude_unset=True)

        if "group_ids" in data_to_update:
            group_ids = data_to_update.pop("group_ids")

            self._bulk_delete_groups(session, {id})
            self._bulk_insert_groups(session, {id}, group_ids)

        if "objclass_ids" in data_to_update:
            objclass_ids = data_to_update.pop("objclass_ids")

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
        self.require_spec_writer(current_user, session)

        data_to_update = data.model_dump(exclude_unset=True)

        if "group_ids" in data_to_update:
            group_ids = data_to_update.pop("group_ids")

            self._bulk_delete_groups(session, ids)
            self._bulk_insert_groups(session, ids, group_ids)

        if "objclass_ids" in data_to_update:
            objclass_ids = data_to_update.pop("objclass_ids")

            self._bulk_delete_objclasses(session, ids)
            self._bulk_insert_objclasses(session, ids, objclass_ids)

        table_cls = self.table_cls
        assert isinstance(table_cls.id, QueryableAttribute)

        if data_to_update:
            q = update(table_cls).where(table_cls.id.in_(ids)).values(**data_to_update)
            session.execute(q)
