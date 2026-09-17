# CLI reference

Every command prints one JSON object on stdout and JSON-lines logs on stderr.
Exit code 2 means the deck needs attention or is broken; 1 means the command
failed.

The V2 commands are first; the 0.x commands below them still work and are
unchanged.

---

## `catalog`

The composition language and what the engine ships with.

```bash
slide-agent catalog --grammar                      # the grammar page as Markdown
slide-agent catalog --include recipes,presets      # JSON, for a program
slide-agent catalog --include fonts --fonts "geometric sans"
slide-agent catalog --include icons --icons growth
```

## `build`

Build a deck from an intent. (With `--script`, this is the 0.x build script
path, documented below.)

```bash
slide-agent build --intent deck.intent.json --deck out/
slide-agent build --deck out/                      # rebuild after editing intent.json
slide-agent build --deck out/ --check              # validate and solve, write nothing
slide-agent build --deck out/ --strict             # validate every part against ECMA-376
```

Writes `intent.json`, `theme.tokens.json`, `scene.json`, `deck.pptx`,
`previews/`, and `run.json` into the deck directory. Only slides whose own JSON
changed are re-solved; a change to the design language rebuilds every slide.

## `check`

`build --check` with an intent that has no deck yet.

```bash
slide-agent check --intent deck.intent.json
```

## `explore`

Compare design languages on the slides that matter, before committing.

```bash
slide-agent explore --deck out/ --designs directions.json --slides cover,evidence
```

`directions.json` is an array of up to three design requests; up to four slide
ids. Renders one side-by-side sheet in about a second.

## `view`

```bash
slide-agent view --deck out/ --what sheet          # the contact sheet
slide-agent view --deck out/ --what slides --slides cover,ask
slide-agent view --deck out/ --what crop --element ask/text3
slide-agent view --deck out/ --what rhythm         # silhouettes and densities
slide-agent view --deck out/ --what expand --slides agenda   # a recipe as its composition
slide-agent view --deck out/ --what report --page 0
```

Previews are drawn in-process from the same measurements the fit engine used.
They are previews, not PowerPoint renders.

## `edit`

```bash
slide-agent edit --deck out/ --ops edits.json
slide-agent edit --deck out/ --instruction "make slide 4 calmer"   # engine-managed
```

`edits.json` is an array of EditOps:

```json
[
  {"level": "intent", "op": "set", "path": "/slides/2/compose/items/0/text", "value": "Churn fell 41%"},
  {"level": "intent", "op": "choose", "edit": "fit-route-1", "option": 0},
  {"level": "intent", "op": "expand", "path": "/slides/5"},
  {"level": "design", "op": "set", "path": "/color/palette/signal", "value": "#C2410C"},
  {"level": "element", "slide": "route", "element": "route/text5", "set": {"refuse": "type-step"}}
]
```

## `finalize`

```bash
slide-agent finalize --deck out/ --export pdf,png
```

Fidelity render with LibreOffice, text-survival checks, full schema validation,
a clean-directory rebuild from `intent.json`, and exports. `--no-round-trip`
skips the rebuild.

## `explain`

```bash
slide-agent explain --deck out/ --element route/text5
```

Where an element came from (composition, component, or recipe), its fit steps,
every adjustment the engine made, and the findings attached to it.

## `generate`

Engine-managed direction, for callers with no model of their own. Needs
`ANTHROPIC_API_KEY` and `@anthropic-ai/sdk` installed where Slide Agent runs.

```bash
slide-agent generate --deck out/ --brief brief.md --sources notes.md,data.csv \
  --profile balanced --slides 12 --format 16:9
```

Profiles: `quality`, `balanced` (default), `draft`. Judgement tasks never run
below the balanced tier; a tight budget drops the critic, never the tier.

## `fill`

```bash
slide-agent fill --template qbr.intent.json --data accounts.csv --out decks/ --name-by account
```

One deck per row, deterministic, no model. The template uses `{{bindings}}`,
slide-level `$each` and `$if`, and `$requires` to assert the data's shape.

## `migrate`

```bash
slide-agent migrate --input deck.scene.ndjson --output deck.intent.json
```

Converts a 0.x scene or outline into an intent and reports what mapped.

## `brand`

```bash
slide-agent brand --input acme.potx --output acme.brand.json
```

Locked tokens, layouts, and placeholders from an organisation's template. Use
it with `"design": {"brand": "acme.brand.json"}`.

## `inspect`

```bash
slide-agent inspect --file deck.pptx --page 0
```

## `font`

```bash
slide-agent font --search "humanist sans"
slide-agent font --local
slide-agent font --add "Fraunces" --weights 400,700
```

`--add` fetches an open-licence family from Google Fonts into the font cache and
records each file's SHA-256.

---

# 0.x commands

These are unchanged, and still supported.

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
