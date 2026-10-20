"""Exercise log scheduling with real spawned processes and no database."""

import os
from dataclasses import replace
from multiprocessing import active_children, get_start_method
from pathlib import Path

from click.testing import CliRunner

import pytest

from sta_datasets import argoverse2


def log_task(log: str) -> argoverse2.LogImportTask:
    return argoverse2.LogImportTask(
        config_path="/unused/config.json",
        log_dir=log,
        sweep_names=("100.feather",),
        name="Argoverse 2",
        user_id=1,
        skip_labels=False,
    )


def record_log_process(task: argoverse2.LogImportTask) -> str:
    """Record the worker process for a pickled task without opening a database."""
    log = Path(task.log_dir)
    if log.name == "bad":
        msg = "invalid log in spawned worker"
        raise ValueError(msg)
    log.write_text(f"{os.getpid()}:{get_start_method()}")
    return str(log)


def test_serial_imports_use_task_order(monkeypatch: pytest.MonkeyPatch):
    seen = []

    def record_task(task: argoverse2.LogImportTask) -> str:
        seen.append(task.log_dir)
        return task.log_dir

    monkeypatch.setattr(argoverse2, "import_log_worker", record_task)
    assert argoverse2.run_log_imports([log_task("b"), log_task("a")], 1) == ["b", "a"]
    assert seen == ["b", "a"]


def test_parallel_imports_use_spawned_processes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(argoverse2, "import_log_worker", record_log_process)
    tasks = [replace(log_task(log), log_dir=str(tmp_path / log)) for log in ("b", "a")]
    assert argoverse2.run_log_imports(tasks, 2) == [str(tmp_path / log) for log in ("a", "b")]
    for log in ("a", "b"):
        pid, method = (tmp_path / log).read_text().split(":")
        assert int(pid) != os.getpid()
        assert method == "spawn"


def test_failure_joins_workers_before_returning(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(argoverse2, "import_log_worker", record_log_process)
    before = {child.pid for child in active_children()}
    tasks = [replace(log_task(log), log_dir=str(tmp_path / log)) for log in ("bad", "good")]
    with pytest.raises(ValueError, match="invalid log in spawned worker"):
        argoverse2.run_log_imports(tasks, 2)
    assert {child.pid for child in active_children()} == before


@pytest.mark.parametrize("workers", ["0", "-1", "invalid"])
def test_cli_rejects_invalid_workers(workers: str):
    result = CliRunner().invoke(argoverse2.cli, ["--workers", workers])
    assert result.exit_code == 2
    assert "--workers" in result.output
