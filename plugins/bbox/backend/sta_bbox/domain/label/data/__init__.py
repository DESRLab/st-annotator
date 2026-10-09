from sta.services.domain.label.data import LabelElementDomain, LabelEntityDomain

from ....models.label.data import (
    LabelBox,
    LabelBoxBulkUpdate,
    LabelBoxCreate,
    LabelBoxPublic,
    LabelBoxUpdate,
    LabelTrack,
    LabelTrackBulkUpdate,
    LabelTrackCreate,
    LabelTrackPublic,
    LabelTrackUpdate,
)

element = LabelElementDomain(
    table_cls=LabelBox,
    create_cls=LabelBoxCreate,
    public_cls=LabelBoxPublic,
    update_cls=LabelBoxUpdate,
    bulk_update_cls=LabelBoxBulkUpdate,
)

entity = LabelEntityDomain(
    table_cls=LabelTrack,
    create_cls=LabelTrackCreate,
    public_cls=LabelTrackPublic,
    update_cls=LabelTrackUpdate,
    bulk_update_cls=LabelTrackBulkUpdate,
)
