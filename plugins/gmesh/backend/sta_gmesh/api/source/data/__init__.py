from fastapi.routing import APIRouter

from . import metadata

router = APIRouter(prefix='/gmesh', tags=['gmesh'])

router.include_router(metadata.router)
