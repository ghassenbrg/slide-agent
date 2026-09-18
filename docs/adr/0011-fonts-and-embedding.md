# 11. Any face the engine can measure, embedded by default

**Status:** accepted, 1.0.0

## Context

Typography is a design decision, and V1 limited it in practice: measurement used
per-class tables, so an unusual face was measured as "a sans", and nothing was
embedded — the audience saw whatever their machine had. A typeface the audience
never sees is not really a choice.

## Decision

- Resolve faces from font files: configured directories, the project's own
  `.slide-agent/fonts`, a download cache, then the system's fonts. Measure from
  the file's real advance widths and vertical metrics.
- Metric-compatible substitutes (Carlito for Calibri, Arimo for Arial) are used
  for measurement only, and reported.
- Open-licence families can be fetched on demand from an allowlisted host when
  the operator permits it, hash-recorded in the run record.
- Faces the model chose are subset and embedded by default; Office faces never
  are, because every machine already has them.
- A face that cannot be resolved is a finding with the closest available faces,
  not a silent substitution.

## Consequences

- The deck the audience opens is the deck that was measured.
- Licence bits are honoured: a face whose `fsType` forbids embedding is reported
  rather than embedded, and CFF-outline faces are not embedded at all.
- Embedding is bounded by subsetting to the characters the deck actually uses.

## What would make this wrong

Embedded fonts failing to render in a target application. LibreOffice, which
does not read PowerPoint's EOT embedding without libeot, is a known limitation
and is reported in the verdict rather than hidden.
