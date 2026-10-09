#!/bin/bash
set -eo pipefail

BACKEND_SCHEME=http
BACKEND_PATH=localhost:8000
PLUGINS=(bbox gmesh pcd segmentation vector)

setup_backend() {
    poetry lock
    poetry install --with dev
}

setup_frontend() {
    npm ci

    npx tsc -p tsconfig.build.json --declarationDir dist/types
    npx vite build --mode lib
}

echo "=== [INSTALL] Backend library ==="
(cd backend && setup_backend)

for plugin in ${PLUGINS[@]}; do
    echo "=== [INSTALL] Backend of $plugin plugin ==="
    (cd "plugins/$plugin/backend" && setup_backend)
done

echo "=== [INSTALL] Client ==="
sta serve -c appconfig-postgis.json --$BACKEND_SCHEME $BACKEND_PATH --debug --testing &
backend_pid=$!

cleanup() {
    if kill -0 "$backend_pid" 2>/dev/null; then
        kill "$backend_pid"
        wait "$backend_pid" 2>/dev/null || true
    fi
}

wait_for_backend() {
    local attempt

    for attempt in {1..30}; do
        if curl --silent --fail --output /dev/null "$BACKEND_SCHEME://$BACKEND_PATH"; then
            return 0
        fi

        if ! kill -0 "$backend_pid" 2>/dev/null; then
            echo "sta serve exited before becoming ready" >&2
            return 1
        fi

        sleep 1
    done

    echo "Timed out waiting for sta serve at $BACKEND_SCHEME://$BACKEND_PATH" >&2
    return 1
}

trap cleanup EXIT

wait_for_backend
(cd frontend && npm run openapi-ts)

cleanup
trap - EXIT

echo "=== [INSTALL] Frontend library ==="
(cd config/js && setup_frontend)
(cd frontend && setup_frontend)

for plugin in ${PLUGINS[@]}; do
    echo "=== [INSTALL] Frontend of $plugin plugin ==="
    (cd "plugins/$plugin/frontend" && setup_frontend)
done

