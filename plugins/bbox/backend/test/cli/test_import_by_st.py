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
from sta_bbox.domain.label.data import element as element_domain, entity as entity_domain
from sta_bbox.models.label.data import BoxType
from sta_bbox.plugin import register


def test_import_by_st_reads_bounding_boxes_and_creates_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass = object_class_selection.objclasses[0]
    track_id = uuid.uuid4().int
    box_id = uuid.uuid4().int
    labels_path = tmp_path / "boxes.json"
    labels_path.write_text(
        json.dumps(
            {
                "bounding_boxes": [
                    {
                        "id": box_id,
                        "box_type": BoxType.CUBOID,
                        "center": {"x": 1, "y": 2, "z": 3},
                        "angle": 0,
                        "size": {"x": 4, "y": 5, "z": 6},
                        "track": {
                            "id": track_id,
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
        import_by_st_command("bbox", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        (track,) = entity_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=labelset_branch.group_id,
            commit_hash=labelset_branch.head_hash,
        )
        (box,) = element_domain.list_datas(
            current_user=root_user,
            session=session,
            group_id=labelset_branch.group_id,
            commit_hash=labelset_branch.head_hash,
        )

    assert track.id == uuid.UUID(int=track_id)
    assert track.gt_class_id == objclass.id
    assert box.id == uuid.UUID(int=box_id)
    assert box.entity_id == track.id
    assert box.perceived_class_id == objclass.id
    assert box.type == BoxType.CUBOID


def test_import_by_st_reads_trackless_bounding_boxes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    """Regression guard: boxes with ``"track": null`` leave the entity batch empty.

    An empty list passed to ``bulk_create_datas`` used to reach SQLAlchemy as ``params=[]``,
    which does not skip the statement but emits a default-row INSERT; the resulting
    IntegrityError aborted the whole import before a single box was written.
    """
    objclass = object_class_selection.objclasses[0]
    box_ids = [uuid.uuid4().int, uuid.uuid4().int]
    labels_path = tmp_path / "boxes.json"
    labels_path.write_text(
        json.dumps(
            {
                "bounding_boxes": [
                    {
                        "id": box_id,
                        "box_type": BoxType.CUBOID,
                        "center": {"x": 1, "y": 2, "z": 3},
                        "angle": 0,
                        "size": {"x": 4, "y": 5, "z": 6},
                        "track": None,
                        "perceived_class": {"id": objclass.id, "name": objclass.name},
                    }
                    for box_id in box_ids
                ],
            }
        ),
        encoding="utf-8",
    )
    data_info_path = write_data_info(tmp_path, labels_path)

    result = invoke_label_import(
        monkeypatch,
        import_by_st_command("bbox", register),
        app_config=plugin_import_app_config,
        root_user=root_user,
        label_branch=labelset_branch,
        data_info_path=data_info_path,
    )

    assert result.exit_code == 0, result.output
    with session_ctx(test_app_config) as session:
        tracks = list(
            entity_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=labelset_branch.group_id,
                commit_hash=labelset_branch.head_hash,
            )
        )
        boxes = list(
            element_domain.list_datas(
                current_user=root_user,
                session=session,
                group_id=labelset_branch.group_id,
                commit_hash=labelset_branch.head_hash,
            )
        )

    assert tracks == []
    assert sorted(box.id for box in boxes) == sorted(uuid.UUID(int=box_id) for box_id in box_ids)
    assert all(box.entity_id is None for box in boxes)
    assert all(box.perceived_class_id == objclass.id for box in boxes)
