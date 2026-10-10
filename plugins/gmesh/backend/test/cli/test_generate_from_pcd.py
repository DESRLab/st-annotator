from pathlib import Path

from click.testing import CliRunner

import numpy as np

import pytest

import sta_gmesh.plugin as gmesh_plugin
from sta import entrypoints
from sta.cli import plugins_cli
from sta.common.filesystem import FileSystemPath
from sta.config import AppConfig
from sta.filesystem import filesystem_ctx
from sta.testing.plugin_import import cli_app_ctx
from sta_gmesh.filesystem import GroundMeshFileIO
from sta_gmesh.plugin import register


def _generate_from_pcd_command():
    if "gmesh" not in plugins_cli.commands:
        register()
    return plugins_cli.commands["gmesh"].commands["generate-from-pcd"]


def _seed_point_cloud(data_dir: Path) -> None:
    data_dir.mkdir()

    # A 5x5 planar grid with an intensity channel, as expected by the command.
    # The command reads .bin files as float64 (`dtype="float"`).
    xs, ys = np.meshgrid(np.arange(5, dtype=np.float64), np.arange(5, dtype=np.float64))
    points = np.stack(
        [xs.ravel(), ys.ravel(), np.zeros(25), np.zeros(25)],
        axis=1,
    )
    points.astype(np.float64).tofile(data_dir / "points.bin")

    # Unsupported files must be skipped
    (data_dir / "notes.txt").write_text("not a point cloud", encoding="utf-8")


def _assert_generated_mesh(tmp_path: Path, app_config: AppConfig) -> None:
    assert not (tmp_path / "data" / "notes.obj").exists()

    with filesystem_ctx(app_config):
        out_path = FileSystemPath.from_uri("data/points.obj")
        assert out_path.exists()
        gmesh = GroundMeshFileIO().read(out_path)

    # Same deterministic cloth as in test/filesystem/test_data.py
    assert gmesh.num_points == 64
    assert gmesh.num_faces == 98


def test_generate_from_pcd_writes_obj_for_each_point_cloud(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    plugin_import_app_config: AppConfig,
):
    _seed_point_cloud(tmp_path / "data")

    monkeypatch.setattr(entrypoints, "load_plugins", lambda: None)
    monkeypatch.setattr(gmesh_plugin, "app_ctx", cli_app_ctx)

    _generate_from_pcd_command()  # Ensures the plugin is registered
    result = CliRunner().invoke(
        plugins_cli.commands["gmesh"],
        ["generate-from-pcd", "data"],
        obj=plugin_import_app_config,
    )
    assert result.exit_code == 0, (result.output, result.exception)

    _assert_generated_mesh(tmp_path, plugin_import_app_config)
