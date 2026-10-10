from .....models.label.spec import (
    ObjectClassSelection,
    ObjectClassSelectionBulkUpdate,
    ObjectClassSelectionCreate,
    ObjectClassSelectionPublic,
    ObjectClassSelectionUpdate,
)
from .selections import ObjectClassSelectionDomain

selections = ObjectClassSelectionDomain(
    table_cls=ObjectClassSelection,
    create_cls=ObjectClassSelectionCreate,
    public_cls=ObjectClassSelectionPublic,
    update_cls=ObjectClassSelectionUpdate,
    bulk_update_cls=ObjectClassSelectionBulkUpdate,
)
