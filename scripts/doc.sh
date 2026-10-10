#!/bin/bash
set -euo pipefail

# Skip the MkDocs 2.0 announcements printed by mkdocs-material and properdocs
# (the latter is a transitive dependency of mkdocs-section-index)
export NO_MKDOCS_2_WARNING=true
export DISABLE_MKDOCS_2_WARNING=true

doc_frontend() {
    # TypeDoc discovers package entry points through exports, which target dist/.
    # Build core and then plugins in dependency order, including route typegen,
    # so a fresh checkout documents the same public API as a package consumer.
    for workspace in sta sta-pcd sta-gmesh sta-bbox sta-segmentation sta-vector; do
        npm run build:package --workspace="$workspace"
    done
    npx typedoc --options typedoc.json
}

doc_backend() {
    # Sphinx 6 aborts on orphaned stubs left by moved/removed modules and an
    # incremental html build never drops their pages, so both are regenerated.
    rm -rf core/backend/docs/_api_generated core/backend/docs/_build/html/_api_generated
    # -W makes any warning fatal; --keep-going reports them all in one pass.
    # Extra args after the -M triple are forwarded to the underlying build.
    uv run --package sta --directory core/backend sphinx-build -M html docs docs/_build -W --keep-going
}

echo "=== [DOC] Frontend library ==="
doc_frontend

echo "=== [DOC] Backend library ==="
doc_backend

echo "=== [DOC] Main site ==="
rm -rf site; uv run --package sta mkdocs build -f mkdocs.yml --strict
# The generated API reference is copied in only after the strict build, so the pages
# under site/api/ must already exist for it to resolve: docs/api/** ships tracked stub
# index.html files that mkdocs.yml's nav and docs/api/index.md point at, and these two
# copies overwrite them. mkdocs.yml keeps validation at `warn` for missing nav entries
# and links, which --strict then fails, so its nav refers to concrete artifacts
# (api/frontend/index.html) rather than directories.
mkdir -p site/api/backend/python site/api/frontend
cp -R core/backend/docs/_build/html/. site/api/backend/python/
cp -R core/frontend/docs/_build/. site/api/frontend/
