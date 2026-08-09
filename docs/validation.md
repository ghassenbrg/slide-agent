# Validation and quality

Two different questions, deliberately kept apart.

**Validation** asks whether the file is sound: will it open, is it legible, is
anything off the slide. Failures are defects.

**Quality** asks whether the deck is worth showing. It is advisory. A deck can
be perfectly valid and still not worth presenting.

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
