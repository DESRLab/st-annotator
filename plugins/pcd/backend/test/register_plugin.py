"""Helper to register the pcd plugin exactly once per test process.

``register()`` mutates module-level routers and the CLI group, so it must not be invoked more
than once. Both the import CLI helper and this function guard on ``plugins_cli.commands``.
"""

from __future__ import annotations

from sta.cli import plugins_cli
from sta_pcd.plugin import register


def register_pcd_once() -> None:
    if "pcd" not in plugins_cli.commands:
        register()
