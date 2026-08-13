# Slide Agent 0.15.0 roadmap — Say it once, ship it once

**Status:** Proposed
**Release theme:** 0.13 priced the conversation and cut it 76%. What it cut was the part that is the same size on every deck. What remains grows with the deck, with every review round, and with every deck after the first.
**Target engine version:** `0.15.0`
**Target contract version:** `0.12` — one deprecation window closes; the report and packet schemas move; the authoring surface gains a standard library, a scaffold, and an author-time check mode.
**Scene format:** `slide-agent.scene/1` unchanged

---

## Release thesis

A deck costs the host model in two directions, and they are billed differently.

**What the model reads** — capabilities, the guide, schemas, reports, packets,
previews. 0.13 attacked this and won: static surfaces and images are now
genuinely cheap.

**What the model writes** — the build script. Output tokens, billed at several
times input, uncacheable, produced from nothing every time.

0.13 measured the first against a healthy twelve-slide fixture and never
measured the second at all. Measured against a real deck, both have the same
defect, in the two forms it takes:

> **Reading: repetition is not information.** A finding stated once with a
> hundred call sites is one finding, not a hundred.
>
> **Writing: re-derivation is not authorship.** Anything two independent decks
> both invented is a thing the toolkit should have shipped.

Applied honestly, this removes roughly 80% of what the model reads and 37% of
what it writes. As in 0.13, the changes that save the most also make the deck
*better* — a report where 86% of entries are noise is a report nobody reads
carefully, and a primitive that cannot be built wrong is strictly better than a
check that finds it after the render.

---

## Measured baseline

Every number is measured against real output from `0.14.0`: the `rc-pai` SSO
proposal, seventeen slides, model-authored canvas, five review rounds, plus its
twenty-three-slide sibling. Files are as the toolkit wrote them. Token figures
are characters ÷ 4, the arithmetic `src/evaluation/token-budget.ts` publishes.

### The whole project

| | ~Tokens |
|---|---:|
| Authoring the build script (output) | 19,133 |
| Five review rounds, report + packet each (input) | ~403,000 |
| JSON evidence written to disk across both decks | 616,003 |

The `.pptx` it produced has 17 slides.

### Reading — one review round

| Surface | Bytes | ~Tokens |
|---|---:|---:|
| `report-final.json` | 111,141 | 27,785 |
| `packet-final.json` | 211,278 | 52,819 |
| **One round, both read** | | **80,604** |

Where the report's tokens go:

| Field | ~Tokens | Share |
|---|---:|---:|
| `issues` | 21,653 | **78%** |
| `artifacts` | 1,459 | 5% |
| `fidelity` | 966 | 3% |
| `heuristics` | 256 | 1% |
| `quality` (deprecated alias, byte-identical to `heuristics`) | 256 | 1% |
| everything else | ~3,200 | 12% |

Where the packet's tokens go:

| Field | ~Tokens | Share |
|---|---:|---:|
| `slides[].issues` | 18,992 | **36%** |
| `slides[].text` | 4,945 | 9% |
| `slides[].elements` | 4,419 | 8% |
| `reviewQuestions` | 1,486 | 3% |
| `artifacts` | 1,374 | 3% |
| `slides[].neighbors` (absolute preview paths) | 680 | 1% |
| everything else | ~20,900 | 40% |

`slides[].issues` and `report.issues` are the same 229 objects. A model that
reads both pays twice, in the same round.

### Writing — one build script

| Script | Lines | ~Output tokens |
|---|---:|---:|
| `rcpai-sso-proposal.mjs` (17 slides) | 1,443 | 19,133 |
| `rcpai-sso-b2.mjs` (23 slides) | 1,805 | 25,444 |

Split by what the tokens buy:

| Part | proposal | detailed | Share |
|---|---:|---:|---:|
| **Content** — the claims and prose the deck exists to say | 10,700 | 13,425 | **55%** |
| **Mechanics** — coordinates, style objects, plumbing | 6,278 | 8,908 | **33%** |
| **Scaffolding** — design tokens, type scale, theme inverter, primitives | 2,155 | 3,110 | **12%** |

The 55% is irreducible and should be. That is the deck. The other 45% is
re-derivation.

---

## Six findings

### 1. The issue list is 78% of the report, and 86% of it is `info`

221 issues, five distinct codes:

| Code | Count | Severity |
|---|---:|---|
| `autofit-below-scale` | 100 | info |
| `font-below-scale` | 91 | info |
| `repeated-silhouette` | 19 | warning |
| `render-text-unexpected` | 8 | info |
| `type-off-scale` | 3 | info |

The `message` field alone is 6,943 tokens — the same two sentences re-serialized
with one substituted element name, ninety-one and one hundred times. `details`
is a further 3,558 tokens carrying, in most cases, two integers.

One element — `chrome.num`, the decorative slide number that appears on every
slide **by design** — accounts for 32 issues.

This was invisible in the 0.13 baseline because that baseline was measured on a
fixture asserted to have `issueCount < 8`.

### 2. Two checks are reporting non-events

- **90 of the 100 `autofit-below-scale` issues have
  `declaredFontSize === effectiveFontSize`.** The message says the text "fits
  only after autofit shrinks it from 12pt to 12pt". No shrink occurred. ~7,000
  tokens of a check firing on the absence of the thing it detects.
- **`repeated-silhouette` fired 19 times.** `NEAR_DUPLICATE_THRESHOLD` is `0.93`,
  but the *minimum* observed pairwise similarity among reported twins is
  `0.9815`, median `0.9883`. The cosine in `visual-signature.ts:214` runs over an
  all-positive feature vector, so it saturates near 1.0 and has almost no dynamic
  range on a real deck. A 0.93 cut against a distribution living in [0.98, 1.0]
  is not a threshold.

### 3. The CLI never received 0.13

`src/mcp-server.ts:46` is explicit: *"Indentation was costing roughly 40% of
every packet […] The one place it is kept is nowhere."*

But `src/cli.ts` writes `JSON.stringify(result, null, 2)` in all sixteen of its
output paths, and every `report.json`, `packet.json`, and metadata file on disk
is pretty-printed:

| File | Pretty | Compact | Saving |
|---|---:|---:|---:|
| `report-final.json` | 27,862 | 20,355 | **27%** |
| `packet-final.json` | 52,972 | 34,871 | **34%** |

`TokenAccount` is instantiated only in `mcp-server.ts`, so the CLI has no
`tokenBudget` either. SKILL.md names the build-script CLI path "the recommended
path and the cheapest one" — so the recommended path is the one that never got
the release that made things cheap.

### 4. The budget gates are guarding the wrong deck

`tests/unit/token-budget.test.ts:227` caps a twelve-slide packet at **4,000
tokens**, and asserts three lines above that the fixture is healthy so a flood of
findings would not "pollute" the measurement.

That is backwards for a cost gate. The fixture is healthy, so the ceiling never
exercises the field that dominates. The real packet is **52,819 tokens — 13× the
ceiling watching it — and CI is green.** There is no ceiling on `report.json` at
all.

### 5. Two decks invented the same vocabulary, and no diff can see it

The two scripts were written days apart for the same project. Their top-level
helpers:

| `rcpai-sso-proposal.mjs` | `rcpai-sso-b2.mjs` | Same concept? |
|---|---|:-:|
| `T(brand)` | `T(brand)` | ✅ theme inverter |
| `stack(...)` | `stack(...)` | ✅ measured vertical flow |
| `card(...)` | `panel(...)` | ✅ rounded container |
| `bar(...)` | `rail(...)` | ✅ accent stripe |
| `chip(...)` | `chip(...)` | ✅ pill label |
| `node(...)` | `node(...)` | ✅ diagram box |
| `boundary(...)` | `boundary(...)` | ✅ named enclosure |
| `heading(...)` | `heading(...)` | ✅ title + lead, returns baseline |

**Eight of eleven concepts recur. Only 57 lines — 798 tokens — are
byte-identical.** The model copied nothing; it re-derived each one under a new
name with a different signature. Conceptual overlap near-total, textual overlap
4%.

The shipped layout helpers are the wrong half of the problem. `columns`, `rows`,
`grid`, `inset`, `split`, `distribute` all answer *"divide this frame into n"*.
The scripts call `columns` 7 and 9 times, `grid` twice each — then hand-compute
**132 and 138 coordinate expressions**. The function both decks wrote from
scratch is **flow**: measure a block, place it, advance the cursor, return the
new baseline. Flow is the one layout primitive the API does not have and the one
every slide needs.

### 6. A primitive would have been cheaper than 0.14's newest check

0.14.0 shipped `rounded-corner-overhang` — a new check, three new
`ElementRecord` fields, an OOXML preset-geometry reader in the inspector, and a
guide amendment — because *"a card built the way every deck builds one — a
rounded panel with a coloured bar laid flush along its edge"* leaves a square
corner poking past the curve.

`bar()` in `rcpai-sso-proposal.mjs:81`:

```js
function bar(s, id, f, color, w = 0.07) {
  return s.shape(id, "rect", {
    x: f.x, y: f.y + RADIUS, h: f.h - RADIUS * 2, w,
```

The inset is there. The model derived the fix by hand, correctly, because the
card-plus-bar pairing is not something the toolkit provides — it is something
every deck rebuilds.

**A `card({ accent })` primitive makes the defect unrepresentable.** The check
finds it after a build, a render, and a review round. The primitive prevents it
for zero tokens. This generalises: **every `fixable: false` prose warning in the
report is a design the toolkit declined to encode.**

### Smaller measured waste

- `report.quality` is byte-identical to `report.heuristics`
  (`types/index.ts:1044`, `@deprecated since contract 0.10`). 256 tokens, every
  report.
- 9 of 17 `fidelity.slides` rows are all-clear — five empty arrays each, emitted
  to say nothing happened.
- The absolute project path appears 49 times in one packet and 19 in one report,
  mostly in `neighbors.previous` / `neighbors.next`, which are `slide-(n±1).png`
  and derivable.

---

## Workstreams

### A. Stop reporting non-events — `P0`

A signal-quality fix that happens to be a token fix. **This ships before the
compression in B**, because compressing a list that is 86% noise produces a
compact, cheap, still-useless report — and makes the noise permanent by making
it affordable.

- `V015-01` — `autofit-below-scale` fires only when
  `effectiveFontSize < declaredFontSize`. 90 issues, ~7,000 tokens, and a message
  that contradicts itself, removed by one comparison.
- `V015-02` — Recalibrate `repeatedSilhouettes`. Cosine over an all-positive
  vector cannot discriminate; centre the feature vector, or flag outliers against
  the deck's *own* similarity distribution (top-k, or > 2σ above the deck median)
  rather than an absolute constant. Publish the distribution in the packet so the
  number is auditable.
- `V015-03` — Exempt `role: "decorative"` from `font-below-scale`. A slide number
  is meant to be small; 32 issues on `chrome.num` is the check disagreeing with a
  decision the contract explicitly lets the author make.
- `V015-04` — Omit all-clear `fidelity.slides` rows; report findings plus a
  `checked: 17` count.

Target: 221 issues → ~40, none of them known non-events.

### B. Say each finding once — `P0`

Group `issues` by `code`: the message template and severity once per code, then
one compact row per occurrence carrying only what differs.

Modelled against the real report, after A:

| Representation | ~Tokens |
|---|---:|
| Today, 221 issues, pretty | 21,653 |
| Grouped, 131 issues, pretty | 3,234 |
| Grouped, 131 issues, compact | **1,374** |

**94% smaller with every occurrence still individually named.** Nothing is
summarised away — the model still sees that `hd` on slide 3 is 28pt against a
32pt minimum. What it stops paying for is being told the general rule 91 times.

- `V015-05` — `IssueGroup`: `{code, severity, fixable, message, count, where[]}`,
  where rows are `{slide, element?, ...delta}`.
- `V015-06` — Flat array remains under `--issues flat` for existing tooling.
  Grouped is the default.
- `V015-07` — The packet stops copying issue bodies. `slides[].issues` becomes
  `{code, count}` pointers into the report's groups, plus full bodies for `error`
  and `warning` only. `detail: "full"` restores everything.
- `V015-08` — Collapse `where[]` further when one element repeats across slides:
  `chrome.num` on 16 slides is one row, not sixteen.

### C. Give the CLI the release it missed — `P0`

- `V015-09` — One `emit()` in `cli.ts`, compact by default, `--pretty` for a
  human at a terminal. Applies to stdout and to every `--report`, `--output`, and
  metadata file. **27–34% off every artifact on disk.**
- `V015-10` — `tokenBudget` on CLI results. `TokenAccount` moves out of
  `mcp-server.ts`; a `--budget` line on stderr costs nothing and makes the price
  list visible on the recommended path.
- `V015-11` — Relative paths inside the packet, resolved against
  `artifacts.root` (which `artifacts.previews[]` already does correctly). Drop
  `neighbors` — `slide-(n±1).png` is derivable and documented as such.

### D. Catch it before the render — `P0`

The loop is author → build → render → review → patch. Every defect surviving to
`review` costs a build, a LibreOffice render, a contact sheet, and a full round
of evidence. The build script runs in-process; most geometry defects are knowable
the moment the element is declared.

- `V015-12` — `slide-agent build --check` — geometry, contrast, and scale checks
  with **no render and no `.pptx` write**. Near-instant, near-free, runnable as
  often as the model likes while authoring.
- `V015-13` — **Throw at the call site.** Under `--strict`, `defineDeck`
  validates on declaration, so an overflow reports as
  `deck.mjs:412 — "hd" overflows its 4.45in frame at 32pt` rather than as an
  issue in a JSON report read three steps later. A stack trace is a better error
  message than a validation report and costs nothing to read.
- `V015-14` — **`suggestedEdit` on every fixable issue.** Today an issue is prose
  plus `fixable: false`, so the model must author the fix. An issue carrying
  `{element, property, from, to}` is one the model applies.

### E. Ship the vocabulary two decks agreed on — `P0`

Not a house style and not a layout registry: a standard library of the primitives
both decks invented, importable, overridable, taking a theme the deck still
authors.

- `V015-15` — **`flow(frame, blocks)`** — the missing primitive. Measures each
  block, places it, returns the new baseline. Replaces the hand-written `stack()`
  in every deck and most of the 132 hand-computed coordinates. **Build this
  first**; everything else in E composes with it.
- `V015-16` — **`card(frame, { accent, radius })`** — rounded container with an
  optional edge accent, inset by the radius. Retires `rounded-corner-overhang` as
  a defect class for decks that use it.
- `V015-17` — **`chip`, `node`, `boundary`, `heading`, `marker`** — the rest of
  the recurring set. Each returns its own frame so it composes with `flow`.
- `V015-18` — **`theme(palette, { inverted })`** — the `T(brand)` inverter both
  decks wrote. Takes the deck's own colours; the light/dark *role mapping* is
  what ships, not the colours.
- `V015-19` — Every primitive is `role`-tagged correctly by construction.

Projected: the full 12% scaffolding, plus roughly a third of mechanics.

### F. Scaffold on disk, not in the guide — `P1`

- `V015-20` — `slide-agent scaffold --format 16:9 --out deck.mjs` writes a
  working skeleton: imports, an empty token block with named slots, a type scale,
  margins, one worked slide. The model **edits values** rather than authoring
  structure — zero read tokens and zero write tokens for the part that is the
  same every time.
- `V015-21` — The `build-script` guide section (1,580 tokens, second-largest)
  shrinks to a pointer at the scaffold plus the rules that are genuinely prose.
  The worked card example moves into the scaffold, where it is executable and
  gets tested.
- `V015-22` — `slide-agent snippet <name>` — `timeline`, `comparison-2col`,
  `metric-row`, `swimlane`, `quote`, `stat-callout`. Tested code for one
  composition: ~200 tokens read against ~600 authored, and it renders correctly
  first time.
- `V015-23` — Ship 3–4 complete exemplar scripts as first-class artifacts. A
  model reading one 2,000-token working deck learns more about composition than
  1,580 tokens describing it, and can lift structure directly. Show-don't-tell is
  also the cheaper of the two.

### G. The second round, and the second deck, should cost less than the first — `P1`

This project ran five review rounds at full price, and its sibling deck retyped
the first one's vocabulary from memory.

- `V015-24` — `review --since <packet.json>`. A delta packet: slides whose
  manifest hash changed, issues that appeared or cleared, and a one-line roll-up
  of what did not. Estimated 3,000–5,000 tokens against 52,819.
- `V015-25` — `build`/`revise`/`patch` write the report beside the previous one
  and emit only the diff to stdout when a previous report exists.
- `V015-26` — `slide-agent kit extract --script deck.mjs --out kit.mjs` lifts the
  primitives and token block out of a finished deck into an importable module.
  Deck two starts with `import { card, flow, T } from "./kit.mjs"` and writes
  content only.
- `V015-27` — `slide-agent kit --from deck.pptx --out brand.json` recovers palette
  and type scale from a built deck. `--brand` already accepts a `.potx`; it
  should accept a deck the toolkit itself built.
- `V015-28` — Scaffold and exemplars separate `const CONTENT = {...}` from the
  layout functions consuming it, so revising wording is an edit to a data literal
  — dozens of output tokens instead of hundreds.
- `V015-29` — `build --script deck.mjs --only 9` rebuilds and re-renders one
  slide against the existing package. With `--check`, a sub-second author loop.
- `V015-30` — Retire `report.quality`. The deprecation window opened at contract
  0.10; 0.12 is the bump that closes it.

### H. Gates that would have caught this — `P0`

- `V015-31` — Every budget ceiling gains a second fixture: a **defective**
  seventeen-slide deck with ≥100 issues. The healthy-deck ceiling stays; it
  measures a different thing and should say so.
- `V015-32` — A ceiling on `report.json` (proposed: 8,000 tokens at 17 slides).
  There has never been one.
- `V015-33` — An `issues` ceiling expressed **per distinct code**, not per issue.
  This is the invariant that matters: adding the 500th occurrence of a known code
  must not cost what adding the 5th code costs.
- `V015-34` — A ceiling on **authored output**: an exemplar deck's script, in
  tokens. Nothing has ever measured what the model writes.
- `V015-35` — CI check that no `JSON.stringify(x, null, 2)` reaches a file or
  stdout path outside an explicitly human-facing formatter.

### I. Beyond tokens — `P2`

- `V015-36` — **`chrome.num` is a symptom.** Elements stamped on every slide are
  structurally different from slide content, and every deck-wide check treats
  them as seventeen separate decisions. A `chrome` role that checks run against
  *once* fixes the noise at its source rather than exempting it per-check.
- `V015-37` — **`reviewQuestions` are generated per slide** (1,486 tokens,
  templated from `plan`). The deck-level questions are the ones a contact sheet
  can answer. Emit those always, per-slide ones only for slides with findings.
- `V015-38` — **Issue provenance.** No issue records which check version produced
  it, so a re-review cannot distinguish "this cleared because you fixed it" from
  "this cleared because the check changed". Required before `--since` can be
  trusted.
- `V015-39` — **`readinessReasons` is 181 tokens of prose that never names a
  slide.** Round-trip and readiness are per-deck booleans in a per-slide world.

---

## Where the two halves meet

The reason these ship together rather than as two releases. Each pair is worth
more than the sum.

| Reading side | Writing side | Together |
|---|---|---|
| B — grouped issues | D — `suggestedEdit` | A grouped issue with edits attached is a **patch set**, not a reading assignment |
| A `V015-03` — exempt `decorative` | E `V015-19` — role-tagged by construction | The exemption becomes correct rather than heuristic, because the role is now reliable |
| Issue code `rounded-corner-overhang` | E `V015-16` — `card({ accent })` | **One primitive retires one check.** Fewer codes, fewer issues, less to read |
| G — delta packets | D — `--check` | `--check` makes rounds rarer; deltas make each one cheaper. The savings multiply |
| Guide section `build-script`, 1,580 tokens | F — scaffold and exemplars | The prose shrinks because the example is now executable and on disk |

The through-line: **an issue the model has to read is a design the toolkit
declined to encode.** Everything on the writing side reduces the reading side's
workload at its source, and the reading side's grouping is what makes the
remainder actionable.

---

## Projected result

Estimates, on the same seventeen-slide deck, using the measured field sizes
above.

### Reading

| Surface | 0.14.0 | 0.15.0 | Change |
|---|---:|---:|---:|
| `report.json`, first round | 27,785 | ~5,900 | **−79%** |
| `packet.json`, first round | 52,819 | ~21,000 | **−60%** |
| One full round, both read | 80,604 | ~27,000 | **−67%** |
| Each later round, delta mode | 80,604 | ~10,000 | **−88%** |

### Writing

| Part | 0.14.0 | 0.15.0 | Change |
|---|---:|---:|---:|
| Scaffolding | 2,155 | ~150 | −93% |
| Mechanics | 6,278 | ~4,000 | −36% |
| Content | 10,700 | 10,700 | — |
| **Total output** | **19,133** | **~12,000** | **−37%** |

### This project, end to end

| | 0.14.0 | 0.15.0, same 5 rounds | 0.15.0, with `--check` |
|---|---:|---:|---:|
| Authoring (output) | 19,133 | ~12,000 | ~12,000 |
| Review evidence (input) | ~403,000 | ~67,000 | ~47,000 |
| **Total** | **~422,000** | **~79,000** | **~59,000** |

Output tokens bill at several times input, so the ~7,000 saved on authoring is
comparable in cash to the entire issue-grouping win — and it compounds, because
each revision round re-emits mechanics too.

The quality claims are the ones worth having:

- The report goes from 221 entries of which 191 are noise, to ~40 of which none
  are known non-events. That is the number deciding whether the next round of
  review is any good.
- One defect class retired per primitive shipped. `rounded-corner-overhang` is
  the proof case.
- Errors move from a JSON report to a stack trace with a line number.
- Deck two starts where deck one finished instead of re-deriving its vocabulary.

---

## Sequencing

| Phase | Work | Gate |
|---|---|---|
| 1 | **A** (non-events) + **H** (gates) | Issue count on the real deck drops 221 → ~40 *before* anything is compressed, so compression is measured against a corrected list |
| 2 | **D** (`--check`, strict throws) | An overflow is reported at the call site, before any render exists |
| 3 | **B** (grouping) | Report ≤ 8,000 tokens; `review-detail.test.ts` proves no occurrence was dropped |
| 4 | **E** (`flow` first, then `card`, then the rest) | A deck built on the kit produces zero `rounded-corner-overhang` and zero hand-computed accent insets |
| 5 | **C** (CLI parity) | No pretty-printed file leaves the CLI; `tokenBudget` present on both paths |
| 6 | **F** (scaffold, snippets, guide shrink) | `build-script` section under 900 tokens; scaffold renders clean unedited |
| 7 | **G** (deltas, kit extraction, `--only`) | Round 2 costs < 25% of round 1; a wording change costs < 100 output tokens |
| 8 | **I** + contract 0.12 published with the `quality` removal | — |

Two orderings are load-bearing:

1. **A before B.** Compressing noise makes the noise affordable, and therefore
   permanent.
2. **`flow` before the rest of E.** It is the primitive both decks invented, it
   absorbs the largest share of hand-computed coordinates, and every other
   primitive composes with it.

---

## The line not to cross

SKILL.md: *"The toolkit's `config/` files and built-in layouts are prompt-only
fallbacks. They are drafts, not a design system, and matching them is not a
goal."*

Workstreams E and F ship **mechanics only** — how to stack, how to inset an
accent, how to invert a role mapping. Never proportion, colour, type, or
composition. `flow` knows how to stack; it must not know what the gap should be.

If a reviewer can look at two decks built on the kit and tell they used the same
toolkit, the kit has overreached, and the release has made the product worse in
exchange for tokens it should not have bought.
