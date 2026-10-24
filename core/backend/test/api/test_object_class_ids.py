"""The ID inventories use the same scoped filters as the paginated grids."""

from types import SimpleNamespace

import pytest

from sta.api.label.spec.objclass import definitions, selections
from sta.domain.label.spec.objclass import (
    definitions as definitions_domain,
    selections as selections_domain,
)


@pytest.mark.parametrize(
    ("endpoint", "domain", "method", "extra"),
    [
        (definitions.list_objclass_ids, definitions_domain, "list_objclasses", {}),
        (
            selections.list_selection_ids,
            selections_domain,
            "list_specs",
            {"group_id": 3, "description_contains": "selected"},
        ),
    ],
)
def test_ids_keep_reader_scope_and_filters_without_pagination(
    monkeypatch: pytest.MonkeyPatch, endpoint, domain, method: str, extra: dict
):
    """Fetch all matching IDs with the authenticated reader and group scope intact."""
    calls = []

    def list_records(**kwargs):
        calls.append(kwargs)
        return [SimpleNamespace(id=7), SimpleNamespace(id=9)]

    monkeypatch.setattr(domain, method, list_records)
    reader = object()
    session = object()
    filters = '[{"columnId":"name","operator":"StartsWith","searchTerms":["c"]}]'
    query = {
        "id": None,
        "id_ge": 5,
        "id_le": 10,
        "name": None,
        "name_contains": "car",
        "filters": filters,
        **extra,
    }
    assert endpoint(current_user=reader, session=session, **query) == [7, 9]
    assert calls == [
        {"current_user": reader, "session": session, "offset": None, "limit": None, **query}
    ]
