from sqlalchemy import UniqueConstraint

from sta.services.api.root import _find_table_constraint
from sta.services.models.source.data.base import SourceMetadataSQLModel


def test_find_table_constraint_matches_postgresql_default_unique_name():
    table_cls = SourceMetadataSQLModel.get_table_cls('test_pcd_constraint_lookup')
    table = table_cls.__table__

    constraint = _find_table_constraint(
        table,
        'test_pcd_constraint_lookup_uri_group_id_key',
    )

    assert isinstance(constraint, UniqueConstraint)
    assert list(constraint.columns.keys()) == ['uri', 'group_id']
