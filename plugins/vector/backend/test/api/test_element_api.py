import uuid
from http import HTTPStatus

from fastapi.testclient import TestClient

from sta.api.root import build_api
from sta.testing.config import TestApp

PREFIX = "/label/data/vector/element"


def test_committed_vector_data_has_no_direct_write_routes(test_app: TestApp):
    client = TestClient(build_api(frontend_url="http://localhost:5174"))
    paths = (f"{PREFIX}/", f"{PREFIX}/bulk", f"{PREFIX}/{uuid.uuid4()}")

    for path in paths:
        assert client.post(path, json={}).status_code == HTTPStatus.METHOD_NOT_ALLOWED
        assert client.patch(path, json={}).status_code == HTTPStatus.METHOD_NOT_ALLOWED
        assert client.put(path, json={}).status_code == HTTPStatus.METHOD_NOT_ALLOWED
        assert client.delete(path).status_code == HTTPStatus.METHOD_NOT_ALLOWED


def test_vector_read_routes_remain_available(test_app: TestApp):
    client = TestClient(build_api(frontend_url="http://localhost:5174"))

    assert client.get(f"{PREFIX}/").status_code == HTTPStatus.UNAUTHORIZED
    assert client.get(f"{PREFIX}/{uuid.uuid4()}").status_code == HTTPStatus.UNAUTHORIZED
