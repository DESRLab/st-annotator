"""API coverage for filtering object-class selections by label group."""

from fastapi import Response

import pytest

from sta.api.label.spec.objclass.selections import list_selections
from sta.domain.label.spec.objclass import selections as domain
from sta.domain.querying import Pagination, Sorting


def test_list_selections_filters_by_group(monkeypatch: pytest.MonkeyPatch) -> None:
    """Apply the group filter to both the page and its total count."""
    selection = {
        "id": 7,
        "name": "selection",
        "description": "",
        "groups": [{"id": 3, "name": "labels", "description": ""}],
        "objclasses": [{"id": 9, "name": "car", "description": "", "color_rgb": 16711680}],
    }
    page_filters: list[int | None] = []
    count_filters: list[int | None] = []

    def list_specs(*, group_id: int | None, **_kwargs):
        page_filters.append(group_id)
        return [selection] if group_id == 3 else []

    def count_specs(*, group_id: int | None, **_kwargs):
        count_filters.append(group_id)
        return 1 if group_id == 3 else 0

    monkeypatch.setattr(domain, "list_specs", list_specs)
    monkeypatch.setattr(domain, "count_specs", count_specs)

    def list_for_group(group_id: int):
        return list_selections(
            response=Response(),
            current_user=object(),
            session=None,
            pagination=Pagination(),
            sorting=Sorting(),
            id=None,
            id_ge=None,
            id_le=None,
            group_id=group_id,
            name=None,
            name_contains=None,
            description_contains=None,
        )

    assert list_for_group(3) == [selection]
    assert list_for_group(4) == []
    assert page_filters == [3, 4]
    assert count_filters == [3, 4]
