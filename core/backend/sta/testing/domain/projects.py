import pytest

from sta.config import AppConfig
from sta.domain.projects import create_project
from sta.models.project import ProjectCreate, ProjectPublic
from sta.models.user import UserPublic
from sta.session import session_ctx


@pytest.fixture
def unassigned_project(test_app_config: AppConfig, root_user: UserPublic):
    with session_ctx(test_app_config) as session:
        record = create_project(
            current_user=root_user,
            session=session,
            data=ProjectCreate(name="test"),
        )
        project = ProjectPublic.model_validate(record)

        session.commit()

    yield project


@pytest.fixture
def assigned_project(test_app_config: AppConfig, root_user: UserPublic):
    with session_ctx(test_app_config) as session:
        record = create_project(
            current_user=root_user,
            session=session,
            data=ProjectCreate(name="test", member_ids=[root_user.id]),
        )
        project = ProjectPublic.model_validate(record)

        session.commit()

    yield project
