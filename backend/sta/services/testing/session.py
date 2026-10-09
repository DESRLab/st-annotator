import pytest

from sta.services.config import AppConfig
from sta.services.session import session_ctx


@pytest.fixture
def session(app_config: AppConfig):
    with session_ctx(app_config) as session:
        yield session
