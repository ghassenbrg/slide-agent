# Slide Agent V2 — technical audit and implementation roadmap

**Status:** Implemented in 1.0.0 — see [`04-implementation-status.md`](04-implementation-status.md) for what shipped, what changed, and what is still open
**Date:** 2026-09-17
**Baseline audited:** `0.15.0` (commit `f85fae0`), contract `0.11`, scene `slide-agent.scene/1`
**Audience:** maintainers, and any engineering team or coding agent that will build V2

---

## How to read this

The plan is split so a reader — human or model — loads only the part it needs.
Every task, finding, and decision has a stable ID that can be cited in issues
and pull requests.

| Document | Read it when | Contents |
|---|---|---|
| **This file** | Always, first | Verdict, why the model stays in charge, headline numbers, the ten decisions, what to do this week |
| [`01-current-system-audit.md`](01-current-system-audit.md) | Before you argue with a decision | What V1 is, what was measured, strengths, critique, the debt register (`F-*`), security findings (`S-*`), how it compares to the rest of the field |
| [`02-v2-architecture.md`](02-v2-architecture.md) | Before you design or build a component | Target architecture, data models, the composition and design languages, agent workflow, rendering, QA and design review, token and cost strategy, models, caching, performance, DX, observability, plugins, security, technology choices |
| [`04-implementation-status.md`](04-implementation-status.md) | Before you trust a figure on this page | What shipped in 1.0.0, where the implementation differs from this plan and why, what is deliberately still open, and the known limitations |
| [`03-v2-roadmap.md`](03-v2-roadmap.md) | Before you plan or pick up work | What to keep, redesign, remove, and add; migration; phases with task IDs (`V2-*`), exit gates, priorities, risks, ADRs to write, open questions, sources |

---

## The verdict in one page

Slide Agent V1 is a rigorous, honest, well-tested **deterministic PowerPoint
toolkit** (24.7k lines of TypeScript, 681 passing tests in 17 s). It has no
model inside it. Every judgement — and almost every coordinate — comes from the
host agent: Claude Code, Codex, Copilot, Gemini, or any MCP client.

That split is the root of both its strengths and its limits:

1. **The model spends its tokens on arithmetic, not on design.** In the shipped
   example scripts the model writes **637–755 output tokens per slide, of which
   only 126–145 are the words on the slide.** Most of the rest is coordinates,
   font sizes, hex colours, and components redefined for every deck. 0.15.0 tried
   authoring primitives and measured a **1% saving against a projected 37%**.
   Its rule — the toolkit ships mechanics, "never proportion, colour, type, or
   composition" — was right about *who decides*. Its primitives still worked in
   inches and literals, which is why they saved nothing.
2. **Correctness is found, not built.** Overflow, collisions, contrast, and
   repetition are found *after* a build and a render, then fixed through
   review → patch → rebuild rounds. Each round rebuilds the whole deck. Each
   render starts a fresh LibreOffice process (about 4 s). A deck can only reach
   `presentationReadiness: "ready"` after the host model records visual
   findings, so the model's look is spent hunting defects instead of judging
   design. Both example decks measured here stopped at `review`.
3. **What it builds is editable, but not template-native.** A generated deck has
   one blank layout, **0 placeholders, and 105 hard-coded sRGB colours against
   0 theme colours**. Titles are loose text boxes. PowerPoint's outline view,
   accessibility checker, Designer, Copilot, and "change theme" cannot see the
   deck's structure. Real-world use needs both bespoke art direction, which V1
   is built for, and corporate templates, which it is not.
4. **There is no path to a finished deck without a capable host agent.** The
   prompt-only mode produces bracketed placeholders by design. That rules out
   batch generation, APIs, and recurring reports.
5. **Some security boundaries do not hold** (see `S-01`–`S-08`). The MCP
   `slide_agent_run` tool accepts a `script` path. The server imports and runs
   that file in-process, and the tool is annotated `destructiveHint: false`.
   Request paths are not confined to a workspace. External processes have no
   timeout.

**The V2 thesis:** *the model directs; the engine executes.* The model decides
everything a designer would argue about. The engine computes everything that has
a right answer, and never changes a design decision silently.

The model writes a compact, schema-checked **DeckIntent**:
- the visual **concept**;
- a **design language** — palette and roles, typefaces and scale, grid,
  surfaces, texture, imagery, chart style — written once per deck;
- reusable **components**;
- each slide's message and **composition**, in grid units, roles, and named
  tokens instead of inches and literals.

The engine then:
- solves the geometry, shapes and fits the text, verifies contrast, and routes
  connectors;
- embeds the chosen fonts and emits PowerPoint-native structure (masters,
  layouts, placeholders, theme colours);
- previews the result in about a second.

Design-preserving fixes happen automatically and are reported. Design-changing
fixes come back to the model as choices. The model's look at the deck is spent
on judgement against the brief. Recipes and preset themes exist for routine
slides, drafts, and template-fill, but they are opt-in and labelled.

---

## Why the model stays in charge

A presentation tool that runs inside a frontier agent is only worth the user's
tokens if the model's judgement shows up in the deck. A tool that moves taste
into the engine — fixed layouts, generated themes, automatic variety — is
cheaper. It also produces decks the user could get from a template gallery
without spending any tokens. V2 therefore cuts cost by removing **arithmetic,
repetition, and defect-hunting** from the model's work, not its decisions.

**Where model output goes** (host mode, 12-slide deck, modelled in
[`02 §9.1`](02-v2-architecture.md#91-what-is-saved-and-what-is-not)):

| Output | V1 | V2 directed (default) | V2 draft (opt-in, labelled) |
|---|---:|---:|---:|
| Slide words, data, and ledgers | ~2.7k | ~1.7k | ~1.7k |
| **Design decisions**: concept, design language, components, composition | **~3.5k** | **~3.3k** | ~0.7k |
| Coordinates, sizes, and repeated style literals | ~5.8k | ≈ 0 | 0 |
| Defect patches | ~3k | ~0.3k | ~0.3k |
| Design review and refinement | 0 | ~1.2k | 0 |
| Reasoning and prose between calls | ~15k | ~6k | ~4k |
| **Total** | **~30k** | **~12.5k** | **~6.7k** |

The budget for design decisions stays where it was. Everything around it
shrinks. Every phase gate checks design quality with blind designer comparisons
**before** it checks cost.

---

## Headline targets

"Measured" values come from this audit's runs on the 0.15.0 build (macOS arm64,
Node 24.11, LibreOffice and Poppler installed) or from the project's own
published measurements. "Modelled" values follow the stated assumptions in
[`02 §9`](02-v2-architecture.md#9-token-and-cost-optimisation-strategy) and
are replaced by real measurements in Phase 0 (`V2-006`, `V2-010`).

**Quality (gated first, at every phase)**

| Metric | V1 today | V2 target | Basis |
|---|---:|---:|---|
| Blind designer preference, V2 directed vs V1 (same briefs, same host model) | baseline | non-inferior; target ≥ 60% preferred | panel (`V2-010`) |
| Brief fit ("designed for this audience and goal") | baseline | ≥ V1 | panel |
| "Made by the same tool?" identification across decks | baseline | ≤ V1 | panel |
| Engine-managed `balanced` vs host-directed decks | n/a | non-inferior | panel |

**Cost and speed (12-slide deck)**

| Metric | V1 today | V2 target | Basis |
|---|---:|---:|---|
| Model output tokens per slide | 637–755 | ~250 composed; ~125 from a recipe | measured → modelled |
| Tool calls per finished deck (host mode) | ~15–30 | 6–8 directed with a design review; 3–5 draft | modelled |
| Host-model cost per deck, Opus-5-class host, with prompt caching | ≈ $1.70 | ≈ $0.55 directed; ≈ $0.30 draft | modelled |
| Cost per deck, engine-managed | n/a (not possible) | ≈ $0.15 `balanced`; ≈ $0.42 `quality`; ≈ $0.035 `draft` | modelled |
| Cost per deck, template-fill from a directed template | n/a | ≈ $0 (no model at fill time) | by construction |
| Build → first preview | 4.4–5.0 s (LibreOffice) | < 1 s (in-process preview) | measured → target |
| Previewing two design directions side by side | a render round each | ≤ 1.5 s | target |
| Rebuild after a one-element edit | full deck build, plus render if requested | changed slides only | code → target |

**Output and safety**

| Metric | V1 today | V2 target | Basis |
|---|---:|---:|---|
| `ready` (mechanically sound) without a host visual review | no | yes (deterministic tiers T0–T5) | code → target |
| Design changes the engine makes without reporting them | n/a | 0 | by construction |
| Slides with a real title placeholder | 0% | 100% | measured → target |
| Theme-role colours emitted as theme references | 0% | ≥ 90% | measured → target |
| Model-chosen typefaces that reach the audience | depends on installed fonts | embedded subsets | target |
| CLI build result size (product-introduction, rendered) | 28.5k chars, ~45% duplicated | ≤ 3k chars verdict; detail on request | measured → target |
| Security findings open (`S-*`) | 8 | 0 before the 1.0 beta | audit |

---

## Ten decisions this plan makes

Each is argued in the architecture document and gets a decision record (see
[`03 §7`](03-v2-roadmap.md#7-decision-records-to-write)).

| # | Decision | Replaces |
|---|---|---|
| D1 | **The model directs; the engine executes.** The model owns message, emphasis, concept, design language, composition, and rhythm. The engine owns geometry, measurement, fitting, contrast verification, routing, and OOXML. No silent taste: adjustments are reported and refusable, design-changing fit steps come back as choices, and quality gates precede cost gates. | Model-authored coordinates and literals; 0.15.0's coordinate-level primitives. Keeps and sharpens ADR-0001 |
| D2 | **DeckIntent with a composition language** is the primary authoring format: grid, flex, layer, and free placement in grid units, roles, and named tokens; components defined once per deck; recipes as optional starting points; `canvas` only in `compat-v1`. | Build scripts and NDJSON as the recommended path |
| D3 | **A design language authored by the model** once per deck, compiled and verified into W3C DTCG 2025.10 tokens; brand import with locks; preset themes only for draft mode. | Free-prose `creativeDirection` plus per-element literals |
| D4 | **An opt-in design vocabulary**: starter components, ~24 recipe families, icon sets, a curated font library with embedding, and texture primitives. None of it is applied to a directed deck unless the model chooses it. Decks are measured for sameness by designer panels. | ADR-0004's "no icon vocabulary" and "no components" clauses |
| D5 | **Template-native OOXML writer**: real masters, layouts, placeholders, `schemeClr`, theme fonts, and embedded font subsets. It can generate *into a customer's .potx*, with the model directing inside the brand's locks. Charts stay behind an adapter. | PptxGenJS plus post-processor plus sanitizer |
| D6 | **Correct by construction, judged by a model**: real font shaping, a fit ladder, and contrast verification make mechanical readiness deterministic. The model's look — the host's own review, or the engine-managed critic — is spent on design against the brief, and recorded separately. | Render → review → patch as the primary quality loop |
| D7 | **Three operating modes on one orchestrator**: host-agent (skill/MCP); engine-managed, with a director model at the profile's tier plus a critic, a creative-tier floor, and small models only for mechanical tasks; and template-fill from directed templates. | Host-agent only |
| D8 | **Content-addressed incremental build DAG** with stage caches, a fast in-process preview (resvg) that makes exploring designs affordable, and a pooled, sandboxed LibreOffice fidelity gate. | Whole-deck rebuild per change; a cold `soffice` per render |
| D9 | **One command registry** generates the CLI, MCP tools (with output schemas, Tasks, and correct annotations), and HTTP routes. Zod is the only source of types. | 20+ CLI commands, 12 MCP tools, hand-written duplicate types |
| D10 | **Security by default**: workspace confinement, no code execution through MCP, operator-owned network and font policy, process and archive limits, sandboxed renders and plugins. | Trusting request paths and flags |

---

## What to do first (Phase 0, two weeks)

These ship on the V1 line, as `0.16.0`, while V2 is being built.

1. `V2-001` — Stop MCP from executing scripts; confine request paths to a
   workspace root; make tool annotations match what the tools do. (`S-01`, `S-02`)
2. `V2-002` / `V2-003` — Add timeouts and process-group kill to `runProcess`;
   add zip-bomb limits before `JSZip.loadAsync`. (`S-05`, `S-06`)
3. `V2-004` — Pin DNS answers for remote image fetches; make remote fetching an
   operator setting, not a request flag. (`S-03`, `S-04`)
4. `V2-000` — Fix the broken `@slide-agent/core/contract` export
   (`dist/contract/index.js` is never built). (`F-21`)
5. `V2-005` — Stop reporting every finding three times in CLI and MCP results.
   (`F-14`)
6. `V2-006` — Build the evaluation harness and record the **measured** V1
   baseline — tokens, cost, turns, wall time, readiness — on ≥ 2 host models.
7. `V2-010` — Set up the blind designer panel and rate the V1 baseline decks:
   preference, brief fit, and "same tool?". Every later gate checks quality
   against it first.
8. `V2-007` — Start the human-labelled slide flaw set: 300 slides, labelled
   against a SlideAudit-style taxonomy.
9. `V2-008` — Write ADR-0005 to ADR-0007 so the division of labour is decided
   explicitly, not drifted into.
10. `V2-009` — Monorepo skeleton; V1 moves into `packages/core-v1` untouched.

---

## Delivery shape

```text
Phase 0  Stabilise V1, measure cost and design quality .. weeks 1–2    → 0.16.0
Phase 1  IR, design language, writer, fonts ............. weeks 3–7
Phase 2  Composition language, fit, previews, recipes ... weeks 6–11   → 1.0.0-alpha
Phase 3  Directed host workflow, design review, MCP v2 .. weeks 11–14  → 1.0.0-beta
Phase 4  Engine-managed direction, critic, ingestion .... weeks 13–17  → 1.0.0-rc
Phase 5  Editing, templates, migration .................. weeks 17–20  → 1.0.0
Phase 6  Service mode, scale, observability ............. weeks 19–23  → 2.1.0
Phase 7  Ecosystem, packs, exports, tuning .............. week 24+     → 1.x
```

Assumes three engineers with coding-agent assistance, a part-time presentation
designer, and a contracted designer panel. Phases overlap where their
dependencies allow; each has measured exit gates, not dates, as its definition
of done.
