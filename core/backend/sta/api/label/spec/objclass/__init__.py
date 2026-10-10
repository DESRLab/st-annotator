from fastapi.routing import APIRouter

from . import definitions, selections

router = APIRouter(prefix="/objclass", tags=["objclass"])

router.include_router(definitions.router)
router.include_router(selections.router)
