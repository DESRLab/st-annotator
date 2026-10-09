from sta.common.logging import get_logger

logger = get_logger()


def load_plugins():
    from importlib.metadata import entry_points

    discovered_plugins = entry_points(group='sta.plugins')

    for plugin in discovered_plugins:
        logger.info("Loading plugin: %s", plugin.value)
        func = plugin.load()
        func()
