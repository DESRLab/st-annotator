#!/bin/bash
set -euo pipefail

# Run from the repository root, as with the other repository-wide commands.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/set-version.mjs" "$@"
