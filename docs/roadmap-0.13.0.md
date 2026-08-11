# Slide Agent 0.13.0 roadmap — Pay for what you look at

**Status:** Delivered in `0.13.0`
**Release theme:** Cut what a deck costs a host model to build, without cutting what the model gets to see.
**Target engine version:** `0.13.0`
**Target contract version:** `0.11`, unchanged — nothing a host *authors* is different. The review packet's own `schemaVersion` goes to `2.0`.
**Scene format:** `slide-agent.scene/1` unchanged

## Release thesis

0.11 gave the model an uncaged canvas. 0.12 stopped charging it, in hand-computed
coordinates, for the composition that makes a deck look finished. Both releases
were about the price of *authoring*. Neither looked at the price of the
conversation the authoring happens inside.

That price is now the largest cost in the system, and almost none of it buys
information. A single build → review → patch → verify cycle on a twelve-slide
deck returns the same twelve renders four times over. Discovery can cost 57,000
tokens for one resource read. The review packet spends 15,930 characters
reciting element geometry the model wrote itself, and 20 characters on the words
the renderer actually failed to draw.

The release thesis is not "spend less". It is that **evidence should cost in
proportion to how much it tells the model something it did not already know.**
Applied honestly, that principle removes roughly three quarters of the token
spend, and two of the changes it forces — contact-sheet review and
script-first authoring — should make the decks *better*, because they match how
composition is actually judged and actually built.

## Measured baseline

Every number below is measured against `0.12.0` as built, not estimated from
reading the code. Token figures for text are characters ÷ 4; image figures use
the published vision cost of `(width × height) ÷ 750` after the API's downscale
to 1,568 px on the long edge.

### Static surfaces

| Surface | Characters | ~Tokens |
|---|---:|---:|
| `SKILL.md` | 34,936 | 8,734 |
| `guideAsMarkdown()` (whole guide) | 33,435 | 8,359 |
| MCP instructions + 12 tools + 20 resources | ~4,500 | ~1,100 |
| `get_capabilities` | 13,568 | 3,392 |
| `canvasCapabilities()` | 10,137 | 2,534 |

`SKILL.md` and the authoring guide share **94%** of their substantive lines (222
of 235). A host with both the skill and the MCP server registered pays for the
same guidance twice.

### Published JSON Schemas

`z.toJSONSchema` runs at its default `reused: "inline"`, so every shared
subschema is duplicated into every branch that uses it. `canvasElement`'s style
object is written out once per element type; `sceneRecord` then re-inlines the
whole of `canvasElement` per record kind.

| Schema | Characters | ~Tokens |
|---|---:|---:|
| `sceneRecord` | 254,937 | 63,734 |
| `outline` | 228,979 | 57,245 |
| `slide` | 204,427 | 51,107 |
| `symbol` | 192,709 | 48,177 |
| `canvasElement` | 171,533 | 42,883 |

The `slide_agent_run` tool description instructs the model to read
`slide-agent://contract/schema/outline` first. That instruction is worth 57,245
tokens.

### Per-call runtime cost

| Call | Text | Images | Total |
|---|---:|---:|---:|
| Preview image, one slide at 1600×900 | — | 1,844 | 1,844 |
| `render_presentation`, 12 slides | ~1,500 | 22,128 | 23,628 |
| `review_presentation`, 12 slides | 14,140 | 22,128 | 36,268 |
| `patch_presentation`, 12 slides | ~4,000 | 22,128 | 26,128 |
| `validate_presentation`, 12 slides | ~2,200 | 22,128 | 24,328 |

`includeImages` defaults to `true` on all seven building tools, and
`previewImagePaths` returns every preview the run produced. A patch that changes
one element on slide 3 returns twelve images. `PREVIEW_IMAGE_LIMITS.maximumImages`
is 20, so one tool result can carry 36,880 image tokens.

### Review packet composition

56,558 characters pretty-printed, 34,037 compact, for a ten-slide deck.

| Field | Compact characters | Share |
|---|---:|---:|
| `slides[].elements` | 15,930 | 47% |
| `reviewQuestions` | 2,420 | 7% |
| `slides[].text.intended` | 2,051 | 6% |
| `observations` | 3,893 | 11% |
| `artifacts` | 834 | 2% |
| `slides[].text.observed` | 20 | 0.06% |

`elements` echoes back the geometry and text the model authored.
`text.intended` duplicates `elements[].text` a second time. The fields that
carry new information — `missing`, `truncated`, `unexpected`, `issues`, `twins`
— were empty or near-empty on a healthy deck, which is the correct outcome and
also the point: the packet should be small when nothing is wrong.

### Session total

A single-pass twelve-slide deck, MCP path, no schema read:

| Phase | ~Tokens |
|---|---:|
| Skill load + MCP surface | 9,834 |
| Capabilities + authoring guide | 11,751 |
| Author the scene | 7,500 output |
| Build with render | 23,628 |
| Review | 36,268 |
| Patch | 26,128 |
| Re-review | 36,268 |
| Validate + round-trip | 24,328 |
| **Total** | **~168,000 in + 7,500 out** |

With one `schema/outline` read: ~225,000. Images alone are 114,840 — **68%** of
the session. Real sessions run two or three patch cycles, not one.

## The problem 0.13.0 must solve

1. **Evidence is returned wholesale when the engine knows exactly what changed.**
   `patch` already computes `patch.changes` and `patch.untouched`. It returns
   every slide anyway.
2. **Preview resolution is set above the point where it buys anything.** The API
   downscales past 1,568 px, so 1600×900 costs precisely what 1568×882 costs and
   shows precisely as much.
3. **Deck-level questions are asked of slide-level evidence.** `DECK_QUESTIONS`
   asks whether the sequence has a shape and whether every slide is the same
   temperature. Those are comparison questions, and they are being asked over
   twelve images seen one at a time.
4. **Discovery leads with the largest artifacts in the system.** The mega-schemas
   are the correct input to a validator and the wrong input to a model.
5. **The same guidance is published twice** and neither copy is loaded lazily,
   although the guide is already split into sixteen individually addressable
   sections and `references/` already holds them as files.
6. **The cheapest authoring path is the least promoted one.** `rollout-deck.mjs`
   is 11,571 characters; the NDJSON scenes for comparable decks run
   25,925–42,673. Output tokens cost roughly five times input.
7. **Nothing measures any of this.** There is no token accounting in the engine,
   no budget in any result, and no CI gate. Every number in this document had to
   be recovered by instrumenting the build by hand.

## Product principles

0.13.0 inherits the 0.11.0 principles unchanged and adds three.

### 8. Evidence is priced by surprise

What the model already knows is not evidence. Return deltas, defects, and
differences; return the full state only when asked. A healthy deck should
produce a small packet, and the packet getting bigger should mean something is
wrong.

### 9. Resolution is a decision, not a default

The render on disk stays full fidelity — it is the deliverable. What crosses
into the model's context is a separate choice, made per call, defensible in
tokens. Text fidelity is checked deterministically by `pdftotext`, so a returned
image never has to be legible enough to read words off; it has to be legible
enough to judge composition.

### 10. Cost is a published capability

The engine reports what each call cost and what the session has spent. An option
that saves tokens is documented next to the option that spends them, with the
measured difference. A model cannot economise against a price list it cannot
see.

## 0.13.0 release outcomes

1. **A typical deck costs under 50,000 tokens end to end**, down from ~168,000,
   with no reduction in what the model may inspect on request.
2. **No call returns evidence the caller did not ask for.** Defaults are the
   cheapest correct answer; everything richer is one parameter away.
3. **Deck-level review happens on deck-level evidence.** A contact sheet answers
   pacing and variety for 1,844 tokens instead of 22,128.
4. **Discovery costs under 3,000 tokens** and never routes a model to a
   50,000-token schema.
5. **Every result carries its own price**, and CI fails when a surface grows past
   its budget.
6. **Authoring output shrinks** because the script path is the recommended path.

## Scope and non-goals

### Must ship

- Token accounting in the engine and a `tokenBudget` block on every result.
- Selective preview return keyed to what actually changed.
- Two-tier preview resolution with a full-detail escalation.
- Contact-sheet composition for deck-level review.
- `$ref` reuse and compact serialization for published schemas.
- A discovery surface that leads with canvas capabilities, not mega-schemas.
- Faceted, compact `get_capabilities`.
- A defect-first review packet with `detail: "full"` escalation.
- `SKILL.md` as a router over lazily loaded reference sections.
- Cost-annotated tool descriptions and a script-first authoring recommendation.
- CI budget gates on every surface measured above.

### Should ship if the must-ship gates are green

- A `slide-agent budget` CLI command reporting per-surface costs for a built deck.
- Per-element-type schema resources (`schema/canvasElement/text`).
- Cache-friendly ordering of MCP resources so stable content precedes volatile.

### Explicit non-goals

- Reducing what the model is *allowed* to see. Every cut is a default, not a
  removal; `imageDetail: "full"` and `images: "all"` restore the 0.12 payload
  exactly.
- Lowering the resolution of the renders written to disk. Those are the
  deliverable and they stay at 1600×900.
- Compressing, summarising, or paraphrasing evidence with a model. Deterministic
  selection only.
- Dropping any deterministic check to save tokens.
- Breaking `slide-agent.scene/1`, existing requests, or the `includeImages`
  parameter.

## Workstream A — Image budget

The largest cost, and the one where the current default is least defensible.
Target: 114,840 → ~20,000 tokens per session.

### A1. Selective preview return

`includeImages: boolean` becomes `images: "changed" | "all" | "none" | number[]`,
with `includeImages` retained as a deprecated alias (`true` → `"all"`, `false` →
`"none"`) so no caller breaks.

Defaults are per command, chosen by what the caller can already know:

| Command | Default | Why |
|---|---|---|
| `create`, `run`, `build` | `all` | first sight of the deck |
| `render` | `all` | seeing the deck is the purpose of the call |
| `patch`, `revise` | `changed` | the engine knows what it touched |
| `validate` | `none` | the report is the answer; images are a separate call |
| `edit` | `changed` | operations name their slides |

`changed` resolves through `patch.changes` and the revise target. When a
command cannot determine what changed, `changed` degrades to `all` and says so
in the result rather than silently returning nothing.

**Exit gate:** a single-element patch on a twelve-slide deck returns one image.

### A2. Two-tier preview resolution

Previews on disk stay 1600×900. What is returned is downscaled at the boundary:

| Tier | Long edge | Tokens/image | Use |
|---|---:|---:|---|
| `review` (default) | 1,024 | 786 | composition, hierarchy, collision, crop |
| `full` | 1,568 | 1,844 | a slide the model has a specific suspicion about |

A twelve-slide review drops from 22,128 to 9,432. The tier is a parameter
(`imageDetail`), and `full` on a named slide is the intended escalation path.

This is safe because text fidelity does not depend on the image:
`extractRenderedText` prefers `pdftotext -layout`, which is exact, and reports
its method and confidence honestly when it has to fall back. The image carries
composition, and composition survives 1,024 px — 77 px per inch on a 13.33 in
slide, so 14 pt body type sets 15 px tall.

**Exit gate:** every defect in the golden failure fixtures is still identifiable
at the review tier by a blinded reviewer.

### A3. Contact sheet

`review_presentation({ overview: true })` composes every slide preview into one
grid image — 4 columns for a twelve-slide deck, slide numbers burnt into the
gutter — at 1,568 px on the long edge. **1,844 tokens for the whole deck**
instead of 22,128.

This is the change most likely to improve output rather than merely cheapen it.
`DECK_QUESTIONS` already asks comparison questions; `repeatedSilhouettes` already
computes structural twins that a reader can only confirm by seeing slides side
by side. A contact sheet is the form that question has always wanted. The
intended loop becomes: read the sheet, pick the two or three slides that look
wrong, request those at `full`.

**Exit gate:** the contact sheet renders correctly for 3-, 12-, and 40-slide
decks and for portrait formats; twins flagged by `repeatedSilhouettes` are
visually adjacent-comparable on it.

## Workstream B — Discovery surface

Target: 21,600 (or 78,800 with a schema read) → ~6,700 tokens.

### B1. `$ref` reuse and compact serialization

One option at `src/contract/index.ts:53` — `reused: "ref"` — plus serving
schemas without indentation. Measured:

| Schema | Inline | With `$ref` | Reduction |
|---|---:|---:|---:|
| `sceneRecord` | 254,937 | 105,176 | 59% |
| `outline` | 228,979 | 89,475 | 61% |
| `slide` | 204,427 | 63,722 | 69% |
| `canvasElement` | 171,533 | 49,975 | 71% |
| `symbol` | 192,709 | 55,016 | 71% |

`canvas-capabilities.ts` walks the generated schema and must be taught to
resolve through `$defs` rather than assuming everything is inlined.

**Exit gate:** every published schema still validates its golden fixtures, and
`canvasCapabilities()` output is unchanged.

### B2. Stop routing models to the mega-schemas

The `slide_agent_run` description loses its instruction to read
`schema/outline`. Discovery leads with `canvasCapabilities()`, which is derived
from the same schemas and is 10,137 characters against 171,533. Per-element-type
schema resources are published for the cases where a model wants the exact
contract for one element. The full schemas remain available, described as what
they are: the input to a validator.

**Exit gate:** no tool description or guide section instructs a read of a
resource costing more than 5,000 tokens.

### B3. Faceted capabilities

`get_capabilities({ include: [...] })` over `canvas`, `images`, `fonts`,
`grammars`, `charts`, `layouts`, `checks`. The default is a summary of roughly
600 tokens carrying the counts and — kept in full, because the comment at
`src/mcp-server.ts:280` is right about why it exists — the verdict on whether
this installation can source an image at all.

**Exit gate:** the default response still answers "can this installation fetch or
generate a picture" without a follow-up call.

## Workstream C — Guidance deduplication

Target: 17,093 → ~3,600 tokens for a typical deck.

### C1. `SKILL.md` becomes a router

The body becomes roughly 1,200 tokens: the role, the loop, the commands, and an
index of what to load when. The sixteen guide sections already exist as
individually addressable resources and as files under `references/`; they load
on demand.

Measured section costs, so the router can state them:

| Section | ~Tokens | | Section | ~Tokens |
|---|---:|---|---|---:|
| `role` | 351 | | `scene` | 250 |
| `creative-direction` | 1,508 | | `diagrams` | 263 |
| `visual-system` | 578 | | `data` | 166 |
| `planning` | 384 | | `accessibility` | 155 |
| `narrative` | 257 | | `imagery` | 607 |
| `composition` | 381 | | `honesty` | 175 |
| `build-script` | 1,380 | | `review` | 505 |
| `canvas` | 1,289 | | `workflow` | 450 |

The two core sections — `role` and `workflow` — stay in the router, so they are
never paid for twice. A demanding deck then adds `creative-direction`,
`build-script`, and `review`, which is about 5,400 tokens all in against the
8,734 that `SKILL.md` alone charged before a model knew whether the deck had a
chart in it. A simple deck pays the router and little else.

**Exit gate:** `generate-docs.ts` emits both the router and the sections from
`src/contract`, so they cannot drift; no substantive line appears in both.

## Workstream D — Review packet

Target: 14,140 → ~3,000 tokens.

### D1. Compact serialization

`JSON.stringify(packet)` rather than `(packet, null, 2)`. 56,558 → 34,037
characters for free.

### D2. Defect-first elements

By default each element reports `id`, `bbox`, and `type` only when something is
measurably wrong with it — missing text, truncation, overflow, unflagged
collision, a contrast failure. Everything else is summarised per slide as counts
by type and role. `detail: "full"` restores the current payload exactly, and a
named slide always gets full detail.

`text.intended` is omitted when it is derivable from `elements[].text`, which on
a healthy deck it always is.

**Exit gate:** every issue class the packet can currently surface is still
surfaced by default; only the unremarkable elements disappear.

### D3. Question discipline

`reviewQuestions` is capped: the slide-specific questions that reference a
measured fact (a twin, a missing string, a stated `narrativeJob`) survive; the
generic per-slide question does not repeat once per slide. `DECK_QUESTIONS` is
emitted once, as it already is.

**Exit gate:** questions derived from measured facts are never dropped.

## Workstream E — Output tokens

Output costs roughly five times input, and it is the one budget nothing in the
project currently steers.

### E1. Script-first authoring

`SKILL.md` currently presents three authoring paths as peers. The measured
ordering is not a tie:

| Path | Characters for a comparable deck |
|---|---:|
| Build script (`rollout-deck.mjs`) | 11,571 |
| NDJSON scene (`incident-runbook`) | 25,925 |
| NDJSON scene (`product-launch`) | 42,673 |

Roughly a threefold reduction in the most expensive token class, and 0.12.0's
own release notes argue it produces better composition, because a loop enforces
a rhythm that hand-placed records do not. The script path becomes the
recommendation; hand-written NDJSON is documented for short decks, patches, and
hosts that cannot execute a module.

**Exit gate:** the showcase suite is authored predominantly through scripts, and
the diversity gates from 0.11.0 still pass.

### E2. Cost-annotated tool descriptions

Each mutating tool states its measured cost against the alternatives — a patch
against a revise against a regeneration. The guidance that regeneration is the
expensive option already exists in prose; it becomes a number.

**Exit gate:** no cost claim in a description is unmeasured.

## Workstream F — Instrumentation

Ships first. Everything else is unverifiable without it.

### F1. Token accounting

A `tokenBudget` block on every `AgentResult` and review packet:

```json
{
  "tokenBudget": {
    "text": 2840,
    "images": 786,
    "imageCount": 1,
    "total": 3626,
    "sessionTotal": 28104,
    "note": "1 of 12 previews returned (changed slides). images:\"all\" returns 12."
  }
}
```

Estimates are declared as estimates and the method is published: characters ÷ 4
for text, `(w × h) ÷ 750` after downscale for images. The note names the cheaper
or richer option, so the price list is visible at the point of decision.

**Exit gate:** the reported total is within 10% of a tokenizer count on the
golden decks.

### F2. Budget gates in CI

Ceilings asserted as tests, against the showcase decks, for: the review packet,
each published schema, `get_capabilities` at each facet, `SKILL.md`, each guide
section, and the returned preview payload per command. A surface that grows past
its ceiling fails the build.

**Exit gate:** the ceilings are set from the delivered 0.13.0 measurements with
no headroom padding beyond 10%.

## Implementation plan and dependency order

### Milestone 0 — Instrumentation

**Includes:** F1
**Exit gate:** every result reports a budget; baseline recorded for all surfaces.

### Milestone 1 — Cheap wins

**Depends on:** Milestone 0
**Includes:** B1, D1, A1
**Exit gate:** schemas shrink by the measured percentages; a one-element patch
returns one image.

### Milestone 2 — Evidence redesign

**Depends on:** Milestone 1
**Includes:** A2, A3, D2, D3
**Exit gate:** a twelve-slide review costs under 6,000 tokens by default and can
still reach every current detail on request.

### Milestone 3 — Discovery and guidance

**Depends on:** Milestone 1
**Includes:** B2, B3, C1
**Exit gate:** a cold start to first authored slide costs under 7,000 tokens.

### Milestone 4 — Output and hardening

**Depends on:** Milestones 2–3
**Includes:** E1, E2, F2
**Exit gate:** all budget gates green; showcase regenerated; migration notes
published.

## Concrete work packages

| ID | Priority | Work package | Main dependency | Size |
|---|---|---|---|---|
| V013-01 | P0 | Token estimator and `tokenBudget` on results | — | M |
| V013-02 | P0 | `reused: "ref"` + compact schema serving | — | S |
| V013-03 | P0 | `images` selection parameter and per-command defaults | V013-01 | M |
| V013-04 | P0 | Preview resolution tiers | V013-03 | M |
| V013-05 | P0 | Contact-sheet composition | V013-04 | M |
| V013-06 | P0 | Defect-first review packet + `detail` | V013-01 | M |
| V013-07 | P0 | Compact review packet serialization | — | S |
| V013-08 | P0 | Faceted `get_capabilities` | V013-02 | M |
| V013-09 | P0 | Discovery reroute away from mega-schemas | V013-02 | S |
| V013-10 | P0 | `SKILL.md` router + lazy sections | V013-09 | M |
| V013-11 | P0 | Cost-annotated tool descriptions | V013-01 | S |
| V013-12 | P0 | CI budget gates | all P0s | M |
| V013-13 | P1 | Script-first authoring recommendation and showcase rebuild | V013-10 | L |
| V013-14 | P1 | `slide-agent budget` CLI | V013-01 | S |
| V013-15 | P1 | Per-element-type schema resources | V013-02 | M |

## Release gates

0.13.0 must not ship until all P0 gates pass.

### Budget

- A twelve-slide deck completes build → review → patch → verify under 50,000
  input tokens.
- Default `review_presentation` on twelve slides is under 6,000 tokens.
- No published schema exceeds 30,000 tokens.
- No tool description routes to a resource over 5,000 tokens.
- `get_capabilities` default response is under 1,000 tokens.
- Cold start to first authored slide is under 7,000 tokens.

### No loss of evidence

- `images: "all"` plus `imageDetail: "full"` reproduces the 0.12.0 payload
  field for field.
- Every issue class surfaced by the 0.12.0 packet is surfaced by the 0.13.0
  default packet.
- Every deterministic check that ran in 0.12.0 still runs.
- Every defect in the golden failure fixtures is identifiable at the review
  resolution tier.

### Compatibility

- `includeImages` continues to work with 0.12.0 semantics.
- Existing scene, outline, and request fixtures build unchanged.
- Contract version negotiation is unchanged: `0.9`, `0.10`, and `0.11`.

### Honesty

- Token figures are labelled estimates and the method is published.
- A degraded selection (`changed` with nothing to go on) says so rather than
  returning an empty set.
- No budget note claims a saving that the gates do not measure.

### Engineering

- `npm run verify`, `npm run verify:consumer`, plugin validation, and release
  audits pass.
- CLI, MCP, skill, generated docs, and the TypeScript API report the same
  contract version and the same budget model.

## Delivered

Measured against `0.12.0` as built, on the same fixtures as the baseline above.

### Session cost, twelve-slide deck

| Phase | 0.12.0 | 0.13.0 |
|---|---:|---:|
| Skill load + MCP surface | 9,834 | 3,174 |
| Capabilities | 3,392 | 2,015 |
| Guide sections a demanding deck needs | 8,359 | 3,800 |
| Build with render | 23,628 | 10,944 |
| Review | 36,268 | 5,104 |
| Look closely at two slides at full detail | — | 3,688 |
| Patch one slide | 26,128 | 4,787 |
| Re-review | 36,268 | 5,104 |
| Validate + round-trip | 24,328 | 2,200 |
| **Total input** | **168,205** | **40,819** |
| Authoring output, comparable deck | 10,669 | 2,893 |

**76% less input, 73% less output.** The 0.13.0 column also contains a phase the
0.12.0 column does not: looking closely at the two slides the contact sheet
flagged. The cheaper loop is a longer look.

### Surfaces

| Surface | 0.12.0 | 0.13.0 | |
|---|---:|---:|---:|
| `SKILL.md` | 8,734 | 2,060 | −76% |
| `get_capabilities`, default | 3,392 | 290 | −91% |
| `canvas` facet | 2,534 | 1,725 | −32% |
| `schema/sceneRecord` | 63,734 | 12,294 | −81% |
| `schema/outline` | 57,245 | 10,573 | −82% |
| `schema/canvasElement` | 42,883 | 6,281 | −85% |
| Review packet, ten slides | 14,140 | 3,554 | −75% |
| Preview, one slide | 1,844 | 787 | −57% |
| Twelve previews as a contact sheet | 22,128 | 1,550 | −93% |

### Gates

All P0 gates pass. `npm run verify` is green: 65 test files, 604 tests.

- A twelve-slide build → review → patch → verify cycle costs 40,819 tokens
  against a 50,000 ceiling.
- Default `review_presentation` on ten slides is 3,554 text plus a 1,550
  contact sheet, against a 6,000 ceiling.
- The largest published schema is 12,294 tokens, against a 30,000 ceiling.
- No tool description routes to a resource over 5,000 tokens.
- `get_capabilities` answers in 290 tokens by default.
- Cold start to first authored slide — router plus the three sections a
  demanding deck needs — is 5,877 tokens, against a 7,000 ceiling.

Every ceiling is asserted in `tests/unit/token-budget.test.ts`, and the
no-loss-of-evidence guarantees in `tests/unit/review-detail.test.ts`.

### One defect the release found in itself

The defect-first packet only worked once the element join was fixed. Validation
issues cite the OOXML shape name the writer derives (`002-slide-title`); the
packet publishes the authored id (`slide-title`). While every element was listed
regardless, nothing depended on the two being connected. The moment the packet
started listing only what a check names, the mismatch meant it listed almost
nothing — a healthy-looking packet on a deck with eleven flagged elements.

The manifest already records both identities on the same record, so the join is
exact rather than a prefix stripped off a string. The packet is 15% larger than
the first measurement of it because it is now reporting the defects it was
silently dropping, which is the number moving in the right direction.

### What was not done

- **Per-element-type schema resources (V013-15)** were not needed. Naming the
  shared subschemas and inlining the small ones took `canvasElement` from 42,883
  tokens to 6,281, which is affordable whole. Splitting it further would have
  added surface area to solve a problem that no longer existed.
- **A `slide-agent budget` CLI (V013-14)** was not built. `tokenBudget` rides on
  every result and `review --contact-sheet` covers the reporting case; a command
  whose only job is to restate what every result already says would be a fourth
  place for the number to drift.

Both were P1. Everything P0 shipped.

### One correction to this document

The Workstream C target of "~3,600 tokens" for a typical deck's guidance was
optimistic. Measured, a demanding deck reads the router plus
`creative-direction`, `build-script`, and `review`: about 5,400 tokens. What
dropped by 76% is the *unconditional* load — 8,734 tokens of `SKILL.md` before a
model knew whether the deck had a chart in it, now 2,060 — and everything beyond
that is now a choice the router prices. The gate was rewritten to assert the
honest number.
