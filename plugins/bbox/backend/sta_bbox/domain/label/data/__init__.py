from sta.domain.label.data import LabelElementDomain, LabelEntityDomain

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

entity = LabelEntityDomain(
    table_cls=LabelTrack,
    filter_columns=frozenset({"id", "gt_class_id", "is_black", "last_edit_at"}),
    create_cls=LabelTrackCreate,
    public_cls=LabelTrackPublic,
    update_cls=LabelTrackUpdate,
    bulk_update_cls=LabelTrackBulkUpdate,
)

element = LabelElementDomain(
    table_cls=LabelBox,
    filter_columns=frozenset(
        {
            "id",
            "entity_id",
            "type",
            "perceived_class_id",
            "quality_rank",
            "distinctive_lv",
            "occlusion_lv",
            "last_edit_at",
        }
    ),
    create_cls=LabelBoxCreate,
    public_cls=LabelBoxPublic,
    update_cls=LabelBoxUpdate,
    bulk_update_cls=LabelBoxBulkUpdate,
    entity_domain=entity,
)
