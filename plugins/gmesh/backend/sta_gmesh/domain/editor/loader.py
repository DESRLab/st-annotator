from collections.abc import Sequence

from fastapi import Response
from sqlmodel import Session

from sta.common.logging import get_logger
from sta.common.utils.json import JSONType
from sta.domain.editor.loader import DataLoader
from sta.models.frame import FramePublic
from sta.models.user import UserPublic

from ...filesystem import GroundMeshData
from ..source.data import metadata as metadata_domain
from ..source.data.data import open_data

logger = get_logger()


def make_response(data: GroundMeshData) -> Response:
    vertices_bytes = data.xyz.astype("float32").reshape(-1).tobytes()
    faces_bytes = data.faces.astype("int32").reshape(-1).tobytes()

    return make_binary_response(
        content=vertices_bytes + faces_bytes,
        vertices_byte_length=len(vertices_bytes),
        faces_byte_length=len(faces_bytes),
    )


def make_binary_response(
    *,
    content: bytes = b"",
    vertices_byte_length: int = 0,
    faces_byte_length: int = 0,
) -> Response:
    return Response(
        content,
        media_type="application/octet-stream",
        headers={
            "X-Vertices-ByteLength": str(vertices_byte_length),
            "X-Faces-ByteLength": str(faces_byte_length),
        },
    )


class GroundMeshLoader(DataLoader):
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
            msg = "Multiple frames not supported yet"
            raise NotImplementedError(msg)

        (frame,) = frames

        if frame.source_group_id is None:
            msg = "No source group defined by this frame"
            raise RuntimeError(msg)

        metadatas = metadata_domain.list_datas_in_bounds(
            current_user=current_user,
            session=session,
            group_id=frame.source_group_id,
            st_bounds=frame.st_bounds,
        )

        if not metadatas:
            return make_binary_response()

        loaded_data: list[GroundMeshData] = []
        missing_uris: list[str] = []
        for mt in metadatas:
            try:
                loaded_data.append(open_data(current_user, session, mt))
            except FileNotFoundError:
                missing_uris.append(str(mt.uri))

        if missing_uris:
            logger.warning(
                "Skipped %s missing ground mesh data files for frame %s; first missing file: %s",
                len(missing_uris),
                frame.id,
                missing_uris[0],
            )

        if not loaded_data:
            return make_binary_response()

        data = GroundMeshData.merge(*loaded_data)

        return make_response(data)
