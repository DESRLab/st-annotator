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
from sta_segmentation.domain.label.data import element as element_domain, entity as entity_domain
from sta_segmentation.plugin import register


def test_import_by_st_reads_segmentation_labels_and_creates_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass = object_class_selection.objclasses[0]
    instance_id = uuid.uuid4().int
    selection_id = uuid.uuid4().int
    labels_path = tmp_path / "labels.json"
    labels_path.write_text(
        json.dumps(
            {
                "selections": [
                    {
                        "id": selection_id,
                        "points": [{"x": 1, "y": 2, "z": 3}, {"x": 4, "y": 5, "z": 6}],
                        "instance": {
                            "id": instance_id,
                            "gt_class": {"id": objclass.id, "name": objclass.name},
                            "is_black": True,
                        },
                        "perceived_class": {"id": objclass.id, "name": objclass.name},
                        "distinctive_lv": 1,
                        "occlusion_lv": 2,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    data_info_path = write_data_info(tmp_path, labels_path)

    result = invoke_label_import(
        monkeypatch,
        import_by_st_command("segmentation", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        (instance,) = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=labelset_branch.group_id,
            commit_hash=labelset_branch.head_hash,
        )
        (selection,) = element_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=labelset_branch.group_id,
            commit_hash=labelset_branch.head_hash,
        )

    assert instance.id == uuid.UUID(int=instance_id)
    assert instance.gt_class_id == objclass.id
    assert selection.id == uuid.UUID(int=selection_id)
    assert selection.entity_id == instance.id
    assert selection.perceived_class_id == objclass.id
    assert len(selection.points) == 2


def test_import_by_st_reads_selections_without_instances(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    """Regression guard: selections with ``"instance": null`` leave the entity batch empty.

    The empty entity list used to reach SQLAlchemy as ``params=[]``, which does not skip the
    statement but emits a default-row INSERT; the resulting IntegrityError aborted the import
    before any selection was written.
    """
    objclass = object_class_selection.objclasses[0]
    selection_ids = [uuid.uuid4().int, uuid.uuid4().int]
    labels_path = tmp_path / "labels.json"
    labels_path.write_text(
        json.dumps(
            {
                "selections": [
                    {
                        "id": selection_id,
                        "points": [{"x": 1, "y": 2, "z": 3}, {"x": 4, "y": 5, "z": 6}],
                        "instance": None,
                        "perceived_class": {"id": objclass.id, "name": objclass.name},
                    }
                    for selection_id in selection_ids
                ],
            }
        ),
        encoding="utf-8",
    )
    data_info_path = write_data_info(tmp_path, labels_path)

    result = invoke_label_import(
        monkeypatch,
        import_by_st_command("segmentation", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        instances = list(
            entity_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=labelset_branch.group_id,
                commit_hash=labelset_branch.head_hash,
            )
        )
        selections = list(
            element_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=labelset_branch.group_id,
                commit_hash=labelset_branch.head_hash,
            )
        )

    assert instances == []
    assert sorted(s.id for s in selections) == sorted(
        uuid.UUID(int=selection_id) for selection_id in selection_ids
    )
    assert all(s.entity_id is None for s in selections)
    assert all(s.perceived_class_id == objclass.id for s in selections)
