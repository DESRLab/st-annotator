import uuid
from collections import defaultdict
from collections.abc import Sequence

from pydantic import AwareDatetime, BaseModel
from sqlmodel import Session

from sta.common.spatial import DecimalCoord3
from sta.common.utils.json import JSONType
from sta.domain.editor.loader import DataLoader
from sta.domain.label.repo.branches import read_branch
from sta.models.frame import FramePublic
from sta.models.user import UserPublic

from ...models.label.data import LabelVector, VectorType
from ..label.data import element as element_domain


class LabelVectorBulkPublic(BaseModel):
    id: uuid.UUID
    timestamp: AwareDatetime | None = None
    type: VectorType
    vertices: Sequence[DecimalCoord3]
    gt_class_id: int | None = None


class VectorData(BaseModel):
    frame_id: int
    branch_id: int
    head_hash: str
    vectors: Sequence[LabelVectorBulkPublic]


def _vector_to_bulk(vector: LabelVector) -> LabelVectorBulkPublic:
    return LabelVectorBulkPublic(
        id=vector.id,
        timestamp=vector.timestamp,
        type=vector.type,
        vertices=vector.vertices.coords,
        gt_class_id=vector.gt_class_id,
    )


class VectorLoader(DataLoader):
    data_model = VectorData

    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> Sequence[VectorData]:
        frames_by_branch: dict[int, list[FramePublic]] = defaultdict(list)
        for frame in frames:
            if frame.label_branch_id is None:
                msg = "No label branch defined by this frame"
                raise RuntimeError(msg)
            frames_by_branch[frame.label_branch_id].append(frame)

        payloads_by_frame: dict[int, VectorData] = {}
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
            for frame in branch_frames:
                payloads_by_frame[frame.id] = VectorData(
                    frame_id=frame.id,
                    branch_id=branch.id,
                    head_hash=branch.head_hash,
                    vectors=[
                        _vector_to_bulk(element)
                        for element in elements
                        if element.st_bounds.intersects(frame.st_bounds)
                    ],
                )

        return [payloads_by_frame[frame.id] for frame in frames]
