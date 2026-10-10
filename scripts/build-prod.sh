#!/bin/bash
set -euo pipefail

# Builds publishable frontend packages and the production React Router bundle.
# Normal development does not require this script: run scripts/install.sh once
# to install dependencies and generate the API client, then scripts/serve-dev.sh to
# use the source-watching Vite development server.

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ $# -ne 0 ]]; then
    echo "Usage: $0" >&2
    exit 2
fi

STA_QUIET_RESULT=1 bash "$REPO_ROOT/scripts/build-dev.sh"

echo "=== [BUILD] Full frontend distribution ==="
CORE_ROOT="$REPO_ROOT/core/frontend"
CORE_CONFIG="$CORE_ROOT/sta.config.ts"
FULL_CONFIG="$REPO_ROOT/distributions/full/frontend/sta.config.ts"

restore_core_config() {
    node "$REPO_ROOT/scripts/select-frontend-config.mjs" \
        "$CORE_ROOT" \
        "$CORE_CONFIG"
}

# The React Router build rewrites the generated composition shim. Always put
# it back on the core-only configuration, including after an interrupted or
# failed full build.
trap restore_core_config EXIT
STA_CONFIG_PATH="$FULL_CONFIG" npm run build --workspace=sta

if rg -q "__STA_E2E_PROBE__|StaE2EProbe|VITE_STA_E2E_PROBE" \
    "$CORE_ROOT/build/client"; then
    echo "Production client contains the disabled editor e2e probe" >&2
    exit 1
fi

restore_core_config
trap - EXIT
node "$REPO_ROOT/scripts/frontend-build-freshness.mjs" prod-record

echo "=== RESULT ==="
echo "Production build complete. Run 'bash scripts/serve-prod.sh -c <config>' to serve it."
