import pytest

from sta.config import AppConfig
from sta.domain.source.groups import create_group
from sta.models.source.group import SourceGroupCreate, SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx


@pytest.fixture
def source_group(test_app_config: AppConfig, root_user: UserPublic):
    with session_ctx(test_app_config) as session:
        record = create_group(
            current_user=root_user,
            session=session,
            data=SourceGroupCreate(name="test"),
        )
        group = SourceGroupPublic.model_validate(record)

        session.commit()

    yield group
