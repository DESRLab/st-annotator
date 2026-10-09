from fastapi.routing import APIRouter

from . import specs

router = APIRouter(prefix='/pcd', tags=['pcd'])

router.include_router(specs.router)
