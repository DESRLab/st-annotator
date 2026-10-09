from sqlmodel import Session

from sta.common.spatial import OptionalDecimalCoord3, PartialSTBounds
from sta.services.models.user import UserPublic

from ....filesystem import PointCloudData, PointCloudFileIO
from ....models.source.data import PointCloudMetadata
from ....models.source.spec import PointCloudConfig
from ....ops import OperationRegistry
from ....ops.preprocessing import register_preprocessing_ops
from ....ops.preprocessing.crop import CropBox, CropPolygon
from ....ops.preprocessing.remove_bg import RemoveBackground

pcd_io = PointCloudFileIO()

preprocessor_op_registry = OperationRegistry()
register_preprocessing_ops(preprocessor_op_registry, allow_transform=False)


def open_data(
    current_user: UserPublic,
    session: Session,
    metadata: PointCloudMetadata,
    *,
    crop_area: bool = True,
    remove_bg: bool = True,
) -> PointCloudData:
    from ..spec import specs

    pcd_spec = specs.read_spec_in_group(
        current_user=current_user,
        session=session,
        group_id=metadata.group_id,
    )
    if pcd_spec is None:
        msg = f"No point cloud source defined for source group #{metadata.group_id}"
        raise ValueError(msg)

    pcd_config = PointCloudConfig.model_validate(pcd_spec.config)

    data = pcd_io.read(
        metadata.uri,
        dtype=pcd_config.dtype,
        channel_headers=pcd_config.channel_headers,
    )

    for item in pcd_config.preprocessors:
        op = preprocessor_op_registry.create_op(item.op_name, item.op_params)
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
) -> PointCloudMetadata:
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
