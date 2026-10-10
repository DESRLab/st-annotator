from hashlib import sha1
from typing import Final

from sqlmodel import Session

from sta.common.spatial import OptionalDecimalCoord3, PartialSTBounds
from sta.models.user import UserPublic

from ....filesystem import GroundMeshData, GroundMeshFileIO
from ....models.source.data import GroundMeshMetadata

_gmesh_io = GroundMeshFileIO()

BOUNDS_CONFIG_IDENTITY: Final = sha1(b"gmesh", usedforsecurity=False).hexdigest()
"""
The derivation identity of a ground mesh: one value, shared by every record.

A mesh's box comes from its own file and the record's transform. There is no ground mesh
specification, so nothing about the group changes what reading a mesh produces -- which
is exactly why this plugin has no configuration reconciliation to perform, only a marker
saying whether a record has been read yet. The digest still has to exist, because an
absent marker is what distinguishes a box that was never derived from one that was.
"""


def open_data(
    current_user: UserPublic,
    session: Session,
    metadata: GroundMeshMetadata,
) -> GroundMeshData:
    data = _gmesh_io.read(metadata.uri)
    data.apply_transformation(metadata.transform)
    return data


def touch_st_bounds(
    current_user: UserPublic,
    session: Session,
    metadata: GroundMeshMetadata,
) -> GroundMeshMetadata:
    """
    Refresh one record's box from its mesh, and record that it now reflects the inputs.

    Raises
    ------
    FileNotFoundError
        If the stored mesh cannot be read. Nothing is written, so the record stays pending.
    """
    if not metadata.auto_bounds:
        # The box was pinned by hand, so it must survive every later write and every
        # source-configuration change that would otherwise recompute it. Its identity stays
        # empty: `auto_bounds` is what holds a pinned record out of the pending set.
        return metadata

    data = open_data(current_user, session, metadata)
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
            bounds_config_hash=BOUNDS_CONFIG_IDENTITY,
            bounds_error=None,
        ),
    )
    session.add(metadata)
    session.flush([metadata])

    session.refresh(metadata)

    return metadata
