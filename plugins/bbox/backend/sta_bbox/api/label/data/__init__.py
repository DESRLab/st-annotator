from fastapi.routing import APIRouter

from . import element, entity

router = APIRouter(prefix='/bbox', tags=['bbox'])

router.include_router(element.router)
router.include_router(entity.router)
