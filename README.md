<p align="center">
  <img src="images/icon.png" alt="Slide Agent" width="140">
</p>

<h1 align="center">Slide Agent</h1>

<p align="center">
  <strong>Turn a design an AI model authors into a real, editable PowerPoint file —<br>
  then prove it opens cleanly, reads legibly, and is worth showing someone.</strong>
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

Slide Agent has no house style. The model chooses the palette, the typography,
the composition, and the diagram language. Slide Agent supplies the native
PowerPoint primitives, a quality floor, and one authoring contract that every
agent implements the same way.

Three properties hold throughout:

- **Everything stays editable.** Native text, shapes, tables, and charts. No
  slide is ever flattened into an image.
- **Every package is schema-valid.** Each XML part is checked against the
  bundled official ECMA-376 schemas, offline, before the deck is returned.
- **Nothing overstates itself.** A draft says it is a draft, a schematic
  preview says it is not a render, and a refused hyperlink is reported rather
  than dropped in silence.

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
deck.pdf                      when previews are requested
artifacts/
├── images/                   one preview per slide
├── intermediate_files/       the manifest and the round-trippable scene
└── logs/                     validation report and execution metadata
```

Every command returns one JSON object on stdout and JSON-lines logs on stderr.

## Features

| | |
|---|---|
| **Authoring** | Model-authored art direction, freeform canvases, any slide kind, rich text runs, arbitrary PptxGenJS shapes and options |
| **Diagrams** | `layered`, `swimlane`, `sequence`, `hierarchy`, and `quadrant` grammars, plus hand-composed shapes and connectors |
| **Data** | Native bar, stacked, horizontal, line, area, pie, doughnut, scatter, and radar charts; editable waterfalls; native tables; CSV/TSV/JSON connectors that carry provenance |
| **Formats** | 16:9, 4:3, 9:16, A4 landscape and portrait — layouts adapt rather than overflow |
| **Imagery** | Local files, opt-in remote URLs, or a host-supplied provider for stock search and generation, with `credit`, `license`, and `generated` carried into the deck |
| **Brand** | `--brand kit.json`, or point it straight at your `.potx` — locks only what your organisation cannot bend on |
| **Languages** | `--bilingual` renders a second language as its own editable text, with RTL and script-aware fonts |
| **Editing** | Slide-level `revise`, OOXML-level `edit`, cross-deck `import-slide`, and a semantic `diff` between two decks |
| **Quality** | ECMA-376 validation, per-font and per-script text measurement, geometry, contrast, accessibility, and a score with advice |
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
| `DesignTokenizer` | How `creativeDirection` becomes a design system |

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
| [Validation and quality](docs/validation.md) | What is checked, and what is only advice |
| [Troubleshooting](docs/troubleshooting.md) | When something does not work |
| [Architecture](docs/architecture.md) | How the pieces fit together |
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
