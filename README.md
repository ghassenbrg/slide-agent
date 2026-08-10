<p align="center">
  <img src="images/icon.png" alt="Slide Agent" width="140">
</p>

<h1 align="center">Slide Agent</h1>

<p align="center">
  <strong>Your AI designs the presentation. Slide Agent gives it an expressive PowerPoint canvas,<br>
  preserves the design as editable objects, and provides the render-and-revise loop needed to finish well.</strong>
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

Slide Agent has no house style, and it does not have one on purpose. The model
invents the visual system — its own variables, its own style names, its own
motifs — and Slide Agent's job is to realize it faithfully, check it against
things that are actually true, and show the model what it built.

Four properties hold throughout:

- **Everything stays editable.** Native text, shapes, tables, and charts. No
  slide is ever flattened into an image, and the manifest states per element
  what a person can actually change.
- **Authored values are preserved.** Repairs default to *suggest* on a
  model-authored canvas: the engine reports what it would change and changes
  nothing. Your colours and type sizes are not its to overwrite.
- **Every package is schema-valid and portable.** Each XML part is checked
  against the bundled official ECMA-376 schemas, offline; every asset is
  content-addressed into the package; and `--round-trip` proves the emitted
  scene rebuilds from the package alone.
- **Nothing overstates itself.** A draft says it is a draft, a schematic
  preview says it is not a render, `heuristics` are called heuristics rather
  than a quality score, and `presentationReadiness` is a different answer from
  "the file opens".

Three ways to use it, in descending order of what they produce:

1. **AI-authored freeform** — recommended for any deck whose quality matters.
2. **Structured native grammar** — when the data or relationships have a known
   semantic form worth handing to a diagram or chart.
3. **Prompt-only fallback draft** — scaffolding with bracketed placeholders. It
   labels itself as such, and it is never presented as finished design.

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

With the skill installed, Codex, Claude Code, Copilot, or any MCP client reads
the authoring contract, designs the deck, and calls Slide Agent to build it:

> Make me a 10-slide board deck on the zero-trust migration. Dense and
> technical, dark, no stock photography.

### As a build script

For a deck whose quality matters, have the model write a JavaScript module that
composes it, and run:

```bash
slide-agent build --script deck.mjs --output deck.pptx --render --round-trip
```

The module defines this deck's own repeated forms as ordinary functions and
places them in loops, so a card with a title, a sub-label, and an accent bar
costs one call instead of four hand-computed records. Slide Agent supplies the
arithmetic — `columns`, `rows`, `grid`, `split`, `distribute`, `inset`, and
`measureText` — and ships no components and no house style. The emitted
`scene.ndjson` stays canonical, so `patch`, `revise`, and `--round-trip` work
exactly as they do for hand-authored scenes.

The script imports `@slide-agent/core`, so it needs the package resolvable from
its own directory — `npm install @slide-agent/core` beside it, or a workspace
that already has it. It is then imported and run in the engine's process with
your privileges: the same decision as running it with `node`. Slide Agent never
discovers, downloads, or executes a script it was not handed.

See [`examples/scripts/rollout-deck.mjs`](examples/scripts/rollout-deck.mjs).

### With any model, by hand

```bash
slide-agent capabilities                            # what this install can do
slide-agent contract --format prompt > guide.txt    # hand this to any model
slide-agent run --request deck.json                 # build what it authored
```

`slide-agent draft --prompt brief.md --output request.json` turns a brief into
a request skeleton for a model to complete. `create --prompt` builds directly
from a brief, but no model is involved in that path, so it produces a
structural draft with visible `[placeholders]` and reports `status: "warning"`.

### Over MCP

```json
{
  "mcpServers": {
    "slide-agent": { "command": "slide-agent-mcp" }
  }
}
```

The server publishes the whole authoring contract as resources, and every tool
that can render returns the slide previews as images so a model can see what it
built before reporting success.

### Output

```text
deck.pptx                     editable native text, shapes, tables, charts
artifacts/deck/
├── scene.ndjson              the round-trippable blueprint, with portable asset paths
├── manifest.json             every element, with its editability
├── validation.json           issues, readiness, fidelity, and the artifact graph
├── review.json               the review packet, when one was written
├── metadata.json             the request and execution record
├── deck.pdf                  when previews are requested
├── previews/slide-01.png     one preview per slide
└── assets/<sha256>.png       every embedded asset, by content hash
```

Move that folder anywhere and it still rebuilds — the scene references its
assets relative to itself, and `--round-trip` proves it.

Every command returns one JSON object on stdout and JSON-lines logs on stderr.

## Features

| | |
|---|---|
| **Authoring** | Model-authored art direction, freeform canvases, any slide kind, rich text runs, arbitrary PptxGenJS shapes and options |
| **Build scripts** | Compose a deck as a program: your own components as functions, `columns`/`rows`/`grid`/`split`/`distribute` for placement, `measureText` and `autoHeight` so a box fits its own text |
| **Diagrams** | `slide.graph` ranks, orders, places, and routes — you only draw the node; connectors anchor to the elements they join and route around what is in the way, straight, elbowed, or curved; `layered`, `swimlane`, `sequence`, `hierarchy`, and `quadrant` grammars |
| **Placement** | Absolute inches, or `place` relations — `alignLeft`, `below`, `rightOf`, `sameAs`, `spanFrom`/`spanTo` — solved into inches before composition |
| **Repetition** | `slideChrome` repeats the kicker, slide number, footer rule, and brand mark you wrote, with per-slide values interpolated |
| **Data** | Native bar, stacked, horizontal, line, area, pie, doughnut, scatter, and radar charts; editable waterfalls; native tables; CSV/TSV/JSON connectors that carry provenance |
| **Formats** | 16:9, 4:3, 9:16, A4 landscape and portrait — layouts adapt rather than overflow |
| **Imagery** | Local files, opt-in remote URLs, or a host-supplied provider for stock search and generation, with `credit`, `license`, and `generated` carried into the deck |
| **Brand** | `--brand kit.json`, or point it straight at your `.potx` — locks only what your organisation cannot bend on |
| **Languages** | `--bilingual` renders a second language as its own editable text, with RTL and script-aware fonts |
| **Visual systems** | The deck's own variables, named styles with inheritance, motifs, and constraints — arbitrary names, `styleRef` and `{"$var":…}` references, and precise errors instead of silent coercion |
| **Editing** | Element-level `patch` by id, slide-level `revise`, OOXML-level `edit`, cross-deck `import-slide`, and a semantic `diff` between two decks |
| **Review loop** | `slide-agent review` returns the exact render, the words read back off it, the geometry, your declared intent, and questions worth asking — bound by hash to the PPTX it describes; slides that came out as the same drawing are named by number, and `validate --findings` records the verdict that closes the loop |
| **Quality** | ECMA-376 validation, per-font and per-script text measurement, geometry, contrast through translucency, accessibility, render text fidelity, and heuristics that say what they are |
| **Previews** | LibreOffice renders; without it, Slide Agent draws the deck's own geometry so the look-and-revise loop still closes |
| **Reproducible** | `SOURCE_DATE_EPOCH` makes the same scene produce byte-identical packages |

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
| [Authoring contract](references/README.md) | What a model authors — generated from the schemas |
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
