"""TestClient tests for the bbox element/entity API handlers.

Only the list/read/summary routes are actually registered by the plugin router;
the create/update/delete/bulk handlers exist but their route decorators are
commented out in ``sta_bbox`` (label mutation is expected to go through the
label repository push API). Those dormant handlers are mounted on a test-only
router below so that their bodies are exercised end-to-end as well.
"""

import uuid
from decimal import Decimal
from http import HTTPStatus

from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlmodel import Session

import pytest

from sta.api.responses import SuccessResponse
from sta.api.root import build_api
from sta.config import AppConfig
from sta.domain.label.repo.branches import read_branch
from sta.domain.label.repo.graph import push_commits
from sta.domain.label.repo.ops import OperationRegistry
from sta.domain.users import create_user
from sta.models.label.repo import (
    LabelsetBranchPublic,
    LabelsetCommitInstruction,
)
from sta.models.label.spec import ObjectClassSelectionPublic
from sta.models.user import Role, UserCreate, UserPublic
from sta_bbox.api.label.data import element as element_api, entity as entity_api
from sta_bbox.domain.label.repo.ops.box import (
    AssignEntityParams,
    BoxOperationType,
    CreateParams as BoxCreateParams,
    register_box_ops,
)
from sta_bbox.domain.label.repo.ops.track import (
    CreateParams as TrackCreateParams,
    TrackOperationType,
    register_track_ops,
)
from sta_bbox.models.label.data import (
    BoxType,
    LabelBoxCreate,
    LabelBoxPublic,
    LabelTrackPublic,
    TruncDecimalCoord3,
    TruncDecimalSize3,
)

ONES = TruncDecimalCoord3.ones()
FAR_CENTER = TruncDecimalCoord3.from_tuple((Decimal("10"),) * 3)
SIZE = TruncDecimalSize3.from_tuple(ONES.to_tuple())


def _mutation_router() -> APIRouter:
    """Mounts the dormant bbox mutation handlers onto a test-only router."""
    router = APIRouter(prefix="/label/data/bbox")

    router.add_api_route(
        "/element/create",
        element_api.create_element,
        methods=["POST"],
        response_model=LabelBoxPublic,
    )
    router.add_api_route(
        "/element/bulk-create",
        element_api.bulk_create_elements,
        methods=["POST"],
        response_model=SuccessResponse,
    )
    router.add_api_route(
        "/element/bulk-update",
        element_api.bulk_update_elements,
        methods=["PUT"],
        response_model=SuccessResponse,
    )
    router.add_api_route(
        "/element/bulk-delete",
        element_api.bulk_delete_elements,
        methods=["DELETE"],
        response_model=SuccessResponse,
    )
    router.add_api_route(
        "/element/update/{id}",
        element_api.update_element,
        methods=["PUT"],
        response_model=LabelBoxPublic,
    )
    router.add_api_route(
        "/element/delete/{id}",
        element_api.delete_element,
        methods=["DELETE"],
        response_model=SuccessResponse,
    )

    router.add_api_route(
        "/entity/create",
        entity_api.create_entity,
        methods=["POST"],
        response_model=LabelTrackPublic,
    )
    router.add_api_route(
        "/entity/bulk-create",
        entity_api.bulk_create_entities,
        methods=["POST"],
        response_model=SuccessResponse,
    )
    router.add_api_route(
        "/entity/bulk-update",
        entity_api.bulk_update_entities,
        methods=["PUT"],
        response_model=SuccessResponse,
    )
    router.add_api_route(
        "/entity/bulk-delete",
        entity_api.bulk_delete_entities,
        methods=["DELETE"],
        response_model=SuccessResponse,
    )
    router.add_api_route(
        "/entity/update/{id}",
        entity_api.update_entity,
        methods=["PUT"],
        response_model=LabelTrackPublic,
    )
    router.add_api_route(
        "/entity/delete/{id}",
        entity_api.delete_entity,
        methods=["DELETE"],
        response_model=SuccessResponse,
    )

    return router


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/label/data/bbox/element/create"),
        ("POST", "/label/data/bbox/element/bulk-create"),
        ("PUT", "/label/data/bbox/element/bulk-update"),
        ("DELETE", "/label/data/bbox/element/bulk-delete"),
        ("PUT", "/label/data/bbox/element/update/00000000-0000-4000-8000-000000000001"),
        ("DELETE", "/label/data/bbox/element/delete/00000000-0000-4000-8000-000000000001"),
        ("POST", "/label/data/bbox/entity/create"),
        ("POST", "/label/data/bbox/entity/bulk-create"),
        ("PUT", "/label/data/bbox/entity/bulk-update"),
        ("DELETE", "/label/data/bbox/entity/bulk-delete"),
        ("PUT", "/label/data/bbox/entity/update/00000000-0000-4000-8000-000000000001"),
        ("DELETE", "/label/data/bbox/entity/delete/00000000-0000-4000-8000-000000000001"),
    ],
)
def test_production_api_does_not_register_direct_bbox_mutations(
    test_app_config: AppConfig,
    method: str,
    path: str,
):
    del test_app_config
    with TestClient(build_api(frontend_url="http://localhost:5174")) as production_client:
        response = production_client.request(method, path, json={})

    assert response.status_code in {HTTPStatus.NOT_FOUND, HTTPStatus.METHOD_NOT_ALLOWED}


@pytest.fixture
def client(test_app_config: AppConfig):
    _ = test_app_config  # Ensure the plugins (and their routes) are loaded

    app = build_api(frontend_url="http://localhost:5174")
    app.include_router(_mutation_router())

    with TestClient(app) as client:
        yield client


def _login(client: TestClient, *, username: str, password: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text

    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _seed_labels(
    session: Session,
    *,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    branch: LabelsetBranchPublic,
    objclass_id: int,
):
    """Pushes one track and two boxes (one assigned to the track)."""
    register_box_ops(op_registry)
    register_track_ops(op_registry)

    (track_id, near_box_id, far_box_id) = push_commits(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=TrackOperationType.CREATE,
                op_params=TrackCreateParams(gt_class_id=objclass_id),
            ),
            LabelsetCommitInstruction(
                op_name=BoxOperationType.CREATE,
                op_params=BoxCreateParams(
                    type=BoxType.CUBOID,
                    center=ONES,
                    angle=Decimal("2"),
                    size=SIZE,
                    perceived_class_id=objclass_id,
                ),
            ),
            LabelsetCommitInstruction(
                op_name=BoxOperationType.CREATE,
                op_params=BoxCreateParams(
                    type=BoxType.CUBOID,
                    center=FAR_CENTER,
                    angle=Decimal("0"),
                    size=SIZE,
                    perceived_class_id=objclass_id,
                ),
            ),
        ],
    )
    assert isinstance(track_id, uuid.UUID)
    assert isinstance(near_box_id, uuid.UUID)
    assert isinstance(far_box_id, uuid.UUID)

    push_commits(
        current_user=root_user,
        session=session,
        op_registry=op_registry,
        branch_id=branch.id,
        commit_instrs=[
            LabelsetCommitInstruction(
                op_name=BoxOperationType.ASSIGN_ENTITY,
                op_params=AssignEntityParams(
                    box_id=near_box_id,
                    entity_id=track_id,
                ),
            ),
        ],
    )

    session.commit()

    branch = LabelsetBranchPublic.model_validate(
        read_branch(
            current_user=root_user,
            session=session,
            id=branch.id,
        ),
    )

    return track_id, near_box_id, far_box_id, branch


def test_element_endpoints(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass_id = object_class_selection.objclasses[0].id
    track_id, near_box_id, far_box_id, branch = _seed_labels(
        session,
        root_user=root_user,
        op_registry=op_registry,
        branch=labelset_branch,
        objclass_id=objclass_id,
    )
    commit_params = {"group_id": branch.group_id, "commit_hash": branch.head_hash}
    headers = _login(client, username="admin", password="admin")

    # List
    response = client.get("/label/data/bbox/element/", params=commit_params, headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert {item["id"] for item in payload} == {str(near_box_id), str(far_box_id)}
    assert response.headers["Content-Range"] == "elements 0-2/2"

    # List with a spatial filter that only overlaps the far box
    response = client.get(
        "/label/data/bbox/element/",
        params={**commit_params, "min_x": 5, "min_y": 5, "min_z": 5},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()] == [str(far_box_id)]

    # Summary listing omits the geometry fields
    response = client.get("/label/data/bbox/element/summary", params=commit_params, headers=headers)
    assert response.status_code == 200, response.text
    summaries = response.json()
    assert {item["id"] for item in summaries} == {str(near_box_id), str(far_box_id)}
    assert "center_x" not in summaries[0]
    assert response.headers["Content-Range"] == "elements 0-2/2"

    # Read
    response = client.get(
        f"/label/data/bbox/element/{near_box_id}", params=commit_params, headers=headers
    )
    assert response.status_code == 200, response.text
    item = response.json()
    assert Decimal(str(item["center_x"])) == 1
    assert Decimal(str(item["angle"])) == 2
    assert item["type"] == BoxType.CUBOID.value
    assert item["entity_id"] == str(track_id)
    assert item["perceived_class_id"] == objclass_id

    # Read of an unknown or deleted id is a 404
    response = client.get(
        f"/label/data/bbox/element/{uuid.uuid4()}", params=commit_params, headers=headers
    )
    assert response.status_code == 404

    # BUG: The `ids` filter is unusable. The parameter is typed
    # `collections.abc.Set[...]`, which pydantic validates as a frozenset,
    # so any `ids` query value fails validation with 422.
    response = client.get(
        "/label/data/bbox/element/",
        params={**commit_params, "ids": [str(uuid.uuid4())]},
        headers=headers,
    )
    assert response.status_code == 422

    # Create
    new_box = LabelBoxCreate.from_bbox(
        center=TruncDecimalCoord3.from_tuple((Decimal("4"), Decimal("5"), Decimal("6"))),
        angle=Decimal("1"),
        size=SIZE,
        timestamp=None,
        group_id=branch.group_id,
        commit_hash=branch.head_hash,
        type=BoxType.CYLINDER,
    )
    response = client.post(
        "/label/data/bbox/element/create", json=new_box.model_dump(mode="json"), headers=headers
    )
    assert response.status_code == 200, response.text
    created_box_id = uuid.UUID(response.json()["id"])

    response = client.get("/label/data/bbox/element/", params=commit_params, headers=headers)
    assert response.status_code == 200, response.text
    assert len(response.json()) == 3

    # Update
    response = client.put(
        f"/label/data/bbox/element/update/{near_box_id}",
        params=commit_params,
        json={"angle": "5", "occlusion_lv": 2},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    response = client.get(
        f"/label/data/bbox/element/{near_box_id}", params=commit_params, headers=headers
    )
    assert response.status_code == 200, response.text
    item = response.json()
    assert Decimal(str(item["angle"])) == 5
    assert item["occlusion_lv"] == 2

    # Bulk update
    response = client.put(
        "/label/data/bbox/element/bulk-update",
        params=commit_params,
        json={"ids": [str(far_box_id)], "data": {"distinctive_lv": 1}},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    response = client.get(
        f"/label/data/bbox/element/{far_box_id}", params=commit_params, headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["distinctive_lv"] == 1

    # Bulk delete
    response = client.request(
        "DELETE",
        "/label/data/bbox/element/bulk-delete",
        params=commit_params,
        json=[str(created_box_id)],
        headers=headers,
    )
    assert response.status_code == 200, response.text

    response = client.get("/label/data/bbox/element/", params=commit_params, headers=headers)
    assert {item["id"] for item in response.json()} == {str(near_box_id), str(far_box_id)}

    # Delete
    response = client.request(
        "DELETE",
        f"/label/data/bbox/element/delete/{far_box_id}",
        params=commit_params,
        headers=headers,
    )
    assert response.status_code == 200, response.text

    response = client.get(
        f"/label/data/bbox/element/{far_box_id}", params=commit_params, headers=headers
    )
    assert response.status_code == 404


def test_entity_endpoints(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass_id = object_class_selection.objclasses[0].id
    track_id, _, _, branch = _seed_labels(
        session,
        root_user=root_user,
        op_registry=op_registry,
        branch=labelset_branch,
        objclass_id=objclass_id,
    )
    commit_params = {"group_id": branch.group_id, "commit_hash": branch.head_hash}
    headers = _login(client, username="admin", password="admin")

    # List
    response = client.get("/label/data/bbox/entity/", params=commit_params, headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert [item["id"] for item in payload] == [str(track_id)]
    assert payload[0]["gt_class_id"] == objclass_id
    assert response.headers["Content-Range"] == "entities 0-1/1"

    # Read
    response = client.get(
        f"/label/data/bbox/entity/{track_id}", params=commit_params, headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["id"] == str(track_id)

    response = client.get(
        f"/label/data/bbox/entity/{uuid.uuid4()}", params=commit_params, headers=headers
    )
    assert response.status_code == 404

    # Create
    response = client.post(
        "/label/data/bbox/entity/create",
        json={"group_id": branch.group_id, "commit_hash": branch.head_hash, "is_black": True},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    new_track_id = uuid.UUID(response.json()["id"])
    assert response.json()["is_black"] is True

    # Update
    response = client.put(
        f"/label/data/bbox/entity/update/{new_track_id}",
        params=commit_params,
        json={"is_black": False, "gt_class_id": objclass_id},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_black"] is False
    assert response.json()["gt_class_id"] == objclass_id

    # Bulk update
    response = client.put(
        "/label/data/bbox/entity/bulk-update",
        params=commit_params,
        json={"ids": [str(new_track_id)], "data": {"is_black": True}},
        headers=headers,
    )
    assert response.status_code == 200, response.text

    response = client.get(
        f"/label/data/bbox/entity/{new_track_id}", params=commit_params, headers=headers
    )
    assert response.json()["is_black"] is True

    # Bulk delete
    response = client.request(
        "DELETE",
        "/label/data/bbox/entity/bulk-delete",
        params=commit_params,
        json=[str(new_track_id)],
        headers=headers,
    )
    assert response.status_code == 200, response.text

    response = client.get("/label/data/bbox/entity/", params=commit_params, headers=headers)
    assert [item["id"] for item in response.json()] == [str(track_id)]


def test_auth_and_validation_errors(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass_id = object_class_selection.objclasses[0].id
    _, near_box_id, _, branch = _seed_labels(
        session,
        root_user=root_user,
        op_registry=op_registry,
        branch=labelset_branch,
        objclass_id=objclass_id,
    )
    commit_params = {"group_id": branch.group_id, "commit_hash": branch.head_hash}

    # Unauthenticated requests are rejected
    assert client.get("/label/data/bbox/element/", params=commit_params).status_code == 401

    # An annotator without the DATA_MANAGER role cannot write label data
    # and cannot see label groups they are not assigned to.
    create_user(
        current_user=root_user,
        session=session,
        data=UserCreate(
            username="bbox-test-annotator",
            password="password",
            roles={Role.ANNOTATOR},
        ),
    )
    session.commit()

    headers = _login(client, username="bbox-test-annotator", password="password")

    response = client.post(
        "/label/data/bbox/element/create",
        json=LabelBoxCreate.from_bbox(
            center=ONES,
            angle=Decimal("0"),
            size=SIZE,
            timestamp=None,
            group_id=branch.group_id,
            commit_hash=branch.head_hash,
            type=BoxType.CUBOID,
        ).model_dump(mode="json"),
        headers=headers,
    )
    assert response.status_code == 403

    response = client.post(
        "/label/data/bbox/entity/create",
        json={"group_id": branch.group_id, "commit_hash": branch.head_hash},
        headers=headers,
    )
    assert response.status_code == 403

    response = client.get("/label/data/bbox/element/", params=commit_params, headers=headers)
    assert response.status_code == 200
    assert response.json() == []

    response = client.get(
        f"/label/data/bbox/element/{near_box_id}", params=commit_params, headers=headers
    )
    assert response.status_code == 404

    # Validation errors
    headers = _login(client, username="admin", password="admin")

    response = client.get(
        "/label/data/bbox/element/not-a-uuid", params=commit_params, headers=headers
    )
    assert response.status_code == 422

    response = client.get(f"/label/data/bbox/element/{near_box_id}", headers=headers)
    assert response.status_code == 422  # Missing group_id / commit_hash


def test_element_mutations_reject_unknown_entity_id(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass_id = object_class_selection.objclasses[0].id
    track_id, near_box_id, far_box_id, branch = _seed_labels(
        session,
        root_user=root_user,
        op_registry=op_registry,
        branch=labelset_branch,
        objclass_id=objclass_id,
    )
    commit_params = {"group_id": branch.group_id, "commit_hash": branch.head_hash}
    headers = _login(client, username="admin", password="admin")
    dangling_id = uuid.uuid4()

    # Create with an unknown entity id
    new_box = LabelBoxCreate.from_bbox(
        center=ONES,
        angle=Decimal("0"),
        size=SIZE,
        timestamp=None,
        group_id=branch.group_id,
        commit_hash=branch.head_hash,
        type=BoxType.CUBOID,
        entity_id=dangling_id,
    )
    response = client.post(
        "/label/data/bbox/element/create",
        json=new_box.model_dump(mode="json"),
        headers=headers,
    )
    assert response.status_code == 404
    assert "parent entity" in response.json()["detail"]

    # Update to an unknown entity id
    response = client.put(
        f"/label/data/bbox/element/update/{near_box_id}",
        params=commit_params,
        json={"entity_id": str(dangling_id)},
        headers=headers,
    )
    assert response.status_code == 404
    assert "parent entity" in response.json()["detail"]

    # Bulk update to an unknown entity id
    response = client.put(
        "/label/data/bbox/element/bulk-update",
        params=commit_params,
        json={"ids": [str(far_box_id)], "data": {"entity_id": str(dangling_id)}},
        headers=headers,
    )
    assert response.status_code == 404
    assert "parent entities" in response.json()["detail"]

    # All three rejected writes must leave the state untouched.
    response = client.get("/label/data/bbox/element/", params=commit_params, headers=headers)
    assert response.status_code == 200, response.text
    items = {item["id"]: item for item in response.json()}
    assert set(items) == {str(near_box_id), str(far_box_id)}
    assert items[str(near_box_id)]["entity_id"] == str(track_id)
    assert items[str(far_box_id)]["entity_id"] is None


def test_element_bulk_create_rejects_unknown_entity_id(
    client: TestClient,
    session: Session,
    root_user: UserPublic,
    op_registry: OperationRegistry,
    labelset_branch: LabelsetBranchPublic,
    object_class_selection: ObjectClassSelectionPublic,
):
    objclass_id = object_class_selection.objclasses[0].id
    track_id, near_box_id, far_box_id, branch = _seed_labels(
        session,
        root_user=root_user,
        op_registry=op_registry,
        branch=labelset_branch,
        objclass_id=objclass_id,
    )
    commit_params = {"group_id": branch.group_id, "commit_hash": branch.head_hash}
    headers = _login(client, username="admin", password="admin")

    def box_body(**rest) -> dict:
        return LabelBoxCreate.from_bbox(
            center=ONES,
            angle=Decimal("0"),
            size=SIZE,
            timestamp=None,
            group_id=branch.group_id,
            commit_hash=branch.head_hash,
            type=BoxType.CUBOID,
            **rest,
        ).model_dump(mode="json")

    # A batch containing a single dangling entity_id is rejected as a whole.
    response = client.post(
        "/label/data/bbox/element/bulk-create",
        json=[box_body(entity_id=track_id), box_body(entity_id=uuid.uuid4())],
        headers=headers,
    )
    assert response.status_code == 404
    assert "parent entities" in response.json()["detail"]

    response = client.get("/label/data/bbox/element/", params=commit_params, headers=headers)
    assert response.status_code == 200, response.text
    assert {item["id"] for item in response.json()} == {str(near_box_id), str(far_box_id)}
