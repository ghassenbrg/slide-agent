# 4. Groups, symbols, and vector editability

**Status:** accepted, 0.11.0

## Context

Authors needed to move a legend, a callout, or a repeated motif as one thing,
and to reuse an assembly across slides without restating its coordinates. The
obvious implementation is a native OOXML group (`p:grpSp`).

The spike found what the roadmap suspected: native grouping survives desktop
Office well and degrades unevenly elsewhere — LibreOffice, Google Slides, and
Keynote's importer each handle nested transforms and grouped text differently.
An editability promise that only holds in one application is not a promise.

Vector artwork has a related problem in the opposite direction. OOXML stores an
SVG as an *enhancement* to a raster blip, so an SVG alone cannot be embedded,
and "this artwork is editable" is true, partly true, or false depending on how
it was authored — which the file cannot tell us.

## Decision

**Logical groups, expanded.** `group` positions children relative to its own
origin and expands them into ordinary native elements. Each child records its
`groupId`, is individually selectable in PowerPoint, is individually addressable
by a patch, and round-trips with its relative transform intact. Slide Agent
emits no `p:grpSp`.

**Author-defined symbols.** A symbol is whatever collection of elements the
deck decided is worth reusing, declared in the scene. `symbol-instance` places
one, with per-instance scale, text, colour, and style overrides, and namespaces
each child's id by the instance so two placements never collide. Slide Agent
ships **no icon vocabulary** — a built-in one would be a house style with extra
steps.

**Declared editability, per element.** `ElementRecord.editability` is one of
`native`, `grouped-native`, `embedded-vector`, `embedded-raster`, or
`generated-native`. Vector artwork carries its own `editable: false |
"partial" | true`, stated by the author, alongside the raster that older
viewers actually draw.

## Consequences

- A group is not a single object in PowerPoint's selection model. Moving one as
  a unit after the fact means selecting its parts, or patching it by group id.
- Symbol instances scale type with the placement, so a symbol at half size
  reads as one design rather than as full-size type in a small box.
- The manifest is more honest and less flattering: it says plainly that a
  photograph is pixels.

## What would make this wrong

Native groups round-tripping reliably across the viewers that matter. The
element type would not change — only what it emits.
