# 8. Automatic fitting stops where design begins

**Status:** accepted, 1.0.0

## Context

Text that does not fit is the most common defect in generated decks, and the
most expensive to fix by looking. But "make it fit" is not one decision: sizing
a heading down one step preserves the design; widening a region, switching a
recipe, or splitting a slide changes it.

## Decision

A ladder with an explicit line through it:

1. Measure at the authored size.
2. Reflow within the flexibility the composition declared.
3. Balance line breaks.
4. Size down within the node's `fit.minStep` (default one step, never below the
   role's legibility floor) — automatic, and **reported as an adjustment**.
5. Structural change — widen the region, switch variant, split — **returned as a
   choice** with options and their effects.
6. Shorten copy — returned as a suggested edit with an exact character budget.
7. Residual — `needs-attention`, with the budget and the choices.

Steps 1–4 run automatically in every mode. Steps 5–6 are automatic only in draft
mode, template-fill, or when the author sets `direction.fit: "auto"`.

Every adjustment is refusable: pin the value and the engine keeps it. A pin that
refuses a hard constraint (contrast, a legibility floor, bounds) becomes a
blocking finding rather than a silent repair.

## Consequences

- The writer emits autofit that matches what was measured, so PowerPoint does not
  re-decide what the engine already decided.
- A model never has to hunt overflow in a render; it answers a choice or a
  character budget.
- Fit steps are recorded per element, so `explain` can say exactly what happened.

## What would make this wrong

If measurement drifts from PowerPoint's own line breaking, the choices are
wrong. That is why measurement uses the real font files and why preview-versus-
render divergence is checked.
