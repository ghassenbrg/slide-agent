# 9. Readiness is mechanical; design review is separate and recorded

**Status:** accepted, 1.0.0

## Context

V1 mixed two questions. `presentationReadiness` held a deck at `review` until a
host recorded visual findings, which made a model's look a procedural gate, and
vision passes were spent finding overflow — a defect a measurement can catch for
nothing.

## Decision

Two answers, never merged:

- **`state`** — `broken`, `needs-attention`, `ready-unrendered`, `ready` — comes
  from deterministic tiers T0–T5 with no model involved. It says the deck is
  mechanically sound and says nothing about taste.
- **`designReview`** — `none`, `host`, or `critic` — records who judged the
  design against the brief and concept. It never blocks readiness, and it is part
  of the default directed workflow: build, look at the sheet, decide.

Mechanical checks may not depend on a model; the design review may not be
simulated by a heuristic score.

## Consequences

- A deck nobody looked at cannot be reported as well designed, and a deck that
  fails a heuristic cannot be reported as broken.
- Vision is spent on hierarchy, focus, rhythm, and craft, which is what it is
  good at.
- Panels of designers, not the engine, decide whether V2's output is better;
  a model judge may act as a nightly proxy but never gates alone.

## What would make this wrong

A deterministic check reaching a verdict only a person can reach — or a design
review being turned into a number and then into a gate.
