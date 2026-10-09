from collections.abc import Set

from sqlmodel import Session

from sta.services.domain.source.data import SourceMetadataDomain
from sta.services.models.user import UserPublic

from ....models.source.data import (
    GroundMeshMetadata,
    GroundMeshMetadataBulkUpdate,
    GroundMeshMetadataCreate,
    GroundMeshMetadataPublic,
    GroundMeshMetadataUpdate,
)
from .data import touch_st_bounds


class GroundMeshMetadataDomain(
    SourceMetadataDomain[
        GroundMeshMetadata,
        GroundMeshMetadataCreate,
        GroundMeshMetadataPublic,
        GroundMeshMetadataUpdate,
        GroundMeshMetadataBulkUpdate,
    ],
):
    def __init__(self) -> None:
        super().__init__(
            table_cls=GroundMeshMetadata,
            create_cls=GroundMeshMetadataCreate,
            public_cls=GroundMeshMetadataPublic,
            update_cls=GroundMeshMetadataUpdate,
            bulk_update_cls=GroundMeshMetadataBulkUpdate,
        )

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: GroundMeshMetadataCreate,
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
        data: GroundMeshMetadataUpdate,
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
        data: list[GroundMeshMetadataCreate],
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
        data: GroundMeshMetadataBulkUpdate,
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
