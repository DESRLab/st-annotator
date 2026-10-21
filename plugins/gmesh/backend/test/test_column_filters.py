"""Metadata pages, counts and matching IDs share column filters."""

from unittest.mock import Mock

from fastapi import Response

from sta.domain.querying import Pagination
from sta_gmesh.api.source.data import metadata


def test_metadata_api_forwards_filters_to_page_count_and_ids(monkeypatch):
    listing = Mock(return_value=[])
    count = Mock(return_value=2)
    ids = Mock(return_value=[3, 8])
    monkeypatch.setattr(metadata.domain, "list_datas", listing)
    monkeypatch.setattr(metadata.domain, "count_datas", count)
    monkeypatch.setattr(metadata.domain, "list_data_ids", ids)
    filters = '[{"columnId":"uri","operator":"StartsWith","searchTerms":["scans/"]}]'
    args = dict(current_user=Mock(), session=Mock(), group_id=7, filters=filters)
    response = Response()
    assert metadata.list_metadatas(response, pagination=Pagination(limit=25), **args) == []
    assert response.headers["content-range"] == "metadatas 0-0/2"
    assert metadata.list_metadata_ids(**args) == [3, 8]
    for read in [listing, count, ids]:
        assert read.call_args.kwargs["filters"] == filters
        assert read.call_args.kwargs["group_id"] == 7


def test_plugin_registers_metadata_uri_filters():
    user = Mock()
    user.has_role.return_value = True
    query = metadata.domain.build_list_query(
        user,
        Mock(),
        offset=25,
        limit=25,
        group_id=7,
        filters='[{"columnId":"uri","operator":"StartsWith","searchTerms":["scans"]}]',
    )
    compiled = query.compile()
    assert "LIKE" in str(compiled)
    assert "scans" in compiled.params.values()
