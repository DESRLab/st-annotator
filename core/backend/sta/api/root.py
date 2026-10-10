import re
import sqlite3
from http import HTTPStatus

import psycopg2
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import (
    Constraint,
    ForeignKeyConstraint,
    PrimaryKeyConstraint,
    Table,
    UniqueConstraint,
)
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel

from sta.common.logging import get_logger
from sta.domain.jobs.worker import job_worker_lifespan

from . import accounts, auth, editor, files, frames, jobs, label, projects, source, tasks, users
from .body_limit import RequestBodyLimitMiddleware, max_request_bytes_from_env
from .cors import get_exposed_headers
from .lifespan import api_lifespan, register_lifespan_handler
from .rate_limit import LoginRateLimiter

logger = get_logger()

router = APIRouter()

register_lifespan_handler(job_worker_lifespan)


@router.get("/")
def root():
    return RedirectResponse("/docs")


def _get_postgresql_default_constraint_name(constraint: Constraint, table_name: str) -> str | None:
    if isinstance(constraint, PrimaryKeyConstraint):
        return f"{table_name}_pkey"

    if isinstance(constraint, ForeignKeyConstraint):
        return f"{table_name}_{'_'.join(constraint.columns.keys())}_fkey"

    if isinstance(constraint, UniqueConstraint):
        return f"{table_name}_{'_'.join(constraint.columns.keys())}_key"

    return None


def _find_table_constraint(table: Table, constraint_name: str) -> Constraint | None:
    for constraint in table.constraints:
        if constraint.name == constraint_name:
            return constraint

    for constraint in table.constraints:
        if _get_postgresql_default_constraint_name(constraint, table.name) == constraint_name:
            return constraint

    return None


def parse_integrity_violation(exc: IntegrityError) -> str | None:
    exc_dbapi = exc.orig

    if isinstance(exc_dbapi, sqlite3.IntegrityError):
        if not exc_dbapi.args or not isinstance(exc_dbapi.args[0], str):
            return None
        error_str = exc_dbapi.args[0]

        if "FOREIGN KEY constraint failed" in error_str:
            # SQLite does not provide information about which constraint is violated
            return "A referenced item does not exist"
        elif re.search(r"UNIQUE constraint failed: (.+)", error_str):
            # The matched text is "table.column", so it identifies the constraint
            # without being echoed: the PostgreSQL branch deliberately keeps
            # schema details out of client-visible responses.
            return "A duplicate item already exists"
        else:
            return None

    if isinstance(exc_dbapi, psycopg2.errors.IntegrityError):
        table_name = exc_dbapi.diag.table_name
        constraint_name = exc_dbapi.diag.constraint_name

        if table_name and constraint_name:
            table = SQLModel.metadata.tables.get(table_name)

            if table is not None:
                constraint = _find_table_constraint(table, constraint_name)

                if isinstance(constraint, (PrimaryKeyConstraint, UniqueConstraint)):
                    return "A duplicate item already exists"
                if isinstance(constraint, ForeignKeyConstraint):
                    return "A referenced item does not exist"

        if isinstance(exc_dbapi, psycopg2.errors.ForeignKeyViolation):
            return "A referenced item does not exist"

        if isinstance(exc_dbapi, psycopg2.errors.UniqueViolation):
            return "A duplicate item already exists"

        return None

    # Unknown drivers and constraint shapes must reach the handler's logged 500
    # fallback without replacing the original database exception.
    return None


def build_api(frontend_url: str, *, start_job_worker: bool = False) -> FastAPI:
    app = FastAPI(lifespan=api_lifespan)
    app.state.login_rate_limiter = LoginRateLimiter.from_env()
    # Deferred work is opt-in per process: tests build this app to assert on what a
    # request left behind, and a worker draining the queue concurrently would make those
    # assertions race. `sta serve` is the caller that turns it on.
    app.state.job_worker_enabled = start_job_worker

    # Resolve the remaining per-request environment settings once here, next to
    # the limiter, so a malformed value aborts startup instead of raising from
    # inside every login. Only IntegrityError has an exception handler, so a
    # RuntimeError thrown in a request path would surface as a plaintext 500.
    app.state.trusted_proxy_networks = auth.trusted_proxy_networks_from_env()
    app.state.jwt_access_expiry_seconds = auth.jwt_access_expiry_seconds_from_env()

    app.add_middleware(
        RequestBodyLimitMiddleware,
        max_bytes=max_request_bytes_from_env(),
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        # The URL of the frontend server
        allow_origins=[frontend_url],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=get_exposed_headers(),
    )

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(request: Request, exc: IntegrityError):
        if detail := parse_integrity_violation(exc):
            return JSONResponse(
                status_code=HTTPStatus.BAD_REQUEST,
                content={"detail": detail},
            )

        logger.error("Failed to handle IntegrityError", exc_info=exc)

        return JSONResponse(
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )

    # Include routes added by the plugins
    app.include_router(router)

    app.include_router(accounts.router)
    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(files.router)

    app.include_router(frames.router)
    app.include_router(projects.router)
    app.include_router(tasks.router)
    app.include_router(jobs.router)

    app.include_router(source.setup_router())
    app.include_router(label.setup_router())

    app.include_router(editor.setup_router())

    return app
