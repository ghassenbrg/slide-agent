# Changelog

All notable public changes are recorded here. Versions follow semantic versioning.

## Unreleased

- future notes here.

## 0.0.1 - 2026-08-02

- Initial release.

## 0.0.2 - 2026-08-02

- Register bundled skills automatically for local and global npm installs, with an explicit CI opt-out.
- Automatically install the matching core engine when the VS Code extension first activates.
- Make executable discovery, managed install/uninstall PATH handling, plugin frontmatter validation, and their tests portable across Windows, macOS, and Linux.
- Limit CI to pushes and merged pull requests entering `main`.
- Rename and split the release workflow into professional verification and publication jobs.
- Upgrade artifact upload and download actions to Node.js 24-compatible releases.

## 0.0.3 - 2026-08-02

- Minor fixes.

## 0.1.0 - 2026-08-02

- Repair three ECMA-376 schema violations in generated decks that could trigger PowerPoint repair prompts: paragraph properties re-emitted between continued text runs, the missing mandatory `c:grouping` in line charts, and chart-series elements that are misordered or illegal for their chart type (for example bar-only `invertIfNegative` in line, area, and pie series).
- Validate every generated PresentationML, DrawingML, chart, theme, and app-properties part against the bundled official ECMA-376 transitional XML Schemas using a WebAssembly libxml2 (`xmllint-wasm`); schema violations now surface as `schema-violation` validation errors for any deck, including edited third-party files.
- Detect paragraph-order, chart-grouping, chart-sequence, and chart-series defects in `slide-agent validate` package checks so existing decks report the same issues the exporter repairs.
- Record the exported package's SHA-256 in the generation manifest and let `slide-agent validate` automatically discover and trust that manifest when the hash still matches, so standalone validation of a freshly created deck honors authoring metadata such as intentional overlap instead of reporting false overlap errors.
- Fix `slide-agent-mcp` exiting silently instead of serving when launched through an npm or npx bin symlink on macOS and Linux; the direct-execution guard now compares realpaths.
- Make `--report` optional for `slide-agent validate` and the `validate_presentation` MCP tool; the report defaults to `artifacts/logs/<deck>.validation.json` next to the presentation.
- Fix Windows argument handling in the VS Code extension: CLI invocations through cmd.exe now quote the launcher path and arguments, so output paths containing spaces work.
- Fix LibreOffice preview rendering on Windows by passing the user-profile directory as a proper `file:///` URL.
- Add a "Get started with Slide Agent" walkthrough to the VS Code extension covering engine installation, first deck creation, AI-chat usage, and diagnostics.
- Shrink the project icon from 1.6 MB to 373 KB in every distribution, reducing the VS Code extension package from 1.59 MB to under 400 KB.