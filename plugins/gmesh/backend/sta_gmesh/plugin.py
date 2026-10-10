from __future__ import annotations

from decimal import Decimal

import click
from pytz import BaseTzInfo
from tqdm import tqdm

from sqlmodel import Session

from sta.api.cors import expose_headers
from sta.api.source import data
from sta.cli import (
    plugins_cli,
    source_export_to_filetree_command,
    source_import_by_st_command,
)
from sta.cli.porter import extract_config
from sta.common.filesystem import FileSystemPath
from sta.domain.editor.loader import SOURCE_DATA_LOADERS, register_data_loader
from sta.domain.jobs import register_job_executor
from sta.entrypoints import app_ctx
from sta.models.source.group import SourceGroupPublic
from sta.models.user import UserPublic
from sta.porter.st_metadata import STMetadataReader
from sta_pcd.filesystem import PointCloudFileIO

from .api.source import data as data_gmesh
from .domain.editor.loader import GroundMeshLoader
from .domain.source.data import metadata as metadata_domain
from .filesystem import GroundMeshData, GroundMeshFileIO
from .models.source.data import GroundMeshMetadataCreate


def _get_read_write_fn(
    current_user: UserPublic,
    session: Session,
    source_group: SourceGroupPublic,
):
    gmesh_io = GroundMeshFileIO()

    return gmesh_io.read, gmesh_io.write


def register():
    data.router.include_router(data_gmesh.router)

    register_data_loader(SOURCE_DATA_LOADERS, "gmesh", GroundMeshLoader())
    register_job_executor(metadata_domain.reconcile_kind, metadata_domain.reconcile_bounds)
    expose_headers(
        (
            "X-Faces-ByteLength",
            "X-Vertices-ByteLength",
        )
    )

    @plugins_cli.group
    def gmesh() -> None:
        """Command-line interface for Ground Mesh Plugin."""
        pass

    @gmesh.command
    @click.argument(
        "data_uri", type=click.Path(file_okay=False, dir_okay=True, path_type=str), required=True
    )
    @click.pass_context
    def generate_from_pcd(ctx: click.Context, *, data_uri: str):
        """
        Generate a ground mesh for each point cloud file in DATA_URI
        (relative to FILESYSTEM_ROOT in the ST Annotator configuration).
        """
        config = extract_config(ctx)

        with app_ctx(config):
            data_dir = FileSystemPath.from_uri(data_uri)

            pcd_io = PointCloudFileIO()
            gmesh_io = GroundMeshFileIO()

            in_files = [in_file for in_file in data_dir.iterdir() if pcd_io.supports_read(in_file)]

            for in_file in tqdm(in_files, "Generating ground mesh for point clouds"):
                pcd = pcd_io.read(
                    in_file, dtype="float", channel_headers=["x", "y", "z", "intensity"]
                )
                gmesh = GroundMeshData.from_pcd(pcd)

                out_file = in_file.with_suffix(".obj")
                gmesh_io.write(out_file, gmesh)

    @source_import_by_st_command(gmesh)
    def gmesh_import_by_st(
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

        gmesh_items = []
        for st_item in tqdm(st_items, desc="Reading ground meshes"):
            gmesh_data = read_fn(st_item.filepath)
            gmesh_data.apply_transformation(st_item.file_coords_to_db_coords)

            min_coords, max_coords = gmesh_data.bbox
            gmesh_item = GroundMeshMetadataCreate(
                # Stated as derived because it is: this reads each mesh and applies its
                # transform exactly as the derivation does, and a mesh has no reading
                # configuration that could later disagree with the result.
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
            ).update_from_transform(st_item.file_coords_to_db_coords)

            gmesh_items.append(gmesh_item)

        click.echo("Importing ground mesh metadatas...")

        metadata_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=gmesh_items,
            # The boxes above are the canonical derivation's output, so this records them
            # as such instead of queueing a sweep to re-read every mesh a second time.
            attest_bounds=True,
        )

        click.echo("Done!")

    @source_export_to_filetree_command(gmesh)
    def gmesh_export_to_filetree(
        *,
        current_user: UserPublic,
        session: Session,
        source_group: SourceGroupPublic,
        export_dir: FileSystemPath,
    ):
        click.echo("Reading ground mesh metadatas...")

        gmesh_items = metadata_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=source_group.id,
        )

        read_fn, write_fn = _get_read_write_fn(
            current_user=current_user,
            session=session,
            source_group=source_group,
        )

        for gmesh_item in tqdm(gmesh_items, desc="Exporting ground meshes"):
            src_path = FileSystemPath.from_uri(gmesh_item.uri)
            gmesh_data = read_fn(src_path)
            gmesh_data.apply_transformation(gmesh_item.transform)

            dst_path = export_dir / src_path.path_str
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if dst_path.exists():
                msg = f"File already exists at path: {dst_path}"
                raise RuntimeError(msg)

            write_fn(dst_path, gmesh_data)
