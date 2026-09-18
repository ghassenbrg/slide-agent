# Contributing to Slide Agent

Thank you for improving Slide Agent. This guide covers the development workflow; [README.md](README.md) explains what the project does, [references/v2/grammar.md](references/v2/grammar.md) is the composition language a model authors in, and [SKILL.md](SKILL.md) is the router a host agent reads.

Both are generated — `SKILL.md`, everything under `references/`, and the grammar page come out of `npm run docs`, and `npm run verify` fails on drift. Edit the source (`src/contract` for 0.x, `src/v2/commands` for 1.x), not the output.

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

Two engines. **1.x** is `src/v2`: a model-authored `slide-agent.intent/1` document → validate (`ir`) → compile the design language (`tokens`) → expand components and recipes (`compose`) → solve each slide against real font metrics (`text`, `layout`) → write OOXML directly (`ooxml`) → QA T0–T5 (`qa`), orchestrated by `Engine` in `src/v2/engine`. **0.x** is `src/pipeline.ts`: outline → `DeckBuilder` composes PptxGenJS elements (`src/components`, `src/layouts`) → `PptxExporter` writes the package and `PptxSanitizer` repairs known PptxGenJS OOXML defects → validators (`src/validation`) → `AutoFixer` retries fixable issues. Existing decks are edited at the OOXML level in `src/editing`.

The dependency runs one way: `src/v2` reads from the 0.x modules, and only the three entry points (`src/index.ts`, `src/cli.ts`, `src/mcp-server.ts`) import `src/v2`. Keep it that way. [docs/architecture.md](docs/architecture.md) has the full map.

Invariants to preserve:

1. **The model directs; the engine executes.** Do not add a code path that makes a design decision silently. If the engine must change something the author decided, report it as an adjustment that a pin can refuse. If the engine cannot decide without inventing taste, return a choice. A change that quietly improves a deck's looks is a change that takes authorship away from the person whose deck it is — see [ADR 0005](docs/adr/0005-the-model-directs-the-engine-executes.md).
2. **Everything stays editable.** No flattening slides into images; native text, placeholders, shapes, tables, and charts only.
3. **Generated packages are schema-valid.** `tests/integration/ooxml-schema.test.ts` and `tests/unit/v2/writer.test.ts` build decks and validate them against the official schemas — if you add new OOXML constructs, extend the writer and validator together (`src/utils/chart-schema.ts` is the shared source of truth for chart sequences).
4. **Builds are deterministic.** The same intent and inputs produce byte-identical packages under a pinned `SOURCE_DATE_EPOCH`. Anything that writes a timestamp, a random id, or an unordered map into the package breaks this; the round-trip test will catch it.
5. **`ready` stays mechanical.** No model's opinion may set it, and `designReview` must never block it.

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
