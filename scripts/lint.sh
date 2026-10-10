#!/bin/bash
set -euo pipefail

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
PYRIGHT_CONFIG="$REPO_ROOT/config/python/pyproject.toml"
PYRIGHT_TEST_CONFIG="$REPO_ROOT/config/python/pyright-tests.json"

PLUGINS=()
for plugin_dir in plugins/*/; do
    if [[ -d "$plugin_dir" ]]; then
        PLUGINS+=("$(basename "$plugin_dir")")
    fi
done

lint_backend() {
    local package=$1
    local project=$2
    local source_target="${3:-}"
    local test_target="${4:-test}"

    uv run --package "$package" --directory "$project" deptry .
    uv run --package "$package" --directory "$project" ruff format --check .
    uv run --package "$package" --directory "$project" ruff check .

    local python_path
    python_path="$(uv run --package "$package" python -c 'import sys; print(sys.executable)')"
    if [[ -n "$source_target" ]]; then
        uv run --package "$package" --directory "$project" pyright \
            --warnings \
            --pythonpath "$python_path" \
            --project "$PYRIGHT_CONFIG" \
            "$source_target"
    fi

    if [[ -e "$project/$test_target" ]]; then
        # Test modules are checked separately with legacy fixture/SQLModel
        # diagnostics relaxed; all other errors still fail the build, and
        # --warnings makes the remaining diagnostics fail it too so the
        # relaxed pass cannot drift into a silent no-op.
        uv run --package "$package" --directory "$project" pyright \
            --warnings \
            --pythonpath "$python_path" \
            --project "$PYRIGHT_TEST_CONFIG" \
            "$test_target"
    fi
}

# Standalone Python (tooling scripts, the Playwright tree) is not a
# distributable package, so it gets no deptry/source pass; it is type-checked
# with the same relaxed profile as test trees, warnings included.
lint_standalone_python() {
    local project=$1

    uv run --package sta-integration-tests --directory tests/backend ruff format --check \
        "$REPO_ROOT/$project"
    uv run --package sta-integration-tests --directory tests/backend ruff check \
        "$REPO_ROOT/$project"
    uv run --package sta-integration-tests --directory tests/backend pyright \
        --warnings \
        --pythonpath "$(uv run --package sta-integration-tests python -c 'import sys; print(sys.executable)')" \
        --project "$PYRIGHT_TEST_CONFIG" \
        "$REPO_ROOT/$project"
}

# depcheck reads each package's .depcheckrc.yaml, which documents the
# per-package ignores.
lint_frontend() {
    local workspace=$1

    npm exec --workspace="$workspace" -- depcheck
    npm run typecheck --workspace="$workspace"
    npm run lint --workspace="$workspace"
}

# Plugin frontends are type-checked locally via their own tsconfig; the main
# frontend's tsc also covers plugin sources it imports through source
# exports. Plugin app route modules are covered too: the react-router typegen
# only emits +types for modules inside the frontend app directory, so each
# plugin route module commits a hand-written +types stand-in (keep it in sync
# with the module's loader/clientLoader/action exports).
lint_plugin_frontend() { lint_frontend "$1"; }

# Bbox, segmentation and vector resolve cross-plugin imports through the
# dependency packages' emitted declarations. Installation does not build those
# declarations, so prepare the two dependency plugins before linting consumers.
prepare_frontend_plugin_types() {
    echo "=== [LINT] Frontend plugin dependency types ==="
    npm run build:package --workspace=sta-pcd
    npm run build:package --workspace=sta-gmesh
}

# Run independent plugin checks concurrently while preserving live, attributable
# output. Merging each job's streams also prevents its stderr from losing the
# plugin label.
lint_plugins() {
    local side=$1
    local plugin
    local -a pids=()
    local -a labels=()

    for plugin in "${PLUGINS[@]}"; do
        (
            echo "=== [LINT] ${side^} of $plugin plugin ==="
            if [[ "$side" == "frontend" ]]; then
                lint_plugin_frontend "sta-$plugin"
            else
                lint_backend "sta_$plugin" "plugins/$plugin/backend" "sta_$plugin"
            fi
        ) 2>&1 | sed -u "s/^/[LINT $side:$plugin] /" &
        pids+=("$!")
        labels+=("$plugin")
    done

    local failed=false
    local index
    for index in "${!pids[@]}"; do
        if ! wait "${pids[$index]}"; then
            echo "[LINT $side:${labels[$index]}] FAILED" >&2
            failed=true
        fi
    done
    ! $failed
}

if $RUN_FRONTEND; then
    echo "=== [LINT] Frontend formatting ==="
    # Workspaces aggregate: one invocation covers every workspace, so it stays
    # outside the per-workspace loop below rather than repeating for each
    # package.
    npm run format:check --workspaces --if-present

    echo "=== [LINT] Frontend library ==="
    lint_frontend sta

    prepare_frontend_plugin_types
    lint_plugins frontend

    echo "=== [LINT] Shared JavaScript configuration ==="
    # checkJs/allowJs in the package's tsconfig type-check its own JSDoc
    # annotations, so the lint step alone would not catch a bad annotation.
    npm run typecheck --workspace=sta-config
    npm run lint --workspace=sta-config

    echo "=== [LINT] Frontend integration ==="
    lint_standalone_python tests/frontend
    lint_plugin_frontend st-annotator-frontend-tests
    npm run lint --workspace=st-annotator-full
    npm run typecheck --workspace=st-annotator-full
    node scripts/check-frontend-dependencies.mjs
fi

if $RUN_BACKEND; then
    echo "=== [LINT] Backend library ==="
    lint_backend sta core/backend sta

    lint_plugins backend

    echo "=== [LINT] Backend integration ==="
    lint_standalone_python scripts
    lint_backend sta-integration-tests tests/backend "" .
fi

echo "=== RESULT ==="
echo "Lint passed ($SUITE)."
