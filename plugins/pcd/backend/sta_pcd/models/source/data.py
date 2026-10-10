from typing import TYPE_CHECKING, Any, ClassVar

from pydantic import AwareDatetime
from sqlalchemy.sql.sqltypes import String
from sqlmodel import Field, SQLModel

from sta.common.spatial import DecimalCoord
from sta.models.base import sqlmodel_sa_type
from sta.models.source.data import SourceTransformMetadataSQLModel
from sta.models.source.group import SourceGroup, SourceGroupPublic
from sta.models.types import FileURI


class PointCloudMetadataSQLModel(SourceTransformMetadataSQLModel):
    weather: str | None = Field(max_length=31, sa_type=sqlmodel_sa_type(String(31)))

    @classmethod
    def get_update_cls(cls):
        class PointCloudMetadataUpdate(super().get_update_cls()):
            weather: str | None = Field(default=None, max_length=31)

        return PointCloudMetadataUpdate


if TYPE_CHECKING:

    class PointCloudMetadata(PointCloudMetadataSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: int
        group: SourceGroup = Field(default=None)

    class PointCloudMetadataCreate(PointCloudMetadataSQLModel):
        pass

    class PointCloudMetadataPublic(PointCloudMetadataSQLModel):
        id: int
        group: SourceGroupPublic = Field(default=None)

    class PointCloudMetadataUpdate(SQLModel):
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
        weather: str | None = Field(default=None, max_length=31)

    class PointCloudMetadataBulkUpdate(PointCloudMetadataUpdate):
        pass
else:
    PointCloudMetadata = PointCloudMetadataSQLModel.get_table_cls("pcd")
    PointCloudMetadataCreate = PointCloudMetadataSQLModel.get_create_cls()
    PointCloudMetadataPublic = PointCloudMetadataSQLModel.get_public_cls()
    PointCloudMetadataUpdate = PointCloudMetadataSQLModel.get_update_cls()
    PointCloudMetadataBulkUpdate = PointCloudMetadataSQLModel.get_update_cls()
