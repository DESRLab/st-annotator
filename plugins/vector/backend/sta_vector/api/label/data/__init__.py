from fastapi.routing import APIRouter

from . import element

router = APIRouter(prefix='/vector', tags=['vector'])

router.include_router(element.router)
