# 6. A composition language, not a layout registry

**Status:** accepted, 1.0.0

## Context

Slides need a way to say "these six cards sit in a row, the fourth is twice the
width, and chevrons run between them" without saying where each card is. V1 had
a fixed layout registry for `kind` slides and raw coordinates for everything
else: the registry was a house style nobody wanted, and the coordinates were
arithmetic the model paid for on every element.

## Decision

`slide-agent.compose/1`: containers (`grid`, `row`, `column`, `layer`, `free`)
and leaves (`text`, `shape`, `image`, `icon`, `chart`, `table`, `diagram`,
`use`, `texture`, `rule`, `space`), each node an object with one kind key, placed
by cell ranges (`"at": "c1-7 r2-6"`) or flex rules, styled by roles and named
tokens.

It borrows CSS grid and flexbox vocabulary deliberately: models are fluent in it.
It stops before geometry — no inches, no per-element colour or size repetition,
no connector routes, no chart or icon geometry. Literals stay legal for a
deliberate exception and are recorded as literals.

`free` placement and `canvas` slides are the escape hatches: art direction that
wants exact overlap keeps working, and V1 canvases import unchanged.

## Consequences

- One language serves the model, components, recipes, and third-party packs, so
  a recipe is only a saved composition — and `expand` hands it back as one.
- Findings can point at a JSON pointer into the author's own document, which is
  what makes errors actionable (`/slides/3/compose/items/1/at: column 14 outside
  a 12-column grid`).
- The language is a gate on the whole plan: if showcase-quality slides cannot be
  expressed in it without `free`, the design has failed and the answer is more
  expressiveness.

## What would make this wrong

Models composing worse in it than in inches, or needing `free` for ordinary
work. Both are measurable, and both are reasons to extend the language.
