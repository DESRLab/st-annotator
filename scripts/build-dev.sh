#!/bin/bash
set -euo pipefail

# Clean and rebuild every publishable frontend package used during development.

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== [CLEAN] Generated frontend files ==="
rm -rf \
    core/frontend/.react-router \
    core/frontend/app/sta-config.shim.ts \
    core/frontend/app/sta-routes-config.shim.ts \
    core/frontend/build \
    core/frontend/dist \
    core/frontend/public/build-hash.txt \
    plugins/bbox/frontend/dist \
    plugins/gmesh/frontend/dist \
    plugins/pcd/frontend/dist \
    plugins/segmentation/frontend/dist \
    plugins/vector/frontend/dist

echo "=== [BUILD] OpenAPI client ==="
bash "$REPO_ROOT/scripts/generate-openapi-client.sh"

echo "=== [BUILD] Frontend packages ==="
for workspace in sta sta-pcd sta-gmesh sta-bbox sta-segmentation sta-vector; do
    npm run build:package --workspace="$workspace"
done

# scripts/build-prod.sh runs this script as one stage of a longer build and
# emits the closing marker itself, so a composed build prints exactly one.
if [[ -z ${STA_QUIET_RESULT:-} ]]; then
    echo "=== RESULT ==="
    echo "Development build complete. Run 'bash scripts/serve-dev.sh -c <config>' to start the dev servers."
fi
