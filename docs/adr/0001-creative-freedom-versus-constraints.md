# 1. Creative freedom versus deterministic constraints

**Status:** accepted, 0.11.0

## Context

The contract said the AI is the creative director. The implementation did not
behave that way. Unspecified geometry became `sharp`, so every deck that said
nothing about corners got a corner treatment. The fallback design system's type
scale was applied to model-authored canvases as a *defect*, so a bench manual
setting its notes at 11pt was told it was wrong. The repair loop rewrote
authored colours and typefaces to satisfy a contrast metric and reported one
line of prose about it.

None of that was a bug in the sense of a mistake in the code. Each one was a
deliberate default that assumed the engine's taste was better than nothing. On
a canvas somebody designed, that assumption is wrong.

## Decision

The engine may enforce **hard constraints** and may not enforce **preferences**.

Hard constraints, on every deck:

- package integrity and ECMA-376 conformance;
- elements inside the slide, unless the author declares `allowBleed`;
- text that survives to the render;
- WCAG contrast against what a reader actually sees, translucency included;
- a 9pt absolute legibility floor;
- alt text on every non-decorative image and chart;
- truthfulness: declared provenance, cited sources, unverified claims marked.

Preferences, which the engine reports and never applies to a model-authored
canvas:

- the fallback type scale;
- corner radius, stroke weight, spacing rhythm, and density;
- palette and typeface choices;
- composition, silhouette, and reading path.

Concretely: an omitted `geometry` resolves to `authored` and contributes
nothing. Between the 9pt floor and the fallback scale, a canvas gets
`font-below-scale` as `info`, not a defect. Autofit is measured against the 9pt
floor rather than the fallback scale. Repairs default to `suggest` on a canvas.

## Consequences

- Some decks that used to report `pass` now report `review`, because the engine
  stopped quietly fixing them. That is the intended outcome, not a regression.
- A prompt-only draft still repairs itself under `safe`: nobody designed it, so
  there is nothing to preserve. The decision is per slide, not per deck.
- The engine can no longer guarantee a deck "looks fine". It guarantees the
  file holds together and reports what it would change. `presentationReadiness`
  exists because those became different answers.

## What would make this wrong

Evidence that hosts systematically ship decks with defects the engine could
have fixed and they did not read the suggestions. The response would be better
surfacing, not a return to silent repair.
