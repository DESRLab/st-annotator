from collections.abc import Iterable, Sequence, Set
from datetime import datetime
from http import HTTPStatus
from typing import Generic, Protocol, TypeVar

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import ColumnElement, and_, not_
from sqlmodel import Session, delete, func, insert, select, update

from sta.common.database.execution import execute_statement, sql_column, stamp_bulk_edit
from sta.common.spatial import DecimalCoord, PartialSTBounds

from ....models.base import SPATIAL_BOUND_FIELDS, TRANSFORM_FIELDS
from ....models.source.data import (
    SourceDataPublicLike,
    SourceDataSQLModel,
    SourceDataTableLike,
    SourceDataUpdateLike,
    SourceMetadataPublicLike,
    SourceMetadataSQLModel,
    SourceMetadataTableLike,
    SourceMetadataUpdateLike,
)
from ....models.user import Role, UserPublic
from ...auth import require_role
from ...ops import reserve_bulk_insert_ids
from ..groups import get_valid_group_ids

__all__ = [
    "SourceDataDomain",
    "SourceMetadataDomain",
    "imply_bounds_override",
    "needs_bounds_recalculation",
]

CoordFilter = float | DecimalCoord


_T = TypeVar("_T", bound=SourceDataTableLike)
_C = TypeVar("_C", bound=SourceDataSQLModel)
_P = TypeVar("_P", bound=SourceDataPublicLike, covariant=True)
_U = TypeVar("_U", bound=SourceDataUpdateLike)
_BU = TypeVar("_BU", bound=SourceDataUpdateLike)


class BoundsModePayload(Protocol):
    """A source-data create/update payload that can pin the record's spatial box."""

    @property
    def auto_bounds(self) -> bool | None: ...
    @auto_bounds.setter
    def auto_bounds(self, value: bool | None) -> None: ...

    @property
    def model_fields_set(self) -> set[str]: ...


def imply_bounds_override(data: BoundsModePayload) -> None:
    """
    Read a payload that carries its own spatial box as asking to keep that box.

    Deriving the bounds from the stored source file is authoritative for every write
    unless the caller says otherwise, so a request that supplies coordinates without
    naming ``auto_bounds`` would have them recomputed away by the very write offering
    them. Stating the flag explicitly always wins, including switching derivation back
    on. Timestamps are excluded: they are always caller-owned.
    """
    if "auto_bounds" in data.model_fields_set:
        return

    if SPATIAL_BOUND_FIELDS & data.model_fields_set:
        data.auto_bounds = False


_BOUNDS_FIELDS = SPATIAL_BOUND_FIELDS | {"min_timestamp", "max_timestamp"}

_RECALCULABLE_BOUND_FIELDS = frozenset({"auto_bounds", "uri", "group_id"}) | TRANSFORM_FIELDS


def needs_bounds_recalculation(data: SourceDataUpdateLike) -> bool:
    """
    Whether a source-data write can change the box that derivation records.

    Deriving the bounds re-reads the stored file through the specification of the group
    that owns the record and applies the record's own transform before taking the box,
    so a refresh is owed when the file moves, the group (and therefore the reading
    configuration) moves, derivation is switched back on, or any transform column
    changes. Hand-set coordinates and timestamps are deliberately absent: supplying a
    coordinate pins ``auto_bounds`` false (see :func:`imply_bounds_override`) so the
    refresh would return immediately, and timestamps are caller-owned, never derived.
    Without this gate a batch edit of an unrelated attribute re-reads every selected
    source file inside the request.
    """
    return bool(_RECALCULABLE_BOUND_FIELDS & data.model_fields_set)


class _BoundsCarrier(Protocol):
    """Anything whose columns already hold a spatiotemporal box: a row or a create payload."""

    @property
    def st_bounds(self) -> PartialSTBounds: ...


def _validate_st_bounds(records: Iterable[_BoundsCarrier]) -> None:
    """
    Reject writes whose resulting spatiotemporal bounds are inverted.

    The min/max and timestamp columns are only cross-checked by :class:`PartialSTBounds`,
    and ``st_bounds`` is a property rather than a field, so nothing validates them while a
    row is written. A hand-set override that pushes a minimum past the maximum it retains
    would therefore persist and fail only later, wherever ``st_bounds`` is read (source
    matching, the export porters) -- as an unhandled :class:`pydantic.ValidationError`.
    Evaluating the resulting ``st_bounds`` reuses the authoritative validators instead of
    duplicating the comparison, and runs before the caller commits.
    """
    for record in records:
        try:
            _ = record.st_bounds
        except ValidationError as e:
            reasons = "; ".join(str(error["msg"]) for error in e.errors())
            raise HTTPException(
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                detail=f"Invalid source bounds: {reasons}",
            ) from e


class SourceDataDomain(Generic[_T, _C, _P, _U, _BU]):
    def __init__(
        self,
        *,
        table_cls: type[_T],
        create_cls: type[_C],
        public_cls: type[_P],
        update_cls: type[_U],
        bulk_update_cls: type[_BU],
    ):
        super().__init__()

        self.table_cls = table_cls
        self.create_cls = create_cls
        self.public_cls = public_cls
        self.update_cls = update_cls
        self.bulk_update_cls = bulk_update_cls

    def can_read_data_filters(self, user: UserPublic, session: Session):
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return []

        return [sql_column(self.table_cls.group_id).in_(get_valid_group_ids(user, session))]

    def can_read_data(self, user: UserPublic, session: Session, data: _T | _C) -> bool:
        if user.has_role(Role.DATA_MANAGER, Role.PROJECT_MANAGER):
            return True

        return data.group_id in get_valid_group_ids(user, session)

    def require_data_writer(
        self,
        user: UserPublic,
        session: Session,
        data: _T | _C | None = None,
    ):
        # Source-data writes are deliberately global here, unlike the label
        # domain, whose guard scopes a passed record by group visibility. `data`
        # is accepted for call-site symmetry only and is never read: honouring it
        # would widen create/update/delete to anyone whose assigned tasks reach
        # the target source group.
        return require_role(user, Role.DATA_MANAGER)

    def create_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: _C | _T,
    ) -> _T:
        """
        Create a new record.

        Parameters
        ----------
        data : _C | _T
            The data to create. Table-model instances are inserted as-is;
            any other model (e.g. a Create model) is validated into a new
            table instance first.
        """
        self.require_data_writer(current_user, session, data)

        # Use a table-model instance as-is: model_validate would resolve its
        # unloaded relationships to None, blanking the FK columns on flush.
        record = data if isinstance(data, self.table_cls) else self.table_cls.model_validate(data)

        _validate_st_bounds([record])

        session.add(record)
        session.flush([record])

        session.refresh(record)

        return record

    def build_list_query(
        self,
        current_user: UserPublic,
        session: Session,
        *,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
    ):
        table_cls = self.table_cls

        q = select(table_cls).offset(offset)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)
        if limit is not None:
            q = q.limit(limit)
        if ids is not None:
            q = q.where(sql_column(table_cls.id).in_(ids))
        if group_id is not None:
            q = q.where(table_cls.group_id == group_id)
        if min_x is not None:
            column = sql_column(table_cls.max_x)
            q = q.where(column.is_(None) | (column >= min_x))
        if min_y is not None:
            column = sql_column(table_cls.max_y)
            q = q.where(column.is_(None) | (column >= min_y))
        if min_z is not None:
            column = sql_column(table_cls.max_z)
            q = q.where(column.is_(None) | (column >= min_z))
        if max_x is not None:
            column = sql_column(table_cls.min_x)
            q = q.where(column.is_(None) | (column <= max_x))
        if max_y is not None:
            column = sql_column(table_cls.min_y)
            q = q.where(column.is_(None) | (column <= max_y))
        if max_z is not None:
            column = sql_column(table_cls.min_z)
            q = q.where(column.is_(None) | (column <= max_z))
        if min_timestamp is not None:
            column = sql_column(table_cls.max_timestamp)
            q = q.where(column.is_(None) | (column >= min_timestamp))
        if max_timestamp is not None:
            column = sql_column(table_cls.min_timestamp)
            q = q.where(column.is_(None) | (column <= max_timestamp))

        return q

    def list_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
    ) -> Sequence[_T]:
        q = self.build_list_query(
            current_user,
            session,
            offset=offset,
            ids=ids,
            limit=limit,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
        )

        return session.exec(q).all()

    def count_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
    ) -> int:
        q = self.build_list_query(
            current_user,
            session,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
        )

        return session.exec(select(func.count()).select_from(q.subquery())).one()

    def list_datas_in_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int,
        st_bounds: PartialSTBounds | None = None,
    ) -> Sequence[_T]:
        return self.list_datas(
            current_user=current_user,
            session=session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=None if st_bounds is None else st_bounds.min_coords.x,
            min_y=None if st_bounds is None else st_bounds.min_coords.y,
            min_z=None if st_bounds is None else st_bounds.min_coords.z,
            max_x=None if st_bounds is None else st_bounds.max_coords.x,
            max_y=None if st_bounds is None else st_bounds.max_coords.y,
            max_z=None if st_bounds is None else st_bounds.max_coords.z,
            min_timestamp=None if st_bounds is None else st_bounds.min_timestamp,
            max_timestamp=None if st_bounds is None else st_bounds.max_timestamp,
        )

    def read_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
    ):
        table_cls = self.table_cls

        q = select(table_cls).where(table_cls.id == id)
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)

        record = session.exec(q).one_or_none()
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        return record

    def update_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
        data: _U,
    ):
        record = session.get(self.table_cls, id)
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        self.require_data_writer(current_user, session, record)

        data_to_update = data.model_dump(exclude_unset=True)

        record.sqlmodel_update(data_to_update)
        # A box written by hand reflects no derivation, so the record must not keep whatever
        # claim it carried before. Clearing it is also what makes switching derivation back on
        # work later: a surviving marker would tell the next sweep this box is already finished.
        if data_to_update.get("auto_bounds") is False and (
            SPATIAL_BOUND_FIELDS & data_to_update.keys()
        ):
            record.bounds_config_hash = None
            record.bounds_error = None

        # Validate after the update so the retained columns participate, and before the
        # flush so an inverted box never reaches the database. A write that re-enables
        # derivation is exempt: the stored box is about to be recomputed from the source
        # file, so rejecting it here would trap a row whose box went stale by other means.
        if data_to_update.get("auto_bounds") is not True:
            _validate_st_bounds([record])

        session.add(record)
        session.flush([record])

        session.refresh(record)

        return record

    def delete_data(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        id: int,
    ):
        record = session.get(self.table_cls, id)
        if not record:
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND)

        self.require_data_writer(current_user, session, record)

        session.delete(record)
        session.flush([record])

    def bulk_create_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        data: list[_C],
    ) -> list[int]:
        # An empty parameter list is a no-op, not a bulk insert: SQLAlchemy does not skip the
        # statement for ``params=[]``, it emits a single INSERT using only server/column defaults,
        # which fails the NOT NULL constraints on ``group_id`` and ``uri``. Bail out before the
        # permission round trip so a batch that changes nothing cannot raise on permissions.
        # Returning no ids is safe for callers that feed them back to ``list_datas``: an empty id
        # set compiles to ``IN ()`` and selects nothing, so no other row can be touched.
        if not data:
            return []

        self.require_data_writer(current_user, session)

        _validate_st_bounds(data)

        ids = reserve_bulk_insert_ids(
            session=session,
            table_cls=self.table_cls,
            count=len(data),
        )

        execute_statement(
            session,
            insert(self.table_cls),
            [
                {"id": record_id, **item.model_dump()}
                for record_id, item in zip(ids, data, strict=True)
            ],
        )

        return ids

    def bulk_update_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
        data: _BU,
    ) -> list[int]:
        """
        Apply one bulk edit to the selected rows, and report the sweeps it started.

        Note what the return value is *not*: :meth:`bulk_create_datas` answers with the ids
        of the records it inserted, while this answers with the ids of the background jobs it
        queued. Both are ``list[int]``, and only the name of the receiving variable tells them
        apart, so a caller that needs the rows a write produced must read that from the
        statement it called rather than from the type.
        """
        self.require_data_writer(current_user, session)

        data_to_update = data.model_dump(exclude_unset=True)
        has_updates = stamp_bulk_edit(data_to_update)

        if data_to_update.get("auto_bounds") is False and (
            SPATIAL_BOUND_FIELDS & data_to_update.keys()
        ):
            # As in `update_data`: a box stated by hand reflects no derivation, so every
            # selected row loses the marker it carried, and switching derivation back on
            # later re-derives them instead of trusting a stale claim.
            data_to_update.update(bounds_config_hash=None, bounds_error=None)

        table_cls = self.table_cls
        if has_updates:
            q = update(table_cls).where(sql_column(table_cls.id).in_(ids)).values(**data_to_update)
            execute_statement(session, q)

            if _BOUNDS_FIELDS & data_to_update.keys():
                # Re-read the rows so each one is checked against the bounds it retained;
                # raising here aborts the commit, rolling the bulk statement back. A
                # batch that re-enables derivation is exempt, as every row's box is about
                # to be recomputed from its source file.
                if data_to_update.get("auto_bounds") is not True:
                    records = session.exec(
                        select(table_cls).where(sql_column(table_cls.id).in_(ids))
                    ).all()
                    _validate_st_bounds(records)

        return []

    def bulk_delete_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int],
    ):
        self.require_data_writer(current_user, session)

        table_cls = self.table_cls
        q = delete(table_cls).where(sql_column(table_cls.id).in_(ids))
        execute_statement(session, q)

    # ### Spatial-bounds reconciliation -------------------------------------------
    #
    # A record awaits derivation when `auto_bounds` is on and `bounds_config_hash` is
    # NULL; see the column comment on SourceDataSQLModel. These are the only operations
    # on that state that do not need the source file, so they are the whole contract a
    # write path has to honour: mark what moved, ask what is left, hand the list to a job.
    #
    # None of these statements touch `last_edit_at`. Marking is a system correction, not
    # a user edit, and stamping it would make an open edit form fail with a 409 because a
    # background sweep happened to revisit the same rows.

    def _pending_bounds_filter(self) -> ColumnElement[bool]:
        table_cls = self.table_cls

        return and_(
            sql_column(table_cls.auto_bounds).is_(True),
            sql_column(table_cls.bounds_config_hash).is_(None),
        )

    def mark_group_bounds_pending(
        self,
        *,
        session: Session,
        group_ids: Set[int],
        config_identity: str,
    ) -> None:
        """
        Forget the derivation identity of the records in these groups that no longer match it.

        The caller passes the identity that *now* applies to the group, so one statement
        covers every reason a group's records can go stale: a configuration that changed,
        a specification the group just acquired or lost, or a configuration the group kept
        while its records were never derived. Records already matching are left alone,
        which is what makes a save that changed nothing cost nothing.
        """
        if not group_ids:
            return

        table_cls = self.table_cls

        execute_statement(
            session,
            update(table_cls)
            .where(
                sql_column(table_cls.group_id).in_(group_ids),
                # A pinned box never regains a hash, so without this it would be
                # rewritten by every later configuration save and stay pending-looking
                # forever. Marking is for records derivation still owns.
                sql_column(table_cls.auto_bounds).is_(True),
                sql_column(table_cls.bounds_config_hash).is_distinct_from(config_identity),
            )
            .values(bounds_config_hash=None, bounds_error=None)
            # No caller holds these rows' identity-mapped state after a marking
            # statement; the reconciling job reads them again through its own query.
            .execution_options(synchronize_session=False),
        )

    def mark_rows_bounds_pending(self, *, session: Session, ids: Set[int]) -> Set[int]:
        """
        Mark selected records as awaiting derivation; returns the groups they belong to.

        Used when a write moved one of the record's own inputs -- its file, its transform,
        the group that supplies its reading configuration -- so the box it kept is no
        longer the box the current inputs would produce. The groups come back with them
        because whoever marks rows pending is always about to queue work for them.
        """
        if not ids:
            return set()

        table_cls = self.table_cls
        group_ids = set(
            session.exec(
                select(sql_column(table_cls.group_id)).where(
                    sql_column(table_cls.id).in_(ids),
                ),
            ).all()
        )

        execute_statement(
            session,
            update(table_cls)
            .where(sql_column(table_cls.id).in_(ids))
            .values(bounds_config_hash=None, bounds_error=None)
            .execution_options(synchronize_session=False),
        )

        return group_ids

    def attest_bounds(
        self,
        *,
        session: Session,
        ids: Set[int],
        config_identity: str,
    ) -> None:
        """
        Record that these boxes were produced under ``config_identity``.

        The opposite of marking, and honest only for a caller that performed the canonical
        derivation itself: a box read the way a sweep would read it has nothing left to
        await, so queueing a sweep to re-read it would be pure cost.
        """
        if not ids:
            return

        table_cls = self.table_cls

        execute_statement(
            session,
            update(table_cls)
            .where(sql_column(table_cls.id).in_(ids))
            .values(bounds_config_hash=config_identity, bounds_error=None)
            .execution_options(synchronize_session=False),
        )

    def record_bounds_error(self, *, session: Session, ids: Set[int], reason: str) -> None:
        """
        Explain why these records are still awaiting derivation.

        The marker is left pending on purpose: this reports an attempt, not a result, so a
        later configuration change re-queues the work just as it would for any record whose
        box was never refreshed.
        """
        if not ids:
            return

        table_cls = self.table_cls

        execute_statement(
            session,
            update(table_cls)
            .where(sql_column(table_cls.id).in_(ids))
            .values(bounds_error=reason)
            .execution_options(synchronize_session=False),
        )

    def pending_bounds_group_ids(self, *, session: Session, group_ids: Set[int]) -> Set[int]:
        """Which of these groups still have a record awaiting derivation."""
        if not group_ids:
            return set()

        table_cls = self.table_cls
        rows = session.exec(
            select(sql_column(table_cls.group_id))
            .where(
                sql_column(table_cls.group_id).in_(group_ids),
                self._pending_bounds_filter(),
            )
            .distinct()
        ).all()

        return set(rows)

    def list_pending_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        group_id: int,
    ) -> Sequence[_T]:
        """Every record of one group awaiting derivation, oldest first."""
        table_cls = self.table_cls
        q = select(table_cls).where(
            sql_column(table_cls.group_id) == group_id,
            self._pending_bounds_filter(),
        )
        for cond in self.can_read_data_filters(current_user, session):
            q = q.where(cond)

        return session.exec(q.order_by(sql_column(table_cls.id))).all()


_MT = TypeVar("_MT", bound=SourceMetadataTableLike)
_MC = TypeVar("_MC", bound=SourceMetadataSQLModel)
_MP = TypeVar("_MP", bound=SourceMetadataPublicLike, covariant=True)
_MU = TypeVar("_MU", bound=SourceMetadataUpdateLike)
_MBU = TypeVar("_MBU", bound=SourceMetadataUpdateLike)


class SourceMetadataDomain(SourceDataDomain[_MT, _MC, _MP, _MU, _MBU]):
    def build_list_query(
        self,
        current_user: UserPublic,
        session: Session,
        *,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        uri: str | None = None,
        bounds_pending: bool | None = None,
    ):
        table_cls = self.table_cls

        q = super().build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
        )
        if uri is not None:
            q = q.where(table_cls.uri == uri)
        if bounds_pending is not None:
            # "Awaiting derivation" is a property of the record's own state, so filtering on
            # it is how a reader finds the rows a sweep has not reached -- and, inverted,
            # how it finds the hand-pinned boxes that no sweep will ever touch.
            pending = self._pending_bounds_filter()
            q = q.where(pending if bounds_pending else not_(pending))

        return q

    def list_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        uri: str | None = None,
        bounds_pending: bool | None = None,
    ) -> Sequence[_MT]:
        q = self.build_list_query(
            current_user,
            session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            uri=uri,
            bounds_pending=bounds_pending,
        )

        return session.exec(q).all()

    def list_data_ids(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        uri: str | None = None,
        bounds_pending: bool | None = None,
    ) -> list[int]:
        q = self.build_list_query(
            current_user,
            session,
            offset=0,
            limit=None,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            uri=uri,
            bounds_pending=bounds_pending,
        )
        table_cls = self.table_cls
        id_query = q.order_by(None).with_only_columns(sql_column(table_cls.id))
        return list(execute_statement(session, id_query).scalars().all())

    def count_datas(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        ids: Set[int] | None = None,
        group_id: int | None = None,
        min_x: CoordFilter | None = None,
        min_y: CoordFilter | None = None,
        min_z: CoordFilter | None = None,
        max_x: CoordFilter | None = None,
        max_y: CoordFilter | None = None,
        max_z: CoordFilter | None = None,
        min_timestamp: datetime | None = None,
        max_timestamp: datetime | None = None,
        uri: str | None = None,
        bounds_pending: bool | None = None,
    ) -> int:
        q = self.build_list_query(
            current_user,
            session,
            ids=ids,
            group_id=group_id,
            min_x=min_x,
            min_y=min_y,
            min_z=min_z,
            max_x=max_x,
            max_y=max_y,
            max_z=max_z,
            min_timestamp=min_timestamp,
            max_timestamp=max_timestamp,
            uri=uri,
            bounds_pending=bounds_pending,
        )

        return session.exec(select(func.count()).select_from(q.subquery())).one()

    def list_datas_in_bounds(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        offset: int = 0,
        limit: int | None = None,
        ids: Set[int] | None = None,
        group_id: int,
        st_bounds: PartialSTBounds | None = None,
        uri: str | None = None,
    ) -> Sequence[_MT]:
        return self.list_datas(
            current_user=current_user,
            session=session,
            offset=offset,
            limit=limit,
            ids=ids,
            group_id=group_id,
            min_x=None if st_bounds is None else st_bounds.min_coords.x,
            min_y=None if st_bounds is None else st_bounds.min_coords.y,
            min_z=None if st_bounds is None else st_bounds.min_coords.z,
            max_x=None if st_bounds is None else st_bounds.max_coords.x,
            max_y=None if st_bounds is None else st_bounds.max_coords.y,
            max_z=None if st_bounds is None else st_bounds.max_coords.z,
            min_timestamp=None if st_bounds is None else st_bounds.min_timestamp,
            max_timestamp=None if st_bounds is None else st_bounds.max_timestamp,
            uri=uri,
        )
