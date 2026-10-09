
from sqlalchemy.sql.sqltypes import JSON, Text
from sqlmodel import Field

from sta.services.models.source.spec import SourceSpecSQLModel

from ..configs import PointCloudConfig


class PointCloudSpecSQLModel(SourceSpecSQLModel):
    description: str = Field(sa_type=Text, nullable=False, default='')
    config: PointCloudConfig = Field(sa_type=JSON, nullable=False, default_factory=PointCloudConfig.default)

    @classmethod
    def get_update_cls(cls):
        class PointCloudSpecUpdate(super().get_update_cls()):
            description: str | None = None
            config: PointCloudConfig | None = None

        return PointCloudSpecUpdate


PointCloudSpec = PointCloudSpecSQLModel.get_table_cls("pcd_spec")
PointCloudSpecCreate = PointCloudSpecSQLModel.get_create_cls()
PointCloudSpecPublic = PointCloudSpecSQLModel.get_public_cls()
PointCloudSpecUpdate = PointCloudSpecSQLModel.get_update_cls()
PointCloudSpecBulkUpdate = PointCloudSpecSQLModel.get_update_cls()
