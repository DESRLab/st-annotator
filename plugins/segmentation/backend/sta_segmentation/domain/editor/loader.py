from collections.abc import Sequence

from pydantic import BaseModel
from sqlmodel import Session

from sta.common.utils.json import JSONType
from sta.services.domain.editor.loader import DataLoader
from sta.services.domain.label.repo.branches import read_branch
from sta.services.domain.label.spec.objclass import selections as objclass_domain
from sta.services.models.frame import FramePublic
from sta.services.models.label.spec.objclass import ObjectClassSelectionPublic
from sta.services.models.user import UserPublic

from ..label.data import (
    LabelInstancePublic,
    LabelSelectionPublic,
    element as element_domain,
    entity as entity_domain,
)


class SegmentationData(BaseModel):
    instances: Sequence[LabelInstancePublic]
    selections: Sequence[LabelSelectionPublic]
    class_selection: ObjectClassSelectionPublic


class SegmentationLoader(DataLoader):

    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> SegmentationData:
        # TODO: Decode multiple frames from a single response
        if len(frames) != 1:
            msg = "Multiple frames not supported yet"
            raise NotImplementedError(msg)

        frame, = frames

        if frame.label_branch_id is None:
            msg = "No label branch defined by this frame"
            raise RuntimeError(msg)

        branch = read_branch(
            current_user=current_user,
            session=session,
            id=frame.label_branch_id,
        )

        entities = entity_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=branch.group_id,
            commit_hash=branch.head_hash,
        )

        elements = element_domain.list_datas_in_bounds(
            current_user=current_user,
            session=session,
            group_id=branch.group_id,
            commit_hash=branch.head_hash,
            st_bounds=frame.st_bounds,
        )

        class_selection = objclass_domain.read_spec_in_group(
            current_user=current_user,
            session=session,
            group_id=branch.group_id,
        )

        return SegmentationData(
            instances=entities,
            selections=elements,
            class_selection=class_selection,
        )
