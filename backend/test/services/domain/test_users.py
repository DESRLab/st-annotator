from datetime import datetime

from sqlmodel import Session

from sta.common.utils.datetime import utc_equal
from sta.common.utils.func import OptionalEquals
from sta.services.domain import users as domain
from sta.services.models.user import UserPublic

optional_utc_equal = OptionalEquals(utc_equal)

def required_utc_lt(t1: datetime | None, t2: datetime | None) -> bool:
    if t1 is None or t2 is None:
        return False

    return t1 <= t2


def test_login_logout(root_user: UserPublic, session: Session):
    assert root_user.prev_login_at is None, 'Should not have prev login'
    assert root_user.current_login_at is None, 'Should not have current login'

    record = domain.login_user(current_user=root_user, session=session, id=root_user.id)
    assert record.prev_login_at is None, 'Should only init current login'
    assert record.current_login_at is not None, 'Should only init current login'

    current_login_at = record.current_login_at

    record = domain.login_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), 'Should init prev login'
    assert required_utc_lt(record.prev_login_at, record.current_login_at), 'Should update current login'

    current_login_at = record.current_login_at

    record = domain.logout_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), 'Should update prev login'
    assert record.current_login_at is None, 'Should clear current login'

    prev_login_at = record.prev_login_at

    record = domain.login_user(current_user=root_user, session=session, id=root_user.id)
    assert record.prev_login_at == prev_login_at, 'Should only set current login'
    assert required_utc_lt(record.prev_login_at, record.current_login_at), 'Should only set current login'

    current_login_at = record.current_login_at

    record = domain.logout_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), 'Should update prev login'
    assert record.current_login_at is None, 'Should clear current login'

    record = domain.logout_user(current_user=root_user, session=session, id=root_user.id)
    assert optional_utc_equal(record.prev_login_at, current_login_at), 'Should update prev login (idempotent)'
    assert record.current_login_at is None, 'Should clear current login (idempotent)'
