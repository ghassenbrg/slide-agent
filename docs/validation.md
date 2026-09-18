# Validation, readiness, and heuristics

Two different questions, deliberately kept apart: whether the file is sound, and
whether the deck is any good. The engine answers the first and refuses to
pretend it can answer the second.

---

# 1.x: readiness, adjustments, and choices

## Three things a verdict carries, and they are not the same

**`state`** is mechanical. It is decided by checks, not by opinion:

| State | Means |
|---|---|
| `broken` | The package itself is unsound — a part failed the ECMA-376 schemas, or the writer could not finish. Nothing else matters until this is fixed. |
| `needs-attention` | A blocking finding, or a `suggestedEdit` you have not answered. The file opens; something in it is wrong or undecided. |
| `ready-unrendered` | Sound, checked, and not yet put through a real render. |
| `ready` | The same, plus a fidelity render that agrees with the scene. |

**`designReview`** is separate and never changes `state`:

| Value | Means |
|---|---|
| `none` | Nobody has looked. This is the default and it stays the default. |
| `host` | The host model reviewed the previews. |
| `critic` | The engine-managed design critic reviewed them. |

A deck can be `ready` with `designReview: "none"` — that is the normal case for
a directed deck, and it is honest. Nothing in Slide Agent will set
`designReview` for you, and no value of it will ever make a deck `ready`.

**`adjustments`** are changes the engine made to *your* decisions. They are
reported, grouped by kind, with the elements they touched:

```json
{ "kind": "type-step", "count": 2, "where": ["route/text5", "route/text25"] }
```

If you disagree, pin it — `{"level": "element", "slide": "route",
"element": "text5", "set": {"refuse": "type-step"}}` — and the engine will find
another way or report a residual instead. Contrast is the one exception: it is a
hard constraint, and a refused contrast repair is reported as
`contrast-pinned` rather than applied. See
[ADR 0008](adr/0008-fit-ladder-and-adjustments.md).

**`suggestedEdits`** are the decisions the engine declined to make. Widening a
region, splitting a slide, or choosing which sentence to cut all change the
design, so they come back as options with their effects, plus an exact character
budget where shortening is one of them. Answer with
`{"level": "intent", "op": "choose", "edit": "<id>", "option": 1}`.

## The fit ladder

Text that does not fit is not a warning; it is a sequence of steps, and the
verdict says which ones ran.

1. **Measure** against the real font file — advance widths from `hmtx`, not a
   per-class estimate.
2. **Reflow** within the region the composition gave it.
3. **Balance** a headline so the last line is not one orphaned word.
4. **Size down**, within the limit your type scale allows. Automatic, and
   reported as a `type-step` adjustment.
5. **Offer a structural choice** — a wider region, a split, a different
   component. Never taken automatically.
6. **Suggest a shortened edit**, with the character budget that would fit.
7. **Report the residual.** If nothing above worked, `text-overflow` says so.
   Text is never quietly clipped and never quietly shrunk past the floor.

## The tiers

| Tier | Asks | Codes |
|---|---|---|
| **T0** Schema and references | Is the intent well-formed, and does everything it names exist? | `intent-invalid`, `design-invalid`, `component-cycle`, `recipe-unknown`, `recipe-slot-missing`, `color-role-unknown`, `color-data-unknown`, `surface-color-unknown`, `image-unavailable`, `alt-missing`, `margin-too-large`, `slide-id-duplicate`, `preset-unknown`, `brand-unavailable`; `adjust-no-match` and `brand-locked` at major, `pin-unmatched` and `recipe-slot-unknown` at minor |
| **T1** Construction | Did the engine build what was asked, and what did it have to change? | `text-overflow`, `contrast-pinned`, `adjustment-refused`; `font-unavailable` and `font-not-embeddable` at major; `font-substitute-measured`, `font-measured-by-table`, `data-colors-close` at minor |
| **T2** Package | Is the OOXML valid, and does the deck rebuild? | `xsd-invalid`, `round-trip-mismatch` — **the only findings that make a deck `broken`**; `link-refused` at major, `literal-colors` at minor |
| **T3** Geometry | Does it physically work on the slide? | `collision` (blocking between two text elements, major otherwise), `connector-through-node` at minor |
| **T4** Content | Is the content finished and consistent? | `placeholder-text`, `slide-empty`; `slide-duplicate` and `number-inconsistent` at major; `headline-is-topic`, `slide-no-title` at minor |
| **T5** Fidelity | Does the render match the scene? | `text-lost-in-render`, `render-missing-pages`; `fidelity-unavailable`, `render-font-note` at minor |
| **T6** Design | Is it any good? | Nothing. It never blocks, and it is recorded in `designReview`, never in `state`. |

T0–T2 are facts. T3 is geometry the engine computed and can defend. T4 mixes
facts (a placeholder is a placeholder) with heuristics (`headline-is-topic`,
`slide-duplicate`), and the heuristic ones ship at `minor` or `major` precisely
because nobody has calibrated them against a corpus — none of them blocks on a
number nobody has measured. T5 depends on LibreOffice being present; without it
`fidelity-unavailable` says so rather than passing silently.

Note where overflow sits: `text-overflow` is T1, not T3. It is not a geometric
surprise — it is the fit ladder reporting that it ran out of moves it was
allowed to make on its own.

## Rhythm

`rhythm` reports pairs of slides whose compositions are near-identical, scored
by cosine similarity over a centred 12×7 occupancy signature. It is the template
test: a deck that says the same shape six times is a deck nobody designed. It is
advisory, and it names the pair and the score so you can disagree.

## Authoring provenance

`authoring` counts how much of the deck you actually directed:

```json
{ "composed": 3, "recipe": 1, "draft": 0, "canvas": 0, "design": "authored" }
```

`recipe` and `draft` above zero mean the engine supplied composition you did
not. `design` says where the design language came from — `authored`, `brand`,
`preset`, or `tokens`. This is in every verdict on purpose: a cheap deck should
be visibly a cheap deck. See [ADR 0007](adr/0007-opt-in-vocabulary.md).

## What `finalize` adds

`finalize` runs the fidelity render, then rebuilds the deck from its own
`intent.json` in a clean temporary directory and compares the bytes. A mismatch
is `round-trip-mismatch` and means the deck will not rebuild on anyone else's
machine. Builds are byte-identical under a pinned `SOURCE_DATE_EPOCH`; without
one, timestamps differ and the comparison is structural.

## Why a slide looks that way

```bash
slide-agent explain --deck out/ --slide evidence --element headline
```

Provenance (which composition node, which component instance, which recipe), the
fit steps that ran, the adjustments applied, and the choices still open.

---

# 0.x: validation, readiness, and heuristics

The rest of this page describes the 0.x engine, which still builds scenes,
outlines, and build scripts unchanged.

Two different questions, deliberately kept apart.

**Validation** asks whether the file is sound: will it open, is it legible, is
anything off the slide. Failures are defects.

**Quality** asks whether the deck is worth showing. It is advisory. A deck can
be perfectly valid and still not worth presenting.

## Two verdicts

`packageStatus` answers *does this file hold together* — schema, parts,
relationships, packaged assets, render freshness, and the clean-directory
round-trip.

`presentationReadiness` answers *would you put this in front of the audience*.
It combines blocking presentation defects, render text fidelity, unresolved
claims, visual-review findings, per-dimension heuristic floors, and whether a
true render exists at all. `readinessReasons` lists what decided it, in order.

Readiness is deliberately not a weighted average. One critical dimension —
text that did not survive the render, a missing packaged asset, a failed
round-trip, an unresolved blocking finding — blocks readiness however good
everything else is.

`status` is retained for contract 0.9 readers and documented as
package-oriented.

## Validation layers

1. The generation manifest — semantic content and exact authoring geometry.
2. The PPTX package — required parts, relationships, content types.
3. Every XML part against the bundled official ECMA-376 schemas, offline.
4. OOXML inspection when no manifest is available.
5. Accessibility: alt text, reading order, contrast, type size.
6. Optional rendering, then preview count and file checks. Without LibreOffice
   this falls back to schematic drawings, reported as `render.mode:
   "schematic"` — they check geometry, not fidelity.

## How text is measured

Overflow, autofit, and layout box sizing all come from one measurement: per
character, per family, and per script. A word set in Arial Black is measured
wider than the same word in Arial Narrow; a paragraph of Japanese breaks
between characters rather than counting as one unbreakable word; line spacing
comes from the face rather than from a constant.

The tables are embedded rather than read from the machine's installed fonts, so
a deck reaches the same verdict on a laptop and in CI. Whether a font is
actually installed is a separate, advisory question — `slide-agent fonts`.

An unknown family still measures: it is classified by name and priced against
its class, because the project asks models to choose fonts freely and refusing
to measure one would silently switch off overflow detection for that slide.

## What a manifest cannot tell you

Validation is strongest when the build manifest is available, because that is
where the author's intent lives — deliberate overlap, element roles, alt text.
A deck recovered from OOXML alone (an edited deck, or one someone handed you)
has none of that, so checks that depend on intent soften: two overlapping
shapes become a warning rather than an error, since the package has no channel
in which the author could have declared the overlap deliberate.

Reports say which kind of manifest they used.

## Repair modes

The default for a model-authored canvas is **`suggest`**: the engine reports
exactly what it would change, from what, to what, and whether that replaces a
value the author set — and changes nothing. Model-authored values are source
material, not the engine's to overwrite.

- `suggest` — report in `suggestedRepairs`, change nothing. Default on a canvas.
- `safe` — apply, record each repair with its rollback value in
  `appliedRepairs`, and roll the whole run back and rebuild as authored if the
  render's text gets worse.
- `off` — do nothing. `autoFix: false` is equivalent.

Prompt-only drafts default to `safe`: nobody designed them, so there is nothing
to preserve.

## The repair loop

Issues carry `fixable`. The loop repairs what it can, rebuilds, and stops as
soon as a pass changes nothing. It repairs fixable *warnings* too, not only
failures — leaving a repairable defect in a deck is a worse outcome than one
more pass.

An error the fixer provably cannot repair is downgraded to a warning carrying
`unfixedReason` and the remedy, so you get an actionable deck rather than a
hard failure you cannot act on. Errors that a retry could still fix stay
errors.

## Accessibility

- **Alt text** is required on images and charts. Mark genuine decoration with
  `role: "decorative"` to exempt it. Alt text naming the medium ("Chart
  showing…") is flagged separately.
- **Reading order** is checked within a column. Multi-column layouts are
  legitimately read column by column, so cross-column comparisons are not
  reported.
- **Contrast**: 4.5:1 for body text, 3:1 at 18pt or 14pt bold. `AAA` mode
  raises those to 7:1 and 4.5:1.
- **Text-free slides** are flagged: they are invisible to a screen reader.

## Render text fidelity

A scene that validates says what the author intended. The render says what the
audience will see, and only the second can catch a title that autofit shrank
until its last word fell off, a footnote left behind after its sentence was
deleted, or a word broken by a wrap nobody saw.

The rendered PDF's own text layer is read where Poppler is installed — exact,
not recognised. Where only Tesseract is available, OCR is used and reported as
`confidence: "medium"`; a mismatch read by OCR produces `review`, never a
fabricated pass or a fabricated defect.

`fidelity.slides[]` reports `missing`, `truncated`, `splitWords`, `repeated`,
and `unexpected` per slide.

## Artifact identity

Every file a report describes is bound by SHA-256, with what it was derived
from. A preview left over from an earlier revision cannot pass as evidence,
because its hash no longer matches the one the report recorded.

`--round-trip` copies the package's `artifacts/` into a clean temporary
directory, rebuilds the emitted scene using only what is in there, and compares
slide count, element ids, geometry, and key properties. If that fails, the
package will not rebuild on anyone else's machine either, and `packageStatus`
is `fail`.

## Heuristics, named as such

`report.heuristics` (also emitted as `quality` for 0.9 readers) are proxies for
design qualities, not measurements of them. `hierarchy` counts type sizes; it
cannot see hierarchy. Calling them a quality score implied the engine had judged
the design, which it had not and cannot.

- **density** counts the union of element areas, not the sum, so a full-bleed
  photograph with a caption over it does not report as 130% covered.
- **variety** measures geometry — occupancy, dominant mass, whitespace topology,
  reading path, and slide-to-slide rhythm — rather than counting element types.
- **evidence** requires a declared relationship: a chart or table, an image with
  alt text, a diagram of at least three related nodes, or an element the claim
  ledger points at.
- **bands have per-dimension floors.** Clean typography cannot disguise
  unreadable contrast.

## Quality dimensions

| Dimension | What it measures |
|---|---|
| `hierarchy` | Distinct type sizes per slide. One means nothing is emphasised; six means nothing is. |
| `contrast` | Average and worst text contrast across the deck |
| `density` | Slide-area coverage. 30–65% is the comfortable band. |
| `variety` | Distinct slide silhouettes across the sequence — the template test |
| `evidence` | Substantive slides showing a chart, table, image, or diagram, minus placeholders |
| `accessibility` | Accessibility issues per slide |

Bands: `strong` ≥ 78, `workable` ≥ 58, otherwise `weak`. A deck where 30% or
more of slides still contain `[placeholders]` is `weak` regardless of score —
clean typography must not disguise unfinished work.

Every dimension reports what it measured, and anything below 70 reports the
single most useful thing to change.

## Custom checks

Register a `QualityCheck` to encode your own standards — brand rules, legal
footers, naming conventions — without forking the validator. See
[api.md](api.md).
