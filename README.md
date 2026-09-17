<p align="center">
  <img src="images/icon.png" alt="Slide Agent" width="140">
</p>

<h1 align="center">Slide Agent</h1>

<p align="center">
  <strong>Your model directs the design. Slide Agent computes the rest —<br>
  geometry, text fitting, contrast, and native PowerPoint — and shows you what it built.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@slide-agent/core"><img src="https://img.shields.io/npm/v/%40slide-agent%2Fcore?label=npm&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/ghassenbrg/slide-agent/actions/workflows/slide-agent-ci.yml"><img src="https://github.com/ghassenbrg/slide-agent/actions/workflows/slide-agent-ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/@slide-agent/core"><img src="https://img.shields.io/node/v/%40slide-agent%2Fcore" alt="Node.js version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/%40slide-agent%2Fcore?color=blue" alt="MIT licence"></a>
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#extending">Extending</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

Slide Agent has no house style, and it does not have one on purpose. **The model
directs; the engine executes.** You decide everything a designer would argue
about — the message, the visual concept, the palette, the typefaces, the
composition, what is emphasised, how the deck is paced. The engine computes
everything with a right answer: frames, text measurement and fitting, contrast
verification, connector routing, and the OOXML itself.

That division is what makes a deck cheap without making it generic. Writing a
slide in grid units, roles, and named tokens costs about a quarter of what
writing coordinates and colour literals cost — and the decisions are still
yours:

```json
{"id":"route","message":"Waves fail at the pilot","compose":{"grid":"12x6","items":[
 {"at":"c1-9 r1","text":"Every wave clears the same six gates","role":"title"},
 {"at":"c1-12 r3-5","row":{"gap":"space.3","connect":"chevron","items":[
  {"use":"gate","n":"01","label":"Inventory","detail":"what talks to what"},
  {"use":"gate","n":"04","label":"Pilot","detail":"one business unit","grow":2,"tone":"accent","size":"+1"}]}}]}}
```

Four properties hold throughout:

- **No silent taste.** Every change the engine makes to one of your decisions —
  a contrast repair, a type step — is reported and refusable with a pin. Moves
  that would change the design, like widening a region or splitting a slide,
  come back as choices for you to answer. Recipes and presets are opt-in, and
  every verdict says how much of the deck used them.
- **Everything stays editable and native.** Real title placeholders, theme
  colours and fonts, native charts with their data, native tables, icons as
  custom geometry, embedded typefaces. No slide is ever flattened into an image.
- **Checked against things that are true.** Each part is validated against the
  bundled ECMA-376 schemas offline; text is measured from the font files it will
  be set in; contrast, bounds, and legibility floors are hard constraints; and
  `finalize` rebuilds the deck from its own intent in a clean directory.
- **Nothing overstates itself.** A preview says it is a preview, a draft says it
  is a draft, and `ready` means mechanically sound — never that the design is
  good. That judgement stays with a model or a person who looked.

Four ways to use it:

1. **You direct** (default) — your model writes the intent; no model runs inside
   Slide Agent.
2. **Draft** — `"auto"` slides and a preset theme let the engine pick recipes.
   Cheap, and labelled as draft in every verdict.
3. **Engine-managed** — `slides_generate` for callers with no model of their own:
   a director writes, a critic reviews the preview, the director revises.
4. **Template-fill** — direct a template once, then fill it from data with no
   model at all.

## Installation

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install
```

One command. No clone, no `sudo`, no administrator-owned npm prefix. It
installs a user-local CLI and MCP server under `~/.local`, registers the skill
with the agents that support one, and runs `slide-agent doctor`.

As a library:

```bash
npm install @slide-agent/core
```

### Requirements

| | |
|---|---|
| **Node.js** | 22.12 or newer — the only hard requirement |
| **LibreOffice + Poppler** | Optional. Needed for PDF and PNG previews; without them Slide Agent draws schematic SVG previews of the deck's geometry instead |

## Quick start

### With an AI assistant

With the skill installed, Claude Code, Codex, Copilot, Gemini, or any MCP client
reads the composition grammar, designs the deck, and builds it:

> Make me a 10-slide board deck on the zero-trust migration. Dense and
> technical, dark, no stock photography.

### By hand

```bash
slide-agent catalog --grammar                                   # the composition language
slide-agent build --intent deck.intent.json --deck out/         # build and preview
slide-agent view --deck out/ --what sheet                       # look at it
slide-agent edit --deck out/ --ops edits.json                   # answer choices, change design
slide-agent finalize --deck out/ --export pdf                   # render, verify, export
```

`slide-agent explore --deck out/ --designs two-directions.json --slides cover,evidence`
previews two design languages side by side before you commit to one.
[`examples/v2/zero-trust-rollout.intent.json`](examples/v2/zero-trust-rollout.intent.json)
is a complete directed deck.

### Without a model of your own

```bash
export ANTHROPIC_API_KEY=...            # the only mode that calls a model
npm install @anthropic-ai/sdk
slide-agent generate --deck out/ --brief brief.md --sources notes.md,data.csv --profile balanced
```

### At volume

```bash
slide-agent fill --template qbr.intent.json --data accounts.csv --out decks/
```

One deck per row, deterministic, no model.

### Over MCP

```json
{
  "mcpServers": {
    "slide-agent": { "command": "slide-agent-mcp" }
  }
}
```

Seven tools — `slides_catalog`, `slides_build`, `slides_edit`, `slides_view`,
`slides_finalize`, `slides_inspect`, `slides_generate` — and the grammar,
catalog, schema, recipes, and examples as resources. See [docs/mcp.md](docs/mcp.md).

### Output

```text
out/
├── intent.json               your decisions, canonical and diffable
├── theme.tokens.json         the compiled design language (W3C DTCG)
├── scene.json                every element, with provenance and adjustments
├── deck.pptx                 native, editable, with embedded fonts
├── previews/sheet.png        the contact sheet, and one preview per slide
├── assets/<sha256>.png       every image, by content hash
├── run.json                  what happened: stages, decisions, fit steps, findings
└── exports/                  pdf and png, after finalize
```

Move that folder anywhere and it still rebuilds; `finalize` proves it.

Every command returns one JSON object on stdout and JSON-lines logs on stderr.

## Features

| | |
|---|---|
| **Composition language** | Grid, flex rows and columns, layers, free placement, bleed, connectors, repeats — in grid units, roles, and named tokens, never inches |
| **Design languages** | Your palette and roles, any typeface the engine can measure, modular or explicit type scales, space, grid, shape, surfaces, and texture primitives; compiled to theme slots with contrast verified |
| **Components** | Defined once per deck, instantiated anywhere, fitted per instance |
| **Recipes** | 38 saved compositions across 24 families as starting points; `expand` opens any of them as a composition you can rework |
| **Fit ladder** | Measure, reflow, balance, size down within your limit — reported — then choices, exact character budgets, and a residual that is never hidden |
| **Typography** | Measured from the real font files, with UAX-14-style breaking, CJK and RTL scripts, balanced headlines, and OFL faces fetched and embedded on demand |
| **Charts** | Native charts with an embedded workbook, styled from your tokens; facts computed deterministically — a model may phrase them, never invent them |
| **Diagrams** | Flow, layered, hierarchy, cycle, and swimlane grammars with obstacle-aware routing; you decide the node design and the emphasis |
| **Icons** | 1,848 Lucide icons as native custom geometry, recolourable and editable; searched by name or concept |
| **Previews** | In-process SVG → PNG in milliseconds, drawn from the same measurements the fit engine used; contact sheets, exploration sheets, and issue crops |
| **Quality** | T0 schema with JSON-pointer findings, T1 construction invariants, T2 ECMA-376, T3 geometry and rhythm, T4 content, T5 render fidelity — and a design review that never blocks mechanical readiness |
| **Brands** | Import a `.potx`: locked tokens, layouts, and placeholders. You still write the concept, the unlocked language, and every composition |
| **Editing** | EditOps at intent, design, element, and package level; pins survive rebuilds; only changed slides are rebuilt |
| **Engine-managed** | Director, design critic, and revise loop with a creative floor: judgement never drops to a small model, and the budget guard degrades the critic before the tier |
| **Formats** | 16:9, 4:3, 9:16, A4 landscape and portrait |
| **Reproducible** | `SOURCE_DATE_EPOCH` makes the same intent produce byte-identical packages |
| **Compatible** | V1 scenes, outlines, and canvases still build; `slide-agent migrate` converts them; `--compat-v1` keeps the 0.x MCP tools |

Full command reference: [docs/cli.md](docs/cli.md).

## Extending

Slide Agent is meant to be extended rather than forked. Contributions register
through one surface and get the same manifest tracking and validation as the
built-ins:

```ts
import { SlideAgent, type DiagramGrammar, type ImageResolver } from "@slide-agent/core";

const agent = new SlideAgent(logger, {
  diagrams: [houseGrammar],   // your own notation
  checks: [legalFooter],      // your own review rules
  assets: stockLibrary,       // where pictures come from
});

agent.capabilities();
```

| Interface | Replaces |
|---|---|
| `DiagramGrammar` | A named diagram form |
| `ChartRenderer` | How one or more chart kinds are drawn |
| `QualityCheck` | An organisation's own validation rules |
| `ImageResolver` | Where images come from — stock search, an asset library, a generator |
| `RenderBackend` | Preview generation |
| `DesignTokenizer` | How `creativeDirection` becomes the fallback design system |
| `VisualReviewer` | A reviewer that consumes the same deterministic review packet a host AI does |

Slide Agent deliberately does not search for images or generate them: choosing
imagery is the model's judgement, and a stock API inside the build tool would
mean credentials and licence terms in a package whose posture is that it does
not fetch things. `ImageResolver` is where a host that can do those things
plugs in. See [docs/api.md](docs/api.md#extension-points).

## Documentation

| | |
|---|---|
| [Quickstart](docs/quickstart.md) | Install to a good deck in five minutes |
| [Composition grammar](references/v2/grammar.md) | The language you design in — generated from the engine |
| [Recipes and presets](references/v2/recipes.md) | Starting points for routine slides, and draft themes |
| [V2 plan](docs/v2/README.md) | Why the engine is shaped this way, and what shipped ([status](docs/v2/04-implementation-status.md)) |
| [Migration to 2.0](MIGRATION-2.0.md) | What changes for a 0.x host, and what still works |
| [0.x authoring contract](references/README.md) | The V1 canvas contract, kept for compatibility |
| [Agent integrations](docs/agents.md) | Codex, Claude Code, Copilot, Gemini, Cursor, MCP, CLI |
| [CLI reference](docs/cli.md) | Every command and flag |
| [MCP server](docs/mcp.md) | Connect Cursor, Zed, Claude Desktop, or any MCP client |
| [API and extensions](docs/api.md) | TypeScript API and extension points |
| [Editing existing decks](docs/editing.md) | Operations and their limits |
| [Validation, readiness, and heuristics](docs/validation.md) | What is checked, what is measured, and what is only a proxy |
| [Showcase decks](examples/showcase/README.md) | Six independent designs, with the similarity report that proves it |
| [Human evaluation](docs/human-evaluation.md) | The blinded protocol for the questions a metric cannot answer |
| [Model evaluation prompts](docs/model-evaluation-prompts.md) | Five briefs for comparing how different host models use the contract |
| [Architecture decisions](docs/adr/README.md) | What the engine may never normalize, and why |
| [Troubleshooting](docs/troubleshooting.md) | When something does not work |
| [Architecture](docs/architecture.md) | How the pieces fit together |
| [0.11.0 roadmap](docs/roadmap-0.11.0.md) | Uncaged AI authoring, render-aware review, and portable final artifacts |
| [Migration to contract 0.10](MIGRATION-0.10.md) | What is new in 0.11.0, and what a 0.9 host keeps |
| [Migration guide](MIGRATION-0.9.md) | Breaking changes from earlier versions |
| [Changelog](CHANGELOG.md) | What changed, and why |

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md)
covers the development workflow and the quality gates every change has to
clear:

```bash
npm install
npm run verify     # typecheck, generated-docs check, tests, build
```

CI runs on Linux, macOS, and Windows across Node.js 22 and 24, with coverage
floors, dependency auditing, and a clean-project install proving the published
package writes nothing outside the consuming project.

## Security

Slide Agent treats every path and URL in a request as untrusted, because a
canvas is model-authored and often derived from material it cannot vouch for.
Remote asset fetching is off by default; private and link-local addresses stay
unreachable; hyperlinks are held to a scheme allowlist.

Report a vulnerability through GitHub's private reporting flow rather than a
public issue — see [SECURITY.md](SECURITY.md).

## Licence

[MIT](LICENSE) © Ghassen Bargougui

Dependency licences are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The publication runbook is
[RELEASE.md](RELEASE.md).
