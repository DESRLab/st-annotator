from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

from click.testing import CliRunner

import pytest

from sta.benchmarks.perf_label_queries import VALID_PLUGINS
from sta.cli import bench as bench_module, cli as sta_cli

bench_cli = sta_cli.commands["bench"]

LABEL_QUERIES_COMMAND = "label-queries"


def write_config_file(tmp_path: Path) -> Path:
    # The bench CLI never reads the config file itself; it only forwards the path.
    path = tmp_path / "app-config.json"
    path.write_text(json.dumps({"db": "demo:db", "fs": "demo:fs"}))
    return path


@pytest.fixture
def perf_label_queries(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace the benchmark entry point so the command body runs without a database."""
    stub = MagicMock(name="perf_label_queries")
    monkeypatch.setattr(bench_module, "perf_label_queries", stub)
    return stub


def test_bench_help_lists_label_queries():
    result = CliRunner().invoke(bench_cli, ["--help"])

    assert result.exit_code == 0, result.output
    assert LABEL_QUERIES_COMMAND in result.output


def test_label_queries_forwards_all_arguments(tmp_path, perf_label_queries):
    config_path = write_config_file(tmp_path)
    output_dir = tmp_path / "results"

    result = CliRunner().invoke(
        bench_cli,
        [
            LABEL_QUERIES_COMMAND,
            "-c",
            str(config_path),
            "-p",
            "segmentation",
            "--user-count",
            "3",
            "--commit-count",
            "42",
            "--branching-prob",
            "0.5",
            "--label-entity-prob",
            "0.25",
            "--label-create-prob",
            "0.3",
            "--label-delete-prob",
            "0.05",
            "--init-label-count",
            "7",
            "-o",
            str(output_dir),
            "--overwrite",
            "--seed",
            "1234",
            "--query-plan",
            "--log-storage",
        ],
    )

    assert result.exit_code == 0, result.output
    perf_label_queries.assert_called_once_with(
        config_path=str(config_path),
        plugin="segmentation",
        user_count=3,
        commit_count=42,
        branching_prob=0.5,
        label_entity_prob=0.25,
        label_create_prob=0.3,
        label_delete_prob=0.05,
        init_label_count=7,
        output_dir=output_dir,
        overwrite=True,
        seed=1234,
        query_plan=True,
        log_storage=True,
    )


def test_label_queries_uses_defaults(tmp_path, perf_label_queries):
    config_path = write_config_file(tmp_path)
    output_dir = tmp_path / "results"

    result = CliRunner().invoke(
        bench_cli,
        [
            LABEL_QUERIES_COMMAND,
            "-c",
            str(config_path),
            "-o",
            str(output_dir),
        ],
    )

    assert result.exit_code == 0, result.output
    perf_label_queries.assert_called_once_with(
        config_path=str(config_path),
        plugin=VALID_PLUGINS[0],
        user_count=1,
        commit_count=2500,
        branching_prob=0.00,
        label_entity_prob=0.20,
        label_create_prob=0.20,
        label_delete_prob=0.01,
        init_label_count=0,
        output_dir=output_dir,
        overwrite=None,
        seed=None,
        query_plan=False,
        log_storage=False,
    )


def test_label_queries_rejects_unknown_plugin(tmp_path, perf_label_queries):
    config_path = write_config_file(tmp_path)
    output_dir = tmp_path / "results"

    result = CliRunner().invoke(
        bench_cli,
        [
            LABEL_QUERIES_COMMAND,
            "-c",
            str(config_path),
            "-o",
            str(output_dir),
            "-p",
            "not-a-plugin",
        ],
    )

    assert result.exit_code == 2
    assert "Invalid value" in result.output
    perf_label_queries.assert_not_called()


def test_label_queries_requires_output_dir(tmp_path, perf_label_queries):
    config_path = write_config_file(tmp_path)

    result = CliRunner().invoke(bench_cli, [LABEL_QUERIES_COMMAND, "-c", str(config_path)])

    assert result.exit_code == 2
    assert "Missing option" in result.output
    perf_label_queries.assert_not_called()
