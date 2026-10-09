

import pytest

from sta.services.config import AppConfig
from sta.services.session import tmp_db_ctx


@pytest.fixture
def root_user(app_config: AppConfig):
    with tmp_db_ctx(app_config) as user:
        yield user
