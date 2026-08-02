#!/bin/sh
set -eu

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="${1:-}"

if [ -z "$target" ]; then
  printf '%s\n' "Usage: $0 <codex|copilot|claude|gemini|all> [--skip-cli]" >&2
  exit 2
fi
shift

exec node "$script_directory/setup.mjs" --target "$target" "$@"
