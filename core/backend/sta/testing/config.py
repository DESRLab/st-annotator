import threading
from dataclasses import dataclass

import pytest

from sta.common.database import DatabaseConfig, InMemoryDatabaseConfig, PostGISDatabaseConfig
from sta.config import AppConfig
from sta.entrypoints import test_app_ctx as make_test_app_ctx
from sta.models.user import UserPublic


@dataclass(frozen=True)
class TestApp:
    config: AppConfig
    root_user: UserPublic


@pytest.fixture
def test_db_config(request: pytest.FixtureRequest) -> DatabaseConfig:
    """
    The database the test application boots against.

    Defaults to a per-thread PostGIS database. A module that needs neither
    spatial columns nor plugin routes can opt into a lightweight in-memory
    SQLite database (skipping the per-test PostGIS drop/recreate entirely)
    by marking itself: ``pytestmark = pytest.mark.in_memory_db``.
    """
    if request.node.get_closest_marker("in_memory_db") is not None:
        return InMemoryDatabaseConfig()

    pid = threading.get_ident()
    return PostGISDatabaseConfig.from_env(db_suffix=f"_test_pid_{pid}")


@pytest.fixture
def test_app(test_db_config: DatabaseConfig, request: pytest.FixtureRequest):
    """
    The application under test, and the root user its requests authenticate as.

    Plugin entry points are loaded unless the module opts out with
    ``pytestmark = pytest.mark.no_plugins``. Core's own suite does so where it wants
    to assert that a behaviour does not depend on a plugin being installed; a plugin
    suite must not, because its API tests only have routes once ``register()`` has
    attached them.
    """
    app_config = AppConfig.test(db_config=test_db_config)
    with_plugins = request.node.get_closest_marker("no_plugins") is None
    with make_test_app_ctx(app_config, with_plugins=with_plugins) as root_user:
        yield TestApp(config=app_config, root_user=root_user)


@pytest.fixture
def test_app_config(test_app: TestApp) -> AppConfig:
    return test_app.config
