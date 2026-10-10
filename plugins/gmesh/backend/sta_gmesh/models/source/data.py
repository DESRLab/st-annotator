from typing import TYPE_CHECKING, Any, ClassVar

from pydantic import AwareDatetime
from sqlmodel import Field, SQLModel

from sta.common.spatial import DecimalCoord
from sta.models.source.data import SourceTransformMetadataSQLModel
from sta.models.source.group import SourceGroup, SourceGroupPublic
from sta.models.types import FileURI


class GroundMeshMetadataSQLModel(SourceTransformMetadataSQLModel):
    pass


if TYPE_CHECKING:

    class GroundMeshMetadata(GroundMeshMetadataSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: int
        group: SourceGroup = Field(default=None)

    class GroundMeshMetadataCreate(GroundMeshMetadataSQLModel):
        pass

    class GroundMeshMetadataPublic(GroundMeshMetadataSQLModel):
        id: int
        group: SourceGroupPublic = Field(default=None)

    class GroundMeshMetadataUpdate(SQLModel):
        group_id: int | None = None
        auto_bounds: bool | None = None
        uri: FileURI | None = None
        min_x: DecimalCoord | None = None
        min_y: DecimalCoord | None = None
        min_z: DecimalCoord | None = None
        max_x: DecimalCoord | None = None
        max_y: DecimalCoord | None = None
        max_z: DecimalCoord | None = None
        min_timestamp: AwareDatetime | None = None
        max_timestamp: AwareDatetime | None = None
        translate_x: DecimalCoord | None = None
        translate_y: DecimalCoord | None = None
        translate_z: DecimalCoord | None = None
        rotate_x: DecimalCoord | None = None
        rotate_y: DecimalCoord | None = None
        rotate_z: DecimalCoord | None = None
        scale_x: DecimalCoord | None = None
        scale_y: DecimalCoord | None = None
        scale_z: DecimalCoord | None = None

    class GroundMeshMetadataBulkUpdate(GroundMeshMetadataUpdate):
        pass
else:
    GroundMeshMetadata = GroundMeshMetadataSQLModel.get_table_cls("gmesh")
    GroundMeshMetadataCreate = GroundMeshMetadataSQLModel.get_create_cls()
    GroundMeshMetadataPublic = GroundMeshMetadataSQLModel.get_public_cls()
    GroundMeshMetadataUpdate = GroundMeshMetadataSQLModel.get_update_cls()
    GroundMeshMetadataBulkUpdate = GroundMeshMetadataSQLModel.get_update_cls()
