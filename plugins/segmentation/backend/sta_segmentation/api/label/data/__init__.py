from fastapi.routing import APIRouter

from . import element, entity

router = APIRouter(prefix='/segmentation', tags=['segmentation'])

router.include_router(element.router)
router.include_router(entity.router)
