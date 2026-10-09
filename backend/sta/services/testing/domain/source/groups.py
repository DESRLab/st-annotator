

import pytest

from sta.services.config import AppConfig
from sta.services.domain.source.groups import create_group
from sta.services.models.source.group import SourceGroupCreate, SourceGroupPublic
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx


@pytest.fixture
def source_group(app_config: AppConfig, root_user: UserPublic):
    with session_ctx(app_config) as session:
        record = create_group(
            current_user=root_user,
            session=session,
            data=SourceGroupCreate(name="test"),
        )
        group = SourceGroupPublic.model_validate(record)

        session.commit()

    yield group
