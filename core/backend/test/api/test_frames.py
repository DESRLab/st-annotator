"""Response-shape tests for what the frame endpoints put on the wire.

``FramePublicWithParents`` is returned by three read endpoints and embeds a whole
task per row. ``sta.models.task.TaskPublicFlat`` keeps the recursive task subtree
out of that payload while the task endpoints keep serving it, so the split is a
public contract the frontend relies on and is pinned here.
"""

import pytest

from sta.api.root import build_api

pytestmark = pytest.mark.in_memory_db


def _schemas() -> dict:
    return build_api(frontend_url="http://localhost:5174").openapi()["components"]["schemas"]


def test_frame_payload_embeds_a_non_recursive_task():
    schemas = _schemas()

    assert {"task", "account", "source_group", "label_branch"} <= set(
        schemas["FramePublicWithParents"]["properties"],
    )

    task_ref = schemas["FramePublicWithParents"]["properties"]["task"]["$ref"]
    assert task_ref != "#/components/schemas/TaskPublic"

    embedded = schemas[task_ref.rsplit("/", 1)[-1]]["properties"]
    assert "children" not in embedded
    # Everything the frames grid and the editor read off an embedded task
    # survives, including the assigned accounts the editor derives ids from.
    assert {
        "id",
        "name",
        "description",
        "deadline",
        "project_id",
        "parent_id",
        "last_edit_at",
        "supervisors",
        "annotators",
    } <= set(embedded)
    assert embedded["supervisors"]["items"]["$ref"] == "#/components/schemas/AccountPublicSummary"
    assert embedded["annotators"]["items"]["$ref"] == "#/components/schemas/AccountPublicSummary"
    # An embedded account is a coworker's account as much as an embedded task
    # is, so both use the projection that has no `preferences` field.
    assert (
        schemas["FramePublicWithParents"]["properties"]["account"]["$ref"]
        == "#/components/schemas/AccountPublicSummary"
    )

    # The task endpoints still return the tree.
    assert "children" in schemas["TaskPublic"]["properties"]
    assert "children" in schemas["TaskPublicWithParents"]["properties"]
