from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

import click
from pytz import BaseTzInfo
from tqdm import tqdm

from pydantic import TypeAdapter
from sqlmodel import Session

from sta.api.label import data
from sta.cli import (
    label_export_by_src_command,
    label_import_by_st_command,
    plugins_cli,
)
from sta.cli.prompts import prompt_source_group
from sta.common.filesystem import FileSystemPath
from sta.common.logging import get_logger
from sta.common.spatial import PartialSTBounds
from sta.domain.editor.loader import LABEL_DATA_LOADERS, register_data_loader
from sta.domain.label.repo.ops import OP_REGISTRY
from sta.domain.label.spec.objclass import selections as objclass_domain
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.label.spec import ObjectClass
from sta.models.source.data import SourceMetadataTableLike
from sta.models.user import UserPublic
from sta.porter.st_metadata import STMetadataReader
from sta_pcd.domain.source.data import metadata as pcd_domain

from .api.label import data as data_vector
from .domain.editor.loader import VectorLoader
from .domain.label.data import element as element_domain
from .domain.label.repo.ops.vector import register_vector_ops
from .filesystem import LabelClassModel, LabelsFileIO, LabelsModel, LabelVectorModel
from .models.label.data import (
    LabelVector,
    VectorType,
    VectorVertices,
)

logger = get_logger()


def _get_read_write_fn(
    current_user: UserPublic,
    session: Session,
    label_branch: LabelsetBranchPublic,
):
    labels_io = LabelsFileIO()

    return labels_io.read, labels_io.write


def register():
    data.router.include_router(data_vector.router)

    register_vector_ops(OP_REGISTRY)

    register_data_loader(LABEL_DATA_LOADERS, "vector", VectorLoader())

    @plugins_cli.group
    def vector() -> None:
        """Command-line interface for Vector Labels Plugin."""
        pass

    @label_import_by_st_command(vector)
    def vector_import_by_st(
        *,
        current_user: UserPublic,
        session: Session,
        label_branch: LabelsetBranchPublic,
        data_info_path: str,
        data_tz: BaseTzInfo | None,
    ):
        commit = label_branch.head
        st_items = STMetadataReader().read_csv(
            data_info_path=data_info_path,
            data_tz=data_tz,
        )

        read_fn, _ = _get_read_write_fn(
            current_user=current_user,
            session=session,
            label_branch=label_branch,
        )

        objclass_selection = objclass_domain.read_spec_in_group(
            current_user=current_user,
            session=session,
            group_id=label_branch.group_id,
        )

        if objclass_selection is None:
            objclasses_by_id: dict[int | None, ObjectClass] = {}
            objclasses_by_name: dict[str, ObjectClass] = {}
        else:
            objclasses_by_id = {objclass.id: objclass for objclass in objclass_selection.objclasses}
            objclasses_by_name = {
                objclass.name: objclass for objclass in objclass_selection.objclasses
            }

        vector_items: list[LabelVector] = []

        def resolve_objclass_id(reference: Any) -> int:
            objclass = objclasses_by_id.get(reference.id) or objclasses_by_name.get(reference.name)
            if objclass is None or objclass.id is None:
                msg = f"Cannot resolve object class {reference!r}"
                raise ValueError(msg)
            return objclass.id

        for st_item in tqdm(st_items, desc="Reading vector labels"):
            min_timestamp = st_item.min_timestamp
            max_timestamp = st_item.max_timestamp
            if min_timestamp != max_timestamp:
                msg = "Each bounding vector should only occupy a single timestamp"
                raise ValueError(msg)

            labels = read_fn(st_item.filepath)
            timestamp = min_timestamp

            for vector in labels.vectors:
                gt_class = vector.gt_class
                vertices = st_item.file_coords_to_db_coords.apply_to_vertices(vector.vertices)

                vector_items.append(
                    LabelVector.from_vertices(
                        id=uuid.UUID(int=vector.id),
                        group_id=commit.group_id,
                        commit_hash=commit.hash,
                        vertices=TypeAdapter(VectorVertices).validate_python(
                            {
                                "type": VectorType(vector.vector_type),
                                "coords": [v.to_decimal().to_dict() for v in vertices],
                            }
                        ),
                        timestamp=timestamp,
                        gt_class_id=None if gt_class is None else resolve_objclass_id(gt_class),
                    )
                )

        click.echo("Importing vector labels...")

        element_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=vector_items,
        )

        click.echo("Done!")

    @label_export_by_src_command(vector)
    def vector_export_by_arc(
        *,
        current_user: UserPublic,
        session: Session,
        label_branch: LabelsetBranchPublic,
        export_dir: FileSystemPath,
    ):
        element_items = element_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=label_branch.group_id,
            commit_hash=label_branch.head_hash,
        )
        if len(element_items) == 0:
            msg = "No labels found"
            raise RuntimeError(msg)

        source_group = prompt_source_group(current_user, session)
        sources = pcd_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=source_group.id,
        )
        if len(sources) == 0:
            msg = "No source data found"
            raise RuntimeError(msg)

        sources_by_st_bounds: dict[
            PartialSTBounds,
            list[SourceMetadataTableLike],
        ] = defaultdict(list)
        for source in sources:
            sources_by_st_bounds[source.st_bounds].append(source)

        sources_by_id = {source.id: source for source in sources}

        # Key by source id: the SQLModel source rows define __eq__ and are
        # therefore unhashable, so they cannot key the dict directly.
        labels_by_source_id: dict[
            int,
            list[LabelVector],
        ] = defaultdict(list)

        for element in tqdm(element_items, desc="Matching label elements to source data"):
            label_bounds = element.st_bounds

            for src_bounds, srcs in sources_by_st_bounds.items():
                if label_bounds.intersects(src_bounds):
                    for src in srcs:
                        element_lst = labels_by_source_id[src.id]
                        element_lst.append(element)

        _, write_fn = _get_read_write_fn(
            current_user=current_user,
            session=session,
            label_branch=label_branch,
        )

        for source_id, elements in tqdm(
            labels_by_source_id.items(), desc="Exporting vector labels"
        ):
            source = sources_by_id[source_id]
            src_path = FileSystemPath.from_uri(source.uri)

            dst_path = export_dir / src_path.parent.path_str / f"{src_path.name}.json"
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if dst_path.exists():
                msg = f"File already exists at path: {dst_path}"
                raise RuntimeError(msg)

            vector_data: list[LabelVectorModel] = []
            for vector in elements:
                model = LabelVectorModel(
                    id=vector.id.int,
                    vector_type=vector.type,
                    vertices=[v.to_float() for v in vector.vertices.coords],
                )

                vector_class = vector.gt_class
                if vector_class is None:
                    logger.warning("No associated class for vector label: %s. Skipping.", vector)
                    model.gt_class = None
                else:
                    model.gt_class = LabelClassModel(id=vector_class.id, name=vector_class.name)

                vector_data.append(model)

            write_fn(dst_path, LabelsModel(vectors=vector_data))
