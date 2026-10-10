"""Exercise documentation publishing through its command-line boundary."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PACKAGER = Path(__file__).with_name("package-doc-versions.py")


class DocumentationVersionsTest(unittest.TestCase):
    """Verify archive preservation, aliases, and legacy redirects."""

    def setUp(self) -> None:
        """Create an isolated documentation build and archive."""
        temporary = tempfile.TemporaryDirectory(prefix="sta-doc-versions-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / "build"
        self.archive = self.root / "archive"

    def build(self, marker: str) -> None:
        """Create distinguishable reference pages and assets."""
        for file in (
            "index.html",
            "guide/page/index.html",
            "dev/index.html",
            "api/frontend/index.html",
            "api/backend/python/index.html",
            "assets/style.css",
        ):
            destination = self.source / file
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(marker)

    def publish(self, version: str, *, stable: bool = False) -> subprocess.CompletedProcess[str]:
        """Invoke the same CLI as the publishing workflow."""
        return subprocess.run(
            [
                sys.executable,
                str(PACKAGER),
                str(self.source),
                str(self.archive),
                version,
                *(["--stable"] if stable else []),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

    def publish_successfully(self, version: str, *, stable: bool = False) -> None:
        """Require successful publication with useful failure output."""
        result = self.publish(version, stable=stable)
        self.assertEqual(result.returncode, 0, result.stderr)

    def contents(self, file: str) -> str:
        """Read a published page or metadata file."""
        return (self.archive / file).read_text()

    def test_snapshots_aliases_and_redirects(self) -> None:
        """Publish successive versions without losing content or legacy links."""
        self.build("development")
        self.publish_successfully("development")
        self.assertIn("development/index.html", self.contents("index.html"))
        self.assertEqual(self.contents("development/index.html"), "development")
        self.assertIn("development/dev/index.html", self.contents("dev/index.html"))
        shutil.rmtree(self.source / "guide")
        self.publish_successfully("development")
        self.assertIn("development/index.html", self.contents("guide/page/index.html"))
        self.build("release one")
        self.publish_successfully("1.0.0", stable=True)
        self.build("release two")
        self.publish_successfully("1.1.0", stable=True)
        self.assertEqual(self.contents("1.0.0/api/frontend/index.html"), "release one")
        self.assertEqual(self.contents("1.1.0/api/backend/python/index.html"), "release two")
        self.assertEqual(self.contents("1.0.0/assets/style.css"), "release one")
        self.assertIn("../../1.1.0/guide/page/index.html", self.contents("guide/page/index.html"))
        self.assertIn(
            "../../../1.1.0/guide/page/index.html", self.contents("stable/guide/page/index.html")
        )
        self.assertIn("location.search + location.hash", self.contents("index.html"))
        self.build("backfill")
        self.publish_successfully("0.9.0", stable=True)
        self.build("prerelease")
        self.publish_successfully("2.0.0-rc.1")
        self.build("new development")
        shutil.rmtree(self.source / "guide")
        self.publish_successfully("development")
        self.assertEqual(self.contents("development/index.html"), "new development")
        self.assertIn("1.1.0/index.html", self.contents("index.html"))
        versions = json.loads(self.contents("versions.json"))
        self.assertEqual(
            next(entry["version"] for entry in versions if "stable" in entry["aliases"]), "1.1.0"
        )
        self.assertEqual(versions[-1]["version"], "development")
        self.publish_successfully("1.2.0", stable=True)
        self.assertIn("1.2.0/index.html", self.contents("guide/page/index.html"))
        (self.source / "api/frontend/index.html").unlink()
        self.assertNotEqual(self.publish("1.1.0", stable=True).returncode, 0)
        self.assertEqual(self.contents("1.1.0/index.html"), "release two")

    def test_rejects_invalid_versions(self) -> None:
        """Reject traversal and stable aliases for development or prereleases."""
        self.build("development")
        for version, stable in (("../escape", False), ("development", True), ("2.0.0-rc.1", True)):
            with self.subTest(version=version):
                self.assertNotEqual(self.publish(version, stable=stable).returncode, 0)
        self.assertFalse(self.archive.exists())


if __name__ == "__main__":
    unittest.main()
