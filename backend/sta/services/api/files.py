import io
import mimetypes
import zipfile
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from sta.common.filesystem import FileSystemPath

from ..domain.users import require_role
from ..models.user import Role, UserPublic
from .auth import get_current_user

router = APIRouter(
    prefix='/files',
    tags=['files'],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)

CHUNK_SIZE = 1024 * 1024


def _resolve_safe_path(rel_path: str) -> FileSystemPath:
    try:
        return FileSystemPath.from_uri(rel_path)
    except Exception:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Access denied: Cannot access path",
        ) from None


def _add_path_to_zip(zf: zipfile.ZipFile, target: FileSystemPath, arcname: str) -> None:
    if target.is_dir():
        children = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        if not children:
            zf.writestr(f"{arcname.rstrip('/')}/", "")
            return

        for child in children:
            child_arcname = f"{arcname.rstrip('/')}/{child.name}"
            _add_path_to_zip(zf, child, child_arcname)
        return

    with target.open("rb") as file_obj:
        with zf.open(arcname, "w") as zip_entry:
            while chunk := file_obj.read(CHUNK_SIZE):
                zip_entry.write(chunk)


class FileEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int | None = None
    modified: float | None = None


class FileListResponse(BaseModel):
    entries: list[FileEntry]


@router.get('/', response_model=FileListResponse)
async def list_files(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    path: Annotated[str, Query()] = "",
):
    require_role(current_user, Role.DATA_MANAGER)

    target = _resolve_safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail="Path not found")
    if not target.is_dir():
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Path is not a directory")

    entries: list[FileEntry] = []
    for item in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        stat = item.stat()

        entries.append(FileEntry(
            name=item.name,
            path=item.parent.as_uri(),
            is_dir=item.is_dir(),
            size=stat.get("size"),
            modified=stat.get("mtime"),
        ))

    return FileListResponse(entries=entries)


@router.get('/download')
async def download_file(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    path: Annotated[str, Query()] = "",
):
    require_role(current_user, Role.DATA_MANAGER)

    target = _resolve_safe_path(path)
    if not target.exists():
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail="File not found")
    if not target.is_file():
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail="Path is not a file")

    stat = target.stat()
    headers = {
        "Content-Disposition": f'attachment; filename="{target.name}"',
    }
    if stat.get("size") is not None:
        headers["Content-Length"] = str(stat["size"])

    media_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"

    def iter_file():
        with target.open("rb") as file_obj:
            while chunk := file_obj.read(CHUNK_SIZE):
                yield chunk

    return StreamingResponse(iter_file(), media_type=media_type, headers=headers)


class DownloadZipRequest(BaseModel):
    paths: list[str]


@router.post('/download-zip')
async def download_zip(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    body: DownloadZipRequest,
):
    require_role(current_user, Role.DATA_MANAGER)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for rel_path in body.paths:
            target = _resolve_safe_path(rel_path)
            if not target.exists():
                raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail=f"{rel_path} not found")

            _add_path_to_zip(zf, target, target.name)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment"},
    )
