from collections.abc import Set

from sqlmodel import Session, select

from sta.services.domain.source.spec.base import SourceSpecDomain
from sta.services.models.user import UserPublic

from ....models.source.spec import (
    PointCloudSpec,
    PointCloudSpecBulkUpdate,
    PointCloudSpecCreate,
    PointCloudSpecPublic,
    PointCloudSpecUpdate,
)
from ..data import metadata as metadata_domain
from ..data.data import touch_st_bounds


class PointCloudSpecDomain(
    SourceSpecDomain[
        PointCloudSpec,
        PointCloudSpecCreate,
        PointCloudSpecPublic,
        PointCloudSpecUpdate,
        PointCloudSpecBulkUpdate,
    ],
):
    def __init__(self) -> None:
        super().__init__(
            table_cls=PointCloudSpec,
            create_cls=PointCloudSpecCreate,
            public_cls=PointCloudSpecPublic,
            update_cls=PointCloudSpecUpdate,
            bulk_update_cls=PointCloudSpecBulkUpdate,
        )

    def _touch_group_metadatas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_ids: Set[int],
    ) -> None:
        for group_id in group_ids:
            for metadata in metadata_domain.list_datas(
                current_user=current_user,
                session=session,
                group_id=group_id,
            ):
                touch_st_bounds(current_user, session, metadata)

    def create_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: PointCloudSpecCreate,
    ):
        record = super().create_spec(
            current_user=current_user,
            session=session,
            data=data,
        )

        self._touch_group_metadatas(
            current_user=current_user,
            session=session,
            group_ids={group.id for group in record.groups},
        )

        return record

    def update_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
        data: PointCloudSpecUpdate,
    ):
        # Circumvent request parsing issue
        if data.description is None:
            data.description = ""

        record = super().update_spec(
            current_user=current_user,
            session=session,
            id=id,
            data=data,
        )

        self._touch_group_metadatas(
            current_user=current_user,
            session=session,
            group_ids={group.id for group in record.groups},
        )

        return record

    def bulk_update_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: PointCloudSpecBulkUpdate,
    ):
        super().bulk_update_specs(
            current_user=current_user,
            session=session,
            ids=ids,
            data=data,
        )

        specs_cls = self.table_cls
        groups_cls = self.table_cls.get_group_links_cls()

        group_ids = session.exec(
            select(groups_cls.group_id).distinct()
            .join(specs_cls, groups_cls.spec_id)
            .filter(groups_cls.spec_id.in_(ids)),
        ).all()

        self._touch_group_metadatas(
            current_user=current_user,
            session=session,
            group_ids=set(group_ids),
        )
