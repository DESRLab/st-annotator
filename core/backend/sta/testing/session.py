import pytest

from sta.config import AppConfig
from sta.session import session_ctx


@pytest.fixture
def session(test_app_config: AppConfig):
    with session_ctx(test_app_config) as session:
        yield session
