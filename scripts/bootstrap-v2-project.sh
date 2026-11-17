#!/usr/bin/env bash
# Compatibility entrypoint. Old V2 bootstrap imported only issues 253-305.
# The authoritative living-city Project migration is now the Node script.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/bootstrap-v2-city-project.mjs" "$@"
