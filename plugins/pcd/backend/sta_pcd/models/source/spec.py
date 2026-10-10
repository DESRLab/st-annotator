from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, ClassVar

from sqlalchemy.sql.sqltypes import JSON, Text
from sqlmodel import Field, SQLModel

from sta.models.source.group import SourceGroup, SourceGroupPublic
from sta.models.source.spec import SourceSpecSQLModel
from sta.models.types import Name

from ..configs import PointCloudConfig


class PointCloudSpecSQLModel(SourceSpecSQLModel):
    description: str = Field(sa_type=Text, nullable=False, default="")
    config: PointCloudConfig = Field(
        sa_type=JSON, nullable=False, default_factory=PointCloudConfig.default
    )

    @classmethod
    def get_update_cls(cls):
        class PointCloudSpecUpdate(super().get_update_cls()):
            description: str | None = None
            config: PointCloudConfig | None = None

        return PointCloudSpecUpdate


if TYPE_CHECKING:

    class PointCloudSpecGroup(SQLModel):
        spec_id: int
        group_id: int
        group: SourceGroup

    class PointCloudSpec(PointCloudSpecSQLModel):
        __table__: ClassVar[Any]
        __tablename__: ClassVar[Any]
        id: int
        group_links: list[PointCloudSpecGroup]

        @classmethod
        def get_group_links_cls(cls) -> type[PointCloudSpecGroup]:
            return PointCloudSpecGroup

        @property
        def groups(self) -> Sequence[SourceGroup]:
            return [link.group for link in self.group_links]

    class PointCloudSpecCreate(PointCloudSpecSQLModel):
        group_ids: list[int]

    class PointCloudSpecPublic(PointCloudSpecSQLModel):
        id: int
        groups: list[SourceGroupPublic]

    class PointCloudSpecUpdate(SQLModel):
        name: Name | None = None
        group_ids: list[int] | None = None
        description: str | None = None
        config: PointCloudConfig | None = None

    class PointCloudSpecBulkUpdate(PointCloudSpecUpdate):
        pass
else:
    PointCloudSpec = PointCloudSpecSQLModel.get_table_cls("pcd_spec")
    PointCloudSpecCreate = PointCloudSpecSQLModel.get_create_cls()
    PointCloudSpecPublic = PointCloudSpecSQLModel.get_public_cls()
    PointCloudSpecUpdate = PointCloudSpecSQLModel.get_update_cls()
    PointCloudSpecBulkUpdate = PointCloudSpecSQLModel.get_update_cls()
