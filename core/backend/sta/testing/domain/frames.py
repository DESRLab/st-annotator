import pytest

from sta.config import AppConfig
from sta.domain.frames import create_frame
from sta.models.frame import FrameCreate, FramePublic, WorkType
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.source.group import SourceGroupPublic
from sta.models.task import TaskPublic
from sta.models.user import UserPublic
from sta.session import session_ctx


@pytest.fixture
def frame_for_annotate(
    test_app_config: AppConfig,
    root_user: UserPublic,
    annotator_task: TaskPublic,
    source_group: SourceGroupPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
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
    test_app_config: AppConfig,
    root_user: UserPublic,
    supervisor_task: TaskPublic,
    source_group: SourceGroupPublic,
    labelset_branch: LabelsetBranchPublic,
):
    with session_ctx(test_app_config) as session:
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
