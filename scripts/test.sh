#!/bin/bash
set -eo pipefail

PLUGINS=(bbox gmesh pcd segmentation vector)

test_backend() {
    poetry run -- pytest -n auto
}

test_frontend() {
    npx vitest run --coverage --passWithNoTests
}

echo "=== [TEST] Backend library ==="
(cd backend && test_backend)

for plugin in ${PLUGINS[@]}; do
    echo "=== [TEST] Backend of $plugin plugin ==="
    (cd "plugins/$plugin/backend" && test_backend)
done


echo "=== [TEST] Frontend library ==="
(cd frontend && test_frontend)

for plugin in ${PLUGINS[@]}; do
    echo "=== [TEST] Frontend of $plugin plugin ==="
    (cd "plugins/$plugin/frontend" && test_frontend)
done

