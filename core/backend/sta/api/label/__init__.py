from http import HTTPStatus

from fastapi import APIRouter, Depends

from ..users import get_current_user
from . import data, groups, repo, spec


# Include routes added by the plugins
def setup_router():
    router = APIRouter(
        prefix="/label",
        tags=["label"],
        dependencies=[Depends(get_current_user)],
        responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
    )
    router.include_router(data.router)
    router.include_router(groups.router)
    router.include_router(repo.setup_router())
    router.include_router(spec.router)

    return router
