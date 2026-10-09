from sqlmodel import Session

from sta.common.spatial import OptionalDecimalCoord3, PartialSTBounds
from sta.services.models.user import UserPublic

from ....filesystem import GroundMeshData, GroundMeshFileIO
from ....models.source.data import GroundMeshMetadata

_gmesh_io = GroundMeshFileIO()


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
        ),
    )
    session.add(metadata)
    session.flush([metadata])

    session.refresh(metadata)

    return metadata
