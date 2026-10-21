from sta.domain.label.data import LabelElementDomain, LabelEntityDomain

from ....models.label.data import (
    LabelInstance,
    LabelInstanceBulkUpdate,
    LabelInstanceCreate,
    LabelInstancePublic,
    LabelInstanceUpdate,
    LabelSelection,
    LabelSelectionBulkUpdate,
    LabelSelectionCreate,
    LabelSelectionPublic,
    LabelSelectionUpdate,
)

entity = LabelEntityDomain(
    table_cls=LabelInstance,
    filter_columns=frozenset({"id", "gt_class_id", "is_black", "last_edit_at"}),
    create_cls=LabelInstanceCreate,
    public_cls=LabelInstancePublic,
    update_cls=LabelInstanceUpdate,
    bulk_update_cls=LabelInstanceBulkUpdate,
)

element = LabelElementDomain(
    table_cls=LabelSelection,
    filter_columns=frozenset(
        {"id", "entity_id", "quality_rank", "distinctive_lv", "occlusion_lv", "last_edit_at"}
    ),
    create_cls=LabelSelectionCreate,
    public_cls=LabelSelectionPublic,
    update_cls=LabelSelectionUpdate,
    bulk_update_cls=LabelSelectionBulkUpdate,
    entity_domain=entity,
)
