#!/bin/bash
set -euo pipefail

# Rewriting counterpart of `scripts/lint.sh`, covering the same trees with the
# same backend/frontend split: ESLint autofixes and Prettier formatting for the
# frontend, `ruff format` for Python. There is no root npm aggregate to call;
# this script is the only rewriting entry point.

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

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

PLUGINS=()
for plugin_dir in plugins/*/; do
    if [[ -d "$plugin_dir" ]]; then
        PLUGINS+=("$(basename "$plugin_dir")")
    fi
done

format_backend() {
    local package=$1
    local project=$2

    uv run --package "$package" --directory "$project" ruff format .
}

# Standalone Python that belongs to no package of its own is formatted through
# the integration test environment, mirroring lint.sh's ruff invocation.
format_standalone_python() {
    local project=$1

    uv run --package sta-integration-tests --directory tests/backend ruff format \
        "$REPO_ROOT/$project"
}

# ESLint's type-aware rules resolve cross-plugin imports from emitted package
# declarations. Build dependency plugins before running consumer autofixes so a
# fresh installation does not degrade their imported types to error/any.
prepare_frontend_plugin_types() {
    echo "=== [FORMAT] Frontend plugin dependency types ==="
    npm run build:package --workspace=sta-pcd
    npm run build:package --workspace=sta-gmesh
}

# Run independent plugin rewrites concurrently while preserving live,
# attributable output from both stdout and stderr.
format_plugins() {
    local side=$1
    local action=${2:-}
    local plugin
    local -a pids=()
    local -a labels=()

    for plugin in "${PLUGINS[@]}"; do
        (
            echo "=== [FORMAT] ${side^} of $plugin plugin${action:+ ($action)} ==="
            if [[ "$side" == "frontend" ]]; then
                npm run "$action" --workspace="sta-$plugin"
            else
                format_backend "sta_$plugin" "plugins/$plugin/backend"
            fi
        ) 2>&1 | sed -u "s/^/[FORMAT $side:$plugin] /" &
        pids+=("$!")
        labels+=("$plugin")
    done

    local failed=false
    local index
    for index in "${!pids[@]}"; do
        if ! wait "${pids[$index]}"; then
            echo "[FORMAT $side:${labels[$index]}] FAILED" >&2
            failed=true
        fi
    done
    ! $failed
}

if $RUN_FRONTEND; then
    prepare_frontend_plugin_types

    echo "=== [FORMAT] Frontend autofixes ==="
    # Core's `prelint:fix` hook still runs, so the generated config shim is
    # selected before ESLint reads the sources. Plugin workspaces own disjoint
    # trees and can safely rewrite them concurrently.
    npm run lint:fix \
        --workspace=sta-config \
        --workspace=sta \
        --workspace=st-annotator-full \
        --workspace=st-annotator-frontend-tests \
        --if-present
    format_plugins frontend lint:fix

    echo "=== [FORMAT] Frontend formatting ==="
    # Prettier remains authoritative by running after every ESLint autofix.
    npm run format \
        --workspace=sta-config \
        --workspace=sta \
        --workspace=st-annotator-full \
        --workspace=st-annotator-frontend-tests \
        --if-present
    format_plugins frontend format

    echo "=== [FORMAT] Frontend integration ==="
    format_standalone_python tests/frontend
fi

if $RUN_BACKEND; then
    echo "=== [FORMAT] Backend library ==="
    format_backend sta core/backend

    format_plugins backend

    echo "=== [FORMAT] Backend integration ==="
    format_standalone_python scripts
    format_backend sta-integration-tests tests/backend
fi

echo "=== RESULT ==="
echo "Formatting applied ($SUITE)."
