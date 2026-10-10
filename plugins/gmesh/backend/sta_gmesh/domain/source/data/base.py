from collections.abc import Set
from typing import ClassVar

from sqlmodel import Session

from sta.domain.jobs import JobContext, enqueue_job
from sta.domain.source.data import (
    SourceMetadataDomain,
    imply_bounds_override,
    needs_bounds_recalculation,
)
from sta.models.user import UserPublic

from ....models.source.data import (
    GroundMeshMetadata,
    GroundMeshMetadataBulkUpdate,
    GroundMeshMetadataCreate,
    GroundMeshMetadataPublic,
    GroundMeshMetadataUpdate,
)
from .data import BOUNDS_CONFIG_IDENTITY, touch_st_bounds


class GroundMeshMetadataDomain(
    SourceMetadataDomain[
        GroundMeshMetadata,
        GroundMeshMetadataCreate,
        GroundMeshMetadataPublic,
        GroundMeshMetadataUpdate,
        GroundMeshMetadataBulkUpdate,
    ],
):
    """
    Ground-mesh source metadata, whose spatial bounds are derived from the stored mesh.

    The same rule as the point-cloud plugin: reading one mesh belongs in the request that
    created or moved it, reading a group's worth belongs in a queued sweep. What differs is
    that a mesh has no reading configuration, so a sweep can only ever catch records whose
    own file or transform moved.
    """

    reconcile_kind: ClassVar[str] = "gmesh.reconcile_bounds"
    """Job kind this domain registers an executor for, and the only name it queues under."""

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
        data: GroundMeshMetadataCreate | GroundMeshMetadata,
    ):
        imply_bounds_override(data)

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
        imply_bounds_override(data)
        recalculate_bounds = needs_bounds_recalculation(data)

        record = super().update_data(
            current_user=current_user,
            session=session,
            id=id,
            data=data,
        )

        if not recalculate_bounds:
            return record

        return touch_st_bounds(current_user, session, record)

    def bulk_create_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: list[GroundMeshMetadataCreate],
        attest_bounds: bool = False,
    ) -> list[int]:
        """
        Create meshes in bulk, queueing a sweep unless the caller already derived the boxes.

        ``attest_bounds`` is for the one caller that can honestly claim them: the importer
        reads each mesh and applies its transform exactly as :func:`touch_st_bounds` does,
        so re-reading a hundred thousand files to reproduce the boxes it just stored would
        be pure cost. A point cloud cannot be offered the same exit -- its boxes depend on
        the group's preprocessors, which that reader never applies.
        """
        for item in data:
            imply_bounds_override(item)

        ids = super().bulk_create_datas(
            current_user=current_user,
            session=session,
            data=data,
        )

        if not attest_bounds:
            self.schedule_bounds_reconcile(
                current_user=current_user,
                session=session,
                group_ids={item.group_id for item in data},
            )

            return ids

        self.attest_bounds(
            session=session,
            ids=set(ids),
            config_identity=BOUNDS_CONFIG_IDENTITY,
        )

        return ids

    def bulk_update_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: GroundMeshMetadataBulkUpdate,
    ) -> list[int]:
        imply_bounds_override(data)
        recalculate_bounds = needs_bounds_recalculation(data)

        super().bulk_update_datas(
            current_user=current_user,
            session=session,
            ids=ids,
            data=data,
        )

        if not recalculate_bounds:
            return []

        group_ids = self.mark_rows_bounds_pending(session=session, ids=ids)
        return self.schedule_bounds_reconcile(
            current_user=current_user,
            session=session,
            group_ids=group_ids,
        )

    def schedule_bounds_reconcile(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_ids: Set[int],
    ) -> list[int]:
        """
        Queue one sweep per group that still has a record awaiting derivation.

        Returns the rows this created -- not the groups asked about, since only the queue
        knows whether a row was added or the work was already waiting.
        """
        pending = self.pending_bounds_group_ids(session=session, group_ids=group_ids)
        queued: list[int] = []

        for group_id in sorted(pending):
            job = enqueue_job(
                session=session,
                current_user=current_user,
                kind=self.reconcile_kind,
                payload={"group_id": group_id},
                dedupe_key=f"{self.reconcile_kind}:{group_id}",
                label=f"Derive spatial bounds for ground meshes in source group #{group_id}",
            )
            if job is not None:
                assert job.id is not None
                queued.append(job.id)

        return queued

    def reconcile_bounds(self, ctx: JobContext) -> None:
        """
        Derive every pending mesh of one group.

        A mesh that cannot be read is reported on the record and skipped: the sweep exists
        to converge whatever it can, and a group with one missing file has the same claim
        on the other files as a group with none.
        """
        group_id = ctx.payload["group_id"]
        current_user = ctx.current_user
        session = ctx.session

        pending = self.list_pending_bounds(
            current_user=current_user,
            session=session,
            group_id=group_id,
        )
        ctx.report(done=0, total=len(pending))

        for done, metadata in enumerate(pending, start=1):
            try:
                touch_st_bounds(current_user, session, metadata)
            except (ValueError, FileNotFoundError) as exc:
                self.record_bounds_error(
                    session=session,
                    ids={metadata.id},
                    reason=f"{type(exc).__name__}: {exc}",
                )

            ctx.report(done=done)
