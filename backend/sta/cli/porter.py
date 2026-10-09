
from __future__ import annotations

from typing import Protocol

import click
from pytz import BaseTzInfo, timezone

from sqlmodel import Session

from sta.common.filesystem import FileSystemPath

from ..services.config import AppConfig
from ..services.entrypoints import app_ctx
from ..services.models.label.repo import LabelsetBranchPublic
from ..services.models.source.group import SourceGroupPublic
from ..services.models.user import UserPublic
from ..services.session import session_ctx
from .prompts import prompt_label_branch, prompt_login, prompt_source_group

__all__ = [
    'label_export_by_src_command',
    'label_import_by_st_command',
    'source_export_to_filetree_command',
    'source_import_by_st_command',
]


def _extract_config(ctx: click.Context) -> AppConfig:
    """The context is assumed to be under `sta plugin` command."""
    config = ctx.find_object(AppConfig)
    assert config is not None
    return config


class SourceImportBySTFunc(Protocol):
    def __call__(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        source_group: SourceGroupPublic,
        data_info_uri: str,
        data_tz: BaseTzInfo | None,
    ) -> None:
        ...


def source_import_by_st_command(plugin: click.Group):
    def wrapper(import_fn: SourceImportBySTFunc):
        @plugin.command('import-by-st')
        @click.argument('data_info_uri', type=click.Path(dir_okay=False, file_okay=True, path_type=str), required=True)
        @click.option('--tz', metavar='<TIMEZONE>', type=str, help='Specifies the timezone of each data instance.')
        @click.pass_context
        def import_by_st(ctx: click.Context, data_info_uri: str, *, tz: str | None = None):
            """
            Import source data into the ST Annotator platform according to
            the spatiotemporal metadata in a CSV file, located at DATA_INFO_URI
            (relative to FILESYSTEM_ROOT in the ST Annotator configuration).

            Each row in the CSV file should follow the schema defined by
            :class:`sta.services.porter.st_metadata.STInfoRow`.

            For the `--tz` option, the available timezones are listed in the
            `tz database <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones>`_.
            """
            config = _extract_config(ctx)

            with app_ctx(app_config=config), session_ctx(config) as session:
                user = prompt_login(session)
                source_group = prompt_source_group(user, session)

                import_fn(
                    current_user=user,
                    session=session,
                    source_group=source_group,
                    data_info_uri=data_info_uri,
                    data_tz=None if tz is None else timezone(tz),
                )

                session.commit()

        return import_by_st

    return wrapper


class SourceExportToFileTreeFunc(Protocol):
    def __call__(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        source_group: SourceGroupPublic,
        export_dir: FileSystemPath,
    ) -> None:
        ...


def source_export_to_filetree_command(plugin: click.Group):
    def wrapper(export_fn: SourceExportToFileTreeFunc):
        @plugin.command('export-to-filetree')
        @click.argument('export_dir', type=click.Path(dir_okay=True, file_okay=False, path_type=str), required=True)
        @click.pass_context
        def export_to_filetree(ctx: click.Context, export_dir: str):
            """
            Export source data from the ST Annotator platform into
            a hierarchy under the directory EXPORT_DIR.

            A new file is created for each source data instance based on the corresponding metadata
            stored on the platform.
            """
            config = _extract_config(ctx)

            with app_ctx(app_config=config), session_ctx(config) as session:
                user = prompt_login(session)
                source_group = prompt_source_group(user, session)

                export_fn(
                    current_user=user,
                    session=session,
                    source_group=source_group,
                    export_dir=FileSystemPath.from_uri(export_dir),
                )

                session.commit()

        return export_to_filetree

    return wrapper


class LabelImportBySTFunc(Protocol):
    def __call__(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        label_branch: LabelsetBranchPublic,
        data_info_uri: str,
        data_tz: BaseTzInfo | None,
    ) -> None:
        ...


def label_import_by_st_command(plugin: click.Group):
    def wrapper(import_fn: LabelImportBySTFunc):
        @plugin.command('import-by-st')
        @click.argument('data_info_uri', type=click.Path(dir_okay=False, file_okay=True, path_type=str), required=True)
        @click.option('--tz', metavar='<TIMEZONE>', type=str, help='Specifies the timezone of each data instance.')
        @click.pass_context
        def import_by_st(ctx: click.Context, data_info_uri: str, *, tz: str | None = None):
            """
            Import label data into the ST Annotator platform according to
            the spatiotemporal metadata in a CSV file, located at DATA_INFO_URI
            (relative to FILESYSTEM_ROOT in the ST Annotator configuration).

            Each row in the CSV file should follow the schema defined by
            :class:`sta.services.porter.st_metadata.STInfoRow`.

            For the `--tz` option, the available timezones are listed in the
            `tz database <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones>`_.
            """
            config = _extract_config(ctx)

            with app_ctx(app_config=config), session_ctx(config) as session:
                user = prompt_login(session)
                label_branch = prompt_label_branch(user, session)

                import_fn(
                    current_user=user,
                    session=session,
                    label_branch=label_branch,
                    data_info_uri=data_info_uri,
                    data_tz=None if tz is None else timezone(tz),
                )

                session.commit()

        return import_by_st

    return wrapper


class LabelExportBySourceFunc(Protocol):
    def __call__(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        label_branch: LabelsetBranchPublic,
        export_dir: FileSystemPath,
    ) -> None:
        ...


def label_export_by_src_command(plugin: click.Group):
    def wrapper(export_fn: LabelExportBySourceFunc):
        @plugin.command('export-by-src')
        @click.argument('export_dir', type=click.Path(dir_okay=True, file_okay=False, path_type=str), required=True)
        @click.pass_context
        def export_by_src(ctx: click.Context, export_dir: str):
            """
            Export label data from the ST Annotator platform into
            a hierarchy under the directory EXPORT_DIR.

            The label data is grouped by source data instance. In particular, each output file contains
            the labels that have a spatiotemporal overlap with the source data instance on the platform.
            """
            config = _extract_config(ctx)

            with app_ctx(app_config=config), session_ctx(config) as session:
                user = prompt_login(session)
                label_branch = prompt_label_branch(user, session)

                export_fn(
                    current_user=user,
                    session=session,
                    label_branch=label_branch,
                    export_dir=FileSystemPath.from_uri(export_dir),
                )

                session.commit()

        return export_by_src

    return wrapper
