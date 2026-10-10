"""Tests for the accounts domain: reader/writer guards, the Account<->User
username mirroring rule, and the list/count/delete/bulk paths.
"""

from fastapi import HTTPException
from sqlmodel import Session

import pytest

from sta.domain import accounts as domain
from sta.domain.users import create_user
from sta.models.account import (
    Account,
    AccountBulkUpdate,
    AccountCreate,
    AccountPublic,
    AccountPublicSummary,
    AccountUpdate,
)
from sta.models.user import Role, User, UserCreate, UserPublic

pytestmark = pytest.mark.in_memory_db


def _create_test_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    roles: set[Role],
) -> UserPublic:
    record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=username,
            password="password",
            roles=roles,
        ),
    )

    return UserPublic.model_validate(record)


def test_direct_account_reads_are_unrestricted_but_collections_require_admin(
    root_user: UserPublic,
    session: Session,
):
    plain_user = _create_test_user(session, root_user, username="account_reader_plain", roles=set())

    # Authenticated users may intentionally read another user's profile.
    record = domain.read_account(current_user=plain_user, session=session, id=root_user.id)
    assert record.id == root_user.id

    # What that read may surface is decided by the response shape rather than by
    # anything the caller remembers: GET /accounts/{id} is typed
    # AccountPublicSummary, which has no `preferences` field at all, so the
    # domain row keeps the blob while no non-owner projection can carry it. The
    # full AccountPublic belongs only to responses whose reader is the owner or
    # an administrator; test/api/test_accounts.py pins those endpoint shapes.
    domain.update_account(
        current_user=root_user,
        session=session,
        id=root_user.id,
        data=AccountUpdate(preferences={"theme": "dark"}),
    )
    session.commit()

    record = domain.read_account(current_user=plain_user, session=session, id=root_user.id)
    assert AccountPublic.model_validate(record).preferences == {"theme": "dark"}

    summary = AccountPublicSummary.model_validate(record)
    assert "preferences" not in AccountPublicSummary.model_fields
    assert summary.model_dump() == {"id": root_user.id, "username": root_user.username}
    assert not hasattr(summary, "preferences")

    for collection_read in (
        lambda: domain.list_accounts(current_user=plain_user, session=session),
        lambda: domain.count_accounts(current_user=plain_user, session=session),
    ):
        with pytest.raises(HTTPException) as exc_info:
            collection_read()
        assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        domain.read_account(current_user=plain_user, session=session, id=99999)
    assert exc_info.value.status_code == 404


def test_account_writer_self_bypass_else_admin(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(session, root_user, username="account_writer_plain", roles=set())
    other_user = _create_test_user(session, root_user, username="account_writer_other", roles=set())

    # Users may update their own account without ADMIN...
    updated = domain.update_account(
        current_user=plain_user,
        session=session,
        id=plain_user.id,
        data=AccountUpdate(preferences={"theme": "dark"}),
    )
    session.commit()
    assert updated.preferences == {"theme": "dark"}

    # ...but not somebody else's.
    with pytest.raises(HTTPException) as exc_info:
        domain.update_account(
            current_user=plain_user,
            session=session,
            id=other_user.id,
            data=AccountUpdate(preferences={"theme": "light"}),
        )
    assert exc_info.value.status_code == 403

    # ADMIN may update any account.
    updated = domain.update_account(
        current_user=root_user,
        session=session,
        id=other_user.id,
        data=AccountUpdate(preferences={"lang": "en"}),
    )
    session.commit()
    assert updated.preferences == {"lang": "en"}

    with pytest.raises(HTTPException) as exc_info:
        domain.update_account(
            current_user=root_user,
            session=session,
            id=99999,
            data=AccountUpdate(preferences={}),
        )
    assert exc_info.value.status_code == 404


def test_update_account_syncs_username_into_user(root_user: UserPublic, session: Session):
    target_user = _create_test_user(session, root_user, username="account_sync_user", roles=set())

    updated = domain.update_account(
        current_user=root_user,
        session=session,
        id=target_user.id,
        data=AccountUpdate(username="account_sync_renamed"),
    )
    session.commit()

    assert updated.username == "account_sync_renamed"
    # The mirrored User record follows the username change.
    assert session.get(User, target_user.id).username == "account_sync_renamed"


def test_update_account_rejects_self_service_username_change(
    root_user: UserPublic,
    session: Session,
):
    plain_user = _create_test_user(session, root_user, username="account_self_rename", roles=set())

    with pytest.raises(HTTPException) as exc_info:
        domain.update_account(
            current_user=plain_user,
            session=session,
            id=plain_user.id,
            data=AccountUpdate(username="account_self_renamed"),
        )

    assert exc_info.value.status_code == 403
    assert session.get(User, plain_user.id).username == "account_self_rename"
    assert session.get(Account, plain_user.id).username == "account_self_rename"


def test_delete_account(root_user: UserPublic, session: Session):
    victim_user = _create_test_user(session, root_user, username="account_delete_user", roles=set())
    plain_user = _create_test_user(session, root_user, username="account_delete_plain", roles=set())

    with pytest.raises(HTTPException) as exc_info:
        domain.delete_account(current_user=plain_user, session=session, id=victim_user.id)
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        domain.delete_account(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404

    domain.delete_account(current_user=root_user, session=session, id=victim_user.id)
    session.commit()

    assert session.get(Account, victim_user.id) is None
    # Only the Account row is removed; the User row is untouched.
    assert session.get(User, victim_user.id) is not None


def test_bulk_update_accounts(root_user: UserPublic, session: Session):
    first_user = _create_test_user(session, root_user, username="bulk_accounts_first", roles=set())
    second_user = _create_test_user(
        session, root_user, username="bulk_accounts_second", roles=set()
    )

    # bulk_update_accounts takes no id, so it always requires ADMIN.
    with pytest.raises(HTTPException) as exc_info:
        domain.bulk_update_accounts(
            current_user=first_user,
            session=session,
            ids={first_user.id},
            data=AccountBulkUpdate(preferences={"self": True}),
        )
    assert exc_info.value.status_code == 403

    domain.bulk_update_accounts(
        current_user=root_user,
        session=session,
        ids={first_user.id, second_user.id},
        data=AccountBulkUpdate(preferences={"bulk": True}),
    )
    session.commit()

    assert session.get(Account, first_user.id).preferences == {"bulk": True}
    assert session.get(Account, second_user.id).preferences == {"bulk": True}
    assert session.get(Account, first_user.id).last_edit_at is not None
    assert session.get(Account, second_user.id).last_edit_at is not None


def test_list_accounts_filters_and_count(root_user: UserPublic, session: Session):
    first_user = _create_test_user(session, root_user, username="list_accounts_first", roles=set())
    second_user = _create_test_user(
        session, root_user, username="list_accounts_second", roles=set()
    )

    assert len(domain.list_accounts(current_user=root_user, session=session, limit=1)) == 1
    assert (
        len(domain.list_accounts(current_user=root_user, session=session, offset=1, limit=1)) == 1
    )

    assert [
        account.id
        for account in domain.list_accounts(
            current_user=root_user, session=session, username="list_accounts_second"
        )
    ] == [second_user.id]
    assert [
        account.id
        for account in domain.list_accounts(
            current_user=root_user, session=session, username="list_accounts_first"
        )
    ] == [first_user.id]

    assert domain.count_accounts(current_user=root_user, session=session) >= 3
    assert (
        domain.count_accounts(
            current_user=root_user,
            session=session,
            username="list_accounts_first",
        )
        == 1
    )


def test_create_account_for_existing_backing_user(root_user: UserPublic, session: Session):
    target_user = _create_test_user(session, root_user, username="account_create_user", roles=set())

    # New users get an Account automatically; remove it so the explicit
    # creation path can run against the backing user.
    domain.delete_account(current_user=root_user, session=session, id=target_user.id)

    record = domain.create_account(
        current_user=root_user,
        session=session,
        data=AccountCreate(
            id=target_user.id,
            username="account_create_new",
            preferences={"theme": "dark"},
        ),
    )
    session.commit()

    # The Account row mirrors the backing User 1:1 (same primary key).
    assert record.id == target_user.id
    fetched = session.get(Account, target_user.id)
    assert fetched is not None
    assert fetched.username == "account_create_new"
    assert fetched.preferences == {"theme": "dark"}
    # The backing User row is untouched.
    assert session.get(User, target_user.id) is not None


def test_create_account_rejects_missing_backing_user(root_user: UserPublic, session: Session):
    with pytest.raises(HTTPException) as exc_info:
        domain.create_account(
            current_user=root_user,
            session=session,
            data=AccountCreate(id=99999, username="account_create_ghost"),
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "There is no user with the provided ID!"


def test_create_account_requires_admin(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(session, root_user, username="account_create_plain", roles=set())

    # create_account is checked without an id, so even "own" ids need ADMIN.
    with pytest.raises(HTTPException) as exc_info:
        domain.create_account(
            current_user=plain_user,
            session=session,
            data=AccountCreate(id=plain_user.id, username="account_create_denied"),
        )
    assert exc_info.value.status_code == 403
