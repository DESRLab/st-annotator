from __future__ import annotations

import uuid
from collections import defaultdict

import click
from pytz import BaseTzInfo
from tqdm import tqdm

from sqlmodel import Session

from sta.cli import (
    label_export_by_src_command,
    label_import_by_st_command,
    plugins_cli,
)
from sta.cli.prompts import prompt_source_group
from sta.common.filesystem import FileSystemPath
from sta.common.logging import get_logger
from sta.common.spatial import PartialSTBounds
from sta.services.api.label import data
from sta.services.domain.editor.loader import LABEL_DATA_LOADERS
from sta.services.domain.label.repo.ops import OP_REGISTRY
from sta.services.domain.label.spec.objclass import selections as objclass_domain
from sta.services.models.label.repo import LabelsetBranchPublic
from sta.services.models.label.spec import ObjectClass
from sta.services.models.source.data import SourceMetadataPublicLike
from sta.services.models.user import UserPublic
from sta.services.porter.st_metadata import STMetadataReader
from sta_pcd.domain.source.data import metadata as pcd_domain

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
    LabelInstanceCreate,
    LabelInstancePublic,
    LabelSelectionCreate,
    LabelSelectionPublic,
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
    data.router.include_router(data_segmentation.router)

    register_instance_ops(OP_REGISTRY)
    register_selection_ops(OP_REGISTRY)

    LABEL_DATA_LOADERS["segmentation"] = SegmentationLoader()

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
        data_info_uri: str,
        data_tz: BaseTzInfo | None,
    ):
        commit = label_branch.head
        st_items = STMetadataReader().read_csv(
            data_info_uri=data_info_uri,
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
            objclasses_by_id = {
                objclass.id: objclass for objclass in objclass_selection.objclasses
            }
            objclasses_by_name = {
                objclass.name: objclass for objclass in objclass_selection.objclasses
            }

        instance_items: list[LabelInstanceCreate] = []
        selection_items: list[LabelSelectionCreate] = []

        for st_item in tqdm(st_items, desc="Reading segmentation labels"):
            min_timestamp = st_item.min_timestamp
            max_timestamp = st_item.max_timestamp
            if min_timestamp != max_timestamp:
                msg = 'Each segmentation instance should only occupy a single timestamp'
                raise ValueError(msg)

            labels = read_fn(st_item.filepath)
            timestamp = min_timestamp

            for selection in labels.selections:
                instance = selection.instance
                if instance is not None:
                    instance_id = instance.id
                    gt_class = instance.gt_class

                    instance_items.append(LabelInstanceCreate(
                        id=uuid.UUID(int=instance_id),
                        group_id=commit.group_id,
                        commit_hash=commit.hash,
                        is_black=False if instance.is_black is None else instance.is_black,
                        gt_class=None if gt_class is None else objclasses_by_id.get(gt_class.id, objclasses_by_name.get(gt_class.name)),
                    ))
                else:
                    instance_id = None
                    gt_class = None

                perceived_class = selection.perceived_class if selection.perceived_class is not None else gt_class
                points = st_item.file_coords_to_db_coords.apply_to_vector(selection.points)

                selection_items.append(LabelSelectionCreate(
                    id=uuid.UUID(int=selection.id),
                    group_id=commit.group_id,
                    commit_hash=commit.hash,
                    points=[v.to_decimal() for v in points],
                    timestamp=timestamp,
                    distinctive_lv=None if selection.distinctive_lv is None else DistinctiveLevel(selection.distinctive_lv),
                    occlusion_lv=None if selection.occlusion_lv is None else OcclusionLevel(selection.occlusion_lv),
                    entity_id=None if instance_id is None else uuid.UUID(int=instance_id),
                    perceived_class=None if perceived_class is None else objclasses_by_id.get(perceived_class.id, objclasses_by_name.get(perceived_class.name)),
                ))

        click.echo("Importing segmentation labels...")

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
            msg = 'No labels found'
            raise RuntimeError(msg)

        source_group = prompt_source_group(current_user, session)
        sources = pcd_domain.list_datas(
            current_user=current_user,
            session=session,
            group_id=source_group.id,
        )
        if len(sources) == 0:
            msg = 'No source data found'
            raise RuntimeError(msg)

        sources_by_st_bounds: dict[
            PartialSTBounds,
            list[SourceMetadataPublicLike],
        ] = defaultdict(list)
        for source in sources:
            sources_by_st_bounds[source.st_bounds].append(source)

        labels_by_source: dict[
            SourceMetadataPublicLike,
            tuple[list[LabelSelectionPublic], list[LabelInstancePublic]],
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
                        'No associated entity for element: %s. Skipping.',
                        element,
                    )
                    continue

            for src_bounds, srcs in sources_by_st_bounds.items():
                if label_bounds.intersects(src_bounds):
                    for src in srcs:
                        entity_lst, element_lst = labels_by_source[src]
                        element_lst.append(element)

                        if label_entity is not None:
                            entity_lst.append(label_entity)

        _, write_fn = _get_read_write_fn(
            current_user=current_user,
            session=session,
            label_branch=label_branch,
        )

        for source, (entities, elements) in tqdm(labels_by_source.items(), desc="Exporting segmentation labels"):
            src_path = FileSystemPath.from_uri(source.uri)

            dst_path = export_dir / src_path.parent.path_str / f'{src_path.name}.json'
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if dst_path.exists():
                msg = f'File already exists at path: {dst_path}'
                raise RuntimeError(msg)

            instances_by_id = {instance.id: instance for instance in entities}

            selection_data: list[LabelSelectionModel] = []
            for selection in elements:
                instance_id = selection.entity_id
                instance = None if instance_id is None else instances_by_id.get(instance_id)

                objclass = selection.perceived_class if instance is None else instance.gt_class
                if objclass is None:
                    logger.warning('No associated class for segmentation mask: %s. Skipping.', selection)
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
                        instance_model.gt_class = LabelClassModel(
                            id=instance_class.id,
                            name=instance_class.name,
                        )

                    selection_model.instance = instance_model

                selection_class = selection.perceived_class
                if selection_class is None:
                    selection_model.perceived_class = None
                else:
                    selection_model.perceived_class = LabelClassModel(
                        id=selection_class.id,
                        name=selection_class.name,
                    )

                selection_data.append(selection_model)

            write_fn(dst_path, LabelsModel(selections=selection_data))
