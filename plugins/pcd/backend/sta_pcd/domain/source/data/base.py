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
    PointCloudMetadata,
    PointCloudMetadataBulkUpdate,
    PointCloudMetadataCreate,
    PointCloudMetadataPublic,
    PointCloudMetadataUpdate,
)
from .data import (
    create_preprocessors,
    resolve_group_config,
    touch_st_bounds,
)


class PointCloudMetadataDomain(
    SourceMetadataDomain[
        PointCloudMetadata,
        PointCloudMetadataCreate,
        PointCloudMetadataPublic,
        PointCloudMetadataUpdate,
        PointCloudMetadataBulkUpdate,
    ],
):
    """
    Point-cloud source metadata, whose spatial bounds are derived from the stored scan.

    Derivation reads a data file, so it is the one part of a metadata write that cannot
    belong in the request at group scale. The rule the whole class follows: work
    proportional to one scan happens now, work proportional to a group is queued. A record
    between the two states carries no derivation marker, which is both what makes a queued
    sweep findable and what keeps a lost job from hiding unfinished work.
    """

    reconcile_kind: ClassVar[str] = "pcd.reconcile_bounds"
    """Job kind this domain registers an executor for, and the only name it queues under."""

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
        data: PointCloudMetadataCreate | PointCloudMetadata,
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
        data: PointCloudMetadataUpdate,
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
            # An edit that cannot move the box -- a weather label, a description -- must not
            # re-read the scan, and must not quietly drop the marker saying which
            # configuration the box still reflects.
            return record

        return touch_st_bounds(current_user, session, record)

    def bulk_create_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: list[PointCloudMetadataCreate],
    ) -> list[int]:
        for item in data:
            imply_bounds_override(item)

        ids = super().bulk_create_datas(
            current_user=current_user,
            session=session,
            data=data,
        )

        # Every row arrives without a derivation marker, including one whose box a caller
        # computed its own way: only a sweep can say what the group's configuration makes
        # of the file. Records a caller pinned by hand are excluded by `auto_bounds`, so an
        # inventory that states its boxes queues nothing.
        self.schedule_bounds_reconcile(
            current_user=current_user,
            session=session,
            group_ids={item.group_id for item in data},
        )

        return ids

    def bulk_update_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: PointCloudMetadataBulkUpdate,
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

        Returns the ids of the rows this call created, which is not the same as the groups
        it was asked about: only the queue knows whether a row was added or the work was
        already waiting. A caller reporting what a save started has to pass these along.

        The pending check is what keeps the queue honest: a write that marked nothing, or
        whose records were already swept by an earlier job, queues no work. It is also what
        makes a lost job recoverable -- the next write to touch the group notices the
        records are still waiting and queues again, rather than trusting that a queue row
        survived.
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
                label=f"Derive spatial bounds for point clouds in source group #{group_id}",
            )
            if job is not None:
                assert job.id is not None
                queued.append(job.id)

        return queued

    def reconcile_bounds(self, ctx: JobContext) -> None:
        """
        Derive every pending scan of one group under the configuration it now has.

        Failures are reported per record and never re-raised: a group whose specification
        has gone, or whose hundred-and-first file is missing, must end up with the other
        hundred derived and one explained row, not a failed job and no explanation.
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

        if not pending:
            return

        try:
            config, config_identity = resolve_group_config(current_user, session, group_id)
        except ValueError as exc:
            # One statement for the group: every record is blocked by the same missing
            # configuration, and reporting it row by row would be a hundred updates saying
            # one thing.
            self.record_bounds_error(
                session=session,
                ids={metadata.id for metadata in pending},
                reason=str(exc),
            )

            return

        # Constructed once: a crop polygon or background statistics file is read per sweep,
        # not per scan.
        preprocessors = create_preprocessors(config)

        for done, metadata in enumerate(pending, start=1):
            try:
                touch_st_bounds(
                    current_user,
                    session,
                    metadata,
                    pcd_config=config,
                    preprocessors=preprocessors,
                    config_identity=config_identity,
                )
            except (ValueError, FileNotFoundError) as exc:
                self.record_bounds_error(
                    session=session,
                    ids={metadata.id},
                    reason=f"{type(exc).__name__}: {exc}",
                )

            ctx.report(done=done)
