# CLI reference

Every command prints one JSON object on stdout and JSON-lines logs on stderr.
Exit code is `1` when `status` is `error`, `0` otherwise.

## `create`

```bash
slide-agent create --scene scene.ndjson --output deck.pptx
slide-agent create --prompt brief.md --output draft.pptx
```

| Flag | Meaning |
|---|---|
| `--scene <file>` | Build from a `slide-agent.scene/1` blueprint. The good path. |
| `--prompt <file>` | Markdown or text brief. Produces a labelled structural draft. |
| `--output <file>` | Required. Must end in `.pptx`. |
| `--brand <file>` | Brand kit constraining palette, typography, logo, footer |
| `--bilingual <mode>` | `parallel`, `stacked`, or `notes` |
| `--config <dir>` | Configuration directory, including the slide format |
| `--render` | Also produce PDF and PNG previews |
| `--previews/--report/--metadata/--inspect <path>` | Override an artifact path |
| `--max-retries <n>` | Bound the automatic repair loop |
| `--no-validate` / `--no-auto-fix` | Skip validation / repair |

## `revise`

```bash
slide-agent revise --input deck.pptx --slide 4 --records slide4.ndjson --output v2.pptx
```

Splices replacement records into the deck's own scene and rebuilds. Every
other slide comes through unchanged. Needs the `artifacts/` directory beside
the deck, or an explicit `--scene`.

## `edit`

```bash
slide-agent edit --input deck.pptx --prompt changes.json --output edited.pptx
```

OOXML-level operations on an existing deck: `replace-text`, `remove-slide`,
`duplicate-slide`, `add-slide`, `reorder-slides`, `apply-theme`,
`replace-image`, `update-table`, `update-chart`. See [editing](editing.md) for
the limits.

## `validate`

```bash
slide-agent validate --input deck.pptx
```

Package integrity, ECMA-376 schema conformance, geometry, legibility,
accessibility, and a quality score. `--render` adds preview checks.

## `diff`

```bash
slide-agent diff --before a.pptx --after b.pptx [--json]
```

Semantic comparison: which slides and elements changed, in which fields.

## `data`

```bash
slide-agent data --input numbers.csv --kind line
slide-agent data --input rows.json --as table
```

Turns CSV, TSV, or JSON into a chart or table spec with a provenance note for
the speaker notes. Refuses rather than guessing when columns are not numeric.

## `contract`

```bash
slide-agent contract                                  # descriptor + guide + schemas
slide-agent contract --format prompt                  # a system prompt
slide-agent contract --format markdown --section canvas
slide-agent contract --schema outline                 # JSON Schema
```

## `render`

```bash
slide-agent render --input deck.pptx --output previews/
```

Needs LibreOffice and Poppler. Previews preserve the deck's aspect ratio.

## `run`

```bash
slide-agent run --request request.json
```

Executes any structured request. This is the interface an agent should use.

## `doctor`

```bash
slide-agent doctor [--json] [--deep]
```

`--deep` builds a deck end to end, so a broken installation reports itself.

## `install` / `uninstall`

```bash
slide-agent install [--target codex|claude|copilot|gemini|all] [--with-render-deps]
slide-agent uninstall
```
