# 5. The model directs; the engine executes

**Status:** accepted, 2.0.0

## Context

V1 gave the model an expressive canvas and asked it to place every element in
inches. That was the right instinct about *who decides* and the wrong unit for
saying it. Measured on a real twelve-slide deck, roughly 5,800 of ~30,000 output
tokens were coordinates and repeated literals, and another ~3,000 went on
patching defects — overflow, collisions, contrast — that a model had to find by
looking at renders. The design decisions themselves were a small share of the
bill, and they were the only part worth paying for.

The obvious way to cut the bill is to give the model a menu: pick a layout, pick
a theme, fill the slots. That is also how every deck starts looking the same,
and it removes the reason to run a frontier model at all.

## Decision

Split the work by a single test: *would two good designers argue about it?*

- **The model decides** message and emphasis, the visual concept, the design
  language (palette, roles, typefaces, scale, space, grid, shape, surfaces,
  texture), the composition of every slide, chart form and what to highlight,
  diagram grammar and node design, and the rhythm of the deck.
- **The engine computes** frames from the composition, text measurement and
  fitting, contrast verification, connector routing, reading order, placeholder
  binding, font resolution and embedding, and the OOXML.

Savings come from arithmetic, repetition, and defect-hunting — never from the
decisions. A slide is written in grid units, roles, and named tokens; a design
language is written once; components are defined once and instantiated.

## Consequences

- The same decisions cost about a quarter of the tokens, and the design budget
  is unchanged.
- The engine may not choose taste on the model's behalf. Where a default is
  unavoidable (an undefined surface, a chart form nobody named) it is recorded
  as a decision in the run record and reported.
- A cheaper path exists (draft mode) but is labelled in every verdict and is
  never the default.
- Quality is gated before cost: a lever that wins on tokens and loses a blind
  comparison against V1 does not become a default.

## What would make this wrong

If models turn out to compose worse in grid units than in inches — if the
language is the bottleneck rather than the arithmetic — the answer is a more
expressive language, more worked examples, and better exploration tools, not
moving decisions into engine defaults.
