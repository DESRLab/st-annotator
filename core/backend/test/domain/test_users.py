from datetime import datetime

from fastapi import HTTPException
from sqlmodel import Session, select

import pytest

from sta.common.utils.datetime import utc_equal
from sta.common.utils.func import OptionalEquals
from sta.domain import users as domain
from sta.domain.auth import auth_user
from sta.models.account import Account
from sta.models.user import Role, User, UserBulkUpdate, UserCreate, UserPublic, UserRole, UserUpdate

pytestmark = pytest.mark.in_memory_db

optional_utc_equal = OptionalEquals(utc_equal)


def _create_test_user(
    session: Session,
    root_user: UserPublic,
    *,
    username: str,
    roles: set[Role],
) -> UserPublic:
    record = domain.create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=username,
            password="password",
            roles=roles,
        ),
    )

    return UserPublic.model_validate(record)


def required_utc_lt(t1: datetime | None, t2: datetime | None) -> bool:
    if t1 is None or t2 is None:
        return False

    return t1 <= t2


def test_login_logout(root_user: UserPublic, session: Session):
    assert root_user.prev_login_at is None, "Should not have prev login"
    assert root_user.current_login_at is None, "Should not have current login"

    record = domain.login_user(current_user=root_user, session=session, id=root_user.id)
    assert record.prev_login_at is None, "Should only init current login"
    assert record.current_login_at is not None, "Should only init current login"

    current_login_at = record.current_login_at

    record = domain.login_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), "Should init prev login"
    assert required_utc_lt(record.prev_login_at, record.current_login_at), (
        "Should update current login"
    )

    current_login_at = record.current_login_at

    record = domain.logout_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), "Should update prev login"
    assert record.current_login_at is None, "Should clear current login"

    prev_login_at = record.prev_login_at

    record = domain.login_user(current_user=root_user, session=session, id=root_user.id)
    assert record.prev_login_at == prev_login_at, "Should only set current login"
    assert required_utc_lt(record.prev_login_at, record.current_login_at), (
        "Should only set current login"
    )

    current_login_at = record.current_login_at

    record = domain.logout_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), "Should update prev login"
    assert record.current_login_at is None, "Should clear current login"

    record = domain.logout_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), (
        "Should update prev login (idempotent)"
    )
    assert record.current_login_at is None, "Should clear current login (idempotent)"


@pytest.mark.parametrize("action", [domain.login_user, domain.logout_user])
def test_login_logout_rejects_mismatched_authenticated_user(
    action,
    root_user: UserPublic,
    session: Session,
):
    other_user = _create_test_user(session, root_user, username="auth_mismatch", roles=set())

    with pytest.raises(HTTPException) as exc_info:
        action(current_user=root_user, session=session, id=other_user.id)

    assert exc_info.value.status_code == 403


def test_read_user_requires_reader_role_or_self(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(session, root_user, username="read_user_plain_user", roles=set())
    manager_user = _create_test_user(
        session,
        root_user,
        username="read_user_manager_user",
        roles={Role.PROJECT_MANAGER},
    )

    # Users may always read their own record...
    record = domain.read_user(current_user=plain_user, session=session, id=plain_user.id)
    assert record.id == plain_user.id

    # ...but reading others requires ADMIN/PROJECT_MANAGER.
    with pytest.raises(HTTPException) as exc_info:
        domain.read_user(current_user=plain_user, session=session, id=manager_user.id)
    assert exc_info.value.status_code == 403

    record = domain.read_user(current_user=manager_user, session=session, id=plain_user.id)
    assert record.id == plain_user.id

    record = domain.read_user(current_user=root_user, session=session, id=manager_user.id)
    assert record.id == manager_user.id

    with pytest.raises(HTTPException) as exc_info:
        domain.read_user(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404


def test_update_user_password_role_and_account_sync(root_user: UserPublic, session: Session):
    target_user = _create_test_user(
        session,
        root_user,
        username="update_target_user",
        roles={Role.ANNOTATOR},
    )

    record = domain.update_user(
        current_user=root_user,
        session=session,
        id=target_user.id,
        data=UserUpdate(
            username="update_target_renamed",
            password="newpassword",
            roles={Role.SUPERVISOR},
        ),
    )
    session.commit()

    assert record.username == "update_target_renamed"
    assert record.roles == {Role.SUPERVISOR}

    # The rehashed password authenticates through the auth domain...
    authed = auth_user(session, username="update_target_renamed", password="newpassword")
    assert authed.id == target_user.id

    # ...and the old password is rejected.
    with pytest.raises(HTTPException) as exc_info:
        auth_user(session, username="update_target_renamed", password="password")
    assert exc_info.value.status_code == 400

    # The mirrored Account row follows the username change.
    account_record = session.get(Account, target_user.id)
    assert account_record is not None
    assert account_record.username == "update_target_renamed"


def test_update_user_guards(root_user: UserPublic, session: Session):
    plain_user = _create_test_user(
        session,
        root_user,
        username="update_guard_plain_user",
        roles=set(),
    )

    # Self-service updates cannot change administrative fields.
    with pytest.raises(HTTPException) as exc_info:
        domain.update_user(
            current_user=plain_user,
            session=session,
            id=plain_user.id,
            data=UserUpdate(username="update_guard_renamed"),
        )
    assert exc_info.value.status_code == 403

    updated = domain.update_user(
        current_user=plain_user,
        session=session,
        id=plain_user.id,
        data=UserUpdate(password="newpassword", current_password="password"),
    )
    assert updated.current_login_at is None
    assert (
        auth_user(
            session,
            username="update_guard_plain_user",
            password="newpassword",
        ).id
        == plain_user.id
    )

    with pytest.raises(HTTPException) as exc_info:
        domain.update_user(
            current_user=plain_user,
            session=session,
            id=plain_user.id,
            data=UserUpdate(password="anotherpassword", current_password="wrong"),
        )
    assert exc_info.value.status_code == 403

    # ADMIN cannot strip the ADMIN role from their own account.
    with pytest.raises(HTTPException) as exc_info:
        domain.update_user(
            current_user=root_user,
            session=session,
            id=root_user.id,
            data=UserUpdate(roles={Role.ANNOTATOR}),
        )
    assert exc_info.value.status_code == 400
    assert Role.ADMIN in session.get(User, root_user.id).roles

    with pytest.raises(HTTPException) as exc_info:
        domain.update_user(
            current_user=root_user,
            session=session,
            id=99999,
            data=UserUpdate(username="update_guard_ghost"),
        )
    assert exc_info.value.status_code == 404


def test_self_password_change_accepts_the_optimistic_locking_token(
    root_user: UserPublic,
    session: Session,
):
    # The password form submits issued_at together with password and
    # current_password. issued_at is concurrency metadata rather than a user
    # field, so it must not read as an administrative edit and deny the change
    # to a non-admin -- while still being enforced as a locking token.
    plain_user = _create_test_user(
        session,
        root_user,
        username="self_password_issued_at",
        roles=set(),
    )
    issued_at = session.get(User, plain_user.id).last_edit_at
    assert issued_at is not None

    updated = domain.update_user(
        current_user=plain_user,
        session=session,
        id=plain_user.id,
        data=UserUpdate(
            password="newpassword",
            current_password="password",
            issued_at=issued_at,
        ),
    )
    assert updated.current_login_at is None
    assert (
        auth_user(
            session,
            username="self_password_issued_at",
            password="newpassword",
        ).id
        == plain_user.id
    )

    # The token is honored, not ignored: a repeat of the same stale request
    # conflicts against the timestamp the successful change just stamped.
    with pytest.raises(HTTPException) as exc_info:
        domain.update_user(
            current_user=plain_user,
            session=session,
            id=plain_user.id,
            data=UserUpdate(
                password="anotherpassword",
                current_password="newpassword",
                issued_at=issued_at,
            ),
        )
    assert exc_info.value.status_code == 409


def test_delete_user_guards_and_role_cleanup(root_user: UserPublic, session: Session):
    victim_user = _create_test_user(
        session,
        root_user,
        username="delete_victim_user",
        roles={Role.ANNOTATOR},
    )

    with pytest.raises(HTTPException) as exc_info:
        domain.delete_user(current_user=root_user, session=session, id=root_user.id)
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        domain.delete_user(current_user=victim_user, session=session, id=victim_user.id)
    assert exc_info.value.status_code == 403

    with pytest.raises(HTTPException) as exc_info:
        domain.delete_user(current_user=root_user, session=session, id=99999)
    assert exc_info.value.status_code == 404

    domain.delete_user(current_user=root_user, session=session, id=victim_user.id)
    session.commit()

    assert session.get(User, victim_user.id) is None
    assert session.exec(select(UserRole).where(UserRole.user_id == victim_user.id)).all() == []


def test_login_logout_missing_user_record(root_user: UserPublic, session: Session):
    stale_user = _create_test_user(session, root_user, username="login_ghost_user", roles=set())

    domain.delete_user(current_user=root_user, session=session, id=stale_user.id)
    session.commit()

    with pytest.raises(HTTPException) as exc_info:
        domain.login_user(current_user=stale_user, session=session, id=stale_user.id)
    assert exc_info.value.status_code == 404

    with pytest.raises(HTTPException) as exc_info:
        domain.logout_user(current_user=stale_user, session=session, id=stale_user.id)
    assert exc_info.value.status_code == 404


def test_bulk_update_users_roles_and_self_demotion_guard(root_user: UserPublic, session: Session):
    first_user = _create_test_user(
        session,
        root_user,
        username="bulk_role_first_user",
        roles={Role.ANNOTATOR},
    )
    second_user = _create_test_user(
        session,
        root_user,
        username="bulk_role_second_user",
        roles=set(),
    )

    domain.bulk_update_users(
        current_user=root_user,
        session=session,
        ids={first_user.id, second_user.id},
        data=UserBulkUpdate(roles={Role.SUPERVISOR}),
    )
    session.commit()

    assert session.get(User, first_user.id).roles == {Role.SUPERVISOR}
    assert session.get(User, second_user.id).roles == {Role.SUPERVISOR}
    assert session.get(User, first_user.id).last_edit_at is not None
    assert session.get(User, second_user.id).last_edit_at is not None

    # The guard also applies to bulk updates that include the acting ADMIN.
    with pytest.raises(HTTPException) as exc_info:
        domain.bulk_update_users(
            current_user=root_user,
            session=session,
            ids={root_user.id, first_user.id},
            data=UserBulkUpdate(roles={Role.ANNOTATOR}),
        )
    assert exc_info.value.status_code == 400
    assert Role.ADMIN in session.get(User, root_user.id).roles

    # Demoting other users (without self) is allowed...
    domain.bulk_update_users(
        current_user=root_user,
        session=session,
        ids={first_user.id},
        data=UserBulkUpdate(roles=set()),
    )
    session.commit()
    assert session.get(User, first_user.id).roles == set()

    # ...but bulk updates still require ADMIN.
    with pytest.raises(HTTPException) as exc_info:
        domain.bulk_update_users(
            current_user=second_user,
            session=session,
            ids={second_user.id},
            data=UserBulkUpdate(roles=set()),
        )
    assert exc_info.value.status_code == 403


def test_create_root_user_rejects_existing_users(root_user: UserPublic, session: Session):
    with pytest.raises(RuntimeError):
        domain.create_root_user(session=session)


def test_list_users_limit_and_exact_match_filters(root_user: UserPublic, session: Session):
    first_user = _create_test_user(
        session,
        root_user,
        username="list_exact_first_user",
        roles={Role.ANNOTATOR},
    )
    second_user = _create_test_user(
        session,
        root_user,
        username="list_exact_second_user",
        roles=set(),
    )

    assert len(domain.list_users(current_user=root_user, session=session, limit=1)) == 1

    assert [
        user.id
        for user in domain.list_users(current_user=root_user, session=session, id=first_user.id)
    ] == [first_user.id]

    assert [
        user.id
        for user in domain.list_users(
            current_user=root_user,
            session=session,
            username="list_exact_second_user",
        )
    ] == [second_user.id]
