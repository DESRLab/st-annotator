

import pytest

from sta.services.config import AppConfig
from sta.services.domain.frames import create_frame
from sta.services.models.frame import FrameCreate, FramePublic, WorkType
from sta.services.models.label.repo import LabelsetBranchPublic
from sta.services.models.source.group import SourceGroupPublic
from sta.services.models.task import TaskPublic
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx


@pytest.fixture
def frame_for_annotate(
    app_config: AppConfig,
    root_user: UserPublic,
    annotator_task: TaskPublic,
    source_group: SourceGroupPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(app_config) as session:
        record = create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=annotator_task.id,
                account_id=root_user.id,
                source_group_id=source_group.id,
                label_branch_id=labelset_branch.id,
                work_type=WorkType.ANNOTATE,
            ),
        )
        frame = FramePublic.model_validate(record)

        session.commit()

    yield frame


@pytest.fixture
def frame_for_review(
    app_config: AppConfig,
    root_user: UserPublic,
    supervisor_task: TaskPublic,
    source_group: SourceGroupPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(app_config) as session:
        record = create_frame(
            current_user=root_user,
            session=session,
            data=FrameCreate(
                task_id=supervisor_task.id,
                account_id=root_user.id,
                source_group_id=source_group.id,
                label_branch_id=labelset_branch.id,
                work_type=WorkType.REVIEW,
            ),
        )
        frame = FramePublic.model_validate(record)

        session.commit()

    yield frame
