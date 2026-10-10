from __future__ import annotations

from pathlib import Path

import pytest

from sta.common.database import InMemoryDatabaseConfig
from sta.common.filesystem import FilesystemConfig
from sta.config import AppConfig
from sta.models.label.group import LabelGroupPublic
from sta.models.label.repo import LabelsetBranchPublic, LabelsetCommitPublic
from sta.models.source.group import SourceGroupPublic
from sta.models.user import Role, UserPublic


@pytest.fixture
def app_config(tmp_path: Path) -> AppConfig:
    """An application config with a temporary filesystem root and a dummy database."""
    return AppConfig(
        db_config=InMemoryDatabaseConfig(),
        fs_config=FilesystemConfig(root=tmp_path),
    )


@pytest.fixture
def stub_user() -> UserPublic:
    return UserPublic(id=1, username="admin", roles={Role.ADMIN})


@pytest.fixture
def stub_source_group() -> SourceGroupPublic:
    return SourceGroupPublic(id=1, name="source-group-a")


@pytest.fixture
def stub_label_group() -> LabelGroupPublic:
    return LabelGroupPublic(id=3, name="label-group-a")


@pytest.fixture
def stub_label_branch(stub_label_group: LabelGroupPublic) -> LabelsetBranchPublic:
    head = LabelsetCommitPublic(
        group_id=stub_label_group.id,
        hash="0" * 40,
        operations=[],
        group=stub_label_group,
    )
    return LabelsetBranchPublic(
        id=10,
        group_id=stub_label_group.id,
        head_hash=head.hash,
        checkpoint_hash=None,
        name="main",
        group=stub_label_group,
        head=head,
        checkpoint=None,
        perm_lv_by_user_id={},
    )
