import uuid
from collections import defaultdict
from collections.abc import Sequence

from pydantic import AwareDatetime, BaseModel
from sqlmodel import Session

from sta.common.spatial import DecimalCoord, DecimalCoord3, DecimalSize3
from sta.common.utils.json import JSONType
from sta.domain.editor.loader import DataLoader
from sta.domain.label.repo.branches import read_branch
from sta.models.frame import FramePublic
from sta.models.types import QualityRank
from sta.models.user import UserPublic

from ...models.label.data import BoxType, DistinctiveLevel, LabelBox, LabelTrack, OcclusionLevel
from ..label.data import (
    element as element_domain,
    entity as entity_domain,
)


class LabelTrackBulkPublic(BaseModel):
    id: uuid.UUID
    is_black: bool = False
    gt_class_id: int | None = None


class LabelBoxBulkPublic(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID | None = None
    timestamp: AwareDatetime | None = None
    type: BoxType
    center: DecimalCoord3
    angle: DecimalCoord
    size: DecimalSize3
    quality_rank: QualityRank | None = None
    distinctive_lv: DistinctiveLevel | None = None
    occlusion_lv: OcclusionLevel | None = None
    perceived_class_id: int | None = None


class BBoxData(BaseModel):
    frame_id: int
    branch_id: int
    head_hash: str
    tracks: Sequence[LabelTrackBulkPublic]
    boxes: Sequence[LabelBoxBulkPublic]


def _track_to_bulk(track: LabelTrack) -> LabelTrackBulkPublic:
    return LabelTrackBulkPublic(
        id=track.id,
        is_black=track.is_black,
        gt_class_id=track.gt_class_id,
    )


def _box_to_bulk(box: LabelBox) -> LabelBoxBulkPublic:
    return LabelBoxBulkPublic(
        id=box.id,
        entity_id=box.entity_id,
        timestamp=box.timestamp,
        type=box.type,
        center=box.center,
        angle=box.angle,
        size=box.size,
        quality_rank=box.quality_rank,
        distinctive_lv=box.distinctive_lv,
        occlusion_lv=box.occlusion_lv,
        perceived_class_id=box.perceived_class_id,
    )


class BBoxLoader(DataLoader):
    data_model = BBoxData

    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> Sequence[BBoxData]:
        frames_by_branch: dict[int, list[FramePublic]] = defaultdict(list)
        for frame in frames:
            if frame.label_branch_id is None:
                msg = "No label branch defined by this frame"
                raise RuntimeError(msg)
            frames_by_branch[frame.label_branch_id].append(frame)

        payloads_by_frame: dict[int, BBoxData] = {}
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
                payloads_by_frame[frame.id] = BBoxData(
                    frame_id=frame.id,
                    branch_id=branch.id,
                    head_hash=branch.head_hash,
                    tracks=[
                        _track_to_bulk(entity)
                        for entity in entities
                        if entity.id in frame_entity_ids
                    ],
                    boxes=[_box_to_bulk(element) for element in frame_elements],
                )

        return [payloads_by_frame[frame.id] for frame in frames]
