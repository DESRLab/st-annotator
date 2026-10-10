import pytest

from sta.models.user import UserPublic
from sta.testing.config import TestApp


@pytest.fixture
def root_user(test_app: TestApp) -> UserPublic:
    return test_app.root_user
