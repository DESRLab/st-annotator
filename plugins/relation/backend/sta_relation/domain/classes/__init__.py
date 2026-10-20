from sta_relation.domain.classes.selections import RelationClassSelectionDomain
from sta_relation.models.classes import (
    RelationClassSelection,
    RelationClassSelectionBulkUpdate,
    RelationClassSelectionCreate,
    RelationClassSelectionPublic,
    RelationClassSelectionUpdate,
)

selections = RelationClassSelectionDomain(
    table_cls=RelationClassSelection,
    create_cls=RelationClassSelectionCreate,
    public_cls=RelationClassSelectionPublic,
    update_cls=RelationClassSelectionUpdate,
    bulk_update_cls=RelationClassSelectionBulkUpdate,
)
