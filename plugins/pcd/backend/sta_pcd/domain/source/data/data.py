import json
from collections.abc import Sequence
from hashlib import sha1
from typing import Any

from sqlmodel import Session

from sta.common.logging import get_logger
from sta.common.spatial import OptionalDecimalCoord3, PartialSTBounds
from sta.models.user import UserPublic

from ....filesystem import PointCloudData, PointCloudFileIO
from ....models.source.data import PointCloudMetadata
from ....models.source.spec import PointCloudConfig
from ....ops import OperationRegistry
from ....ops.operation import Operation
from ....ops.preprocessing import register_preprocessing_ops
from ....ops.preprocessing.crop import CropBox, CropPolygon
from ....ops.preprocessing.remove_bg import RemoveBackground

logger = get_logger()

pcd_io = PointCloudFileIO()

preprocessor_op_registry = OperationRegistry()
register_preprocessing_ops(preprocessor_op_registry, allow_transform=False)

# The configuration fields a derived box actually depends on. `width` and `height` are
# declared but read by nothing, so hashing them would re-read a group's whole inventory
# every time either one was edited in the form.
DERIVATION_CONFIG_FIELDS: set[str] = {"channel_headers", "dtype", "preprocessors"}


def bounds_config_identity(config: PointCloudConfig | None) -> str:
    """
    Identify the reading configuration a derived box was produced under.

    The digest is the whole record of *why* a box may have gone stale: a stored box keeps
    the identity it was derived under, and clearing it is how a record says "nothing I hold
    came from the configuration my group has now". That replaces asking each write which
    groups it touched -- unassignment included, which no diff of group membership can
    answer -- with comparing one scalar.

    ``None`` is the group having no point-cloud specification at all. It gets a digest of
    its own so that losing a configuration is a change, and re-acquiring an identical one is
    a change back.
    """
    hasher = sha1(usedforsecurity=False)

    if config is None:
        hasher.update(b"no-specification")
    else:
        projection = config.model_dump(include=DERIVATION_CONFIG_FIELDS, mode="json")
        hasher.update(json.dumps(projection, sort_keys=True).encode())

    return hasher.hexdigest()


def resolve_group_config(
    current_user: UserPublic,
    session: Session,
    group_id: int,
) -> tuple[PointCloudConfig, str]:
    """The configuration that reads this group's scans, and the identity it hashes to."""
    from ..spec import specs

    pcd_spec = specs.read_spec_in_group(
        current_user=current_user,
        session=session,
        group_id=group_id,
    )
    if pcd_spec is None:
        msg = f"No point cloud source defined for source group #{group_id}"
        raise ValueError(msg)

    config = PointCloudConfig.model_validate(pcd_spec.config)

    return config, bounds_config_identity(config)


def current_config_identity(current_user: UserPublic, session: Session, group_id: int) -> str:
    """
    The identity that applies to this group right now, specification or no specification.

    :func:`resolve_group_config` raises where this reports, because a group losing its
    specification is a state the reconciliation has to record, not an error to surface: the
    scans it leaves behind keep the boxes they have and await a configuration.
    """
    from ..spec import specs

    pcd_spec = specs.read_spec_in_group(
        current_user=current_user,
        session=session,
        group_id=group_id,
    )
    if pcd_spec is None:
        return bounds_config_identity(None)

    return bounds_config_identity(PointCloudConfig.model_validate(pcd_spec.config))


def create_preprocessors(pcd_config: PointCloudConfig) -> tuple[Operation[Any], ...]:
    """Construct configured operations once so auxiliary files are not read per scan."""
    return tuple(
        preprocessor_op_registry.create_op(item.op_name, item.op_params)
        for item in pcd_config.preprocessors
    )


def open_data(
    current_user: UserPublic,
    session: Session,
    metadata: PointCloudMetadata,
    *,
    crop_area: bool = True,
    remove_bg: bool = True,
    pcd_config: PointCloudConfig | None = None,
    preprocessors: Sequence[Operation[Any]] | None = None,
) -> PointCloudData:
    if pcd_config is None:
        pcd_config, _ = resolve_group_config(current_user, session, metadata.group_id)

    data = pcd_io.read(
        metadata.uri,
        dtype=pcd_config.dtype,
        channel_headers=pcd_config.channel_headers,
    )

    if preprocessors is None:
        preprocessors = create_preprocessors(pcd_config)

    for op in preprocessors:
        if not crop_area and isinstance(op, (CropBox, CropPolygon)):
            continue
        if not remove_bg and isinstance(op, RemoveBackground):
            continue

        data = op.apply(data)

    data.apply_transformation(metadata.transform)

    return data


def touch_st_bounds(
    current_user: UserPublic,
    session: Session,
    metadata: PointCloudMetadata,
    *,
    pcd_config: PointCloudConfig | None = None,
    preprocessors: Sequence[Operation[Any]] | None = None,
    config_identity: str | None = None,
) -> PointCloudMetadata:
    """
    Refresh one record's box from its file and record what it was derived under.

    ``pcd_config``, ``preprocessors`` and ``config_identity`` let a batch resolve a group's
    specification once instead of per scan. Any of them that is omitted is derived from the
    others, so a caller cannot supply a configuration whose identity disagrees with it.

    Raises
    ------
    ValueError
        If the record's group has no point-cloud specification, or the configuration cannot
        read the stored file. Nothing is written, so the record keeps awaiting derivation.
    """
    if not metadata.auto_bounds:
        # The box was pinned by hand, so it must survive every later write and every
        # source-configuration change that would otherwise recompute it. Its identity stays
        # empty: `auto_bounds` is what holds a pinned record out of the pending set.
        return metadata

    if config_identity is None:
        if pcd_config is None:
            pcd_config, config_identity = resolve_group_config(
                current_user,
                session,
                metadata.group_id,
            )
        else:
            config_identity = bounds_config_identity(pcd_config)

    data = open_data(
        current_user,
        session,
        metadata,
        pcd_config=pcd_config,
        preprocessors=preprocessors,
    )

    if data.num_points == 0:
        # The preprocessors (e.g. a crop area or a remove-bg intensity band) retained no points,
        # so bounds cannot be derived from the stored source. Leave the previously recorded bounds
        # untouched: writing a zeroed or inverted tuple would make the scan un-intersectable.
        logger.warning(
            "Skipped bounds recalculation for point cloud metadata #%s; preprocessing left no points in %s",
            metadata.id,
            metadata.uri,
        )

        # Nothing was derived, so the record cannot claim it reflects its configuration.
        # It stays pending with the reason beside it, which is what turns today's silent
        # "the box is whatever the last surviving derivation said" into a state the data
        # manager can list. The marker is cleared rather than left alone because the create
        # payload carries these internal columns: a caller that supplied one must not have
        # its claim survive a derivation that produced no box at all.
        metadata.bounds_config_hash = None
        metadata.bounds_error = "Preprocessing left no points to derive bounds from."
        session.add(metadata)
        session.flush([metadata])

        return metadata

    world_min, world_max = data.bbox

    new_st_bounds = PartialSTBounds(
        min_coords=OptionalDecimalCoord3(**world_min.to_decimal().model_dump()),
        max_coords=OptionalDecimalCoord3(**world_max.to_decimal().model_dump()),
        min_timestamp=None,
        max_timestamp=None,
    )

    metadata.sqlmodel_update(
        dict(
            min_x=new_st_bounds.min_coords.x,
            min_y=new_st_bounds.min_coords.y,
            min_z=new_st_bounds.min_coords.z,
            max_x=new_st_bounds.max_coords.x,
            max_y=new_st_bounds.max_coords.y,
            max_z=new_st_bounds.max_coords.z,
            bounds_config_hash=config_identity,
            bounds_error=None,
        ),
    )
    session.add(metadata)
    session.flush([metadata])

    session.refresh(metadata)

    return metadata
