#!/bin/bash
set -eo pipefail

PLUGINS=(bbox gmesh pcd segmentation vector)

lint_backend() {
    poetry run deptry .
    poetry run ruff check . --fix
    # poetry run pyright -p \"$(git rev-parse --show-toplevel)/config/python/pyproject.toml\" .
}

lint_frontend() {
    npx depcheck
    npx tsc -p tsconfig.json
    npx eslint lib --ext .js
}

echo "=== [LINT] Backend library ==="
(cd backend && lint_backend)

for plugin in ${PLUGINS[@]}; do
    echo "=== [LINT] Backend of $plugin plugin ==="
    (cd "plugins/$plugin/backend" && lint_backend)
done

echo "=== [LINT] Frontend library ==="
(cd config/js && lint_frontend)
(cd frontend && lint_frontend)

for plugin in ${PLUGINS[@]}; do
    echo "=== [LINT] Frontend of $plugin plugin ==="
    (cd "plugins/$plugin/frontend" && lint_frontend)
done
