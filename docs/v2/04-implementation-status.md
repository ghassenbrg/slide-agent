# 04 — Implementation status

Part of the [Slide Agent V2 plan](README.md). What shipped in 2.0.0, what
changed from the plan and why, and what is deliberately still open. Figures in
[`02 §9.3`](02-v2-architecture.md#93-cost-model) remain **modelled**: nothing in
this release measured them against a corpus, and the sections below say so where
it matters.

---

## 1. What shipped

| Area | Status | Where |
|---|---|---|
| **IR**: DeckIntent, composition nodes, design language, SceneGraph v2, EditOp, Verdict, RunRecord | Shipped | `src/v2/ir` |
| **Composition language** `slide-agent.compose/1` with JSON-pointer findings and did-you-mean | Shipped | `src/v2/ir/compose.ts` |
| **Design-language compiler**: OKLCH colour, role→theme-slot mapping, contrast repair as reported adjustments, type scale and floors, DTCG import/export, presets, brand import with locks | Shipped | `src/v2/tokens` |
| **Text system**: TrueType/OpenType parsing, font registry, measurement from real advance widths, UAX-14-style breaking with CJK and spaceless scripts, balanced headlines, table fallback | Shipped | `src/v2/text` |
| **Layout**: grid tracks, flex rows and columns, layers, free placement, bleed, connectors, repeats | Shipped | `src/v2/layout` |
| **Fit ladder** with automatic steps, reported adjustments, choices, and character budgets | Shipped | `src/v2/layout/solve.ts` |
| **Components, recipes (24 families / 38 variants), draft selector, rhythm analysis** | Shipped | `src/v2/compose` |
| **Charts**: deterministic stats, form check, native OOXML charts with an embedded workbook, SVG preview | Shipped | `src/v2/charts`, `src/v2/ooxml/chart.ts` |
| **Diagrams**: flow, layered, hierarchy, cycle, swimlane, with obstacle-aware routing (ported from V1) | Shipped | `src/v2/layout/diagram.ts` |
| **Icons**: 1,848 Lucide glyphs as `a:custGeom`, concept search | Shipped | `src/v2/icons`, `assets/icons` |
| **Template-native writer**: placeholders, theme colours and fonts, notes, hidden slides, images with crops and treatments, tables, embedded font subsets, deterministic zip | Shipped | `src/v2/ooxml/writer.ts` |
| **Previews**: in-process SVG → PNG, contact sheets, exploration sheets, issue crops | Shipped | `src/v2/render` |
| **QA**: T0–T5 with readiness v2 and a separate design-review record | Shipped | `src/v2/qa`, `src/v2/engine` |
| **Engine**: deck workspace, incremental builds, run records, `explain`, EditOps with pins, explore, finalize with round-trip | Shipped | `src/v2/engine` |
| **Surfaces**: command registry, seven MCP tools with resources, CLI, `./v2` SDK export, skill v2 (~1.1k tokens) | Shipped | `src/v2/commands`, `src/v2/mcp`, `src/v2/cli` |
| **Engine-managed mode**: director, design critic, revise loop, micro-tasks, routing profiles with a creative floor, budget guard, exact-input response cache, ingestion | Shipped | `src/v2/llm`, `src/v2/ingest` |
| **Template-fill**, **V1 migration**, **`canvas` compatibility**, **`--compat-v1` MCP** | Shipped | `src/v2/engine/fill.ts`, `src/v2/compat-v1`, `src/mcp-v1.ts` |
| **Phase 0 security**: workspace confinement, script refusal, archive limits, subprocess limits, DNS pinning, operator-only network policy | Shipped | `src/security`, `src/utils` |

## 2. Where the implementation differs from the plan

| Plan | What shipped | Why |
|---|---|---|
| `packages/*` monorepo (`V2-009`) | One package, module boundaries under `src/v2/<package>` with the same dependency rule | A physical split would have rewritten the release, install, and CI machinery without changing a line of engine behaviour. The boundaries are real; the `package.json` split is deferred until something needs to be published separately. |
| harfbuzz shaping (`V2-107`) | Advance-width measurement from the font's own `hmtx`/`cmap`, with a wrap safety margin | Shaping matters for scripts with contextual forms; advance widths carry most of the wrapping accuracy, and the margin makes the engine wrap no later than PowerPoint. Kerning and ligature widths are the known gap. |
| ~80 bundled OFL families | A catalogue of ~80 families, fetched on demand into a cache (`slide-agent font --add`), plus system and project fonts | Bundling was ~10 MB in the npm package for faces most decks never use. Fetching is operator-gated and hash-recorded. |
| Yoga flexbox | A flex solver written for slides (equal share by `grow`, content sizing on request) | Slides need "share this row by weight" far more than the full CSS algorithm, and it avoids a WASM dependency in the hot path. |
| `sharp` image processing | Crops are expressed as OOXML source rectangles; images are embedded as authored | The crop maths is the part that matters for `cover`; re-encoding pixels is not needed to place a picture. Downscaling oversized images is still open (see below). |
| Fidelity backends: `unoserver` pool, `graph-convert`, `aspose` | LibreOffice through V1's hardened renderer | The backend interface exists in the plan; a pooled sidecar belongs with service mode. |
| MCP Apps interactive preview | Resource links and inline images | Nothing to gate it on until a host asks for it. |

## 3. Not implemented, and why

| Plan item | Status |
|---|---|
| **Designer panels and the blind-preference gate** (`V2-010`, `V2-007`) | **Needs people.** The engine ships the tooling a panel needs — deterministic builds, preview sheets, `explain`, and inter-deck similarity — but no panel has been run, so *no claim is made here that V2 decks are better than V1 decks*. That comparison is the release's main open question. |
| **Measured cost and quality baseline** (`V2-006`) | Not run. The cost figures in the plan are modelled. The engine records tokens, cost, and stage timings per run, which is what a harness needs. |
| **Expressiveness gate**: 30 showcase-class slides re-expressed, ≥ 90% without `free` | Not run as a formal gate. Every recipe and both worked examples build clean in two formats, which is a weaker check of the same thing. |
| **Service mode** (Phase 6): HTTP API, workers, queues, streamable-HTTP MCP, load testing | Out of scope for 2.0, as planned. |
| **Plugin manifest and third-party packs** (`V2-701`+) | Not implemented. V1's extension points still exist for V1 paths. |
| **Batch API, MCP sampling path, fine-tuned small models** | Not implemented. |
| **Image downscaling and focal-point cropping from a vision model** | Crops are computed deterministically from a declared focal point; no re-encoding, and no automatic focal detection. |
| **Calibration set for heuristic checks** (`V2-007`) | T3–T4 heuristics ship at minor severity where they are heuristic; none of them block on a number nobody has calibrated. |

## 4. Known limitations

- **Embedded fonts do not render in LibreOffice.** PowerPoint reads the EOT
  parts Slide Agent writes; LibreOffice needs libeot, which most builds lack. The
  fidelity render says so in a finding rather than pretending the render is what
  the audience will see.
- **Measurement has no kerning.** Lines are measured from advance widths with a
  1.5% safety margin, so the engine wraps no later than PowerPoint does. Long
  runs of tightly kerned display type are where this shows.
- **Line-break parity with PowerPoint is unverified against a corpus.** The
  calibration suite described in `02 §7.2` is not built.
- **`slides_generate` is untested against a live model.** Its logic is covered by
  a scripted provider; no run in this release called a real API.
- **Charts are drawn by PowerPoint from the data.** The SVG preview mirrors the
  styling but is not pixel-identical to what PowerPoint draws.

## 5. Gates this release does meet

- Every recipe builds in 16:9 and 4:3 with nominal content and **no blocking
  findings**, and the grammar page's worked examples build.
- The writer's output validates against the bundled ECMA-376 schemas, with
  charts, tables, images, icons, notes, hidden slides, and embedded fonts in one
  deck.
- A build is **byte-identical** when rebuilt from its own `intent.json` in a
  clean directory (`finalize --round-trip`).
- MCP responses stay inside their budgets: catalog ≤ 3,000 tokens, build ≤ 800,
  edit ≤ 500, and the grammar page ≤ 2,000.
- Path confinement, script refusal, archive limits, and subprocess limits are
  covered by tests.
