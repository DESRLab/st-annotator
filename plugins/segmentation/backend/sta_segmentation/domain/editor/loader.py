import uuid
from collections import defaultdict
from collections.abc import Sequence

from pydantic import AwareDatetime, BaseModel
from sqlmodel import Session

from sta.common.utils.json import JSONType
from sta.domain.editor.loader import DataLoader
from sta.domain.label.repo.branches import read_branch
from sta.models.frame import FramePublic
from sta.models.types import QualityRank
from sta.models.user import UserPublic

from ...filesystem import GeomConverters
from ...models.label.data import (
    DistinctiveLevel,
    LabelInstance,
    LabelSelection,
    OcclusionLevel,
)
from ..label.data import (
    element as element_domain,
    entity as entity_domain,
)


class LabelInstanceBulkPublic(BaseModel):
    id: uuid.UUID
    is_black: bool = False
    gt_class_id: int | None = None


class LabelSelectionBulkPublic(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID | None = None
    timestamp: AwareDatetime | None = None
    points: Sequence[float]
    quality_rank: QualityRank | None = None
    distinctive_lv: DistinctiveLevel | None = None
    occlusion_lv: OcclusionLevel | None = None
    perceived_class_id: int | None = None


class SegmentationData(BaseModel):
    frame_id: int
    branch_id: int
    head_hash: str
    instances: Sequence[LabelInstanceBulkPublic]
    selections: Sequence[LabelSelectionBulkPublic]


def _instance_to_bulk(instance: LabelInstance) -> LabelInstanceBulkPublic:
    return LabelInstanceBulkPublic(
        id=instance.id,
        is_black=instance.is_black,
        gt_class_id=instance.gt_class_id,
    )


def _selection_to_bulk(
    selection: LabelSelection,
) -> LabelSelectionBulkPublic:
    points = GeomConverters.flat_float_coords_from_wkb(
        selection.selection.desc,
        include_z=selection.include_z,
    )
    return LabelSelectionBulkPublic(
        id=selection.id,
        entity_id=selection.entity_id,
        timestamp=selection.timestamp,
        points=points,
        quality_rank=selection.quality_rank,
        distinctive_lv=selection.distinctive_lv,
        occlusion_lv=selection.occlusion_lv,
        perceived_class_id=selection.perceived_class_id,
    )


class SegmentationLoader(DataLoader):
    data_model = SegmentationData

    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> Sequence[SegmentationData]:
        frames_by_branch: dict[int, list[FramePublic]] = defaultdict(list)
        for frame in frames:
            if frame.label_branch_id is None:
                msg = "No label branch defined by this frame"
                raise RuntimeError(msg)
            frames_by_branch[frame.label_branch_id].append(frame)

        payloads_by_frame: dict[int, SegmentationData] = {}
        for branch_id, branch_frames in frames_by_branch.items():
            branch = read_branch(current_user=current_user, session=session, id=branch_id)
            assert branch.id is not None
            elements = element_domain.list_datas_in_any_bounds(
                current_user=current_user,
                session=session,
                group_id=branch.group_id,
                commit_hash=branch.head_hash,
                st_bounds=[frame.st_bounds for frame in branch_frames],
            )
            entity_ids = {
                element.entity_id for element in elements if element.entity_id is not None
            }
            entities = entity_domain.list_datas_for_element_window(
                current_user=current_user,
                session=session,
                group_id=branch.group_id,
                commit_hash=branch.head_hash,
                referenced_ids=entity_ids,
            )
            for frame in branch_frames:
                frame_elements = [
                    element for element in elements if element.st_bounds.intersects(frame.st_bounds)
                ]
                frame_entity_ids = {
                    element.entity_id for element in frame_elements if element.entity_id is not None
                }
                frame_entity_ids.update(
                    entity.id for entity in entities if not entity_domain.has_children(entity)
                )
                bulk_selections = [_selection_to_bulk(element) for element in frame_elements]
                bulk_entities = [
                    _instance_to_bulk(entity)
                    for entity in entities
                    if entity.id in frame_entity_ids
                ]
                payloads_by_frame[frame.id] = SegmentationData(
                    frame_id=frame.id,
                    branch_id=branch.id,
                    head_hash=branch.head_hash,
                    instances=bulk_entities,
                    selections=bulk_selections,
                )
        return [payloads_by_frame[frame.id] for frame in frames]
