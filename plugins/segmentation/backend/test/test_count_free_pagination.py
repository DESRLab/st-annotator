"""A bounded label page can omit the expensive snapshot total."""

from unittest.mock import Mock

from fastapi import Response
from sqlmodel import select

import pytest

from sta.domain.querying import Pagination
from sta_segmentation.api.label.data import element, entity


@pytest.mark.parametrize(
    "module, endpoint",
    [(element, "list_elements"), (element, "list_element_summaries"), (entity, "list_entities")],
)
@pytest.mark.parametrize("include_total", [True, False])
def test_optional_count(monkeypatch, module, endpoint, include_total):
    listing = Mock(return_value=[])
    monkeypatch.setattr(module.domain, "list_datas", listing)
    count = Mock(return_value=123)
    monkeypatch.setattr(module.domain, "count_datas", count)
    if endpoint == "list_element_summaries":
        listing = Mock(return_value=select(module.LabelSelection))
        monkeypatch.setattr(module, "_query_elements", listing)
    session = Mock()
    session.exec.return_value.all.return_value = []
    response = Response()
    assert (
        getattr(module, endpoint)(
            response,
            current_user=Mock(),
            session=session,
            pagination=Pagination(offset=25, limit=26),
            group_id=7,
            commit_hash="head",
            include_total=include_total,
            filters='[{"columnId":"id","searchTerms":["abc"]}]',
        )
        == []
    )
    assert (
        response.headers["content-range"]
        == f"{'entities' if endpoint == 'list_entities' else 'elements'} 25-25/{123 if include_total else '*'}"
    )
    assert count.call_count == int(include_total)

    assert listing.call_args.kwargs["filters"] == '[{"columnId":"id","searchTerms":["abc"]}]'
    if include_total:
        assert count.call_args.kwargs["filters"] == listing.call_args.kwargs["filters"]


@pytest.mark.parametrize("module,column", [(element, "quality_rank"), (entity, "gt_class_id")])
def test_plugin_filters_reach_the_snapshot_query(module, column):
    import json

    user = Mock()
    user.has_role.return_value = True
    query = module.domain.build_list_query(
        user,
        Mock(),
        group_id=7,
        commit_hash="head",
        offset=25,
        limit=26,
        filters=json.dumps([{"columnId": column, "searchTerms": [2]}]),
    )
    compiled = query.compile()
    assert f"{column} IN" in str(compiled)
    assert [2] in compiled.params.values()
