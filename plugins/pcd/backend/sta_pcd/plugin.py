from __future__ import annotations

from decimal import Decimal
from functools import partial

import click
from pytz import BaseTzInfo
from tqdm import tqdm

from sqlmodel import Session

from sta.api.cors import expose_headers
from sta.api.source import data, spec
from sta.cli import (
    plugins_cli,
    source_export_to_filetree_command,
    source_import_by_st_command,
)
from sta.common.filesystem import FileSystemPath
from sta.domain.editor.loader import SOURCE_DATA_LOADERS, register_data_loader
from sta.domain.jobs import register_job_executor, run_pending_jobs
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.porter.st_metadata import STMetadataReader

from .api.source import data as data_pcd, spec as spec_pcd
from .domain.editor.loader import PointCloudLoader
from .domain.source.data import metadata as metadata_domain
from .domain.source.spec import specs as specs_domain
from .filesystem import PointCloudFileIO
from .models.source.data import PointCloudMetadataCreate
from .models.source.spec import PointCloudConfig


def _get_read_write_fn(
    current_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
):
    pcd_io = PointCloudFileIO()
    pcd_spec = specs_domain.read_spec_in_group(
        current_user=current_user,
        session=session,
        group_id=source_group.id,
    )
    if pcd_spec is None:
        msg = f"No point cloud source defined for source group #{source_group.id}"
        raise ValueError(msg)

    pcd_config = PointCloudConfig.model_validate(pcd_spec.config)
    pcd_type = pcd_config.dtype
    pcd_channel_headers = pcd_config.channel_headers

    read_fn = partial(
        pcd_io.read,
        dtype=pcd_type,
        channel_headers=pcd_channel_headers,
    )
    write_fn = pcd_io.write

    return read_fn, write_fn


def register():
    data.router.include_router(data_pcd.router)
    spec.router.include_router(spec_pcd.router)

    register_data_loader(SOURCE_DATA_LOADERS, "pcd", PointCloudLoader())
    register_job_executor(metadata_domain.reconcile_kind, metadata_domain.reconcile_bounds)
    expose_headers(
        (
            "X-Channel-Headers",
            "X-Num-Channels",
            "X-Num-Points",
        )
    )

    @plugins_cli.group
    def pcd() -> None:
        """Command-line interface for Point Cloud Plugin."""
        pass

    @source_import_by_st_command(pcd)
    def pcd_import_by_st(
        *,
        current_user: UserPublic,
        session: Session,
        source_group: SourceGroupPublic,
        data_info_path: str,
        data_tz: BaseTzInfo | None,
    ):
        group_id = source_group.id
        st_items = STMetadataReader().read_csv(
            data_info_path=data_info_path,
            data_tz=data_tz,
        )

        read_fn, _ = _get_read_write_fn(
            current_user=current_user,
            session=session,
            source_group=source_group,
        )

        pcd_items = []
        for st_item in tqdm(st_items, desc="Reading point clouds"):
            pcd_data = read_fn(st_item.filepath)
            pcd_data.apply_transformation(st_item.file_coords_to_db_coords)

            min_coords, max_coords = pcd_data.bbox
            pcd_item = PointCloudMetadataCreate(
                # Left in derived mode, with the box below as a placeholder: this reader
                # never applies the group's preprocessors, so only the bounds sweep can say
                # what the configured reading produces. Pinning it would make that guess
                # permanent.
                auto_bounds=True,
                min_x=Decimal(str(min_coords.x)),
                min_y=Decimal(str(min_coords.y)),
                min_z=Decimal(str(min_coords.z)),
                max_x=Decimal(str(max_coords.x)),
                max_y=Decimal(str(max_coords.y)),
                max_z=Decimal(str(max_coords.z)),
                min_timestamp=st_item.min_timestamp,
                max_timestamp=st_item.max_timestamp,
                uri=st_item.filepath.as_uri(),
                group_id=group_id,
                weather=None,
            ).update_from_transform(st_item.file_coords_to_db_coords)

            pcd_items.append(pcd_item)

        click.echo("Importing point cloud metadatas...")

        metadata_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=pcd_items,
        )
        session.commit()

        # The create queued one bounds sweep for the group instead of reading every file
        # twice over; run it before finishing so an import never leaves behind a dataset the
        # editor cannot intersect with.
        click.echo("Deriving spatial bounds...")
        run_pending_jobs(session=session)

        click.echo("Done!")

    @source_export_to_filetree_command(pcd)
    def pcd_export_to_filetree(
        *,
        current_user: UserPublic,
        session: Session,
        source_group: SourceGroupPublic,
        export_dir: FileSystemPath,
    ):
        click.echo("Reading point cloud metadatas...")

        pcd_items = metadata_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=source_group.id,
        )

        read_fn, write_fn = _get_read_write_fn(
            current_user=current_user,
            session=session,
            source_group=source_group,
        )

        for pcd_item in tqdm(pcd_items, desc="Exporting point clouds"):
            src_path = FileSystemPath.from_uri(pcd_item.uri)
            pcd_data = read_fn(src_path)
            pcd_data.apply_transformation(pcd_item.transform)

            dst_path = export_dir / src_path.path_str
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if dst_path.exists():
                msg = f"File already exists at path: {dst_path}"
                raise RuntimeError(msg)

            write_fn(dst_path, pcd_data)
