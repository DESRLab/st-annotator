"""Exercise native AV2 files, alignment, and transactional database imports."""

from __future__ import annotations

import json
import shutil
from contextlib import nullcontext
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import click
import pyarrow as pa
from click.testing import CliRunner
from pyarrow import feather

import numpy as np

from shapely import wkb

from sqlmodel import Session, select

import pytest

from sta.models.label.group import LabelGroup
from sta.models.label.spec.objclass import ObjectClass
from sta.models.source.group import SourceGroup
from sta.models.user import UserPublic
from sta_pcd.models.source.data import PointCloudMetadata
from sta_vector.models.label.data import LabelVector

from sta_datasets import argoverse2 as importer

pytestmark = pytest.mark.no_plugins


def dataset(root: Path) -> Path:
    log = root / "train" / "example-log"
    lidar = log / "sensors" / "lidar"
    lidar.mkdir(parents=True)
    timestamps = [1_000_000_123, 1_100_000_123]
    for timestamp in timestamps:
        feather.write_feather(
            pa.table(
                {
                    "x": [1.0, 2.0],
                    "y": [0.0, 1.0],
                    "z": [0.0, 2.0],
                    "intensity": [20, 30],
                }
            ),
            lidar / f"{timestamp}.feather",
        )
    # A 90-degree rotation around Z plus translation in city coordinates.
    feather.write_feather(
        pa.table(
            {
                "timestamp_ns": timestamps,
                "qw": [2**-0.5] * 2,
                "qx": [0.0] * 2,
                "qy": [0.0] * 2,
                "qz": [2**-0.5] * 2,
                "tx_m": [100.0, 102.0],
                "ty_m": [200.0, 200.0],
                "tz_m": [5.0, 5.0],
            }
        ),
        log / "city_SE3_egovehicle.feather",
    )

    def positions(coords):
        return [dict(zip(("x", "y", "z"), row, strict=True)) for row in coords]

    left = positions([[100, 200, 5], [100, 202, 5]])
    right = positions([[101, 200, 5], [101, 202, 5]])
    lane = {
        "left_lane_boundary": left,
        "left_lane_mark_type": "SOLID_WHITE",
        "right_lane_boundary": right,
        "right_lane_mark_type": "DASHED_WHITE",
    }
    (log / "map").mkdir()
    (log / "map" / "log_map_archive_example.json").write_text(
        json.dumps(
            {
                "lane_segments": {"1": lane, "2": {**lane, "left_lane_boundary": left[::-1]}},
                "pedestrian_crossings": {"3": {"edge1": left, "edge2": right}},
                "drivable_areas": {"4": {"area_boundary": left + right[::-1]}},
            }
        )
    )
    return log


def test_discovers_split_and_direct_log_and_selects_frames(tmp_path: Path):
    log = dataset(tmp_path)
    assert importer.select_logs(tmp_path, ()) == [log]
    assert importer.select_logs(log, ("example-log,example-log",)) == [log]
    assert [path.stem for path in importer.select_sweeps(log, 2, 1)] == ["1000000123"]
    with pytest.raises(click.ClickException, match="Missing extracted sensor logs"):
        importer.select_logs(tmp_path, ("missing",))


def test_map_deduplicates_reversed_boundaries_and_orders_crosswalk_vertices(tmp_path: Path):
    vectors = importer.read_map(dataset(tmp_path))
    assert len(vectors) == 4
    crossing = next(vector for vector in vectors if vector.class_name == "crosswalk")
    np.testing.assert_array_equal(
        crossing.xyz,
        [
            [100, 200, 5],
            [100, 202, 5],
            [101, 202, 5],
            [101, 200, 5],
        ],
    )


def test_alignment_uses_rotation_and_each_sweeps_translation(tmp_path: Path):
    log = dataset(tmp_path)
    poses = importer.read_poses(log)
    sweeps = importer.select_sweeps(log, 1, None)
    origin = poses[int(sweeps[0].stem)][1]
    first = importer.aligned_points(sweeps[0], poses[int(sweeps[0].stem)], origin)
    second = importer.aligned_points(sweeps[1], poses[int(sweeps[1].stem)], origin)
    np.testing.assert_allclose(first, [[0, 1, 0, 20], [-1, 2, 2, 30]], atol=1e-6)
    np.testing.assert_allclose(second[:, :3], [[2, 1, 0], [1, 2, 2]], atol=1e-6)
    assert importer.frame_timestamp(1_000_000_123) == datetime(
        1970, 1, 1, 0, 0, 1, tzinfo=timezone.utc
    )


def test_dry_run_does_not_need_config_or_write_files(tmp_path: Path):
    dataset(tmp_path)
    before = set(tmp_path.rglob("*"))
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "--dry-run"])
    assert result.exit_code == 0, (result.output, result.exception)
    assert "2 selected frames, 4 map vectors" in result.output
    assert "Validated 1 logs" in result.output
    assert set(tmp_path.rglob("*")) == before


def test_dry_run_does_not_start_workers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    dataset(tmp_path)

    def unexpected_dispatch(*_):
        pytest.fail("dry run started worker dispatch")

    monkeypatch.setattr(importer, "run_log_imports", unexpected_dispatch)
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "--dry-run", "--workers", "2"])
    assert result.exit_code == 0, (result.output, result.exception)


def test_missing_pose_is_rejected_before_import(tmp_path: Path):
    log = dataset(tmp_path)
    feather.write_feather(pa.table({"x": [1.0]}), log / "sensors" / "lidar" / "1200000123.feather")
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "--dry-run"])
    assert result.exit_code != 0
    assert "Missing exact vehicle pose" in result.output
    assert not (log / ".sta-imports").exists()


def prepare_cli(
    tmp_path: Path, user: UserPublic, session: Session, monkeypatch: pytest.MonkeyPatch
):
    log = dataset(tmp_path)
    config = tmp_path / "config.json"
    config.write_text("{}")
    monkeypatch.setattr(
        importer,
        "load_app_config",
        lambda _: SimpleNamespace(fs_config=SimpleNamespace(root=tmp_path)),
    )
    monkeypatch.setattr(importer, "app_ctx", lambda _: nullcontext())
    monkeypatch.setattr(importer, "session_ctx", lambda _: nullcontext(session))
    monkeypatch.setattr(importer, "prompt_login", lambda _: user)
    monkeypatch.setattr(importer, "dispose_engine", lambda _: None)
    return log, config


@pytest.mark.parametrize("skip_labels", [False, True])
def test_import_persists_aligned_sources_and_static_vectors(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
    *,
    skip_labels: bool,
):
    log, config = prepare_cli(tmp_path, root_user, session, monkeypatch)
    if skip_labels:
        (log / "map" / "log_map_archive_example.json").unlink()
    result = CliRunner().invoke(
        importer.cli,
        [
            str(tmp_path),
            "-c",
            str(config),
            "--workers",
            "1",
            *(["--skip-labels"] if skip_labels else []),
        ],
    )
    assert result.exit_code == 0, (result.output, result.exception)
    sources = session.exec(
        select(PointCloudMetadata).order_by(PointCloudMetadata.min_timestamp)
    ).all()
    assert len(sources) == 2
    assert sources[0].min_timestamp == importer.frame_timestamp(1_000_000_123)
    assert sources[1].min_timestamp == importer.frame_timestamp(1_100_000_123)
    points = np.fromfile(tmp_path / sources[1].uri, dtype="<f4").reshape(-1, 4)
    np.testing.assert_allclose(points, [[2, 1, 0, 20], [1, 2, 2, 30]], atol=1e-6)
    assert float(sources[1].max_x) == 2
    vectors = session.exec(select(LabelVector)).all()
    assert len(vectors) == (0 if skip_labels else 4)
    assert all(v.timestamp is None and v.min_timestamp is None for v in vectors)
    if vectors:
        crossing_class = session.exec(
            select(ObjectClass).where(ObjectClass.name == "crosswalk")
        ).one()
        crossing = next(v for v in vectors if v.gt_class_id == crossing_class.id)
        polygon = wkb.loads(bytes(crossing.geom.data))
        assert polygon.is_valid
        assert set(polygon.exterior.coords) == {(0, 0, 0), (0, 2, 0), (1, 2, 0), (1, 0, 0)}


def test_failed_log_rolls_back_resources_and_removes_converted_files(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    log, config = prepare_cli(tmp_path, root_user, session, monkeypatch)
    original = importer.aligned_points

    def fail_second(path, pose, origin):
        if path.stem == "1100000123":
            msg = "broken second sweep"
            raise ValueError(msg)
        return original(path, pose, origin)

    monkeypatch.setattr(importer, "aligned_points", fail_second)
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "-c", str(config), "--workers", "1"])
    assert result.exit_code != 0
    assert "broken second sweep" in result.output
    assert session.exec(select(SourceGroup)).all() == []
    assert session.exec(select(LabelGroup)).all() == []
    classes = session.exec(select(ObjectClass)).all()
    assert len(classes) == 4
    assert all(record.is_deleted for record in classes)
    assert list((log / ".sta-imports").iterdir()) == []
    assert len(list((log / "sensors" / "lidar").glob("*.feather"))) == 2


def test_classes_are_committed_before_worker_dispatch(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    _, config = prepare_cli(tmp_path, root_user, session, monkeypatch)
    dispatched = []

    def dispatch(tasks: list[importer.LogImportTask], workers: int) -> list[str]:
        with Session(session.get_bind()) as independent:
            classes = independent.exec(select(ObjectClass)).all()
            assert all(not record.is_deleted for record in classes)
            assert {record.name for record in classes} == {
                "lane-boundary/solid_white",
                "lane-boundary/dashed_white",
                "crosswalk",
                "drivable-area",
            }
        dispatched.extend(tasks)
        assert workers == 8
        return []

    monkeypatch.setattr(importer, "run_log_imports", dispatch)
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "-c", str(config)])
    assert result.exit_code == 0, (result.output, result.exception)
    assert len(dispatched) == 1
    assert dispatched[0].sweep_names == ("1000000123.feather", "1100000123.feather")
    assert all(record.is_deleted for record in session.exec(select(ObjectClass)).all())


def test_failed_log_preserves_completed_log_and_shared_classes(
    tmp_path: Path,
    root_user: UserPublic,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    first, config = prepare_cli(tmp_path, root_user, session, monkeypatch)
    second = first.with_name("failed-log")
    shutil.copytree(first, second)
    original = importer.aligned_points

    def fail_log(path, pose, origin):
        if path.parent.parent.parent == second:
            msg = "failed second log"
            raise ValueError(msg)
        return original(path, pose, origin)

    monkeypatch.setattr(importer, "aligned_points", fail_log)
    result = CliRunner().invoke(importer.cli, [str(tmp_path), "-c", str(config), "--workers", "1"])
    assert result.exit_code != 0
    assert "failed second log" in result.output
    assert len(session.exec(select(SourceGroup)).all()) == 1
    assert len(session.exec(select(LabelGroup)).all()) == 1
    assert len(session.exec(select(LabelVector)).all()) == 4
    classes = session.exec(select(ObjectClass)).all()
    assert len(classes) == 4
    assert all(not record.is_deleted for record in classes)
    assert len(list((first / ".sta-imports").glob("*/*.bin"))) == 2
    assert list((second / ".sta-imports").iterdir()) == []
