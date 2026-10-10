#!/bin/bash
set -euo pipefail

PLUGINS=()
for plugin_dir in plugins/*/; do
    if [[ -d "$plugin_dir" ]]; then
        PLUGINS+=("$(basename "$plugin_dir")")
    fi
done

setup_backends() {
    local sync_args=(--all-packages --all-groups)

    if [[ ${CI:-} == true || ${CI:-} == 1 ]]; then
        sync_args+=(--frozen)
    else
        uv lock
    fi

    # CSF's pinned source revision declares a build-only NumPy version that is
    # unavailable on Python 3.10. Its package-specific uv configuration disables
    # isolation so it uses our locked runtime NumPy instead. Populate that NumPy
    # and setuptools first; the second sync then builds CSF in the prepared env.
    uv sync "${sync_args[@]}" --no-install-package cloth-simulation-filter
    uv sync "${sync_args[@]}"
}

echo "=== [INSTALL] Frontend workspace ==="
npm ci

echo "=== [INSTALL] Backend library ==="
setup_backends

echo "=== [INSTALL] OpenAPI Client ==="
bash scripts/generate-openapi-client.sh

echo "=== RESULT ==="
echo "Installation complete! Run 'sta init -c <config>' to create the database."
