# Contributing to Slide Agent

Thank you for improving Slide Agent. This guide covers the development workflow; [README.md](README.md) explains what the project does and [SKILL.md](SKILL.md) defines the agent-facing contract.

## Prerequisites

- Node.js 22.12 or newer (`node --version`)
- npm (bundled with Node.js)
- Optional, for preview rendering only: LibreOffice (`soffice`) and Poppler (`pdftoppm`)

## Setup

```bash
git clone https://github.com/ghassenbrg/slide-agent.git
cd slide-agent
npm install
```

## Everyday commands

```bash
npm run verify        # typecheck + full test suite + build — run before every PR
npm test              # vitest unit + integration tests
npm run typecheck     # TypeScript only
npm run examples      # generate the three example decks under examples/output/
npm run doctor        # diagnose the local installation
```

The VS Code extension lives in `extensions/vscode` with its own `npm install`, `npm run check`, and `npm run package`.

## Architecture in one minute

The pipeline is `src/pipeline.ts`: outline (model-authored or planned from a prompt) → `DeckBuilder` composes editable PptxGenJS elements (`src/components`, `src/layouts`) → `PptxExporter` writes the package and `PptxSanitizer` repairs known PptxGenJS OOXML defects → validators check the manifest, the package, and every XML part against the bundled ECMA-376 schemas (`src/validation`) → `AutoFixer` retries fixable issues. Existing decks are edited at the OOXML level in `src/editing`. The README's Architecture section has the full map.

Two invariants to preserve:

1. **Everything stays editable.** No flattening slides into images; native text, shapes, tables, and charts only.
2. **Generated packages are schema-valid.** `tests/integration/ooxml-schema.test.ts` builds a deck and validates it against the official schemas — if you add new OOXML constructs, extend the sanitizer and validator together (`src/utils/chart-schema.ts` is the shared source of truth for chart sequences).

## Tests

- Unit tests live in `tests/unit`, integration tests in `tests/integration`. Both run in plain vitest with no network access.
- Rendering-dependent assertions must skip gracefully when LibreOffice/Poppler are absent (see `create-edit-render.test.ts` for the pattern).
- New behavior needs a test; bug fixes need a regression test that fails without the fix.

## Pull requests

- Keep the build green: `npm run verify` must pass on macOS, Linux, and Windows (CI runs all three).
- Update documentation (README, SKILL.md, `references/`) and `CHANGELOG.md` under **Unreleased** whenever behavior changes.
- Cross-platform rules of thumb: build paths with `node:path`, convert paths for external tools with `pathToFileURL`, and never assume a POSIX shell in spawned commands.
- Releases follow [RELEASE.md](RELEASE.md); versions are set with `npm run version:set`.

## Reporting issues

Use the GitHub issue tracker. For suspected PowerPoint-compatibility problems, attach the `slide-agent validate --input deck.pptx` JSON report — it includes ECMA-376 schema findings that identify the offending part and line.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
