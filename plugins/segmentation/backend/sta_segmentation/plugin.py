from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal
from typing import Any

import click
from pytz import BaseTzInfo
from tqdm import tqdm

from sqlmodel import Session

from sta.api import editor
from sta.api.label import data
from sta.api.lifespan import register_lifespan_handler
from sta.cli import (
    label_export_by_src_command,
    label_import_by_st_command,
    plugins_cli,
)
from sta.cli.prompts import prompt_source_group
from sta.common.filesystem import FileSystemPath
from sta.common.logging import get_logger
from sta.common.spatial import DecimalCoord3, PartialSTBounds
from sta.domain.editor.loader import LABEL_DATA_LOADERS, register_data_loader
from sta.domain.label.repo.ops import OP_REGISTRY
from sta.domain.label.spec.objclass import selections as objclass_domain
from sta.models.label.repo import LabelsetBranchPublic
from sta.models.label.spec import ObjectClass
from sta.models.source.data import SourceMetadataTableLike
from sta.models.user import UserPublic
from sta.porter.st_metadata import STMetadataReader
from sta_pcd.domain.source.data import metadata as pcd_domain

from .api import editor as editor_segmentation
from .api.label import data as data_segmentation
from .domain.editor.loader import SegmentationLoader
from .domain.label.data import element as element_domain, entity as entity_domain
from .domain.label.repo.ops.instance import register_instance_ops
from .domain.label.repo.ops.selection import register_selection_ops
from .filesystem import (
    LabelClassModel,
    LabelInstanceModel,
    LabelSelectionModel,
    LabelsFileIO,
    LabelsModel,
)
from .models.label.data import (
    DistinctiveLevel,
    LabelInstance,
    LabelSelection,
    OcclusionLevel,
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
    register_lifespan_handler(editor_segmentation.assistant_client_lifespan)
    data.router.include_router(data_segmentation.router)
    editor.router.include_router(editor_segmentation.router)

    register_instance_ops(OP_REGISTRY)
    register_selection_ops(OP_REGISTRY)

    register_data_loader(LABEL_DATA_LOADERS, "segmentation", SegmentationLoader())

    @plugins_cli.group
    def segmentation() -> None:
        """Command-line interface for Segmentation Labels Plugin."""
        pass

    @label_import_by_st_command(segmentation)
    def segmentation_import_by_st(
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

        instance_items: list[LabelInstance] = []
        selection_items: list[LabelSelection] = []

        def resolve_objclass_id(reference: Any) -> int:
            objclass = objclasses_by_id.get(reference.id) or objclasses_by_name.get(reference.name)
            if objclass is None or objclass.id is None:
                msg = f"Cannot resolve object class {reference!r}"
                raise ValueError(msg)
            return objclass.id

        for st_item in tqdm(st_items, desc="Reading segmentation labels"):
            min_timestamp = st_item.min_timestamp
            max_timestamp = st_item.max_timestamp
            if min_timestamp != max_timestamp:
                msg = "Each segmentation instance should only occupy a single timestamp"
                raise ValueError(msg)

            labels = read_fn(st_item.filepath)
            timestamp = min_timestamp

            for selection in labels.selections:
                instance = selection.instance
                if instance is not None:
                    instance_id = instance.id
                    gt_class = instance.gt_class

                    instance_items.append(
                        LabelInstance(
                            id=uuid.UUID(int=instance_id),
                            group_id=commit.group_id,
                            commit_hash=commit.hash,
                            is_black=False if instance.is_black is None else instance.is_black,
                            gt_class_id=None if gt_class is None else resolve_objclass_id(gt_class),
                        )
                    )
                else:
                    instance_id = None
                    gt_class = None

                perceived_class = (
                    selection.perceived_class if selection.perceived_class is not None else gt_class
                )
                points = st_item.file_coords_to_db_coords.apply_to_vertices(selection.points)

                selection_items.append(
                    LabelSelection.from_points(
                        id=uuid.UUID(int=selection.id),
                        group_id=commit.group_id,
                        commit_hash=commit.hash,
                        points=[
                            DecimalCoord3(
                                x=Decimal(str(v.x)),
                                y=Decimal(str(v.y)),
                                z=Decimal(str(v.z)),
                            )
                            for v in points
                        ],
                        timestamp=timestamp,
                        distinctive_lv=None
                        if selection.distinctive_lv is None
                        else DistinctiveLevel(selection.distinctive_lv),
                        occlusion_lv=None
                        if selection.occlusion_lv is None
                        else OcclusionLevel(selection.occlusion_lv),
                        entity_id=None if instance_id is None else uuid.UUID(int=instance_id),
                        perceived_class_id=None
                        if perceived_class is None
                        else resolve_objclass_id(perceived_class),
                    )
                )

        click.echo("Importing segmentation labels...")

        referenced_instance_ids = {
            selection.entity_id for selection in selection_items if selection.entity_id is not None
        }
        for instance in instance_items:
            entity_domain.initialize_has_children(
                instance,
                value=instance.id in referenced_instance_ids,
            )

        entity_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=instance_items,
        )
        element_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=selection_items,
        )

        click.echo("Done!")

    @label_export_by_src_command(segmentation)
    def segmentation_export_by_src(
        *,
        current_user: UserPublic,
        session: Session,
        label_branch: LabelsetBranchPublic,
        export_dir: FileSystemPath,
    ):
        entity_items = entity_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=label_branch.group_id,
            commit_hash=label_branch.head_hash,
        )
        element_items = element_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=label_branch.group_id,
            commit_hash=label_branch.head_hash,
        )
        if len(entity_items) == 0 and len(element_items) == 0:
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
            tuple[list[LabelInstance], list[LabelSelection]],
        ] = defaultdict(lambda: ([], []))

        entities_by_id = {entity.id: entity for entity in entity_items}
        for element in tqdm(element_items, desc="Matching label elements to source data"):
            label_bounds = element.st_bounds
            if element.entity_id is None:
                label_entity = None
            else:
                try:
                    label_entity = entities_by_id[element.entity_id]
                except KeyError:
                    logger.warning(
                        "No associated entity for element: %s. Skipping.",
                        element,
                    )
                    continue

            for src_bounds, srcs in sources_by_st_bounds.items():
                if label_bounds.intersects(src_bounds):
                    for src in srcs:
                        entity_lst, element_lst = labels_by_source_id[src.id]
                        element_lst.append(element)

                        if label_entity is not None:
                            entity_lst.append(label_entity)

        _, write_fn = _get_read_write_fn(
            current_user=current_user,
            session=session,
            label_branch=label_branch,
        )

        for source_id, (entities, elements) in tqdm(
            labels_by_source_id.items(), desc="Exporting segmentation labels"
        ):
            source = sources_by_id[source_id]
            src_path = FileSystemPath.from_uri(source.uri)

            dst_path = export_dir / src_path.parent.path_str / f"{src_path.name}.json"
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if dst_path.exists():
                msg = f"File already exists at path: {dst_path}"
                raise RuntimeError(msg)

            instances_by_id = {instance.id: instance for instance in entities}

            selection_data: list[LabelSelectionModel] = []
            for selection in elements:
                instance_id = selection.entity_id
                instance = None if instance_id is None else instances_by_id.get(instance_id)

                objclass = selection.perceived_class if instance is None else instance.gt_class
                if objclass is None:
                    logger.warning(
                        "No associated class for segmentation mask: %s. Skipping.", selection
                    )
                    continue

                selection_model = LabelSelectionModel(
                    points=[v.to_float() for v in selection.points],
                    id=selection.id.int,
                    distinctive_lv=selection.distinctive_lv,
                    occlusion_lv=selection.occlusion_lv,
                )

                if instance is None:
                    selection_model.instance = None
                else:
                    instance_model = LabelInstanceModel(
                        id=instance.id.int,
                        is_black=instance.is_black,
                    )

                    instance_class = instance.gt_class
                    if instance_class is None:
                        instance_model.gt_class = None
                    else:
                        if instance_class.id is None:
                            msg = f"Object class has no id: {instance_class!r}"
                            raise ValueError(msg)
                        instance_model.gt_class = LabelClassModel(
                            id=instance_class.id,
                            name=instance_class.name,
                        )

                    selection_model.instance = instance_model

                selection_class = selection.perceived_class
                if selection_class is None:
                    selection_model.perceived_class = None
                else:
                    if selection_class.id is None:
                        msg = f"Object class has no id: {selection_class!r}"
                        raise ValueError(msg)
                    selection_model.perceived_class = LabelClassModel(
                        id=selection_class.id,
                        name=selection_class.name,
                    )

                selection_data.append(selection_model)

            write_fn(dst_path, LabelsModel(selections=selection_data))
