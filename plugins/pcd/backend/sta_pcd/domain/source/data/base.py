from collections.abc import Set

from sqlmodel import Session

from sta.services.domain.source.data import SourceMetadataDomain
from sta.services.models.user import UserPublic

from ....models.source.data import (
    PointCloudMetadata,
    PointCloudMetadataBulkUpdate,
    PointCloudMetadataCreate,
    PointCloudMetadataPublic,
    PointCloudMetadataUpdate,
)
from .data import touch_st_bounds


class PointCloudMetadataDomain(
    SourceMetadataDomain[
        PointCloudMetadata,
        PointCloudMetadataCreate,
        PointCloudMetadataPublic,
        PointCloudMetadataUpdate,
        PointCloudMetadataBulkUpdate,
    ],
):
    def __init__(self) -> None:
        super().__init__(
            table_cls=PointCloudMetadata,
            create_cls=PointCloudMetadataCreate,
            public_cls=PointCloudMetadataPublic,
            update_cls=PointCloudMetadataUpdate,
            bulk_update_cls=PointCloudMetadataBulkUpdate,
        )

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: PointCloudMetadataCreate,
    ):
        record = super().create_data(
            current_user=current_user,
            session=session,
            data=data,
        )

        return touch_st_bounds(current_user, session, record)

    def update_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
        data: PointCloudMetadataUpdate,
    ):
        record = super().update_data(
            current_user=current_user,
            session=session,
            id=id,
            data=data,
        )

        return touch_st_bounds(current_user, session, record)

    def bulk_create_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: list[PointCloudMetadataCreate],
    ) -> list[int]:
        ids = super().bulk_create_datas(
            current_user=current_user,
            session=session,
            data=data,
        )

        for record in self.list_datas(
            current_user=current_user,
            session=session,
            ids=set(ids),
        ):
            touch_st_bounds(current_user, session, record)

        return ids

    def bulk_update_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: PointCloudMetadataBulkUpdate,
    ):
        super().bulk_update_datas(
            current_user=current_user,
            session=session,
            ids=ids,
            data=data,
        )

        for record in self.list_datas(
            current_user=current_user,
            session=session,
            ids=ids,
        ):
            touch_st_bounds(current_user, session, record)
