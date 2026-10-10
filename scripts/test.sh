#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/port-utils.sh"

RUN_BACKEND=true
RUN_FRONTEND=true
SUITE="${1:-all}"

case "$SUITE" in
    all)
        ;;
    backend)
        RUN_FRONTEND=false
        ;;
    frontend)
        RUN_BACKEND=false
        ;;
    *)
        echo "Usage: $0 [all|backend|frontend]" >&2
        exit 2
        ;;
esac

PLUGINS=()
for plugin_dir in plugins/*/; do
    if [[ -d "$plugin_dir" ]]; then
        PLUGINS+=("$(basename "$plugin_dir")")
    fi
done

if $RUN_FRONTEND; then
    parse_url "${STA_BACKEND_URL:-http://localhost:8000}"
    backend_port=$PARSED_PORT
    parse_url "${STA_FRONTEND_URL:-http://localhost:5173}"
    frontend_port=$PARSED_PORT

    kill_port_listeners "$backend_port" "backend test"
    if [[ $frontend_port != "$backend_port" ]]; then
        kill_port_listeners "$frontend_port" "frontend test"
    fi
fi

test_backend() {
    local package=$1
    local project=$2
    local workers=${3:-8}
    # `-n auto` intermittently exhausts the shared Postgres server's connection slots
    uv run --package "$package" --directory "$project" pytest -n "$workers"
}
test_frontend() {
    local workspace=$1
    # Istanbul coverage currently leaves Vitest open after tests finish.
    npm run test:unit --workspace="$workspace"
}

# Run independent plugin suites concurrently while preserving live,
# attributable output from both stdout and stderr.
test_plugins() {
    local side=$1
    local plugin
    local -a pids=()
    local -a labels=()

    for plugin in "${PLUGINS[@]}"; do
        (
            echo "=== [TEST] ${side^} of $plugin plugin ==="
            if [[ "$side" == "frontend" ]]; then
                test_frontend "sta-$plugin"
            else
                # Five concurrent plugins at the default eight workers would
                # create 40 worker processes before accounting for connection
                # pools. Keep the phase near the established eight-worker
                # budget while retaining cross-plugin parallelism.
                test_backend "sta_$plugin" "plugins/$plugin/backend" 2
            fi
        ) 2>&1 | sed -u "s/^/[TEST $side:$plugin] /" &
        pids+=("$!")
        labels+=("$plugin")
    done

    local failed=false
    local index
    for index in "${!pids[@]}"; do
        if ! wait "${pids[$index]}"; then
            echo "[TEST $side:${labels[$index]}] FAILED" >&2
            failed=true
        fi
    done
    ! $failed
}

if $RUN_FRONTEND; then
    echo "=== [TEST] Frontend library ==="
    test_frontend sta

    test_plugins frontend

    echo "=== [TEST] Shared JavaScript configuration ==="
    npm run test:unit --workspace=sta-config
fi

if $RUN_BACKEND; then
    echo "=== [TEST] Backend library ==="
    test_backend sta core/backend

    test_plugins backend

    echo "=== [TEST] Backend integration ==="
    # The plugin-dependent backend tests are a separate uv project:
    # plugins depend on core, so they cannot be core test dependencies.
    test_backend sta-integration-tests tests/backend
fi

if $RUN_FRONTEND; then
    echo "=== [TEST] Frontend integration ==="
    # CI disables Playwright's server reuse so the with-data suite starts its
    # fixture-seeding backend instead of inheriting the standard E2E backend.
    CI=1 npm --prefix tests/frontend run test:e2e
    CI=1 npm --prefix tests/frontend run test:e2e:auth
    CI=1 npm --prefix tests/frontend run test:e2e:with-data
fi

echo "=== RESULT ==="
echo "Tests passed ($SUITE)."
