#!/bin/bash
# End-to-end verification of the STA_BACKEND_URL / STA_FRONTEND_URL contract
# used by the Playwright suites.
#
# Scenarios:
#   1. e2e with all defaults                          -> servers serve on 8000/5173, tests pass
#   2. e2e with URL overrides                         -> servers serve on the overridden URLs, tests pass
#   3. serve-dev.sh occupying 8000/5173 + e2e defaults  -> tests fail (ports taken)
#   4. serve-dev.sh occupying 8000/5173 + e2e overrides -> both stacks coexist, tests pass
#
# While the e2e servers are up, the script asserts that the backend serves
# /openapi.json and the frontend serves /login on exactly the expected URLs,
# and that nothing answers on the other URL pair.
#
# CI=1 makes Playwright start its own webServers instead of reusing whatever
# already answers on the health-check URLs, so each scenario exercises the
# full URL wiring.
set -u

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SPEC=${SPEC:-handbook-account.spec.ts}
ALT_BACKEND_URL=${ALT_BACKEND_URL:-http://localhost:8100}
ALT_FRONTEND_URL=${ALT_FRONTEND_URL:-http://localhost:5273}
DEFAULT_BACKEND_URL=http://localhost:8000
DEFAULT_FRONTEND_URL=http://localhost:5173
LOG_DIR=$(mktemp -d /tmp/sta-e2e-verify.XXXXXX)

echo "Spec: ${SPEC:-<full suite>}"
echo "Logs: $LOG_DIR"

spec_args=()
if [[ -n $SPEC ]]; then
    spec_args=(-- "$SPEC")
fi

failures=0

report() {
    local scenario=$1 expected=$2 actual=$3
    if [[ $actual == "$expected" ]]; then
        echo "PASS: $scenario (expected: $expected)"
    else
        echo "FAIL: $scenario (expected: $expected, got: $actual)"
        failures=$((failures + 1))
    fi
}

http_code() {
    curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" 2>/dev/null || true
}

wait_for_url() {
    local url=$1
    for _ in $(seq 1 60); do
        [[ $(http_code "$url") != 000 ]] && return 0
        sleep 2
    done
    return 1
}

wait_for_url_down() {
    local url=$1
    for _ in $(seq 1 30); do
        [[ $(http_code "$url") == 000 ]] && return 0
        sleep 1
    done
    return 1
}

assert_backend_at() {
    local base=$1 code
    code=$(http_code "$base/openapi.json")
    if [[ $code == 200 ]]; then
        echo "  OK: backend serves the API at $base"
    else
        echo "  FAIL: no backend API at $base/openapi.json (HTTP $code)"
        failures=$((failures + 1))
    fi
}

assert_frontend_at() {
    local base=$1 code
    code=$(http_code "$base/login")
    if [[ $code == 200 ]]; then
        echo "  OK: frontend serves the app at $base"
    else
        echo "  FAIL: no frontend app at $base/login (HTTP $code)"
        failures=$((failures + 1))
    fi
}

assert_down() {
    local base=$1
    if [[ $(http_code "$base/") == 000 ]]; then
        echo "  OK: nothing answers at $base"
    else
        echo "  FAIL: something answers at $base"
        failures=$((failures + 1))
    fi
}

run_e2e() {
    local log=$1
    shift
    (
        cd "$REPO_ROOT/tests/frontend" &&
        env -u STA_BACKEND_URL -u STA_FRONTEND_URL "$@" CI=1 \
            npm run test:e2e "${spec_args[@]}"
    ) > "$log" 2>&1
}

start_e2e() {
    run_e2e "$@" &
    E2E_PID=$!
}

start_serve_dev() {
    (cd "$REPO_ROOT" && exec setsid bash scripts/serve-dev.sh -c appconfig-postgis.json) > "$LOG_DIR/serve-dev-sh.log" 2>&1 &
    SERVE_PID=$!
    if ! wait_for_url "$DEFAULT_BACKEND_URL/openapi.json" || ! wait_for_url "$DEFAULT_FRONTEND_URL/login"; then
        echo "serve-dev.sh did not start both servers; see $LOG_DIR/serve-dev-sh.log"
        stop_serve_dev
        exit 1
    fi
}

stop_serve_dev() {
    kill -TERM -- -"$SERVE_PID" 2>/dev/null || true
    wait "$SERVE_PID" 2>/dev/null || true
    wait_for_url_down "$DEFAULT_BACKEND_URL/"
    wait_for_url_down "$DEFAULT_FRONTEND_URL/login"
}

echo "=== Scenario 1: e2e with all defaults ==="
start_e2e "$LOG_DIR/1-defaults.log"
wait_for_url "$DEFAULT_BACKEND_URL/openapi.json" || true
wait_for_url "$DEFAULT_FRONTEND_URL/login" || true
assert_backend_at "$DEFAULT_BACKEND_URL"
assert_frontend_at "$DEFAULT_FRONTEND_URL"
assert_down "$ALT_BACKEND_URL"
assert_down "$ALT_FRONTEND_URL"
if wait "$E2E_PID"; then s1=pass; else s1=fail; fi
report "scenario 1 (defaults)" pass "$s1"

echo "=== Scenario 2: e2e with overridden URLs ==="
start_e2e "$LOG_DIR/2-overrides.log" \
    STA_BACKEND_URL="$ALT_BACKEND_URL" STA_FRONTEND_URL="$ALT_FRONTEND_URL"
wait_for_url "$ALT_BACKEND_URL/openapi.json" || true
wait_for_url "$ALT_FRONTEND_URL/login" || true
assert_backend_at "$ALT_BACKEND_URL"
assert_frontend_at "$ALT_FRONTEND_URL"
assert_down "$DEFAULT_BACKEND_URL"
assert_down "$DEFAULT_FRONTEND_URL"
if wait "$E2E_PID"; then s2=pass; else s2=fail; fi
report "scenario 2 (overrides)" pass "$s2"

wait_for_url_down "$DEFAULT_BACKEND_URL/"
wait_for_url_down "$DEFAULT_FRONTEND_URL/login"
start_serve_dev

echo "=== Scenario 3: serve-dev.sh occupying the defaults + e2e with defaults ==="
assert_backend_at "$DEFAULT_BACKEND_URL"
assert_frontend_at "$DEFAULT_FRONTEND_URL"
if run_e2e "$LOG_DIR/3-conflict.log"; then s3=pass; else s3=fail; fi
report "scenario 3 (port conflict)" fail "$s3"
assert_backend_at "$DEFAULT_BACKEND_URL"
assert_frontend_at "$DEFAULT_FRONTEND_URL"

echo "=== Scenario 4: serve-dev.sh occupying the defaults + e2e with overrides ==="
start_e2e "$LOG_DIR/4-overrides-while-serving.log" \
    STA_BACKEND_URL="$ALT_BACKEND_URL" STA_FRONTEND_URL="$ALT_FRONTEND_URL"
wait_for_url "$ALT_BACKEND_URL/openapi.json" || true
wait_for_url "$ALT_FRONTEND_URL/login" || true
assert_backend_at "$ALT_BACKEND_URL"
assert_frontend_at "$ALT_FRONTEND_URL"
assert_backend_at "$DEFAULT_BACKEND_URL"
assert_frontend_at "$DEFAULT_FRONTEND_URL"
if wait "$E2E_PID"; then s4=pass; else s4=fail; fi
report "scenario 4 (overrides alongside serve-dev.sh)" pass "$s4"

stop_serve_dev

echo
if [[ $failures -gt 0 ]]; then
    echo "$failures check(s) failed; logs in $LOG_DIR"
    exit 1
fi
echo "All scenarios behaved as expected."
