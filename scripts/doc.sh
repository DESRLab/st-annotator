#!/bin/bash
set -eo pipefail

doc_frontend() {
    npx typedoc --options typedoc.json
}

doc_backend() {
    rm -rf docs/_api_generated; rm -rf docs/_build; poetry run -- sphinx-build -M html docs docs/_build
}

echo "=== [DOC] Backend library ==="
(cd backend && doc_backend)

echo "=== [DOC] Frontend library ==="
(cd frontend && doc_frontend)

echo "=== [DOC] Main site ==="
rm -rf site; python -m mkdocs build
ln -s ../backend/docs/_build/html site/api/backend/python
ln -s ../../../packages/common/js/docs/_build site/api/common/js
ln -s ../../../packages/services/js/docs/_build site/api/services/js
