# Slide Agent

<p align="center"><img src="images/icon.png" alt="Slide Agent icon" width="160"></p>

Slide Agent turns a design an AI model authors into a real, editable PowerPoint
file — then checks that the file opens cleanly, reads legibly, and is worth
showing someone.

It has no house style. The model chooses the palette, the typography, the
composition, and the diagram language; Slide Agent supplies native PowerPoint
primitives, a quality floor, and one authoring contract that every agent
implements the same way.

## Install

```bash
npx --yes --package @slide-agent/core@latest -- slide-agent install
```

One command. No clone, no `sudo`, no administrator-owned npm prefix. It
installs a user-local CLI and MCP server under `~/.local`, registers the skill
for the agents that support one, and runs `slide-agent doctor`.

Node.js 22.12 or newer is the only requirement. LibreOffice and Poppler are
optional and only needed for PDF/PNG previews.

## First deck

Ask your AI assistant for a presentation. With the skill installed, Codex,
Claude Code, Copilot, or any MCP client reads the authoring contract, designs
the deck, and calls Slide Agent to build it:

> Make me a 10-slide board deck on the zero-trust migration. Dense and
> technical, dark, no stock photography.

To drive it yourself:

```bash
slide-agent contract --format prompt > guide.txt   # hand this to any model
slide-agent run --request deck.json                # build what it authored
```

`slide-agent draft --prompt brief.md --output request.json` turns a brief into
a request skeleton for a model to finish. `create --prompt` still builds
directly from a brief, but there is no model in the process to design a deck,
so what comes out is a **structural draft** with visible `[placeholders]` — it
reports `status: "warning"` and says so.

## What you get

```text
deck.pptx                     editable native text, shapes, tables, charts
deck.pdf                      when previews are requested
artifacts/
├── images/                   one PNG per slide
├── intermediate_files/       the manifest and the round-trippable scene
└── logs/                     validation report and execution metadata
```

Every command returns one JSON object on stdout and JSON-lines logs on stderr.

## Capabilities

| | |
|---|---|
| **Authoring** | Model-authored art direction, freeform canvases, any slide kind, rich text runs, arbitrary PptxGenJS shapes and options |
| **Diagrams** | `layered`, `swimlane`, `sequence`, `hierarchy`, and `quadrant` grammars, plus hand-composed shapes and connectors |
| **Data** | Native bar, stacked bar, horizontal bar, line, area, pie, doughnut, scatter and radar charts, editable waterfalls, native tables, and CSV/TSV/JSON connectors that carry provenance |
| **Formats** | 16:9, 4:3, 9:16, A4 landscape and portrait — layouts adapt rather than overflow |
| **Imagery** | Local files, opt-in remote URLs, or a host-supplied provider for stock search and generation — with `credit`, `license`, and `generated` carried into the deck |
| **Brand** | `--brand kit.json` — or point it straight at your `.potx` — locks only what your organisation cannot bend on |
| **Languages** | `--bilingual` renders a second language as its own editable text, with RTL and script-aware fonts |
| **Editing** | Slide-level `revise`, OOXML-level `edit`, and a semantic `diff` between two decks |
| **QA** | ECMA-376 schema validation, geometry, per-font and per-script text measurement, contrast, accessibility, and a quality score with advice |
| **Previews** | LibreOffice renders; without it, Slide Agent draws the deck's own geometry so the look-and-revise loop still closes |
| **Reproducible** | `SOURCE_DATE_EPOCH` makes the same scene produce byte-identical packages |

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
| [Migrating to 0.9](MIGRATION-0.9.md) | Breaking changes from earlier versions |
| [Changelog](CHANGELOG.md) | What changed, and why |

## Contributing, security, licence

- [CONTRIBUTING.md](CONTRIBUTING.md) — development workflow and quality gates
- [SECURITY.md](SECURITY.md) — untrusted-input model and vulnerability reporting
- [RELEASE.md](RELEASE.md) — the publication runbook
- [LICENSE](LICENSE) — MIT
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — dependency licences
