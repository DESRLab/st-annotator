"""Register relation data, specifications, and repository operations."""

from fastapi import APIRouter

from sta.api.label import data, spec
from sta.domain.editor.loader import LABEL_DATA_LOADERS, register_data_loader
from sta.domain.label.data.endpoints import ELEMENT_DELETE_LISTENERS
from sta.domain.label.repo.ops import OP_REGISTRY

from .api import data as relation_data
from .api.classes import definitions, selections
from .domain.data import delete_attached
from .domain.loader import RelationLoader
from .domain.ops import Create, Delete, DeleteParams, RelationParams, Update, UpdateParams


def register():
    data.router.include_router(relation_data.router)
    classes = APIRouter(prefix="/relation-class", tags=["relation-class"])
    classes.include_router(definitions.router)
    classes.include_router(selections.router)
    spec.router.include_router(classes)
    register_data_loader(LABEL_DATA_LOADERS, "relation", RelationLoader())
    OP_REGISTRY.register("relation-create", Create, RelationParams)
    OP_REGISTRY.register("relation-update", Update, UpdateParams)
    OP_REGISTRY.register("relation-delete", Delete, DeleteParams)
    ELEMENT_DELETE_LISTENERS.append(delete_attached)
