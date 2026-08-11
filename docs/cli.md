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
| `--brand <file>` | Brand kit JSON, or a `.potx`/`.pptx` whose theme becomes the kit |
| `--bilingual <mode>` | `parallel`, `stacked`, or `notes` |
| `--config <dir>` | Configuration directory, including the slide format |
| `--render` | Also produce PDF and PNG previews |
| `--previews/--report/--metadata/--inspect <path>` | Override an artifact path |
| `--round-trip` | Rebuild the emitted scene in a clean directory and compare. Run it before delivering |
| `--repair <mode>` | `safe`, `suggest`, or `off`. Defaults to `suggest` for a model-authored canvas |
| `--max-retries <n>` | Bound the automatic repair loop |
| `--no-validate` / `--no-auto-fix` | Skip validation / repair |

Read `presentationReadiness`, not only `status`. `packageStatus` says the file
holds together; readiness says whether the deck is finished, and
`readinessReasons` says what decided it.

## `review`

```bash
slide-agent review --input deck.pptx
slide-agent review --input deck.pptx --contact-sheet sheet.png
slide-agent review --input deck.pptx --slide 4
slide-agent review --input deck.pptx --from 3 --to 8 --detail full --output review.json
```

The deterministic review packet for the exact PPTX: artifact hashes, per-slide
renders, the words read back off the render compared with the deck's own text,
element geometry, the author's declared intent and sequence plan, current
issues, and questions worth asking.

| Flag | Meaning |
|---|---|
| `--input <file>` | Required. Its scene, manifest, report, and previews are discovered beside it |
| `--slide <n>` / `--from <n>` / `--to <n>` | Which slides to review |
| `--max-slides <n>` | Cap on slides per packet |
| `--detail <level>` | `defects` (default) lists the elements a check names; `full` lists every element |
| `--contact-sheet <file>` | Also write every slide render as one numbered grid image |
| `--scene/--manifest/--report <file>` | Override a discovered path |
| `--output <file>` | Write the packet here instead of stdout |

At `defects` detail the packet names the elements something is measurably wrong
with and counts the rest under `elementCensus`. It is not withholding anything:
`--detail full` lists every element's geometry and text, and asking for one
slide by number is always full. What the default leaves out is the part the
author already knows, which on a healthy deck is nearly all of it.

The contact sheet is for reading the deck as a sequence — whether the pacing has
a shape, which two slides came out as the same drawing. Those are comparisons,
and a comparison wants the slides side by side.

It contains no aesthetic verdict. `observations.heuristics` are engine proxies,
`observations.issues` are measured facts, and `observations.visualFindings` are
somebody's judgement — kept apart on purpose. An issue that names a slide is
reported on that slide; `observations.issues` carries the deck-wide ones and
`observations.issueCount` is the total either way.

## `patch`

```bash
slide-agent patch --input deck.pptx --operations fix.json --dry-run
slide-agent patch --input deck.pptx --operations fix.json --output revised.pptx --render
```

Changes named elements on named slides and rebuilds, leaving every other element
exactly as it was. `--dry-run` prints the semantic diff and writes nothing.

```jsonc
{ "operations": [
  { "op": "update-text",  "slide": 1, "elementId": "title", "text": "Revised" },
  { "op": "update-style", "slide": 1, "elementId": "note",  "style": { "color": "A32020" } },
  { "op": "update-bbox",  "slide": 2, "elementId": "plate", "bbox": [0.8, 1.2, 6, 4] },
  { "op": "apply-style-system", "selector": { "role": "caption" }, "styleRef": "field-note" }
] }
```

Also: `add-element`, `remove-element`, `update-z-index`, `update-provenance`,
`update-slide`, `update-claims`. Every operation names its slide and element id
— there is no fuzzy matching, and no "make it nicer" operation, because taste is
yours and a deterministic engine guessing at it would just be a house style.

## `capabilities`

```bash
slide-agent capabilities
slide-agent capabilities --canvas
```

What this installation can actually do: diagram grammars, chart kinds,
layouts, quality checks, and how images can reach a slide. Read the `images`
block before designing a photo-led deck — `remoteUrls: false` with
`provider: null` means this installation can embed only files already on disk.

## `draft`

```bash
slide-agent draft --prompt brief.md --output request.json
```

Turns a brief into a structured request a model can finish: the outline, its
slide kinds, and bracketed placeholders where the content belongs. Fill in the
content, add `creativeDirection` and per-slide canvases, then
`slide-agent run --request request.json`.

This is the honest form of "build me a deck from this brief". There is no model
inside Slide Agent, so `create --prompt` can only scaffold; `draft` hands the
scaffolding to something that can design.

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
`duplicate-slide`, `add-slide`, `import-slide`, `reorder-slides`,
`apply-theme`, `replace-image`, `update-table`, `update-chart`. See
[editing](editing.md) for the limits.

## `fonts`

```bash
slide-agent fonts --input deck.pptx
```

Reports which of a deck's typefaces this machine can display. Advisory only: it
never fails a build and never changes a validation verdict, because the machine
that matters is the one your audience opens the deck on. Use `--family` to
check names before you commit to them.

## `template`

```bash
slide-agent template --input corporate.potx --output brand.json
```

Reads an organisation's PowerPoint template and writes the brand kit its theme
implies: the colour scheme mapped through the master's colour map, the major
and minor typefaces, and the footer line the master already carries. Both
palette and typography lock by default; `--unlock palette,typography` relaxes
whichever the organisation does not actually mandate.

`--brand corporate.potx` skips the intermediate file and reads the template
directly. The template's masters and layouts are not adopted — Slide Agent
composes from a grid rather than filling placeholders, and a deck carrying both
would carry two design systems.

## `validate`

```bash
slide-agent validate --input deck.pptx
```

Package integrity, ECMA-376 schema conformance, geometry, legibility, and
accessibility. `--render` adds preview checks and reads the render's text back
to compare it with the deck's own. `--round-trip` rebuilds the emitted scene in
a clean directory from the packaged assets alone.

The report carries two verdicts: `packageStatus` for file integrity and
`presentationReadiness` for whether the deck is finished. `status` is retained
for contract 0.9 readers and is package-oriented.

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

## Related

- [MCP server](mcp.md) — the same operations over MCP, for Cursor, Zed, Claude Desktop, and other clients
- [Authoring contract](../references/README.md) — what `contract` publishes
