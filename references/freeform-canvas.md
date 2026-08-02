# Model-authored freeform canvas

## The canvas is the layout

Add `canvas` to a `SlideSpec` to bypass `LayoutRegistry` completely. The array order is the default paint order. `zIndex` can move elements onto lower or higher layers; equal layers retain array order. Coordinates and dimensions are in inches on the PowerPoint canvas.

Every canvas element is a native editable PowerPoint object. `kind` can be any useful semantic string. `layout` is ignored when `canvas` exists.

```ts
const slide: SlideSpec = {
  id: "turning-point",
  kind: "visual-argument",
  layout: "not-a-template",
  title: "Complexity collapses at one boundary",
  background: "101014",
  designIntent: "Make the control boundary physically dominate the fragmented inputs.",
  composition: "Small irregular inputs converge diagonally into one monumental plane.",
  canvas: [/* editable elements */]
};
```

`title` is required as semantic metadata, but a canvas does not render it automatically. Add a text element if the title should be visible.

## Shared geometry and layering

Every element supplies `id`, `type`, `x`, `y`, `w`, and `h`. Optional fields:

- `zIndex`: explicit layer; lower values render first.
- `role`: semantic role used by QA, such as `title`, `body`, `caption`, `diagram-node`, `chart`, or `decorative`.
- `intentionalOverlap`: allow deliberate collision with other objects.
- `allowOverlapWith`: allow overlap with named element IDs while retaining checks elsewhere.

Use negative connector width or height to draw upward or leftward edges. Ordinary shapes, text, images, tables, and charts must remain inside the slide unless intentional bleed is represented in a safe way supported by the renderer.

## Text and rich text

```ts
{
  id: "deck-title",
  type: "text",
  x: 0.7, y: 0.9, w: 8.2, h: 1.6,
  role: "title",
  text: "The system bends before it breaks",
  style: {
    fontFace: "Georgia",
    fontSize: 48,
    color: "F7F2E8",
    bold: true,
    align: "left",
    valign: "middle",
    margin: 0,
    fit: "shrink",
    rotate: -2
  }
}
```

Use `runs` instead of `text` for inline formatting:

```ts
runs: [
  { text: "31%", options: { bold: true, color: "B8FF32" } },
  { text: " less friction", options: { color: "F7F2E8" } }
]
```

`style.options` passes advanced native options to PptxGenJS before required geometry and identity fields are applied.

## Shapes and connectors

`shape` accepts any PptxGenJS shape name. It is not restricted to Slide Agent's convenience constants.

```ts
{
  id: "signal",
  type: "shape",
  shape: "hexagon",
  x: 8.8, y: 1.0, w: 2.1, h: 2.1,
  role: "diagram-node",
  style: { fill: "FF4FD8", transparency: 8, lineColor: "101014", lineWidth: 1.5, rotate: 12 }
}
```

Connectors interpret `x`,`y` as their start and `x + w`,`y + h` as their end. Put connectors on lower layers so nodes and labels cover their endpoints.

```ts
{
  id: "route-a-b",
  type: "connector",
  x: 2.2, y: 3.1, w: 4.8, h: -1.3,
  zIndex: -10,
  role: "connector",
  style: { color: "66E3FF", width: 2, arrow: true, dashed: false }
}
```

## Images

Images accept local paths, URLs resolved by the image manager, or data URIs. Supply meaningful alt text and choose `cover`, `contain`, or `stretch` intentionally.

```ts
{
  id: "field-photo",
  type: "image",
  path: "/absolute/path/evidence.jpg",
  alt: "Operator reviewing the control room at night",
  fit: "cover",
  x: 7.2, y: 0, w: 6.13, h: 7.5,
  style: { transparency: 4 }
}
```

Use native shapes over images for simple geometry. Use image generation or search outside Slide Agent when the visual requires original illustration or factual photography, then pass the resulting file as an asset.

## Native tables and charts

Canvas tables accept the normal `TableSpec` plus advanced native options. Canvas `chart` elements accept the convenience `ChartSpec`, an arbitrary series-color list, and native chart options.

```ts
{
  id: "signal-chart",
  type: "chart",
  x: 0.8, y: 2.0, w: 7.4, h: 4.5,
  chart: {
    kind: "line",
    labels: ["Jan", "Feb", "Mar"],
    series: [{ name: "Activation", values: [42, 57, 71] }],
    showValues: false
  },
  style: {
    colors: ["B8FF32"],
    options: { showLegend: false, showCatName: false, lineSize: 4 }
  }
}
```

Use standard native charts when editability and precise data access matter. Use shapes and text when the intended quantitative form is custom, such as a slope narrative, annotated range, dot field, lollipop, bespoke waterfall, or proportional symbol composition.

For any PptxGenJS chart type or data structure outside the convenience `ChartSpec`, use `native-chart`:

```ts
{
  id: "radar",
  type: "native-chart",
  nativeType: "radar",
  x: 6.8, y: 1.4, w: 5.4, h: 4.9,
  data: [{ name: "Current", labels: ["Speed", "Trust", "Reach"], values: [7, 9, 5] }],
  options: { showLegend: false, chartColors: ["FF4FD8"] }
}
```

## Advanced native options

The model may pass PptxGenJS-compatible options through:

- Text and shape `style.options`.
- Connector `style.options`.
- Image `style.options`.
- Table `options`.
- Chart `style.options` or unrestricted `native-chart.options`.

These options expand capability without forcing Slide Agent to enumerate every PowerPoint feature. Use documented PptxGenJS keys. Render and inspect after advanced effects because LibreOffice and PowerPoint may differ in their interpretation.

## Technical quality without aesthetic normalization

The validator checks bounds, non-empty slides, text fit, minimum legibility guidance, contrast, images, chart data, and unintended overlaps. It skips template-alignment heuristics for model-authored canvases, so asymmetry and migrating title positions are allowed.

Mark intentional overlap precisely. Avoid marking every object intentional, because that removes useful defect detection. If QA fails, preserve the composition's idea while repairing geometry, copy length, crop, or layering.
