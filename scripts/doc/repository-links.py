"""Resolve repository source links for the documentation snapshot being built."""

import os

from mkdocs.config.defaults import MkDocsConfig


def on_page_markdown(markdown: str, *, config: MkDocsConfig, **_kwargs: object) -> str:
    """Expand the repository source URL using the release tag or main branch."""
    version = os.environ.get("DOCS_VERSION", "development")
    ref = "main" if version == "development" else f"v{version}"
    source_url = f"{config.repo_url.rstrip('/')}/blob/{ref}"
    return markdown.replace("]({{ repo_source_url }}/", f"]({source_url}/")
