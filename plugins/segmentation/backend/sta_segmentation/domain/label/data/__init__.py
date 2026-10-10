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
    create_cls=LabelInstanceCreate,
    public_cls=LabelInstancePublic,
    update_cls=LabelInstanceUpdate,
    bulk_update_cls=LabelInstanceBulkUpdate,
)

element = LabelElementDomain(
    table_cls=LabelSelection,
    create_cls=LabelSelectionCreate,
    public_cls=LabelSelectionPublic,
    update_cls=LabelSelectionUpdate,
    bulk_update_cls=LabelSelectionBulkUpdate,
    entity_domain=entity,
)
