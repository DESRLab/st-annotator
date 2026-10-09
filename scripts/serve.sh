#!/bin/bash
set -eo pipefail

CONFIG_PATH=appconfig-postgis.json
BACKEND_SCHEME=http
BACKEND_PATH=localhost:8000

serve_frontend() {
    npm run dev
}

cleanup() {
    if kill -0 "$backend_pid" 2>/dev/null; then
        kill "$backend_pid"
    fi

    if kill -0 "$frontend_pid" 2>/dev/null; then
        kill "$frontend_pid"
    fi

    wait "$backend_pid" 2>/dev/null || true
    wait "$frontend_pid" 2>/dev/null || true
}

stop_services() {
    trap - INT TERM
    exit 130
}

trap cleanup EXIT
trap stop_services INT TERM

sta serve -c $CONFIG_PATH --$BACKEND_SCHEME $BACKEND_PATH &
backend_pid=$!

(cd frontend && serve_frontend) &
frontend_pid=$!

wait -n "$backend_pid" "$frontend_pid"
