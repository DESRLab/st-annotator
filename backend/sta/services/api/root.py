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

from . import accounts, auth, editor, files, frames, label, projects, source, tasks, users

logger = get_logger()

router = APIRouter()

@router.get("/")
def root():
    return RedirectResponse("/docs")


def _get_postgresql_default_constraint_name(constraint: Constraint, table_name: str) -> str | None:
    if isinstance(constraint, PrimaryKeyConstraint):
        return f'{table_name}_pkey'

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
        error_str = exc_dbapi.args[0]
        assert isinstance(error_str, str)

        if "FOREIGN KEY constraint failed" in error_str:
            # SQLite does not provide information about which constraint is violated
            return "A referenced item does not exist"
        elif (match := re.search(r'UNIQUE constraint failed: (.+)', error_str)):
            table_attrs = match.group(1)
            return f"A duplicate item already exists for the key: {table_attrs}"
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
                    table_attrs = ", ".join(f"{c.table.name}.{c.name}" for c in constraint.columns)
                    return f"A duplicate item already exists for the key: {table_attrs}"
                if isinstance(constraint, ForeignKeyConstraint):
                    table_attrs = ", ".join(f"{c.table.name}.{c.name}" for c in constraint.columns)
                    return f"A referenced item does not exist for the key: {table_attrs}"

                if constraint is not None:
                    raise NotImplementedError(type(constraint))

        if isinstance(exc_dbapi, psycopg2.errors.ForeignKeyViolation):
            return "A referenced item does not exist"

        if isinstance(exc_dbapi, psycopg2.errors.UniqueViolation):
            return "A duplicate item already exists"

        return None

    raise NotImplementedError(type(exc_dbapi))


def build_api() -> FastAPI:
    app = FastAPI()

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        # The URL of the frontend server
        allow_origins=["http://localhost:5173"],  # Frontend origin
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Range"],
    )

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(request: Request, exc: IntegrityError):
        if (detail := parse_integrity_violation(exc)):
            return JSONResponse(
                status_code=HTTPStatus.BAD_REQUEST,
                content={"detail": detail},
            )

        logger.exception("Failed to handle IntegrityError", exc_info=exc)

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

    app.include_router(source.setup_router())
    app.include_router(label.setup_router())

    app.include_router(editor.setup_router())

    return app
