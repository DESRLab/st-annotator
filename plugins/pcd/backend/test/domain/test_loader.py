"""Tests for :meth:`PointCloudLoader.get_data_bulk`.

These seed a real point file plus source spec/metadata through the domain layer, then invoke the
loader registered under ``SOURCE_DATA_LOADERS['pcd']`` and assert on the binary bulk response.
"""

from __future__ import annotations

import json

import numpy as np
from numpy.testing import assert_array_equal

from fastapi import HTTPException
from sqlmodel import Session

import pytest

from sta.common.filesystem import FileSystemPath
from sta.common.spatial import Transform
from sta.config import AppConfig
from sta.domain.editor.loader import SOURCE_DATA_LOADERS
from sta.domain.frames import create_frame
from sta.filesystem import filesystem_ctx
from sta.models.frame import FrameCreate, FramePublic, WorkType
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.session import session_ctx
from sta_pcd.domain.editor.loader import PointCloudLoader
from sta_pcd.domain.source.data import metadata as metadata_domain
from sta_pcd.domain.source.data.data import preprocessor_op_registry
from sta_pcd.domain.source.spec import specs as specs_domain
from sta_pcd.models.configs import PointCloudConfig
from sta_pcd.models.configs.pcd import CropBoxConfig, DenoiseConfig, RemoveBackgroundConfig
from sta_pcd.models.source.data import PointCloudMetadataCreate
from sta_pcd.models.source.spec import PointCloudSpecCreate
from sta_pcd.ops.preprocessing import (
    CropBoxParams,
    DenoiseParams,
    PreprocessingOperationType,
    RemoveBackgroundParams,
)

from ..register_plugin import register_pcd_once

POINTS = np.array(
    [
        [0.0, 0.0, 0.0, 0.0],
        [1.0, 1.0, 1.0, 0.5],
        [3.0, 3.0, 3.0, 1.0],
    ],
    dtype=np.float32,
)


@pytest.fixture
def loader() -> PointCloudLoader:
    register_pcd_once()
    return SOURCE_DATA_LOADERS["pcd"]


def seed_point_cloud(
    *,
    app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    uri_stem: str,
    config: PointCloudConfig | None = None,
) -> str:
    """Writes a point file and creates the matching spec and metadata; returns the URI.

    Must be called inside a filesystem context (the metadata create re-reads the
    file to derive its bounds).
    """
    uri = f"{uri_stem}.npy"
    path = FileSystemPath.from_uri(uri)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        np.save(f, POINTS)

    specs_domain.create_spec(
        current_user=root_user,
        session=session,
        data=PointCloudSpecCreate(
            name="loader point cloud",
            group_ids=[source_group.id],
            config=config or PointCloudConfig.default(),
        ),
    )
    session.commit()

    metadata_domain.create_data(
        current_user=root_user,
        session=session,
        data=PointCloudMetadataCreate(
            uri=uri,
            group_id=source_group.id,
            weather=None,
        ).update_from_transform(Transform.from_optional()),
    )
    session.commit()

    return uri


def seed_spec_only(
    *,
    test_app_config: AppConfig,
    root_user: UserPublic,
    source_group: SourceGroupPublic,
    config: PointCloudConfig | None = None,
) -> None:
    """Creates a spec (with no metadata) in the group."""
    with session_ctx(test_app_config) as session:
        specs_domain.create_spec(
            current_user=root_user,
            session=session,
            data=PointCloudSpecCreate(
                name="loader spec only",
                group_ids=[source_group.id],
                config=config or PointCloudConfig.default(),
            ),
        )
        session.commit()


def test_get_data_bulk_returns_point_cloud_for_a_single_frame(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    frame_for_annotate: FramePublic,
    loader: PointCloudLoader,
):
    with filesystem_ctx(plugin_import_app_config):
        seed_point_cloud(
            app_config=plugin_import_app_config,
            root_user=root_user,
            session=session,
            source_group=source_group,
            uri_stem="bulk",
        )

        response = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame_for_annotate],
            other_args={},
        )

    assert response.headers["X-Num-Points"] == str(POINTS.shape[0])
    assert response.headers["X-Num-Channels"] == str(POINTS.shape[1])
    assert json.loads(response.headers["X-Channel-Headers"]) == ["x", "y", "z", "intensity"]

    content = np.frombuffer(response.body, dtype=np.float32).reshape(POINTS.shape)
    assert_array_equal(content, POINTS)


def test_get_data_bulk_constructs_preprocessors_once_for_multiple_files(
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    frame_for_annotate: FramePublic,
    loader: PointCloudLoader,
    monkeypatch: pytest.MonkeyPatch,
):
    config = PointCloudConfig(
        channel_headers=["x", "y", "z", "intensity"],
        dtype="float32",
        preprocessors=[
            DenoiseConfig(
                op_name=PreprocessingOperationType.DENOISE,
                op_params=DenoiseParams(nb_neighbours=2, std_ratio=20),
            ),
        ],
    )
    with filesystem_ctx(plugin_import_app_config):
        seed_point_cloud(
            app_config=plugin_import_app_config,
            root_user=root_user,
            session=session,
            source_group=source_group,
            uri_stem="cached-op-a",
            config=config,
        )
        second_path = FileSystemPath.from_uri("cached-op-b.npy")
        with second_path.open("wb") as point_cloud_file:
            np.save(point_cloud_file, POINTS)
        metadata_domain.create_data(
            current_user=root_user,
            session=session,
            data=PointCloudMetadataCreate(
                uri=second_path.as_uri(),
                group_id=source_group.id,
                weather=None,
            ).update_from_transform(Transform.from_optional()),
        )
        session.commit()

        original_create_op = preprocessor_op_registry.create_op
        calls = 0

        def counted_create_op(*args, **kwargs):
            nonlocal calls
            calls += 1
            return original_create_op(*args, **kwargs)

        monkeypatch.setattr(preprocessor_op_registry, "create_op", counted_create_op)
        loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame_for_annotate],
            other_args={},
        )

    assert calls == 1


def test_get_data_bulk_rejects_multiple_frames(
    test_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    frame_for_annotate: FramePublic,
    loader: PointCloudLoader,
):
    with pytest.raises(HTTPException, match="exactly one frame") as exc_info:
        loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame_for_annotate, frame_for_annotate],
            other_args={},
        )
    assert exc_info.value.status_code == 422


def test_get_data_bulk_skips_missing_files(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    frame_for_annotate: FramePublic,
    loader: PointCloudLoader,
):
    with filesystem_ctx(plugin_import_app_config):
        uri = seed_point_cloud(
            app_config=plugin_import_app_config,
            root_user=root_user,
            session=session,
            source_group=source_group,
            uri_stem="missing",
        )

        # Remove the backing file after the metadata has been created.
        FileSystemPath.from_uri(uri).unlink()

        response = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame_for_annotate],
            other_args={"remove_bg": False, "crop_area": False},
        )

    assert response.headers["X-Num-Points"] == "0"
    assert json.loads(response.headers["X-Channel-Headers"]) == ["x", "y", "z", "intensity"]
    assert response.body == b""


def test_get_data_bulk_without_spec_or_metadata_returns_empty(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    frame_for_annotate: FramePublic,
    loader: PointCloudLoader,
):
    # The frame's source group has neither a spec nor any metadata.
    with filesystem_ctx(plugin_import_app_config):
        response = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame_for_annotate],
            other_args={},
        )

    assert response.headers["X-Num-Points"] == "0"
    assert response.body == b""


def test_get_data_bulk_with_spec_but_no_metadata_returns_headers_only(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    frame_for_annotate: FramePublic,
    loader: PointCloudLoader,
):
    seed_spec_only(
        test_app_config=test_app_config,
        root_user=root_user,
        source_group=source_group,
    )

    with filesystem_ctx(plugin_import_app_config):
        response = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame_for_annotate],
            other_args={},
        )

    assert response.headers["X-Num-Points"] == "0"
    assert json.loads(response.headers["X-Channel-Headers"]) == ["x", "y", "z", "intensity"]
    assert response.body == b""


def test_get_data_bulk_raises_when_frame_has_no_source_group(
    test_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    annotator_task,
    loader: PointCloudLoader,
):
    with session_ctx(test_app_config) as frame_session:
        record = create_frame(
            current_user=root_user,
            session=frame_session,
            data=FrameCreate(
                task_id=annotator_task.id,
                account_id=root_user.id,
                source_group_id=None,
                label_branch_id=None,
                work_type=WorkType.ANNOTATE,
            ),
        )
        frame = FramePublic.model_validate(record)
        frame_session.commit()

    with pytest.raises(HTTPException, match="has no source group") as exc_info:
        loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame],
            other_args={},
        )
    assert exc_info.value.status_code == 422


def test_get_data_bulk_skips_disabled_preprocessors(
    test_app_config: AppConfig,
    plugin_import_app_config: AppConfig,
    root_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
    frame_for_annotate: FramePublic,
    loader: PointCloudLoader,
):
    config = PointCloudConfig(
        channel_headers=["x", "y", "z", "intensity"],
        dtype="float32",
        preprocessors=[
            CropBoxConfig(
                op_name=PreprocessingOperationType.CROP_BOX,
                op_params=CropBoxParams(keep=True),
            ),
            RemoveBackgroundConfig(
                op_name=PreprocessingOperationType.REMOVE_BG,
                op_params=RemoveBackgroundParams([]),
            ),
        ],
    )
    with filesystem_ctx(plugin_import_app_config):
        seed_point_cloud(
            app_config=plugin_import_app_config,
            root_user=root_user,
            session=session,
            source_group=source_group,
            uri_stem="preprocessed",
            config=config,
        )

        # Disabling crop/background removal skips the corresponding preprocessors entirely.
        response = loader.get_data_bulk(
            current_user=root_user,
            session=session,
            frames=[frame_for_annotate],
            other_args={"remove_bg": False, "crop_area": False},
        )

    assert response.headers["X-Num-Points"] == str(POINTS.shape[0])
    content = np.frombuffer(response.body, dtype=np.float32).reshape(POINTS.shape)
    assert_array_equal(content, POINTS)
