# Fallback layout catalog

## Layouts are optional scaffolds

The registry is not a design boundary or a recommended style system. For high-quality new work, let the host model invent the composition and supply `SlideSpec.canvas`; that bypasses the registry completely.

Use a registered layout when speed, deterministic compatibility, or repeated operational output matters more than a bespoke composition. Select it after writing the slide's claim and evidence. Do not force content into a scaffold selected for decoration.

## Included fallbacks

| Layout | Practical fallback use |
| --- | --- |
| `title` | Basic opening |
| `section` | Narrative transition |
| `executive-summary` | Conclusion with a few supporting ideas |
| `text-image` | One argument and one visual |
| `comparison` | Comparable choices or states |
| `timeline` | Ordered milestones |
| `process` | Repeatable steps |
| `architecture` | Small bounded system relationship |
| `table` | Precise lookup |
| `chart` | Standard quantitative relationship |
| `kpi` | A few headline measures |
| `quote` | Authentic quote or labeled principle |
| `roadmap` | Workstreams across phases |
| `closing` | Decision and actions |
| `custom` | Legacy bounded text/shape/image regions |

These layouts inherit the deck's resolved colors and typography, but their spatial structures are intentionally conventional. They exist so prompt-only and backwards-compatible workflows remain useful.

## Model-authored composition

Add `canvas` to render editable elements directly. The slide may use any semantic `kind` and may omit `layout`. See [freeform-canvas.md](freeform-canvas.md).

## Registered integration layouts

Register a renderer with `LayoutRegistry.register(id, renderer)` when an extension needs a reusable programmatic composition. Keep coordinates in inches and use `ElementWriter` so validation receives an element manifest. A later `canvas` on the same slide still takes precedence.

## Technical typography guidance

The default minimums are 50 pt deck title, 32 pt slide title, 22 pt subheading or callout, 16 pt body, and 11 pt caption/label/footer. These are legibility QA thresholds, not a typographic scale or style prescription. Model-authored canvases may vary position, typeface, case, weight, line length, and scale. Shorten copy or expand the composition before using text too small for the viewing context.
