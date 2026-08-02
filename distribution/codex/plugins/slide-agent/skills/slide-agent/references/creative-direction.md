# Creative direction for original decks

## Purpose

This is a method for inventing a deck-specific visual language. It is not a theme catalog. Treat every example as a prompt for reasoning, never as a named preset.

## Start from meaning

Before choosing color or type, identify:

1. The central claim and the decision or feeling it should produce.
2. The audience's visual literacy, context, and expectations.
3. The material's inherent metaphors, structures, tensions, textures, and scale.
4. The relationship between credibility and surprise the situation can support.

Turn those observations into one visual thesis. A useful thesis connects content to form: “A migration deck behaves like a controlled passage through illuminated checkpoints,” or “A cultural report reads like annotated archival evidence.” Weak theses merely name fashionable adjectives.

## Define a recognizable system

Write the thesis into `PresentationOutline.creativeDirection`. The interface is deliberately open-ended; add fields when they help the host model reason. The renderer consumes concrete palette and typography values but preserves the rest in metadata.

```ts
creativeDirection: {
  name: "Signal through fog",
  concept: "Sparse evidence emerges from a deep atmospheric field",
  rationale: "The board needs confidence without pretending uncertainty is gone",
  mood: ["measured", "luminous", "quietly technical"],
  palette: {
    background: "0B1020",
    surface: "151C2F",
    ink: "F5F2E9",
    muted: "A6AEC5",
    accent: "66E3FF",
    accentAlt: "F7C75E",
    accentSoft: "173847",
    rule: "34405B",
    positive: "65D39A",
    negative: "FF6B72",
    warning: "F7C75E",
    custom: { fog: "27304A", flare: "E9A7FF" }
  },
  typography: {
    display: "Aptos Display",
    heading: "Aptos Display",
    body: "Aptos",
    mono: "Aptos Mono",
    numeric: "Aptos Display"
  },
  compositionPrinciples: [
    "Evidence clusters emerge from large negative fields",
    "One luminous focal point per slide",
    "Titles may migrate to support the composition"
  ],
  imageLanguage: "Low-key documentary crops with atmospheric depth",
  diagramLanguage: "Hairline routes, glowing junctions, few containers",
  chartLanguage: "Direct-labeled signals on a dark field; gridlines nearly disappear",
  shapeLanguage: "Long arcs, isolated points, and thin planes",
  avoid: ["dashboard cards", "generic gradient blobs", "same title position on every slide"]
}
```

Do not copy this visual system into an unrelated deck.

## Color

Choose a semantic palette that supports the communication job, not a stock mood board. Establish background, surface, primary text, secondary text, focal accent, secondary accent, soft accent, rules, and status colors. Add arbitrary named colors under `custom` and use any direct hex value on canvas elements.

Check contrast in the actual composition. Large display type can tolerate subtler contrast than dense labels. A deck can move between light and dark fields when the transition has narrative meaning. Avoid distributing every palette color evenly; hierarchy comes from scarcity.

If no creative direction is supplied, Slide Agent derives a deterministic palette from the brief so prompt-only decks do not all share one theme. That fallback is not a substitute for model-directed art direction.

## Typography

Choose type for voice and function:

- Display type carries character, scale, and emotional temperature.
- Heading type establishes hierarchy and cadence.
- Body type protects long-form clarity.
- Monospaced or numeric faces may create a separate evidence register.

The model may name any typeface. Slide Agent does not enforce a font whitelist; supplied typefaces are added to the active deck's known-font set. Confirm availability or accept PowerPoint substitution. Keep fallbacks compatible in width and tone. Use weight, size, case, spacing, line length, and placement as expressive variables rather than relying only on font family.

## Composition and pacing

Define a spatial grammar—how the deck creates order—without turning it into a template. Possible variables include a baseline or modular grid, edge alignment, fields of negative space, dominant axes, controlled collisions, scale jumps, cropping, repetition, or deliberate imbalance.

Vary individual slides while retaining family resemblance. Think in sequences:

- Cover: establish the world, not the table of contents.
- Early slides: frame tension and establish reading conventions.
- Evidence sequence: modulate density and reveal complexity deliberately.
- Turning point: visibly change scale, field, or rhythm.
- Close: resolve the visual thesis and make the action feel inevitable.

Use a montage to inspect whether slide silhouettes repeat mechanically. If three consecutive slides share the same header-plus-cards skeleton, redesign at least one unless repetition is itself the concept.

## Imagery, texture, and illustration

Specify what images do in the argument: evidence, atmosphere, metaphor, product proof, human context, or spatial anchor. Define crop behavior, tonal treatment, depth, edge character, and relationship to type. Do not add decorative images merely to fill empty regions.

Native PowerPoint shapes can form illustrations, patterns, masks, markers, line art, and material layers while remaining editable. Raster imagery is appropriate for photography, generated artwork, screenshots, complex textures, or supplied assets. Never flatten the entire slide for convenience.

## Originality review

Before building, ask:

- Could this art direction belong only to this story, or could its title be swapped with any business topic?
- Does the palette arise from meaning or habit?
- Are the typography and spatial grammar recognizable?
- Have repeated card grids and generic colored circles replaced actual visual thinking?
- Do diagrams use a language designed for their relationships?
- Does the deck contain at least one memorable visual move that supports the argument?

If the answers are generic, rethink the thesis before polishing slides.
