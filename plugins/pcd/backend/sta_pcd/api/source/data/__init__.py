from fastapi.routing import APIRouter

from . import metadata

router = APIRouter(prefix="/pcd", tags=["pcd"])

router.include_router(metadata.router)
