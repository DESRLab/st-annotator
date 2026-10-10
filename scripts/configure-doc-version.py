"""Write the temporary MkDocs configuration for a documentation snapshot."""

import os
import sys
from pathlib import Path

import yaml


def main() -> None:
    """Select the snapshot URL and enable Material's version selector."""
    config = yaml.safe_load(Path("mkdocs.yml").read_text())
    config["site_url"] = config["site_url"].rstrip("/") + "/" + os.environ["DOCS_VERSION"] + "/"
    config.setdefault("extra", {})["version"] = {
        "provider": "mike",
        "default": "stable",
    }
    Path(sys.argv[1]).write_text(yaml.safe_dump(config, sort_keys=False))


if __name__ == "__main__":
    main()
