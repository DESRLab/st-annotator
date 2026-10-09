

import pytest

from sta.services.config import AppConfig
from sta.services.domain.label.repo.graph import LabelsetBranchInit, init_branch
from sta.services.domain.label.repo.ops import OperationRegistry
from sta.services.domain.label.repo.ops.special import register_special_ops
from sta.services.models.label.group import LabelGroupPublic
from sta.services.models.label.repo import LabelsetBranchPublic
from sta.services.models.user import UserPublic
from sta.services.session import session_ctx


@pytest.fixture
def op_registry():
    op_registry = OperationRegistry()

    register_special_ops(op_registry)

    return op_registry


@pytest.fixture
def labelset_branch(
    app_config: AppConfig,
    root_user: UserPublic,
    label_group: LabelGroupPublic,
    op_registry: OperationRegistry,
):
    with session_ctx(app_config) as session:
        record = init_branch(
            current_user=root_user,
            session=session,
            op_registry=op_registry,
            data=LabelsetBranchInit(
                group_id=label_group.id,
                name="test",
            ),
        )
        branch = LabelsetBranchPublic.model_validate(record)

        session.commit()

    yield branch
