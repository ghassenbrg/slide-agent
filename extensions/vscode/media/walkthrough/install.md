## Install the Slide Agent engine

The extension installs the matching `@slide-agent/core` engine automatically the first time each version starts. Everything lands in your user directory — no administrator rights, no repository clone.

If automatic setup was disabled or interrupted, run it now:

**Slide Agent: Install or Update**

The installer:

- places the `slide-agent` CLI and MCP server under `~/.local/bin`
- registers the same skill for GitHub Copilot, Codex, Claude Code, and Gemini CLI
- verifies the setup with `slide-agent doctor`

Node.js 22.12 or newer must be on your PATH. PowerPoint generation needs nothing else; PDF/PNG previews are optional and use LibreOffice + Poppler when present.
