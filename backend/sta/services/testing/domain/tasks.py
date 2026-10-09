

import pytest

from sta.services.config import AppConfig
from sta.services.domain.tasks import create_task
from sta.services.models.label.group import LabelGroupPublic
from sta.services.models.project import ProjectPublic
from sta.services.models.source.group import SourceGroupPublic
from sta.services.models.task import TaskCreate, TaskPublic
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx


@pytest.fixture
def unassigned_task(
    app_config: AppConfig,
    root_user: UserPublic,
    assigned_project: ProjectPublic,
    source_group: SourceGroupPublic,
    label_group: LabelGroupPublic,
):
    with session_ctx(app_config) as session:
        record = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="test",
                project_id=assigned_project.id,
                source_group_id=source_group.id,
                label_group_id=label_group.id,
            ),
        )
        task = TaskPublic.model_validate(record)

        session.commit()

    yield task


@pytest.fixture
def supervisor_task(
    app_config: AppConfig,
    root_user: UserPublic,
    assigned_project: ProjectPublic,
    source_group: SourceGroupPublic,
    label_group: LabelGroupPublic,
):
    with session_ctx(app_config) as session:
        record = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="test",
                project_id=assigned_project.id,
                source_group_id=source_group.id,
                label_group_id=label_group.id,
                supervisor_ids=[root_user.id],
            ),
        )
        task = TaskPublic.model_validate(record)

        session.commit()

    yield task


@pytest.fixture
def annotator_task(
    app_config: AppConfig,
    root_user: UserPublic,
    assigned_project: ProjectPublic,
    source_group: SourceGroupPublic,
    label_group: LabelGroupPublic,
):
    with session_ctx(app_config) as session:
        record = create_task(
            current_user=root_user,
            session=session,
            data=TaskCreate(
                name="test",
                project_id=assigned_project.id,
                source_group_id=source_group.id,
                label_group_id=label_group.id,
                annotator_ids=[root_user.id],
            ),
        )
        task = TaskPublic.model_validate(record)

        session.commit()

    yield task
