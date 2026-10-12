"""Exercise raw 3RScan PLY reading, scan selection and database import."""

from __future__ import annotations

import json
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import click
from click.testing import CliRunner

import numpy as np

from plyfile import PlyData, PlyElement
from shapely import wkb

from sqlmodel import Session, select

import pytest

from sta.models.label.group import LabelGroup
from sta.models.label.spec.objclass import ObjectClass
from sta.models.source.group import SourceGroup
from sta.models.user import UserPublic
from sta_bbox.models.label.data import LabelBox, LabelTrack
from sta_pcd.models.source.data import PointCloudMetadata
from sta_pcd.models.source.spec import PointCloudSpec
from sta_segmentation.models.label.data import LabelInstance, LabelSelection

from sta_datasets import rscan as importer

pytestmark = pytest.mark.no_plugins


def dataset(root: Path, *, ascii_ply: bool = True) -> None:
    vertices = np.array(
        [
            (1, 2, 3, 255, 0, 0, 7),
            (2, 3, 4, 0, 255, 0, 7),
            (10, 20, 30, 0, 0, 255, 0),
        ],
        dtype=[
            ("x", "f4"),
            ("y", "f4"),
            ("z", "f4"),
            ("red", "u1"),
            ("green", "u1"),
            ("blue", "u1"),
            ("objectId", "u2"),
        ],
    )
    for scan in ("a", "b"):
        directory = root / scan
        directory.mkdir(parents=True)
        PlyData([PlyElement.describe(vertices, "vertex")], text=ascii_ply).write(
            str(directory / importer.PLY_NAME)
        )
        (directory / importer.ANNOTATION_NAME).write_text(
            json.dumps(
                {
                    "segGroups": [
                        {"objectId": 7, "label": "chair", "segments": [123]},
                    ]
                }
            )
        )


@pytest.mark.parametrize("ascii_ply", [True, False])
def test_reads_vertex_object_ids_instead_of_segment_indices(tmp_path: Path, *, ascii_ply: bool):
    dataset(tmp_path, ascii_ply=ascii_ply)
    xyz, ids = importer.read_points(tmp_path / "a" / importer.PLY_NAME)
    np.testing.assert_array_equal(xyz, [[1, 2, 3], [2, 3, 4], [10, 20, 30]])
    np.testing.assert_array_equal(ids, [7, 7, 0])
    labels = importer.read_annotations(tmp_path / "a" / importer.ANNOTATION_NAME)
    assert labels == {7: "chair"}
    importer.validate_instances(ids, labels, "a")


def test_selection_ignores_unannotated_directories_and_deduplicates(tmp_path: Path):
    dataset(tmp_path)
    (tmp_path / "unannotated").mkdir()
    assert importer.select_scans(tmp_path, ()) == ["a", "b"]
    assert importer.select_scans(tmp_path, ("b,a", "a")) == ["a", "b"]
    with pytest.raises(click.ClickException, match="Missing annotated PLY"):
        importer.select_scans(tmp_path, ("unannotated",))


def test_unmapped_object_is_rejected():
    with pytest.raises(ValueError, match="objects \\[7\\]"):
        importer.validate_instances(np.array([0, 7]), {}, "a")


def test_conflicting_object_classes_are_rejected(tmp_path: Path):
    path = tmp_path / "labels.json"
    path.write_text(
        json.dumps(
            {
                "segGroups": [
                    {"objectId": 7, "label": "chair"},
                    {"objectId": 7, "label": "table"},
                ]
            }
        )
    )
    with pytest.raises(ValueError, match="Conflicting labels"):
        importer.read_annotations(path)


def test_dry_run_requires_no_config_and_leaves_dataset_untouched(tmp_path: Path):
    dataset(tmp_path)
    before = set(tmp_path.rglob("*"))
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "--dry-run"])
    assert result.exit_code == 0, result.output
    assert "Validated 2 scans and 1 object classes" in result.output
    assert set(tmp_path.rglob("*")) == before


def prepare_cli(
    tmp_path: Path, user: UserPublic, session: Session, monkeypatch: pytest.MonkeyPatch
) -> Path:
    dataset(tmp_path)
    config_path = tmp_path / "config.json"
    config_path.write_text("{}")
    monkeypatch.setattr(
        importer,
        "load_app_config",
        lambda _: SimpleNamespace(fs_config=SimpleNamespace(root=tmp_path)),
    )
    monkeypatch.setattr(importer, "app_ctx", lambda _: nullcontext())
    monkeypatch.setattr(importer, "session_ctx", lambda _: nullcontext(session))
    monkeypatch.setattr(importer, "prompt_login", lambda _: user)
    return config_path


@pytest.mark.parametrize(
    "options,expected_segmentation,expected_boxes",
    [
        ([], 2, 0),
        (["--label-type", "bbox"], 0, 2),
        (["--label-type", "segmentation", "--label-type", "bbox"], 2, 2),
        (["--skip-labels"], 0, 0),
    ],
)
def test_import_persists_sources_and_scan_scoped_objects(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
    options: list[str],
    expected_segmentation: int,
    expected_boxes: int,
):
    config_path = prepare_cli(tmp_path, root_user, session, monkeypatch)
    if "--skip-labels" in options:
        for path in tmp_path.glob(f"*/{importer.ANNOTATION_NAME}"):
            path.unlink()
    result = CliRunner().invoke(
        importer.cli, [str(tmp_path / "a" / ".."), "-c", str(config_path), *options]
    )
    assert result.exit_code == 0, (result.output, result.exception)
    sources = session.exec(
        select(PointCloudMetadata).order_by(PointCloudMetadata.min_timestamp)
    ).all()
    assert len(sources) == 2
    assert [source.uri for source in sources] == [
        f"a/{importer.PLY_NAME}",
        f"b/{importer.PLY_NAME}",
    ]
    assert sources[0].min_timestamp != sources[1].min_timestamp
    assert all(source.translate_x == 0 and source.scale_x == 1 for source in sources)
    spec = session.exec(select(PointCloudSpec)).one()
    assert (
        importer.PointCloudConfig.model_validate(spec.config).channel_headers == importer.CHANNELS
    )
    assert len(session.exec(select(LabelInstance)).all()) == expected_segmentation
    selections = session.exec(select(LabelSelection)).all()
    assert len(selections) == expected_segmentation
    if selections:
        assert selections[0].entity_id != selections[1].entity_id
        for selection in selections:
            geometry = wkb.loads(bytes(selection.selection.data))
            assert {point.coords[0] for point in geometry.geoms} == {(1, 2, 3), (2, 3, 4)}
    assert len(session.exec(select(LabelTrack)).all()) == expected_boxes
    assert len(session.exec(select(LabelBox)).all()) == expected_boxes


def test_failure_removes_committed_groups_and_classes_but_keeps_raw_files(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    config_path = prepare_cli(tmp_path, root_user, session, monkeypatch)
    before = set(tmp_path.rglob("*"))
    original = importer.read_points

    def fail_second(path: Path):
        if path.parent.name == "b":
            msg = "invalid second scan"
            raise ValueError(msg)
        return original(path)

    monkeypatch.setattr(importer, "read_points", fail_second)
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "-c", str(config_path)])
    assert result.exit_code != 0
    assert "invalid second scan" in result.output
    assert session.exec(select(SourceGroup).where(SourceGroup.name == "3rscan")).first() is None
    assert session.exec(select(LabelGroup).where(LabelGroup.name == "3rscan")).first() is None
    # Object-class deletion preserves the record, as in the shared importer's cleanup tests.
    objclass = session.exec(select(ObjectClass).where(ObjectClass.name == "chair")).one()
    assert objclass.is_deleted
    assert set(tmp_path.rglob("*")) == before
