import pytest

from sta.services.config import AppConfig


@pytest.fixture
def app_config():
    return AppConfig.test()
