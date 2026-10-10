#!/bin/bash
set -euo pipefail

# Proves the built production bundle actually boots and serves.
#
# `build-prod.sh` only shows that the bundle compiles, and `test.sh frontend`
# exercises the Vite dev server, which resolves dependencies through a different
# pipeline than Node does. Runtime module-resolution failures in the SSR bundle
# are therefore invisible to both, so this script starts the real server entry
# with `react-router-serve` and asserts on its responses.

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

FRONTEND_DIR=core/frontend
SERVER_DIR="$FRONTEND_DIR/build/server"
HOST=127.0.0.1
PORT=${STA_SMOKE_PORT:-4173}
READY_TIMEOUT=${STA_SMOKE_TIMEOUT:-90}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)
            PORT=$2
            shift 2
            ;;
        *)
            echo "Usage: $0 [--port PORT]" >&2
            echo "Requires a prior 'bash scripts/build-prod.sh'." >&2
            exit 2
            ;;
    esac
done

if [[ ! -f "$SERVER_DIR/index.js" || ! -f "$FRONTEND_DIR/build/client/build-hash.txt" ]]; then
    echo "Production frontend build not found; run 'bash scripts/build-prod.sh' first." >&2
    exit 1
fi

echo "=== [SMOKE] Test-only packages must not reach the server bundle ==="
# Matched as module specifiers rather than bare strings, and restricted to
# JavaScript so source maps and stylesheets cannot produce false positives.
leaked=false
for package in chai fast-check sinon vitest @vitest/runner @vitest/coverage-istanbul; do
    if grep -rqE --include='*.js' "(import|from) \"$package\"" "$SERVER_DIR"; then
        echo "Test-only package '$package' is imported by the production server bundle:" >&2
        grep -rlE --include='*.js' "(import|from) \"$package\"" "$SERVER_DIR" | sed 's/^/    /' >&2
        leaked=true
    fi
done
if $leaked; then
    echo "Test helpers must stay behind test-only entry points such as 'sta/common/testing'." >&2
    exit 1
fi
echo "Server bundle is free of test-only packages."

server_log="$(mktemp)"
server_pid=""

cleanup() {
    if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
        kill "$server_pid" 2>/dev/null || true
        wait "$server_pid" 2>/dev/null || true
    fi
    rm -f "$server_log"
}
trap cleanup EXIT

echo "=== [SMOKE] Booting the production server bundle ==="
# The production server refuses to start without a session secret. This value
# only signs cookies for a process discarded when the script exits, so it is a
# throwaway literal rather than a deployment secret.
(
    cd "$FRONTEND_DIR"
    NODE_ENV=production \
        STA_SESSION_SECRET=smoke-test-only-not-a-real-secret \
        STA_BACKEND_URL="http://$HOST:1" \
        HOST=$HOST \
        PORT=$PORT \
        exec "$REPO_ROOT/node_modules/.bin/react-router-serve" ./build/server/index.js
) >"$server_log" 2>&1 &
server_pid=$!

echo "Waiting up to ${READY_TIMEOUT}s for http://$HOST:$PORT ..."
ready=false
for _ in $(seq 1 "$READY_TIMEOUT"); do
    if ! kill -0 "$server_pid" 2>/dev/null; then
        echo "Server exited during startup:" >&2
        cat "$server_log" >&2
        exit 1
    fi
    if [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://$HOST:$PORT/login" || true)" == "200" ]]; then
        ready=true
        break
    fi
    sleep 1
done

if ! $ready; then
    echo "Server did not become ready within ${READY_TIMEOUT}s:" >&2
    cat "$server_log" >&2
    exit 1
fi

echo "=== [SMOKE] Asserting server-rendered routes ==="
failures=0

check_route() {
    local path=$1
    local expected=$2
    local actual
    actual=$(curl -s -o /dev/null -w '%{http_code}' "http://$HOST:$PORT$path" || true)
    if [[ "$actual" == "$expected" ]]; then
        echo "    $path -> $actual"
    else
        echo "    $path -> ${actual:-no response} (expected $expected)" >&2
        failures=$((failures + 1))
    fi
}

# `/login` renders without a backend. `/` redirects through the protected
# layout, which proves session storage initialised with the configured secret.
check_route /login 200
check_route / 302

echo "=== [SMOKE] Server log ==="
cat "$server_log"

if [[ $failures -ne 0 ]]; then
    echo "$failures route assertion(s) failed." >&2
    exit 1
fi

echo "Production bundle boots and serves."
