import uuid
from http import HTTPStatus

from fastapi.testclient import TestClient

from sta.api.root import build_api
from sta.testing.config import TestApp


def test_committed_segmentation_data_has_no_direct_write_routes(test_app: TestApp):
    client = TestClient(build_api(frontend_url="http://localhost:5174"))
    paths = (
        "/label/data/segmentation/element/",
        "/label/data/segmentation/element/bulk",
        "/label/data/segmentation/entity/",
        "/label/data/segmentation/entity/bulk",
        f"/label/data/segmentation/element/{uuid.uuid4()}",
        f"/label/data/segmentation/entity/{uuid.uuid4()}",
    )

    for path in paths:
        assert client.post(path, json={}).status_code == HTTPStatus.METHOD_NOT_ALLOWED

    for path in paths:
        assert client.patch(path, json={}).status_code == HTTPStatus.METHOD_NOT_ALLOWED
        assert client.put(path, json={}).status_code == HTTPStatus.METHOD_NOT_ALLOWED
        assert client.delete(path).status_code == HTTPStatus.METHOD_NOT_ALLOWED


def test_segmentation_read_routes_remain_available(test_app: TestApp):
    client = TestClient(build_api(frontend_url="http://localhost:5174"))

    # Authentication is evaluated by the registered GET handlers. A removed
    # route would return 404/405 instead.
    for path in (
        "/label/data/segmentation/element/",
        "/label/data/segmentation/entity/",
    ):
        assert client.get(path).status_code == HTTPStatus.UNAUTHORIZED
