# Architecture

Two engines live in this package. The V2 engine is the default and takes a
`slide-agent.intent/1` document. The 0.x engine still builds scenes, outlines,
and build scripts unchanged, and V2 reaches into it for canvas slides and the
LibreOffice render.

```text
   any host model                ┌─────────────────────────────────────────┐
   (Claude, Codex,               │  grammar · catalog · intent schema      │
    Copilot, MCP,                │  served as a skill, MCP resources,      │
    CLI, local)                  │  `slide-agent catalog`, or ./v2 import  │
                                 └──────────────────┬──────────────────────┘
                                                    │
                          the model writes slide-agent.intent/1
                       brief · concept · design language · compositions
                                                    │
   ┌────────────────────────────────────────────────▼────────────────────────┐
   │  validate (JSON-pointer findings)                                       │
   │    → compile the design language (OKLCH, roles → theme slots, contrast)  │
   │    → expand components and recipes                                      │
   │    → solve each slide (measure real glyphs, flex, fit ladder)           │
   │    → write OOXML (placeholders, theme refs, native charts, custGeom)    │
   │    → QA T0–T5                                                           │
   │    → analyse rhythm                                                     │
   └────────────────────────────────────────────────┬────────────────────────┘
                                                    │
        verdict (state · adjustments · suggestedEdits · issues · rhythm)
            + deck.pptx + previews/ + scene.json + run.json + intent.json
```

The composition language is the product surface. The solver is an
implementation detail.

## The division of labour

Everything above the line is the model's; everything below is the engine's.
This is the whole design, and the rest of the architecture follows from it.

| The model decides | The engine computes |
|---|---|
| The message, the narrative, the pacing | Frames in inches, track sizes, flex distribution |
| Palette, roles, typefaces, type scale, space | Theme-slot mapping, contrast repair, colour maths |
| What each slide *is* — the composition | Where every glyph lands, and whether it fits |
| What is emphasised, and what is quiet | Connector routing, collision detection, bounds |
| Whether the deck is any good | Whether the package is valid |

Where the engine must change one of the model's decisions to make the slide
work, it reports an **adjustment** and accepts a pin refusing it. Where the
choice is aesthetic and the engine has no basis for it, it stops and returns a
**suggestedEdit** with options rather than guessing. See
[ADR 0005](adr/0005-the-model-directs-the-engine-executes.md) and
[ADR 0008](adr/0008-fit-ladder-and-adjustments.md).

## V2 modules

Module boundaries are real and one-directional: nothing lower in this table
imports from anything above it.

| Path | Responsibility |
|---|---|
| `src/v2/ir/` | The types everything agrees on: DeckIntent, composition nodes, design language, SceneGraph v2, EditOp, Verdict, RunRecord, findings |
| `src/v2/tokens/` | The design-language compiler — OKLCH colour, roles onto the twelve theme slots, contrast repair, type scale, DTCG import/export, presets |
| `src/v2/text/` | Font parsing (`sfnt`), the catalogue and registry, on-demand fetching, and `TextEngine` — measurement, breaking, and layout |
| `src/v2/layout/` | Geometry, style resolution, texture, diagram grammars, and `SlideSolver` — the fit ladder lives here |
| `src/v2/compose/` | Component and recipe expansion, the recipe library, the draft selector, rhythm analysis |
| `src/v2/charts/` | Deterministic statistics and the SVG chart preview |
| `src/v2/icons/` | Lucide glyphs and concept search |
| `src/v2/ooxml/` | XML writing, `custGeom` from SVG paths, font subsetting and embedding, native charts with their workbook, and `writePackage` |
| `src/v2/render/` | SVG rendering and in-process SVG → PNG, contact and exploration sheets |
| `src/v2/qa/` | T0–T5 checks and the readiness verdict |
| `src/v2/engine/` | The orchestrator: scene building, incremental builds, edits, explain, explore, finalize, brand import, template fill |
| `src/v2/llm/` | Engine-managed mode only — provider, routing profiles, prompts, the director/critic loop, and the edit router |
| `src/v2/commands/` | One command registry, the grammar page, and the skill |
| `src/v2/mcp/`, `src/v2/cli/` | The two surfaces, both generated from that registry |

The monorepo split described in the plan was not done; the boundaries are
enforced by convention and review rather than by `package.json`. See
[the implementation status](v2/04-implementation-status.md#2-where-the-implementation-differs-from-the-plan).

## 0.x modules, still live

| Path | Responsibility |
|---|---|
| `src/contract/` | 0.x schemas, JSON Schema, the authoring guide, `CONTRACT_VERSION`. Zero engine dependencies. |
| `src/design/` | Tokens, grid, slide formats, brand kits, bilingual rendering |
| `src/planner/` | Prompt → structural draft. Deliberately produces scaffolding. |
| `src/layouts/` | Freeform composer and the built-in fallback layouts |
| `src/diagrams/` | Diagram builders and the named grammars |
| `src/charts/`, `src/data/` | Native charts and data connectors |
| `src/components/` | `ElementWriter` — the PptxGenJS boundary and manifest tracker |
| `src/export/` | Deck construction, export, OOXML sanitisation |
| `src/validation/` | Manifest, package, schema, accessibility, quality, repair |
| `src/editing/` | OOXML inspection and source-preserving edits |
| `src/serialization/` | Scene NDJSON, revision splicing, deck diff |
| `src/rendering/` | LibreOffice + Poppler preview pipeline — V2's `finalize` uses this |
| `src/security/`, `src/utils/` | Path confinement, archive and subprocess limits — shared by both engines |
| `src/extensions.ts` | The public extension registry |

V2 reads from `src/data`, `src/design`, `src/editing`, `src/images`,
`src/rendering`, `src/security`, `src/serialization`, `src/types`, `src/utils`,
and `src/validation`. The dependency runs one way: the only files outside
`src/v2/` that import from it are `src/index.ts`, `src/cli.ts`, and
`src/mcp-server.ts` — the three entry points that offer both engines.

## Invariants

1. **No silent taste.** Every engine change to a model decision is reported and
   refusable. Every decision the engine declines to make comes back as a choice.
2. **Everything stays editable.** Native text, placeholders, shapes, tables, and
   charts with their data. No slide is ever flattened into an image.
3. **Generated packages are schema-valid.** Every XML part validates against the
   bundled official ECMA-376 schemas before the deck is returned.
4. **The build is deterministic.** The same intent, engine version, and font and
   image files produce byte-identical packages under a pinned
   `SOURCE_DATE_EPOCH`. `finalize --round-trip` proves it per deck.
5. **The intent round-trips.** A deck rebuilds from its own `intent.json` in a
   clean directory, which is what makes incremental builds, `explain`, and
   migration safe.
6. **Generated docs come from the code.** The grammar, recipe pages, skill, and
   schemas are emitted by `npm run docs` and checked for drift in CI.
7. **Untrusted by default.** Paths are confined to the workspace roots, scripts
   arriving in a request are refused, archives and subprocesses are bounded, and
   remote fetching is off unless an operator turns it on.
8. **`ready` is mechanical.** No model's opinion sets it, and `designReview`
   never blocks it.

## Every element goes through the solver

Recipes, components, and diagram grammars never place a frame themselves; they
emit composition nodes, and `SlideSolver` resolves every one of them into a
`SceneElement` carrying its provenance, the fit steps that ran, and any
adjustment applied. That record is what makes QA, `explain`, previews, rhythm
analysis, and incremental rebuilds possible. A path that writes OOXML without
going through it gets none of them.

The 0.x equivalent is `ElementWriter`, and the same rule holds there.
