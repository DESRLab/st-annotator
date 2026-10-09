
from sqlalchemy.sql.sqltypes import String
from sqlmodel import Field

from sta.services.models.source.data import SourceTransformMetadataSQLModel


class PointCloudMetadataSQLModel(SourceTransformMetadataSQLModel):
    weather: str | None = Field(sa_type=String(31))

    @classmethod
    def get_update_cls(cls):
        class PointCloudMetadataUpdate(super().get_update_cls()):
            weather: str | None = None

        return PointCloudMetadataUpdate


PointCloudMetadata = PointCloudMetadataSQLModel.get_table_cls("pcd")
PointCloudMetadataCreate = PointCloudMetadataSQLModel.get_create_cls()
PointCloudMetadataPublic = PointCloudMetadataSQLModel.get_public_cls()
PointCloudMetadataUpdate = PointCloudMetadataSQLModel.get_update_cls()
PointCloudMetadataBulkUpdate = PointCloudMetadataSQLModel.get_update_cls()
