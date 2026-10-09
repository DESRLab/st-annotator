from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

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

from .api.label import data as data_bbox
from .domain.editor.loader import BBoxLoader
from .domain.label.data import element as element_domain, entity as entity_domain
from .domain.label.repo.ops.box import register_box_ops
from .domain.label.repo.ops.track import register_track_ops
from .filesystem import LabelBoxModel, LabelClassModel, LabelsFileIO, LabelsModel, LabelTrackModel
from .models.label.data import (
    BoxType,
    DistinctiveLevel,
    LabelBoxCreate,
    LabelBoxPublic,
    LabelTrackCreate,
    LabelTrackPublic,
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
    data.router.include_router(data_bbox.router)

    register_track_ops(OP_REGISTRY)
    register_box_ops(OP_REGISTRY)

    LABEL_DATA_LOADERS["bbox"] = BBoxLoader()

    @plugins_cli.group
    def bbox() -> None:
        """Command-line interface for Bounding Box Labels Plugin."""
        pass

    @label_import_by_st_command(bbox)
    def bbox_import_by_st(
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

        track_items: list[LabelTrackCreate] = []
        box_items: list[LabelBoxCreate] = []

        for st_item in tqdm(st_items, desc="Reading bounding box labels"):
            min_timestamp = st_item.min_timestamp
            max_timestamp = st_item.max_timestamp
            if min_timestamp != max_timestamp:
                msg = 'Each bounding box should only occupy a single timestamp'
                raise ValueError(msg)

            labels = read_fn(st_item.filepath)
            timestamp = min_timestamp

            for bbox in labels.bounding_boxes:
                track = bbox.track
                if track is not None:
                    track_id = track.id
                    gt_class = track.gt_class

                    track_items.append(LabelTrackCreate(
                        id=uuid.UUID(int=track_id),
                        group_id=commit.group_id,
                        commit_hash=commit.hash,
                        is_black=False if track.is_black is None else track.is_black,
                        gt_class=None if gt_class is None else objclasses_by_id.get(gt_class.id, objclasses_by_name.get(gt_class.name)),
                    ))
                else:
                    track_id = None
                    gt_class = None

                perceived_class = bbox.perceived_class if bbox.perceived_class is not None else gt_class
                bbox_center = st_item.file_coords_to_db_coords.apply_to_vector(bbox.center)

                box_items.append(LabelBoxCreate(
                    id=uuid.UUID(int=bbox.id),
                    group_id=commit.group_id,
                    commit_hash=commit.hash,
                    type=BoxType(bbox.box_type),
                    angle=Decimal(bbox.angle),
                    size=bbox.size.to_decimal(),
                    center=bbox_center.to_decimal(),
                    timestamp=timestamp,
                    distinctive_lv=None if bbox.distinctive_lv is None else DistinctiveLevel(bbox.distinctive_lv),
                    occlusion_lv=None if bbox.occlusion_lv is None else OcclusionLevel(bbox.occlusion_lv),
                    entity_id=None if track_id is None else uuid.UUID(int=track_id),
                    perceived_class=None if perceived_class is None else objclasses_by_id.get(perceived_class.id, objclasses_by_name.get(perceived_class.name)),
                ))

        click.echo("Importing bounding box labels...")

        entity_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=track_items,
        )
        element_domain.bulk_create_datas(
            current_user=current_user,
            session=session,
            data=box_items,
        )

        click.echo("Done!")


    @label_export_by_src_command(bbox)
    def bbox_export_by_src(
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
            tuple[list[LabelBoxPublic], list[LabelTrackPublic]],
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

        for source, (entities, elements) in tqdm(labels_by_source.items(), desc="Exporting bounding box labels"):
            src_path = FileSystemPath.from_uri(source.uri)

            dst_path = export_dir / src_path.parent.path_str / f'{src_path.name}.json'
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            if dst_path.exists():
                msg = f'File already exists at path: {dst_path}'
                raise RuntimeError(msg)

            tracks_by_id = {track.id: track for track in entities}

            box_models: list[LabelBoxModel] = []
            for box in elements:
                track_id = box.entity_id
                track = None if track_id is None else tracks_by_id.get(track_id)

                objclass = box.perceived_class if track is None else track.gt_class
                if objclass is None:
                    logger.warning('No associated class for bounding box: %s. Skipping.', box)
                    continue

                box_model = LabelBoxModel(
                    id=box.id.int,
                    box_type=box.type,
                    center=box.center.to_float(),
                    angle=float(box.angle),
                    size=box.size.to_float(),
                    distinctive_lv=box.distinctive_lv,
                    occlusion_lv=box.occlusion_lv,
                )

                if track is None:
                    box_model.track = None
                else:
                    track_model = LabelTrackModel(
                        id=track.id.int,
                        is_black=track.is_black,
                    )

                    track_class = track.gt_class
                    if track_class is None:
                        track_model.gt_class = None
                    else:
                        track_model.gt_class = LabelClassModel(
                            id=track_class.id,
                            name=track_class.name,
                        )

                    box_model.track = track_model

                box_class = box.perceived_class
                if box_class is None:
                    box_model.perceived_class = None
                else:
                    box_model.perceived_class = LabelClassModel(
                        id=box_class.id,
                        name=box_class.name,
                    )

                box_models.append(box_model)

            write_fn(dst_path, LabelsModel(bounding_boxes=box_models))
