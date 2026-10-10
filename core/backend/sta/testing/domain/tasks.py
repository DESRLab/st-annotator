import pytest

from sta.config import AppConfig
from sta.domain.tasks import create_task
from sta.models.project import ProjectPublic
from sta.models.task import TaskCreate, TaskPublic
from sta.models.user import UserPublic
from sta.session import session_ctx


@pytest.fixture
def unassigned_task(
    test_app_config: AppConfig,
    root_user: UserPublic,
    assigned_project: ProjectPublic,
):
    with session_ctx(test_app_config) as session:
        record = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="test",
                project_id=assigned_project.id,
            ),
        )
        task = TaskPublic.model_validate(record)

        session.commit()

    yield task


@pytest.fixture
def supervisor_task(
    test_app_config: AppConfig,
    root_user: UserPublic,
    assigned_project: ProjectPublic,
):
    with session_ctx(test_app_config) as session:
        record = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="test",
                project_id=assigned_project.id,
                supervisor_ids=[root_user.id],
            ),
        )
        task = TaskPublic.model_validate(record)

        session.commit()

    yield task


@pytest.fixture
def annotator_task(
    test_app_config: AppConfig,
    root_user: UserPublic,
    assigned_project: ProjectPublic,
):
    with session_ctx(test_app_config) as session:
        record = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="test",
                project_id=assigned_project.id,
                annotator_ids=[root_user.id],
            ),
        )
        task = TaskPublic.model_validate(record)

        session.commit()

    yield task
