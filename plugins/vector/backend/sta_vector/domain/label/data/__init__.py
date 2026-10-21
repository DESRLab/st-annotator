from sta.domain.label.data import LabelElementDomain

from ....models.label.data import (
    LabelVector,
    LabelVectorBulkUpdate,
    LabelVectorCreate,
    LabelVectorPublic,
    LabelVectorUpdate,
)

element = LabelElementDomain(
    table_cls=LabelVector,
    filter_columns=frozenset({"id", "entity_id", "type", "gt_class_id", "last_edit_at"}),
    create_cls=LabelVectorCreate,
    public_cls=LabelVectorPublic,
    update_cls=LabelVectorUpdate,
    bulk_update_cls=LabelVectorBulkUpdate,
)
