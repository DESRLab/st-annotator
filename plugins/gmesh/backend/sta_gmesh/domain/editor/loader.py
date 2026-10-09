from collections.abc import Sequence

from fastapi import Response
from sqlmodel import Session

from sta.common.utils.json import JSONType
from sta.services.domain.editor.loader import DataLoader
from sta.services.models.frame import FramePublic
from sta.services.models.user import UserPublic

from ...filesystem import GroundMeshData
from ..source.data import metadata as metadata_domain
from ..source.data.data import open_data


def make_response(data: GroundMeshData) -> Response:
    vertices_bytes = data.xyz.astype('float32').reshape(-1).tobytes()
    faces_bytes = data.faces.astype('int32').reshape(-1).tobytes()

    return Response(
        vertices_bytes + faces_bytes,
        media_type='application/octet-stream',
        headers={
            'X-Vertices-ByteLength': str(len(vertices_bytes)),
            'X-Faces-ByteLength': str(len(faces_bytes)),
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

        frame, = frames

        if frame.source_group_id is None:
            msg = "No source group defined by this frame"
            raise RuntimeError(msg)

        metadatas = metadata_domain.list_datas_in_bounds(
            current_user=current_user,
            session=session,
            group_id=frame.source_group_id,
            st_bounds=frame.st_bounds,
        )

        data = GroundMeshData.merge(
            *(
                open_data(
                    current_user=current_user,
                    session=session,
                    metadata=mt,
                )
                for mt in metadatas
            ),
        )

        return make_response(data)
