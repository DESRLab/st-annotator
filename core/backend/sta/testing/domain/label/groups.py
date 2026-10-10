import pytest

from sta.config import AppConfig
from sta.domain.label.groups import create_group
from sta.models.label.group import LabelGroupCreate, LabelGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx


@pytest.fixture
def label_group(test_app_config: AppConfig, root_user: UserPublic):
    with session_ctx(test_app_config) as session:
        record = create_group(
            current_user=root_user,
            session=session,
            data=LabelGroupCreate(name="test"),
        )
        group = LabelGroupPublic.model_validate(record)

        session.commit()

    yield group
