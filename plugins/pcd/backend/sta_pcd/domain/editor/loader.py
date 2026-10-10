import json
from collections.abc import Sequence
from http import HTTPStatus

from fastapi import HTTPException, Response
from pydantic import BaseModel
from sqlmodel import Session

from sta.common.logging import get_logger
from sta.common.utils.json import JSONType
from sta.domain.editor.loader import DataLoader
from sta.models.frame import FramePublic
from sta.models.user import UserPublic

from ...filesystem import PointCloudData
from ...models.source.spec import PointCloudConfig
from ..source.data import metadata as metadata_domain
from ..source.data.data import create_preprocessors, open_data
from ..source.spec import specs

logger = get_logger()


def make_response(data: PointCloudData) -> Response:
    return make_binary_response(
        channel_headers=data.channel_headers,
        content=data.pointwise_data.astype("float32").reshape(-1).tobytes(),
        num_points=data.num_points,
    )


def make_binary_response(
    *,
    channel_headers: Sequence[str] | None = None,
    content: bytes = b"",
    num_points: int = 0,
) -> Response:
    channel_headers = tuple(channel_headers or PointCloudConfig.default().channel_headers)

    return Response(
        content,
        media_type="application/octet-stream",
        headers={
            "X-Num-Points": str(num_points),
            "X-Num-Channels": str(len(channel_headers)),
            "X-Channel-Headers": json.dumps(channel_headers),
        },
    )


class PointCloudLoaderArgs(BaseModel):
    remove_bg: bool = True
    crop_area: bool = True


class PointCloudLoader(DataLoader):
    def get_data_bulk(
        self,
        *,
        current_user: UserPublic,
        session: Session,
        frames: Sequence[FramePublic],
        other_args: JSONType,
    ) -> Response:
        # TODO: Decode multiple frames from a single response
        if len(frames) != 1:
            raise HTTPException(
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                detail="Point-cloud loading requires exactly one frame",
            )

        parsed_args = PointCloudLoaderArgs.model_validate(other_args)

        (frame,) = frames

        if frame.source_group_id is None:
            raise HTTPException(
                status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
                detail=f"Frame #{frame.id} has no source group",
            )

        metadatas = metadata_domain.list_datas_in_bounds(
            current_user=current_user,
            session=session,
            group_id=frame.source_group_id,
            st_bounds=frame.st_bounds,
        )
        pcd_spec = specs.read_spec_in_group(
            current_user=current_user,
            session=session,
            group_id=frame.source_group_id,
        )
        if pcd_spec is None:
            if not metadatas:
                return make_binary_response()

            msg = f"No point cloud source defined for source group #{frame.source_group_id}"
            raise ValueError(msg)

        pcd_config = PointCloudConfig.model_validate(pcd_spec.config)
        preprocessors = create_preprocessors(pcd_config)

        if not metadatas:
            return make_binary_response(channel_headers=pcd_config.channel_headers)

        loaded_data: list[PointCloudData] = []
        missing_uris: list[str] = []
        for mt in metadatas:
            try:
                loaded_data.append(
                    open_data(
                        current_user=current_user,
                        session=session,
                        metadata=mt,
                        crop_area=parsed_args.crop_area,
                        remove_bg=parsed_args.remove_bg,
                        pcd_config=pcd_config,
                        preprocessors=preprocessors,
                    ),
                )
            except FileNotFoundError:
                missing_uris.append(str(mt.uri))

        if missing_uris:
            logger.warning(
                "Skipped %s missing point cloud data files for frame %s; first missing file: %s",
                len(missing_uris),
                frame.id,
                missing_uris[0],
            )

        if not loaded_data:
            return make_binary_response(channel_headers=pcd_config.channel_headers)

        data = PointCloudData.merge(*loaded_data)

        return make_response(data)
