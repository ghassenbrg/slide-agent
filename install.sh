#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
with_render=0
skip_cli=0

for arg in "$@"; do
  case "$arg" in
    --with-render-deps) with_render=1 ;;
    --skip-cli) skip_cli=1 ;;
    *) : ;;
  esac
done

need_command() { command -v "$1" >/dev/null 2>&1; }

install_node() {
  if need_command node && need_command npm; then
    major=$(node -p 'Number(process.versions.node.split(".")[0])')
    [ "$major" -ge 20 ] && return
  fi
  os=$(uname -s)
  if [ "$os" = "Darwin" ] && need_command brew; then
    brew install node
  elif need_command apt-get; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif need_command dnf; then
    sudo dnf install -y nodejs npm
  elif need_command pacman; then
    sudo pacman -Sy --needed nodejs npm
  else
    printf '%s\n' "Node.js 20+ is required and no supported package manager was found." >&2
    printf '%s\n' "Install Node.js from https://nodejs.org and rerun ./install.sh." >&2
    exit 1
  fi
  major=$(node -p 'Number(process.versions.node.split(".")[0])')
  [ "$major" -ge 20 ] || { printf '%s\n' "The package manager installed Node.js $major; version 20+ is required." >&2; exit 1; }
}

has_soffice() {
  need_command soffice || need_command libreoffice || [ -x /Applications/LibreOffice.app/Contents/MacOS/soffice ]
}
has_pdftoppm() { need_command pdftoppm; }

install_render_dependencies() {
  has_soffice && has_pdftoppm && return
  os=$(uname -s)
  if [ "$os" = "Darwin" ] && need_command brew; then
    has_soffice || brew install --cask libreoffice
    has_pdftoppm || brew install poppler
  elif need_command apt-get; then
    sudo apt-get update && sudo apt-get install -y libreoffice poppler-utils
  elif need_command dnf; then
    sudo dnf install -y libreoffice poppler-utils
  elif need_command pacman; then
    sudo pacman -Sy --needed libreoffice-fresh poppler
  else
    printf '%s\n' "Could not install LibreOffice and Poppler automatically." >&2
    printf '%s\n' "Rerun without --with-render-deps to install creation/editing only." >&2
    exit 1
  fi
}

install_node
[ "$with_render" -eq 0 ] || install_render_dependencies

node "$project_root/scripts/setup.mjs" "$@"
cli_prefix=${SLIDE_AGENT_CLI_PREFIX:-"$HOME/.local"}
[ "$skip_cli" -eq 1 ] || PATH="$cli_prefix/bin:$PATH" "$cli_prefix/bin/slide-agent" doctor

printf '\n%s\n' "Slide Agent is ready. Install once; use it from any supported agent."
printf '%s\n' "  Codex:          \$slide-agent"
printf '%s\n' "  GitHub Copilot: /slide-agent"
printf '%s\n' "  Claude Code:    /slide-agent"
printf '%s\n' "  Gemini CLI:     ask it to use slide-agent"
printf '%s\n' "  Any other agent can execute: slide-agent --help"
