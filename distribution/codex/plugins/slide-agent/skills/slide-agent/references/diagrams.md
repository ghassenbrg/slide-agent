# Diagram and quantitative visual craft

## Design relationships, not boxes

Start by naming the relationship the audience must understand: sequence, hierarchy, dependency, flow, feedback, transformation, comparison, containment, topology, causality, scale, uncertainty, or time. Then invent a spatial grammar that makes that relationship visible.

Do not begin by selecting a named diagram template. A diagram is successful when its geometry carries the meaning before every label is read.

## Build from native primitives

Use `canvas` shapes, connectors, text, and optional images. The model controls node shape, size, color, position, grouping field, path, arrow behavior, labels, emphasis, and layering. Any PptxGenJS shape name is allowed.

Recommended construction order:

1. Background fields, zones, or containers.
2. Connectors and routes on lower `zIndex` layers.
3. Nodes or symbolic marks.
4. Labels and annotations.
5. Emphasis, legends, and explanatory callouts.

Keep connectors behind nodes. Route edges so they do not cross labels. Prefer direct labels over distant legends. Vary node size or form only when the difference encodes meaning. Reduce decoration until every remaining mark has a job.

## Spatial reasoning patterns

These are relationship prompts, not a finite catalog:

- Sequence: make order and direction unavoidable; encode phases through spacing, scale, or field transitions.
- Hierarchy: establish levels through vertical position, enclosure, or branching; avoid equal boxes for unequal roles.
- Architecture: separate boundaries, trust zones, control planes, data planes, and external actors before drawing flows.
- Process: show transformation, ownership, gates, evidence, or feedback—not merely numbered rectangles.
- Network: use proximity, clustering, and centrality; label only the nodes required for the argument.
- Feedback: make return paths visible and distinguish reinforcing from balancing loops.
- Before/after: use a shared visual grammar so the changed relationships, not cosmetic differences, dominate.
- Layered system: use depth, opacity, or nested fields only when layers have distinct responsibility.

Invent another grammar when the material demands it.

## Complexity management

Decide what the slide must prove and remove relationships that do not support it. If the audience needs a complete technical reference, split the overview from the detail or move the full reference to an appendix.

Use progressive disclosure across slides rather than microscopic labels. Maintain stable visual anchors when a system evolves over several frames. When showing a transition, keep unchanged elements fixed and animate the idea through successive slides even if the file itself has no motion.

## Diagram styling

Derive the diagram language from the deck's creative direction:

- A scientific deck might use measured axes, specimen labels, fine rules, and controlled notation.
- A material transformation story might use layers, folds, compression, and ruptures.
- A technical operations deck might use signal paths, states, checkpoints, and monospace annotations.
- A human journey might use spatial landmarks, handoff moments, evidence fragments, and emotional intensity.

Do not apply these examples as presets. Let content choose the metaphor and let the deck's typography, color scarcity, line character, and shape language keep diagrams coherent with the rest of the story.

## Charts as arguments

Begin with the question answered by the data. Choose the visual encoding from the relationship:

- Position and length for accurate comparisons.
- Slope or line for change and continuity.
- Area only when magnitude accumulation matters and overlap remains legible.
- Part-to-whole only when the whole is meaningful and categories are few.
- Native tables when exact values or mixed text are the evidence.
- A custom editable shape composition when annotation or an unusual relationship matters more than a conventional chart grammar.

Put the takeaway near the evidence. Direct-label important series. Remove redundant legend, border, axis, tick, and grid elements. Highlight the series or interval that proves the claim; mute context rather than coloring everything equally. Preserve honest scales and disclose units, baselines, comparisons, uncertainty, and source notes.

Canvas chart elements accept model-chosen series colors and any PptxGenJS native chart options. The built-in `ChartBuilder` exists for convenience; its defaults do not constrain a model-authored chart.

## Validation review

At full-size render, check:

- Can the relationship be understood within a few seconds?
- Are routes visible without crossing labels or obscuring node boundaries?
- Are layers and groups distinguishable without excessive boxes?
- Does emphasis match importance?
- Are labels readable at presentation distance?
- Are scale, units, source, and uncertainty honest?
- Is the diagram native and editable where practical?

Repair technical defects without flattening the visual into a generic grid.
