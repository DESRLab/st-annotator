from sqlmodel import Session

import pytest

from sta.services.config import AppConfig
from sta.services.domain import auth as domain
from sta.services.domain.users import create_user
from sta.services.models.user import UserCreate, UserPublic
from sta.services.session import session_ctx, tmp_db_ctx


def _test_login_credentials(
    session: Session,
    root_user: UserPublic,
    root_username: str,
    root_password: str,
):
    other_username = root_username + "_other"
    other_password = root_password + "_other"
    other_record = create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username=other_username,
            password=other_password,
            roles=set(),
        ),
    )

    record = domain.auth_user(session, username=root_username, password=root_password)
    assert UserPublic.model_validate(record) == root_user

    with pytest.raises(type(domain.INVALID_LOGIN)) as exc_info:
        domain.auth_user(session, username=other_username, password=root_password)

    assert exc_info.value == domain.INVALID_LOGIN

    with pytest.raises(type(domain.INVALID_LOGIN)) as exc_info:
        domain.auth_user(session, username=root_username, password=other_password)

    assert exc_info.value == domain.INVALID_LOGIN

    other_user = domain.auth_user(session, username=other_username, password=other_password)
    assert other_user == UserPublic.model_validate(other_record)


@pytest.mark.parametrize("username", ["admin"])
@pytest.mark.parametrize("password", ["admin"])
def test_login_credentials(app_config: AppConfig, username: str, password: str):
    with tmp_db_ctx(app_config, root_username=username, root_password=password) as user:
        with session_ctx(app_config) as session:
            _test_login_credentials(session, user, username, password)
