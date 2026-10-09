from sta.services.models.source.data import SourceTransformMetadataSQLModel


class GroundMeshMetadataSQLModel(SourceTransformMetadataSQLModel):
    pass


GroundMeshMetadata = GroundMeshMetadataSQLModel.get_table_cls("gmesh")
GroundMeshMetadataCreate = GroundMeshMetadataSQLModel.get_create_cls()
GroundMeshMetadataPublic = GroundMeshMetadataSQLModel.get_public_cls()
GroundMeshMetadataUpdate = GroundMeshMetadataSQLModel.get_update_cls()
GroundMeshMetadataBulkUpdate = GroundMeshMetadataSQLModel.get_update_cls()
