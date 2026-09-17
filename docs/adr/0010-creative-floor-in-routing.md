# 10. A creative floor in model routing

**Status:** accepted, 2.0.0

## Context

Engine-managed mode routes tasks to models. The cheapest possible routing puts a
small model everywhere, which is exactly how a tool that exists for design
judgement stops producing any.

## Decision

Judgement tasks — direction, section composition, critique, revision, and
natural-language design edits — run at the profile's tier and may never be
routed below the `balanced` tier, whatever an operator's configuration or a
budget says. Attempting it is a configuration error with a message that names
the draft profile as the honest alternative.

Small models do mechanical language work only: alt text, speaker notes, source
summaries, translation.

When a budget runs short the guard degrades in this order: drop the second
revise pass, then the critic, then stop and report. It never swaps in a smaller
director, and it never silently produces a draft.

## Consequences

- `balanced` costs more than the cheapest possible pipeline, and produces work
  that is worth reviewing.
- Draft mode remains available, explicitly chosen, and labelled.
- Every run record carries the model, prompt version, tokens, and cost of each
  call, so the tier that produced a deck is never a guess.

## What would make this wrong

Evidence from blind comparisons that a smaller model directs as well. The floor
is a claim about capability, and it is measurable.
