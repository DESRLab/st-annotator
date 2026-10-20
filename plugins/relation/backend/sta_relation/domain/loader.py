"""Frame-local relation loading for visible label endpoints."""

import uuid
from collections.abc import Sequence

from pydantic import BaseModel
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from sta.common.database.execution import sql_column
from sta.common.utils.json import JSONType
from sta.domain.editor.loader import DataLoader
from sta.domain.label.data import endpoints as label_endpoints
from sta.domain.label.data.endpoints import LabelElementReference
from sta.domain.label.repo.branches import read_branch
from sta.models.frame import FramePublic
from sta.models.user import UserPublic

from .classes import selections
from .data import class_records, domain


class RelationClassBulkPublic(BaseModel):
    """Required display fields for active and historical relation classes."""

    id: int
    name: str
    color_rgb: int


class RelationPublic(BaseModel):
    id: uuid.UUID
    source: LabelElementReference
    target: LabelElementReference
    relation_class_id: int


class RelationData(BaseModel):
    frame_id: int
    branch_id: int
    head_hash: str
    relations: list[RelationPublic]
    classes: list[RelationClassBulkPublic]
    selectable_class_ids: list[int]


class RelationLoader(DataLoader):
    data_model = RelationData

    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> Sequence[RelationData]:
        payloads = []
        for frame in frames:
            if frame.label_branch_id is None:
                msg = "No label branch defined by this frame"
                raise RuntimeError(msg)
            branch_id = frame.label_branch_id
            branch = read_branch(current_user=current_user, session=session, id=branch_id)
            # Resolve only frame-local endpoint IDs, without loading their geometry.
            # Materialize them once so an empty frame never resolves relation history.
            endpoint_ids = {}
            for name, endpoint_domain in label_endpoints.ELEMENT_DOMAINS.items():
                endpoints = endpoint_domain.build_list_query_in_any_bounds(
                    current_user=current_user,
                    session=session,
                    group_id=branch.group_id,
                    commit_hash=branch.head_hash,
                    st_bounds=[frame.st_bounds],
                ).subquery()
                ids = session.exec(select(endpoints.c.id)).all()
                if ids:
                    endpoint_ids[name] = ids
            records = []
            if endpoint_ids:
                table = domain.table_cls
                filters = [
                    or_(
                        *(
                            and_(table.source_type == name, sql_column(table.source_id).in_(ids))
                            for name, ids in endpoint_ids.items()
                        )
                    ),
                    or_(
                        *(
                            and_(table.target_type == name, sql_column(table.target_id).in_(ids))
                            for name, ids in endpoint_ids.items()
                        )
                    ),
                ]
                query = domain.build_filtered_list_query(
                    current_user,
                    session,
                    group_id=branch.group_id,
                    commit_hash=branch.head_hash,
                    filters=filters,
                )
                records = session.exec(query).all()
            selection = selections.read_spec_in_group(
                current_user=current_user, session=session, group_id=branch.group_id
            )
            available = [] if selection is None else selection.relclasses
            classes = {item.id: item for item in [*class_records(session, records), *available]}
            relations = [
                RelationPublic(
                    id=item.id,
                    source=LabelElementReference(type=item.source_type, id=item.source_id),
                    target=LabelElementReference(type=item.target_type, id=item.target_id),
                    relation_class_id=item.relation_class_id,
                )
                for item in records
            ]
            classes_public = [
                RelationClassBulkPublic.model_validate(item, from_attributes=True)
                for item in classes.values()
            ]
            selectable = [item.id for item in available if item.id is not None]
            payloads.append(
                RelationData(
                    frame_id=frame.id,
                    branch_id=branch_id,
                    head_hash=branch.head_hash,
                    relations=relations,
                    classes=classes_public,
                    selectable_class_ids=selectable,
                )
            )
        return payloads
