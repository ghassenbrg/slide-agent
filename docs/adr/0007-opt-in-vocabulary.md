# 7. Recipes, presets, and components are opt-in and labelled

**Status:** accepted, 2.0.0

## Context

A library of ready-made slide layouts is the fastest way to make decks cheap and
the fastest way to make them all look alike. But routine slides — agenda,
sources, Q&A — genuinely do not deserve a model's attention, and volume paths
(one deck per account, per week) cannot afford one at all.

## Decision

Ship them, and never apply them on the model's behalf.

- **Recipes** (~40 across 24 families) are saved compositions with named slots.
  A directed deck may use one where a starting point is good enough, adapt it
  with `adjust`, or open it with `expand` and rework the composition.
- **Presets** are generated themes for draft mode and template-fill.
- **Starter components** are examples of the language, not a house style.
- **Draft mode** (`"auto"` slides) lets the engine pick a recipe from the shape
  of the content, with a scored trail in the run record.

Every verdict reports `authoring: {composed, recipe, draft, canvas, design}`, so
a caller always knows how much of a deck was directed and how much was filled.

## Consequences

- Cheap output exists and is honest about being cheap.
- The engine's selection rules run in directed decks only as checks and
  suggestions, never as decisions.
- Recipes are governed like code: fixtures at nominal and maximum content, in
  every format, with no blocking findings, gate every release.

## What would make this wrong

If directed decks started reaching for recipes on slides that matter, the fix is
a better composition language and better examples — not a bigger recipe library.
