"""Relation writes and endpoint-deletion effects."""

import uuid
from collections.abc import Set
from typing import Any

from fastapi import HTTPException
from sqlmodel import Session

from sta.domain.label.data import LabelDataDomain
from sta.domain.label.data.endpoints import LabelElementReference, resolve_element
from sta.models.user import UserPublic

from ..models.classes import RelationClass
from ..models.data import Relation, RelationPublic, RelationSQLModel
from .classes import selections

domain = LabelDataDomain(
    table_cls=Relation,
    create_cls=RelationSQLModel,
    public_cls=RelationPublic,
    update_cls=RelationSQLModel.get_update_cls(),
    bulk_update_cls=RelationSQLModel.get_update_cls(),
)


def validate_relation(
    user: UserPublic,
    session: Session,
    group_id: int,
    commit_hash: str,
    source: LabelElementReference,
    target: LabelElementReference,
    relation_class_id: int,
    *,
    existing_class_id: int | None = None,
) -> None:
    """Validate endpoint identity and the group's selectable relation class."""
    if source == target:
        raise HTTPException(422, "A relation requires two distinct label elements")
    for reference in (source, target):
        resolve_element(reference, user, session, group_id, commit_hash)
    if relation_class_id == existing_class_id:
        return
    selection = selections.read_spec_in_group(current_user=user, session=session, group_id=group_id)
    if selection is None or relation_class_id not in {item.id for item in selection.relclasses}:
        raise HTTPException(422, "The relation class is not selectable in this label group")


def delete_attached(
    user: UserPublic,
    session: Session,
    element_type: str,
    ids: Set[uuid.UUID],
    group_id: int,
    commit_hash: str,
) -> None:
    """Tombstone every attached relation, including ones outside the current frame."""
    records = domain.list_datas(
        current_user=user, session=session, group_id=group_id, commit_hash=commit_hash
    )
    relation_ids = {
        record.id
        for record in records
        if not record.is_deleted
        and (
            (record.source_type == element_type and record.source_id in ids)
            or (record.target_type == element_type and record.target_id in ids)
        )
    }
    if relation_ids:
        domain.bulk_delete_datas(
            current_user=user,
            session=session,
            ids=relation_ids,
            group_id=group_id,
            commit_hash=commit_hash,
        )


def class_records(session: Session, records: Any) -> list[RelationClass]:
    """Load definitions, including retired ones, required by historical relations."""
    return [
        record
        for id in {item.relation_class_id for item in records}
        if (record := session.get(RelationClass, id)) is not None
    ]
