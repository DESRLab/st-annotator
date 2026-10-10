from collections.abc import MutableSet, Set

from sqlmodel import Session, select

from sta.common.database.execution import sql_column
from sta.domain.source.spec.base import SourceSpecDomain
from sta.models.user import UserPublic

from ....models.source.spec import (
    PointCloudSpec,
    PointCloudSpecBulkUpdate,
    PointCloudSpecCreate,
    PointCloudSpecPublic,
    PointCloudSpecUpdate,
)
from ..data import metadata as metadata_domain
from ..data.data import current_config_identity


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

    def _reconcile_group_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_ids: Set[int],
    ) -> list[int]:
        """
        Re-point each group's records at the configuration it now has, and queue the work.

        Call this with every group a write touched -- the ones it left as much as the ones
        it joined, and the ones a delete freed -- and it asks nothing else about the write.
        Each group's records keep the marker they carry only when it already names the
        configuration that applies to them now, which is what makes a save that changed
        nothing read no data files while a save that changed everything re-derives a whole
        inventory. Membership diffs could not express the departing case at all: a group a
        specification dropped is absent from its new membership, so no diff of membership
        brings it up, and re-reading its scans through a specification they no longer have is
        impossible regardless.

        The return value is the list of queue rows this created, which is not the set of
        groups asked about: only the queue knows whether a row was added or the work was
        already waiting, so a caller that reports what a save started passes these along.
        """
        for group_id in sorted(group_ids):
            metadata_domain.mark_group_bounds_pending(
                session=session,
                group_ids={group_id},
                config_identity=current_config_identity(current_user, session, group_id),
            )

        return metadata_domain.schedule_bounds_reconcile(
            current_user=current_user,
            session=session,
            group_ids=group_ids,
        )

    def _group_ids_by_spec(self, session: Session, ids: Set[int]) -> dict[int, MutableSet[int]]:
        """
        Read the current group links as a plain mapping.

        A write replaces the links with a Core delete/insert, so the caller must not
        have a record's ``group_links`` collection loaded beforehand: the next flush
        would re-persist the rows the delete already removed.
        """
        groups_cls = self.table_cls.get_group_links_cls()
        rows = session.exec(
            select(groups_cls.spec_id, groups_cls.group_id).where(
                sql_column(groups_cls.spec_id).in_(ids),
            ),
        ).all()

        grouped: dict[int, MutableSet[int]] = {}
        for spec_id, group_id in rows:
            grouped.setdefault(spec_id, set()).add(group_id)

        return grouped

    def create_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: PointCloudSpecCreate,
    ) -> tuple[PointCloudSpec, list[int]]:
        record, job_ids = super().create_spec(
            current_user=current_user,
            session=session,
            data=data,
        )

        job_ids += self._reconcile_group_bounds(
            current_user=current_user,
            session=session,
            group_ids={group.id for group in record.groups if group.id is not None},
        )

        return record, job_ids

    def update_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
        data: PointCloudSpecUpdate,
    ) -> tuple[PointCloudSpec, list[int]]:
        before = self._group_ids_by_spec(session, {id}).get(id, set())

        record, job_ids = super().update_spec(
            current_user=current_user,
            session=session,
            id=id,
            data=data,
        )

        job_ids += self._reconcile_group_bounds(
            current_user=current_user,
            session=session,
            group_ids=before | {group.id for group in record.groups if group.id is not None},
        )

        return record, job_ids

    def bulk_update_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: PointCloudSpecBulkUpdate,
    ) -> list[int]:
        before = self._group_ids_by_spec(session, ids)

        job_ids = super().bulk_update_specs(
            current_user=current_user,
            session=session,
            ids=ids,
            data=data,
        )

        after = self._group_ids_by_spec(session, ids)

        affected: MutableSet[int] = set()
        for group_ids in (*before.values(), *after.values()):
            affected |= group_ids

        job_ids += self._reconcile_group_bounds(
            current_user=current_user,
            session=session,
            group_ids=affected,
        )

        return job_ids

    def delete_spec(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
    ) -> list[int]:
        freed = self._group_ids_by_spec(session, {id}).get(id, set())

        job_ids = super().delete_spec(current_user=current_user, session=session, id=id)

        # A group whose specification is gone can no longer derive anything, so its records
        # are marked and queued: the sweep finds nothing it can do and reports the reason on
        # every one of them, which is the only way that state becomes visible at all.
        job_ids += self._reconcile_group_bounds(
            current_user=current_user,
            session=session,
            group_ids=freed,
        )

        return job_ids

    def bulk_delete_specs(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
    ) -> list[int]:
        freed = self._group_ids_by_spec(session, ids)

        job_ids = super().bulk_delete_specs(current_user=current_user, session=session, ids=ids)

        affected: MutableSet[int] = set()
        for group_ids in freed.values():
            affected |= group_ids

        job_ids += self._reconcile_group_bounds(
            current_user=current_user,
            session=session,
            group_ids=affected,
        )

        return job_ids
