"""Discovers and loads labeling plugins registered under the `sta.plugins` entry-point group."""

from sta.common.logging import get_logger

logger = get_logger()

_loaded_plugins: set[str] = set()


def load_plugins():
    from importlib.metadata import entry_points

    # Entry-point iteration order is not part of the importlib.metadata
    # contract and differs across Python/install versions. Plugin registration
    # order becomes FastAPI route/OpenAPI order, so normalize it before loading.
    discovered_plugins = sorted(
        entry_points(group="sta.plugins"),
        key=lambda plugin: plugin.value,
    )

    for plugin in discovered_plugins:
        if plugin.value in _loaded_plugins:
            continue

        logger.info("Loading plugin: %s", plugin.value)
        func = plugin.load()
        func()

        _loaded_plugins.add(plugin.value)
