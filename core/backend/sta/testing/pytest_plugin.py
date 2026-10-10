import pytest

pytest.register_assert_rewrite("sta.testing")

from .pytest_fixtures import *  # noqa: E402
