# Slide Agent

<p align="center"><img src="images/icon.png" alt="Slide Agent icon" width="180"></p>

Slide Agent is a portable TypeScript/Node.js skill and library for creating, editing, rendering, validating, and repairing editable PowerPoint presentations. It gives a host AI model creative authority over each deck's art direction, colors, typography, composition, imagery, charts, and diagram language instead of forcing every presentation through a fixed theme or template catalog.

PptxGenJS is the primary authoring engine. New decks use native PowerPoint text boxes, shapes, tables, charts, images, connectors, and speaker notes. Existing decks are edited at the OOXML package level so unaffected content remains intact whenever the requested operation can be expressed safely.

## Capabilities

- Create decks from prompt text, a structured brief, or a complete `PresentationOutline`.
- Supply an open-ended, deck-specific `CreativeDirection`; any model-chosen colors and fonts can become the active native theme.
- Author every slide as a freeform editable `canvas` with arbitrary PptxGenJS shapes, rich text, connectors, images, tables, charts, layers, rotations, transparency, and advanced native options.
- Generate a model-readable `artifacts/intermediate_files/<deck>.inspect.ndjson` blueprint and rebuild directly from that line-oriented scene file.
- Use any semantic slide kind and bypass the layout registry completely; the canvas itself is the layout.
- Edit text, slides, themes, images, tables, and chart data in existing `.pptx` files.
- Generate title, section, summary, image, comparison, timeline, process, architecture, table, chart, KPI, quote, roadmap, closing, and custom slides.
- Create native bar, line, pie, and area charts plus editable shape-based waterfall charts.
- Optionally render every slide to PDF and PNG previews when external render tools are available.
- Validate bounds, overlap, text fit, density, font size, contrast, images, fonts, margins, alignment, chart data, empty slides, titles, and package integrity.
- Run a bounded automatic repair-and-rebuild loop.
- Return agent-neutral structured JSON results.

## Requirements

Node.js 20 or newer is the only requirement for creating, editing, and structurally validating `.pptx` files.

PDF and PNG previews are optional. That workflow additionally uses LibreOffice (`soffice`) for PPTX-to-PDF conversion and Poppler (`pdftoppm`) for PDF-to-PNG conversion. Missing preview tools produce warnings in `slide-agent doctor`; they do not prevent installation or PowerPoint generation.

Override executable discovery when needed:

```bash
export SLIDE_AGENT_SOFFICE=/absolute/path/to/soffice
export SLIDE_AGENT_PDFTOPPM=/absolute/path/to/pdftoppm
```

The renderer discovers normal system paths, Homebrew locations, and the macOS LibreOffice application. Use the overrides only for nonstandard installations.

## Install once—no repository clone

The recommended universal install works from Terminal, the VS Code terminal, Codex, Copilot, Claude Code, or Gemini CLI:

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install
```

It persistently installs the CLI and MCP server under the user-writable `~/.local`, registers the same skill for Codex, GitHub Copilot, Claude Code, and Gemini CLI, and verifies the core setup. `npx` is only the bootstrap; normal use does not redownload the package. You do not need `npm link`, an administrator-owned global npm prefix, manual skill copying, a product-specific runtime, or a GitHub source checkout.

To also install the optional preview tools with Homebrew, apt, dnf, pacman, or WinGet:

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install --with-render-deps
```

To remove the managed package, launchers, and only the skill links created by Slide Agent:

```bash
slide-agent uninstall
```

### VS Code and GitHub Copilot

Install `Slide Agent` from the VS Code Marketplace, or download `slide-agent-vscode-<version>.vsix` from a GitHub release and run **Extensions: Install from VSIX**. The extension lets you choose any language model exposed through VS Code's Language Model API. That model invents the artistic direction and authors the complete editable NDJSON scene; Slide Agent builds, renders, validates, and repairs it. The extension's **Slide Agent: Install or Update** command performs the same one-time universal installation—no clone required.

### Development checkout only

The repository scripts remain available to contributors who intentionally work from source. On macOS/Linux run `./install.sh`; on Windows run `install.cmd` or `.\install.ps1`. These install from the current checkout and are not required for end users.

The installers refuse to overwrite conflicting skills or launchers and can be rerun safely. Optional preview dependencies are attempted only with `--with-render-deps`; a failure in that opt-in step never changes the fact that the core package itself needs only Node.js.

Verify or troubleshoot at any time:

```bash
slide-agent doctor
slide-agent doctor --json
```

For a library-only development checkout:

```bash
npm install
npm run build
```

Install the CLI into the user-writable `~/.local/bin` directory during development:

```bash
npm run install:cli
slide-agent --help
```

Set `SLIDE_AGENT_CLI_PREFIX` before installation to choose another user-writable prefix. The installer never writes to `/usr/local` and never requires `sudo`.

### Agent discovery

The one-command installer registers every supported agent. To register only one target during development, use the same portable setup engine:

```bash
npm run install:codex
npm run install:copilot
npm run install:claude
npm run install:gemini
```

Or install for every supported agent in one pass:

```bash
npm run install:agents
```

The targets are `~/.agents/skills/slide-agent` for Codex and the shared Agent Skills standard, `~/.copilot/skills/slide-agent` for GitHub Copilot, `~/.claude/skills/slide-agent` for Claude Code, and `~/.gemini/skills/slide-agent` for Gemini CLI. The CLI and TypeScript API are the neutral integration layer for VS Code extensions, self-hosted models, and other agents that can execute local tools. A browser-only chat session cannot run a program on your computer; connect it through a tool-capable desktop/extension host or a server that invokes the structured CLI/API.

## CLI

Create from a prompt:

```bash
slide-agent create \
  --prompt examples/prompts/product-launch.md \
  --output atlas-launch.pptx
```

Create or regenerate from a model-authored NDJSON scene:

```bash
slide-agent create \
  --scene artifacts/intermediate_files/atlas-launch.inspect.ndjson \
  --output atlas-launch-regenerated.pptx
```

Edit an existing deck:

```bash
slide-agent edit \
  --input atlas-launch.pptx \
  --prompt changes.json \
  --output atlas-launch-updated.pptx
```

Validate structurally by default, or render explicitly when preview tools are installed:

```bash
slide-agent validate --input atlas-launch.pptx --report validation.json
slide-agent render --input atlas-launch.pptx --output previews/
```

Run a generic structured request from an extension or agent:

```bash
slide-agent run --request request.json
```

All commands emit a single structured JSON result on stdout. Structured logs are written as JSON lines to stderr.

### Useful create options

```text
--previews <dir>       Override the preview directory
--report <file>        Override validation JSON path
--metadata <file>      Override metadata JSON path
--inspect <file>       Override the round-trippable NDJSON blueprint path
--scene <file>         Build from NDJSON instead of a prompt
--config <dir>         Use a custom configuration directory
--max-retries <n>      Bound automatic repair attempts
--render               Also generate PDF/PNG previews with optional render tools
--no-validate          Skip validation
--no-auto-fix          Disable repair and rebuild
```

## TypeScript API

```ts
import {
  executeAgentRequest,
  type AgentResult,
  type CreateRequest,
} from "@slide-agent/core";

const request: CreateRequest = {
  command: "create",
  prompt: "Create an eight-slide board update for finance leaders.",
  output: "/workspace/board-update.pptx",
  validate: true,
  autoFix: true,
};

const result: AgentResult = await executeAgentRequest(request);
```

The preferred high-quality path is to let the host model supply a complete `PresentationOutline` with `creativeDirection` and model-authored slide canvases. Prompt-only mode remains vendor-neutral; it derives a different palette from each brief so it does not impose one package theme, but it cannot replace model judgment.

```ts
const outline: PresentationOutline = {
  brief,
  narrative: "Fragmentation resolves into one decision boundary.",
  creativeDirection: {
    concept: "Electric papercut systems map",
    palette: { background: "101014", ink: "F8F5E8", accent: "FF4FD8", accentAlt: "B8FF32" },
    typography: { display: "Georgia", body: "Helvetica Neue", mono: "Menlo" },
    diagramLanguage: "Irregular constellations joined by hairline signal routes"
  },
  slides: [{
    id: "opening",
    kind: "visual-argument",
    title: "One boundary absorbs the complexity",
    background: "101014",
    designIntent: "Make convergence physical through scale and direction.",
    canvas: [
      { id: "deck-title", type: "text", x: 0.7, y: 1, w: 8, h: 1.5, role: "title", text: "One boundary absorbs the complexity", style: { fontSize: 48, fontFace: "Georgia", color: "F8F5E8", bold: true } },
      { id: "signal", type: "shape", shape: "hexagon", x: 9.4, y: 1, w: 2.4, h: 2.4, style: { fill: "FF4FD8", rotate: 12 } }
    ]
  }]
};
```

See [creative direction](references/creative-direction.md), [professional depth](references/professional-depth.md), the [freeform canvas](references/freeform-canvas.md), [scene NDJSON](references/scene-ndjson.md), and [diagram craft](references/diagrams.md).

Reusable registered layouts are still available as optional fallbacks or integration hooks:

```ts
import { DeckBuilder, LayoutRegistry, loadConfig } from "@slide-agent/core";

const config = await loadConfig();
const layouts = new LayoutRegistry(config).register(
  "brand-proof",
  (writer, slide, context) => {
    writer.addText("proof-title", slide.title, { x: 0.7, y: 0.5, w: 12, h: 0.7 }, {
      fontSize: context.config.fonts.minimums.slideTitle,
      bold: true,
      role: "title",
    });
  },
);

const builder = new DeckBuilder(config, { layouts });
```

Set `slide.layout` to `"brand-proof"` when no `canvas` is present. A slide with `canvas` always uses the model's composition.

## Structured result

Every API and CLI operation returns:

```json
{
  "status": "success",
  "generatedFiles": ["/workspace/deck.pptx"],
  "slideCount": 8,
  "warnings": [],
  "validation": {
    "status": "pass",
    "issues": []
  },
  "errors": [],
  "metadata": {
    "requestId": "...",
    "command": "create",
    "startedAt": "...",
    "completedAt": "...",
    "durationMs": 1234,
    "retries": 0,
    "version": "1.1.0"
  }
}
```

Creation and editing also identify `primaryOutput`, `deliverables`, and `artifacts`. The requested output directory stays clean and handoff-friendly:

```text
output/
├── deck.pptx                  # final editable deliverable
├── deck.pdf                   # optional when rendering is requested
└── artifacts/
    ├── images/                # previews; before/ holds edit comparisons
    ├── generated_assets/      # model-created source assets when present
    ├── intermediate_files/    # manifest, NDJSON scene, before-edit PDF
    ├── logs/                  # validation and execution metadata
    └── temporary_files/       # reserved scratch area
```

Override paths explicitly with CLI/API options when an integration needs another layout.

`status` is `error` whenever validation still contains errors. A deck can still be present on disk for inspection, but callers must not treat it as production-ready.

## Architecture

```text
prompt/outline/NDJSON scene → model-authored creative direction
                                      ↓
asset resolver → freeform canvas or fallback layout → editable PptxGenJS builder → PPTX exporter
                                                                             ↓
OOXML inspector ← structural validation + autofix loop
       ↓                         ↑
OOXML editor          optional PDF/PNG renderer
```

- `src/planner/`: prompt analysis and narrative outline planning.
- `src/generators/`: concise deterministic content fallback.
- `src/themes/creative-director.ts`: resolves model-authored design choices and prompt-derived fallbacks.
- `src/layouts/freeform-composer.ts`: renders unrestricted model-authored editable scenes.
- `src/serialization/scene-ndjson.ts`: line-oriented model blueprint import/export.
- `src/layouts/layout-registry.ts`: optional built-in and reusable fallback layouts.
- `src/components/`: tracked native element writer and PptxGenJS compatibility boundary.
- `src/charts/`, `src/diagrams/`, `src/images/`: visual primitives and asset resolution.
- `src/rendering/`: headless render pipeline.
- `src/validation/`: structural, visual-output, package, and auto-fix logic.
- `src/editing/`: OOXML inspection and source-preserving edit operations.
- `src/export/`: deck construction and output.

## Configuration

The `config/` directory supplies technical defaults and prompt-only fallbacks. It is not the artistic authority for a model-authored deck:

- `dimensions.json`: slide size and margins.
- `colors.json`: fallback colors used only when the model does not provide them.
- `fonts.json`: fallback fonts, portability hints, and legibility minimums. Model-selected fonts are accepted and added to the active deck's known-font set.
- `generation.json`: density limits, retries, render size, and output behavior.

Pass `configDir` through the API or `--config` through the CLI to replace those defaults. Prefer `creativeDirection` and per-element canvas styling for artistic choices.

## Existing-deck editing model

PptxGenJS does not import existing presentations. Slide Agent therefore uses JSZip plus targeted OOXML mutations for edits and validates the exported package afterward.

Supported operations:

- `replace-text`
- `remove-slide`
- `duplicate-slide` / `add-slide` by cloning a source slide
- `reorder-slides`
- `apply-theme`
- `replace-image`
- `update-table`
- `update-chart`

Important limitations:

- Text replacement operates within individual OOXML text runs. Text split across several differently formatted runs may require multiple targeted replacements.
- Adding a slide clones an existing slide to preserve its master/layout; arbitrary cross-deck slide import is not implemented.
- Slide cloning also copies speaker notes and normalizes Slide Agent's named slide-number footer; third-party automatic numbering fields remain untouched.
- A duplicated slide can share chart parts with its source. Do not update one copy’s chart data without manual verification in PowerPoint.
- Theme edits update theme parts; direct per-shape formatting can override the new theme.
- Table edits preserve the existing table dimensions and cannot add rows or columns beyond its current grid.
- Chart updates replace cached series, resize their row formulas, and update the first embedded worksheet. The existing series count must remain unchanged; uncommon multi-sheet formulas and external links still need manual verification.
- SmartArt, macros, animations, OLE objects, 3D models, and uncommon extension parts are detected and preserved where package-level operations allow, but Slide Agent does not edit them. Verify them manually.

See [references/editing.md](references/editing.md) for the full operation schema and safety contract.

## Examples and verification

Generate the three original scenario decks locally. Set `SLIDE_AGENT_EXAMPLE_RENDER=1` when optional preview tools are installed:

```bash
npm run examples

# Optional rendered PDFs and PNGs
SLIDE_AGENT_EXAMPLE_RENDER=1 npm run examples
```

Generate the intentional failure fixture:

```bash
npm run fixture:invalid
```

Run all verification:

```bash
npm run verify
```

Generated output stays under the ignored `examples/output/` directory. The repository includes only original prompts, source code, a generated invalid-layout test fixture, and unit/integration tests.

## Publishing, security, and licensing

- [RELEASE.md](RELEASE.md) is the step-by-step npm, npx, VS Code Marketplace, Codex plugin, and GitHub release runbook.
- [SECURITY.md](SECURITY.md) explains vulnerability reporting and the public-content gate.
- [LICENSE](LICENSE) covers Slide Agent's original project code and documentation.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) records direct dependency licenses and trademark notices.
