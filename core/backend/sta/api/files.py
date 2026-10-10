import io
import mimetypes
import queue
import threading
import zipfile
from collections.abc import Iterator
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from sta.common.filesystem import FileSystemPath

from ..domain.users import require_role
from ..models.user import Role, UserPublic
from .auth import get_current_user

router = APIRouter(
    prefix="/files",
    tags=["files"],
    dependencies=[Depends(get_current_user)],
    responses={HTTPStatus.NOT_FOUND: {"description": "Not found"}},
)

# This API is intentionally read-only. Symlinks provisioned inside the
# sanctioned filesystem tree may point elsewhere and remain readable.
# IMPORTANT: Any future upload/import endpoint must reject user-supplied
# symlinks rather than changing this read policy.

CHUNK_SIZE = 1024 * 1024


def _resolve_safe_path(rel_path: str) -> FileSystemPath:
    try:
        # A blank explorer path denotes the root of the configured filesystem.
        # Use its explicit relative representation instead of relying on how
        # pathlib or a filesystem backend happens to coerce an empty string.
        path = FileSystemPath.from_uri(rel_path or ".")
        if ".." in path.parts:
            # DirFileSystem does not normalize "..", so it would resolve
            # outside the filesystem root if left unchecked.
            msg = "Path traversal is not allowed"
            raise ValueError(msg)

        return path
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


class _QueueWriter(io.RawIOBase):
    """Forwards written bytes to a queue instead of buffering them.

    `zipfile.ZipFile` is push-based, so streaming the archive into a pull-based
    response generator requires this bridge: the zip is produced on a worker
    thread while the response drains the queue. The stream is not seekable,
    which makes zipfile write per-entry data descriptors — any standard zip
    reader handles those.
    """

    def __init__(
        self,
        chunk_queue: queue.Queue[bytes | None],
        cancelled: threading.Event,
    ):
        super().__init__()
        self._queue = chunk_queue
        self._cancelled = cancelled

    def writable(self) -> bool:
        return True

    def write(self, data: bytes) -> int:  # type: ignore[override]
        if data:
            while not self._cancelled.is_set():
                try:
                    self._queue.put(bytes(data), timeout=0.1)
                    break
                except queue.Full:
                    continue
            else:
                msg = "ZIP response consumer disconnected"
                raise BrokenPipeError(msg)
        return len(data)


def _iter_zip_chunks(targets: list[tuple[FileSystemPath, str]]) -> Iterator[bytes]:
    chunk_queue: queue.Queue[bytes | None] = queue.Queue(maxsize=8)
    cancelled = threading.Event()
    error: list[BaseException] = []

    def produce() -> None:
        try:
            with zipfile.ZipFile(
                _QueueWriter(chunk_queue, cancelled),
                "w",
                zipfile.ZIP_DEFLATED,
            ) as zf:
                for target, arcname in targets:
                    _add_path_to_zip(zf, target, arcname)
        except BaseException as exc:
            # Propagated to the response once the stream drains.
            error.append(exc)
        finally:
            while not cancelled.is_set():
                try:
                    chunk_queue.put(None, timeout=0.1)
                    break
                except queue.Full:
                    continue

    worker = threading.Thread(target=produce, daemon=True)
    worker.start()

    try:
        while (chunk := chunk_queue.get()) is not None:
            yield chunk

        worker.join()
        if error:
            raise error[0]
    finally:
        cancelled.set()
        worker.join(timeout=1)


class FileEntry(BaseModel):
    name: str
    parent: str
    is_dir: bool
    size: int | None = None
    modified: float | None = None


class FileListResponse(BaseModel):
    entries: list[FileEntry]


@router.get("/", response_model=FileListResponse)
def list_files(
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
        try:
            stat = item.stat()
        except FileNotFoundError:
            # A provisioned symlink may temporarily be broken when its target
            # mount is unavailable. Keep the rest of the directory browsable;
            # attempting to download this entry will return the usual 404.
            continue
        is_dir = item.is_dir()

        entries.append(
            FileEntry(
                name=item.name,
                parent=item.parent.as_uri(),
                is_dir=is_dir,
                # A directory's own size is the size of its filesystem entry,
                # not of its contents, so it carries no useful information.
                size=None if is_dir else stat.get("size"),
                modified=stat.get("mtime"),
            )
        )

    return FileListResponse(entries=entries)


@router.get("/download")
def download_file(
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
    paths: list[str] = Field(min_length=1)


@router.post("/download-zip")
def download_zip(
    *,
    current_user: Annotated[UserPublic, Depends(get_current_user)],
    body: DownloadZipRequest,
):
    require_role(current_user, Role.DATA_MANAGER)

    # Resolve and validate every path up front so path errors still produce
    # proper HTTP error responses instead of aborting the stream mid-archive.
    targets: list[tuple[FileSystemPath, str]] = []
    requested_paths: list[FileSystemPath] = []
    for rel_path in body.paths:
        target = _resolve_safe_path(rel_path)
        if not target.exists():
            raise HTTPException(status_code=HTTPStatus.NOT_FOUND, detail=f"{rel_path} not found")

        # Preserve the requested relative path so same-basename files in
        # different directories remain distinct in the archive. Reject
        # overlapping roots because selecting both a directory and one of its
        # descendants would still emit the descendant twice.
        if any(
            target.path == previous.path
            or target.path in previous.path.parents
            or previous.path in target.path.parents
            for previous in requested_paths
        ):
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="ZIP paths must be unique and non-overlapping",
            )

        arcname = target.path.as_posix().lstrip("/")
        if not arcname or arcname == ".":
            arcname = target.name or "files"
        requested_paths.append(target)
        targets.append((target, arcname))

    filename = f"{targets[0][0].name}.zip" if len(targets) == 1 else "files.zip"

    return StreamingResponse(
        _iter_zip_chunks(targets),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
