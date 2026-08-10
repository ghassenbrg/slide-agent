# 2. Style references and arbitrary variable resolution

**Status:** accepted, 0.11.0

## Context

`CreativeDirection` exposed open prose and a closed token resolver. A model
could describe an intricate material language and still only reach the page
through eleven named colours and three fonts. Any richer system it invented had
to be flattened into per-element literals, repeated on every element, and
unrecoverable afterwards — the deck's design language existed only in the head
of whatever produced it.

The obvious fix — ship a token vocabulary — is a smaller cage. A deck about
tidal charts may need a variable that is a list of depths. Any vocabulary
invented here would be wrong for something.

## Decision

`creativeDirection.visualSystem` holds arbitrary `variables` (general JSON),
arbitrary `styles` (property bags with `basedOn` inheritance), `motifs`, and
`constraints`. Slide Agent reserves **no names** — not `card`, not `premium`,
not `editorial`, not `modern`.

One reference syntax: `{"$var":"name"}`, usable in any style value.
One application order: referenced styles in the order listed, then the
element's own `style` as the final override.

Resolution failures are **errors with the alternatives named**, never silent:

- an unknown style names the styles that do exist;
- an unknown variable names the variables that do exist;
- a cycle names the loop;
- a variable that lands on a property it cannot satisfy names the property, the
  expected shape, and what it actually got.

The reference itself survives on the element, so the emitted scene round-trips
what the author wrote rather than the resolved result.

## Consequences

- Ten arbitrary style names round-trip without renaming or loss.
- The engine validates known property types and passes unknown ones through, so
  the system is checkable without being a whitelist.
- Resolution happens at render time against an unmutated outline. That costs a
  pass per build and buys exact round-trip fidelity.

## Alternatives rejected

- **A fixed token schema** (colors/spacing/type). Smaller cage; wrong for any
  subject whose design language is not made of those three things.
- **Silent fallback on an unknown reference.** A missing style would render as
  an unstyled element, which looks like a design choice and is not.
- **Coercing a mismatched variable.** A number silently read as a colour draws
  something, and what it draws is nobody's decision.
