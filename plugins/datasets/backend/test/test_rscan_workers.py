"""Exercise scan scheduling with real spawned processes and no database."""

import os
from dataclasses import replace
from multiprocessing import active_children, get_start_method
from pathlib import Path

from click.testing import CliRunner

import pytest

from sta_datasets import rscan


def scan_task(scan: str) -> rscan.ScanImportTask:
    return rscan.ScanImportTask(
        config_path="/unused/config.json",
        data_dir="/unused/dataset",
        scan=scan,
        frame_index=0,
        source_group_id=1,
        label_branch_id=None,
        user_id=1,
        labels={},
        edges=[],
        relation_class_ids={},
        types={"segmentation"},
    )


def record_scan_process(task: rscan.ScanImportTask) -> str:
    """Record which process executed a pickled task without opening a database."""
    if task.scan == "bad":
        msg = "invalid scan in spawned worker"
        raise ValueError(msg)
    Path(task.data_dir, task.scan).write_text(f"{os.getpid()}:{get_start_method()}")
    return task.scan


def test_single_worker_preserves_task_order(monkeypatch: pytest.MonkeyPatch):
    seen: list[int] = []

    def record_task(task: rscan.ScanImportTask) -> str:
        seen.append(task.frame_index)
        return task.scan

    monkeypatch.setattr(rscan, "import_scan_worker", record_task)
    tasks = [replace(scan_task("b"), frame_index=1), scan_task("a")]
    assert rscan.run_scan_imports(tasks, workers=1) == ["b", "a"]
    assert seen == [1, 0]


def test_parallel_tasks_run_in_spawned_processes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(rscan, "import_scan_worker", record_scan_process)
    tasks = [replace(scan_task(scan), data_dir=str(tmp_path)) for scan in ("b", "a")]
    assert rscan.run_scan_imports(tasks, workers=2) == ["a", "b"]
    for scan in ("a", "b"):
        pid, start_method = (tmp_path / scan).read_text().split(":")
        assert int(pid) != os.getpid()
        assert start_method == "spawn"


def test_worker_failure_propagates_after_pool_shutdown(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(rscan, "import_scan_worker", record_scan_process)
    existing_children = {child.pid for child in active_children()}
    tasks = [replace(scan_task(scan), data_dir=str(tmp_path)) for scan in ("bad", "good")]
    with pytest.raises(ValueError, match="invalid scan in spawned worker"):
        rscan.run_scan_imports(tasks, workers=2)
    assert {child.pid for child in active_children()} == existing_children


@pytest.mark.parametrize("workers", ["0", "-1", "invalid"])
def test_invalid_worker_count_is_rejected(workers: str):
    result = CliRunner().invoke(rscan.cli, ["--workers", workers])
    assert result.exit_code == 2
    assert "--workers" in result.output
