"""Plugin-neutral label element references and deletion notifications."""

import uuid
from collections.abc import Callable, Set
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from sta.models.user import UserPublic


class LabelElementReference(BaseModel):
    """Identify an element type and its logical id within a label group."""

    type: str
    id: uuid.UUID


ELEMENT_DOMAINS: dict[str, Any] = {}
ElementDeleteListener = Callable[[UserPublic, Session, str, Set[uuid.UUID], int, str], None]
ELEMENT_DELETE_LISTENERS: list[ElementDeleteListener] = []


def register_element_domain(name: str, domain: Any) -> None:
    """Expose an element domain to plugins that reference other labels."""
    ELEMENT_DOMAINS[name] = domain


def resolve_element(
    reference: LabelElementReference,
    user: UserPublic,
    session: Session,
    group_id: int,
    commit_hash: str,
) -> Any:
    """Resolve a live element in the revision being edited, with its access checks."""
    domain = ELEMENT_DOMAINS.get(reference.type)
    if domain is None:
        raise HTTPException(422, f"Unknown label element type: {reference.type}")
    return domain.read_data_for_operation(
        current_user=user,
        session=session,
        id=reference.id,
        group_id=group_id,
        commit_hash=commit_hash,
        exc_noun="relation endpoint",
    )


def notify_element_delete(
    domain: Any,
    user: UserPublic,
    session: Session,
    ids: Set[uuid.UUID],
    group_id: int,
    commit_hash: str,
) -> None:
    """Delete dependent labels inside the same transaction and commit."""
    for name, element_domain in ELEMENT_DOMAINS.items():
        if domain is element_domain:
            for listener in ELEMENT_DELETE_LISTENERS:
                listener(user, session, name, ids, group_id, commit_hash)
