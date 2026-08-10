# 3. Portable asset package and artifact graph

**Status:** accepted, 0.11.0

## Context

Two failures that both reported success.

The emitted scene referenced images by the author's absolute path. Moving the
delivery directory, or handing it to anyone else, broke every rebuild — and
nothing said so, because the original build had the files.

The validation report named its previews by path. A preview left over from the
revision before last satisfied "the preview exists", so a report could describe
one deck while the images beside it showed another.

## Decision

**Content addressing for assets.** Every embedded asset is copied into
`artifacts/<deck>/assets/<sha256>.<ext>`, and the emitted scene references it
*relative to the scene's own directory*. The same picture used on nine slides
is stored once and cannot be confused with a different picture of the same
name.

**Provenance kept separate from location.** `provenance.source` keeps what the
author wrote. Where the bytes came from is a fact about the deck's honesty and
about somebody's licence; where they now live is a fact about the package.
Collapsing them loses the credit line the moment the file is renamed by hash.

**Hashes for everything derived.** `ArtifactIdentity` records path, SHA-256,
size, and `derivedFrom`. A report states which PPTX its previews were rendered
from, by content.

**A round-trip gate.** `--round-trip` copies only `artifacts/` into a clean
temporary directory, rebuilds the emitted scene from what is in there, and
compares slide count, element ids, geometry, and key properties. Failure is
`packageStatus: fail` regardless of whether the original PPTX opens.

## Consequences

- Packages are larger: assets are duplicated into the delivery. That is the
  cost of a deliverable that works on someone else's machine.
- The canonical files sit under `artifacts/<deck name>/` rather than directly
  under `artifacts/`, because two decks built into one directory would
  otherwise share a `manifest.json` and the second would overwrite the first
  deck's blueprint.
- Older `intermediate_files/` and `logs/` paths are still read when discovering
  an existing package, so a 0.10 deck still validates, revises, and patches.
- `--round-trip` roughly doubles build time. It is off by default and expected
  on any run whose output will be delivered.
