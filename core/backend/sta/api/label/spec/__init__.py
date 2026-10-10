from fastapi.routing import APIRouter

from . import objclass

router = APIRouter(prefix="/spec", tags=["spec"])

router.include_router(objclass.router)
