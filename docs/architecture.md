# Architecture

```text
                    ┌──────────────────────────────────────┐
   any host model   │  src/contract                        │
   (Claude, Codex,  │  schemas · authoring guide · version │
    Copilot, MCP,   └──────────────┬───────────────────────┘
    CLI, local)                    │  served four ways
                                   │
   ┌────────────┬──────────────────┼─────────────────┬──────────────┐
   │ skill      │ MCP resources    │ CLI             │ TS import    │
   │ SKILL.md   │ + prompts        │ `contract`      │ /contract    │
   └────────────┴──────────────────┴─────────────────┴──────────────┘
                                   │
                     model authors PresentationOutline
                          or slide-agent.scene/1
                                   │
   ┌───────────────────────────────▼─────────────────────────────────┐
   │  validate → design tokens + grid → compose → ooxml write →      │
   │  sanitize → validate → repair → score                          │
   └───────────────────────────────┬─────────────────────────────────┘
                                   │
              AgentResult (JSON) + .pptx + artifacts/
```

The contract is the product surface. The engine is an implementation detail.

## Modules

| Path | Responsibility |
|---|---|
| `src/contract/` | Schemas, JSON Schema, the authoring guide, `CONTRACT_VERSION`. Zero engine dependencies. |
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
| `src/rendering/` | LibreOffice + Poppler preview pipeline |
| `src/extensions.ts` | The public extension registry |

## Invariants

1. **Everything stays editable.** Native text, shapes, tables, and charts. No
   flattening a slide into an image.
2. **Generated packages are schema-valid.** Every XML part validates against
   the bundled official ECMA-376 schemas before the deck is returned.
3. **The scene round-trips.** Anything a model can author must survive
   serialisation and reimport, because `revise`, `diff`, and regeneration all
   depend on it.
4. **The contract is the only source of truth.** Docs, schemas, prompts, and
   the skill are generated from it — run `npm run docs`.
5. **Untrusted by default.** A canvas is model-authored and often derived from
   untrusted input, so remote fetches are opt-in and private networks stay
   unreachable.

## Every element goes through ElementWriter

Layouts, composers, and grammars never touch PptxGenJS directly. `ElementWriter`
writes the native element *and* records it in the manifest, which is what makes
validation, accessibility checking, quality scoring, and diffing possible. An
extension that bypasses it gets none of those.
