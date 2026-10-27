"""Package completed documentation snapshots into the docs-site archive."""

import argparse
import html
import json
import posixpath
import re
import shutil
import sys
from pathlib import Path
from typing import TypedDict, cast

RELEASE_PATTERN = re.compile(
    r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?"
)


class VersionInfo(TypedDict):
    """Material-compatible version selector metadata."""

    version: str
    title: str
    aliases: list[str]


def html_files(directory: Path, prefix: str = "") -> set[str]:
    """List HTML paths, excluding hidden archive and Git files."""
    files: set[str] = set()
    for entry in directory.iterdir():
        if entry.name.startswith("."):
            continue
        relative = posixpath.join(prefix, entry.name)
        if entry.is_dir():
            files.update(html_files(entry, relative))
        elif entry.name.endswith(".html"):
            files.add(relative)
    return files


def write_redirect(file: Path, destination: str) -> None:
    """Write a redirect that preserves browser query parameters and fragments."""
    attribute = html.escape(destination, quote=True)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(
        '<!doctype html><html><head><meta charset="utf-8">'
        f'<meta http-equiv="refresh" content="0;url={attribute}">'
        f'<link rel="canonical" href="{attribute}">'
        f"<script>location.replace({json.dumps(destination)} + location.search + location.hash)"
        f'</script></head><body><a href="{attribute}">Continue to documentation</a>'
        "</body></html>\n",
        encoding="utf-8",
    )


def release_number(version: str) -> tuple[int, ...]:
    """Compare stable versions numerically, including multi-digit components."""
    return tuple(int(part) for part in version.split("."))


def version_order(entry: VersionInfo) -> tuple[bool, tuple[tuple[int, int | str], ...]]:
    """Sort releases in descending natural order with development last."""
    version = entry["version"]
    parts = tuple(
        (1, int(part)) if part.isdigit() else (0, part) for part in re.split(r"(\d+)", version)
    )
    return version != "development", parts


def package_versions(source: Path, archive: Path, version: str, *, stable: bool = False) -> str:
    """Replace one snapshot and update version metadata and legacy redirects."""
    # Validate the complete build before changing the persisted archive.
    for file in ("index.html", "api/frontend/index.html", "api/backend/python/index.html"):
        (source / file).read_bytes()
    archive.mkdir(parents=True, exist_ok=True)
    metadata = archive / "versions.json"
    versions = (
        cast(list[VersionInfo], json.loads(metadata.read_text())) if metadata.exists() else []
    )
    previous_default = next(
        (entry["version"] for entry in versions if "stable" in entry["aliases"]), None
    )
    # Backfilled releases must not move the stable alias backwards.
    stable_version = previous_default
    if stable and (
        previous_default is None or release_number(version) >= release_number(previous_default)
    ):
        stable_version = version
    versions = [entry for entry in versions if entry["version"] != version]
    versions.append(
        {
            "version": version,
            "title": "Development" if version == "development" else version,
            "aliases": [],
        }
    )
    for entry in versions:
        entry["aliases"] = ["stable"] if entry["version"] == stable_version else []
    versions.sort(key=version_order, reverse=True)
    snapshot = archive / version
    if snapshot.exists():
        shutil.rmtree(snapshot)
    shutil.copytree(source, snapshot)
    metadata.write_text(json.dumps(versions, indent=2) + "\n", encoding="utf-8")
    (archive / ".nojekyll").write_text("")

    default_version = stable_version or (
        "development" if any(entry["version"] == "development" for entry in versions) else version
    )
    default_files = html_files(archive / default_version)
    # Retain legacy paths even when their only development page has been removed.
    legacy_files = {
        file
        for file in html_files(archive)
        if file.split("/")[0] not in ("development", "stable")
        and not RELEASE_PATTERN.fullmatch(file.split("/")[0])
    }
    for entry in versions:
        legacy_files.update(html_files(archive / entry["version"]))
    for file in legacy_files:
        target = file if file in default_files else "index.html"
        destination = posixpath.relpath(
            f"{default_version}/{target}", posixpath.dirname(file) or "."
        )
        write_redirect(archive / file, destination)
    if stable_version:
        alias = archive / "stable"
        if alias.exists():
            shutil.rmtree(alias)
        for file in default_files:
            destination = posixpath.relpath(
                f"{stable_version}/{file}", posixpath.dirname(f"stable/{file}")
            )
            write_redirect(alias / file, destination)
    return default_version


def main() -> None:
    """Package a built site using a validated version identifier."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("archive", type=Path)
    parser.add_argument("version")
    parser.add_argument("--stable", action="store_true")
    args = parser.parse_args()
    if args.version != "development" and not RELEASE_PATTERN.fullmatch(args.version):
        parser.error("version must be development or major.minor.patch[-prerelease]")
    if args.stable and (args.version == "development" or "-" in args.version):
        parser.error("only stable releases can update the stable alias")
    default_version = package_versions(args.source, args.archive, args.version, stable=args.stable)
    sys.stdout.write(f"Packaged {args.version}; default documentation: {default_version}\n")


if __name__ == "__main__":
    main()
