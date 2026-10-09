from __future__ import annotations

import click
from pytz import BaseTzInfo
from tqdm import tqdm

from sqlmodel import Session

from sta.cli import (
    plugins_cli,
    source_export_to_filetree_command,
    source_import_by_st_command,
)
from sta.common.filesystem import FileSystemPath
from sta.services.api.source import data
from sta.services.domain.editor.loader import SOURCE_DATA_LOADERS
from sta.services.models.source.group import SourceGroupPublic
from sta.services.models.user import UserPublic
from sta.services.porter.st_metadata import STMetadataReader

from .api.source import data as data_gmesh
from .domain.editor.loader import GroundMeshLoader
from .domain.source.data import metadata as metadata_domain
from .filesystem import GroundMeshFileIO
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

    SOURCE_DATA_LOADERS["gmesh"] = GroundMeshLoader()

    @plugins_cli.group
    def gmesh() -> None:
        """Command-line interface for Ground Mesh Plugin."""
        pass

    @source_import_by_st_command(gmesh)
    def gmesh_import_by_st(
        *,
        current_user: UserPublic,
        session: Session,
        source_group: SourceGroupPublic,
        data_info_uri: str,
        data_tz: BaseTzInfo | None,
    ):
        group_id = source_group.id
        st_items = STMetadataReader().read_csv(
            data_info_uri=data_info_uri,
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
                min_x=min_coords.x,
                min_y=min_coords.y,
                min_z=min_coords.z,
                max_x=max_coords.x,
                max_y=max_coords.y,
                max_z=max_coords.z,
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
            gmesh_data.apply_transformation(gmesh_data.transform)

            dst_path = export_dir / src_path.path_str
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if dst_path.exists():
                msg = f'File already exists at path: {dst_path}'
                raise RuntimeError(msg)

            write_fn(dst_path, gmesh_data)
