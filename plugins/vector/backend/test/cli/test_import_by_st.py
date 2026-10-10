import json
import uuid
from pathlib import Path

import pytest

from sta.config import AppConfig
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta.testing.plugin_import import (
    import_by_st_command,
    invoke_label_import,
    write_data_info,
)
from sta_vector.domain.label.data import element as element_domain
from sta_vector.models.label.data import VectorType
from sta_vector.plugin import register


def test_import_by_st_reads_vectors_and_creates_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass = object_class_selection.objclasses[0]
    vector_id = uuid.uuid4().int
    labels_path = tmp_path / "vectors.json"
    labels_path.write_text(
        json.dumps(
            {
                "vectors": [
                    {
                        "id": vector_id,
                        "vector_type": VectorType.POLYGON,
                        "vertices": [
                            {"x": 0, "y": 0, "z": 0},
                            {"x": 1, "y": 0, "z": 0},
                            {"x": 1, "y": 1, "z": 0},
                            {"x": 0, "y": 1, "z": 0},
                        ],
                        "gt_class": {"id": objclass.id, "name": objclass.name},
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    data_info_path = write_data_info(tmp_path, labels_path)

    result = invoke_label_import(
        monkeypatch,
        import_by_st_command("vector", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        (vector,) = element_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=labelset_branch.group_id,
            commit_hash=labelset_branch.head_hash,
        )

    assert vector.id == uuid.UUID(int=vector_id)
    assert vector.gt_class_id == objclass.id
    assert vector.type == VectorType.POLYGON


def test_import_by_st_reads_empty_vector_list(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
):
    """Regression guard: a label file with no vectors passes an empty batch to the domain.

    An empty list used to reach SQLAlchemy as ``params=[]``, which does not skip the statement
    but emits a default-row INSERT, aborting the import with an IntegrityError.
    """
    labels_path = tmp_path / "vectors.json"
    labels_path.write_text(json.dumps({"vectors": []}), encoding="utf-8")
    data_info_path = write_data_info(tmp_path, labels_path)

    result = invoke_label_import(
        monkeypatch,
        import_by_st_command("vector", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        vectors = list(
            element_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=labelset_branch.group_id,
                commit_hash=labelset_branch.head_hash,
            )
        )

    assert vectors == []
