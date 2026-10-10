#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_SCHEME=http
BACKEND_PATH=localhost:8000

cd "$REPO_ROOT"

uv run --package sta sta serve -c appconfig-postgis.json \
    --$BACKEND_SCHEME "$BACKEND_PATH" --debug --testing &
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
(cd core/frontend && npm run openapi-ts)
