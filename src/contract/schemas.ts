import { z } from "zod";

/**
 * The authoring contract: one schema set that defines everything a host model
 * may author. It is the single source of truth behind the TypeScript types,
 * the NDJSON scene parser, the request boundary, the JSON Schema published to
 * MCP clients, and the generated documentation. Anything a model can write has
 * to be expressible here, or hosts end up guessing from prose.
 *
 * Open-ended objects use `looseObject` on purpose: a model may record its own
 * reasoning alongside the fields the renderer consumes, and discarding that
 * would lose intent the deck's own blueprint should preserve.
 */

const hex = z.string()
  .regex(/^#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "expected a 3- or 6-digit hex color, with or without a leading #")
  .describe("Hex color, with or without a leading #.");

const inches = z.number().finite().describe("Inches on the slide canvas.");

/**
 * The one reference syntax. A style value may point at any variable the deck
 * declared instead of repeating a literal; the resolver checks the variable
 * against the property it lands on and reports a precise mismatch rather than
 * coercing it.
 */
export const variableReferenceSchema = z.object({
  $var: z.string().min(1).describe("A name from creativeDirection.visualSystem.variables."),
}).describe('A deck variable reference, e.g. {"$var":"map-ink"}.');

/** A property that accepts either a literal or a variable reference. */
function orVar<Schema extends z.ZodType>(schema: Schema) {
  return z.union([schema, variableReferenceSchema]);
}

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
])).describe("Any JSON value. Deck variables are deliberately this open.");

export const sourceCitationSchema = z.object({
  label: z.string().optional(),
  url: z.string().url().optional(),
  note: z.string().optional(),
}).describe("A cited source. Never invent one.");

export const tableSpecSchema = z.object({
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
  columnWidths: z.array(z.number().positive()).optional(),
  highlightRows: z.array(z.number().int().nonnegative()).optional(),
});

export const chartSeriesSchema = z.object({
  name: z.string(),
  values: z.array(z.number()),
});

export const chartSpecSchema = z.object({
  kind: z.enum(["bar", "bar-stacked", "bar-horizontal", "line", "pie", "doughnut", "area", "scatter", "radar", "waterfall"])
    .describe("A native, editable chart. `scatter` reads its labels as x values. For anything else PptxGenJS can draw, use a native-chart element."),
  labels: z.array(z.string()).min(1).describe("Category labels, one per value in every series. For a scatter chart these are the x values and must be numbers."),
  series: z.array(chartSeriesSchema).min(1),
  unit: z.string().optional(),
  showLegend: z.boolean().optional(),
  showValues: z.boolean().optional(),
}).refine(
  (chart) => chart.series.every((series) => series.values.length === chart.labels.length),
  { message: "every series must have exactly one value per category label" },
).refine(
  (chart) => !["pie", "doughnut"].includes(chart.kind) || chart.series.length === 1,
  { message: "a pie or doughnut chart takes exactly one series" },
).refine(
  (chart) => chart.kind !== "scatter" || chart.labels.every((label) => Number.isFinite(Number(label))),
  { message: "a scatter chart reads its labels as x values, so every label must be a number" },
);

const nativeOptions = z.record(z.string(), z.unknown())
  .describe("Advanced PptxGenJS options passed through unchanged. Verify the render. A `hyperlink` here is held to the same scheme allowlist as `link`.");

export const linkSchema = z.union([
  z.string().min(1).describe("An http(s) or mailto URL. A bare host is read as https."),
  z.object({
    url: z.string().min(1),
    tooltip: z.string().optional().describe("What the link does. Screen readers announce it."),
  }),
  z.object({
    slide: z.number().int().positive().describe("A 1-based slide in this deck."),
    tooltip: z.string().optional(),
  }),
]).describe("A hyperlink. Only http, https, and mailto are accepted; anything else is refused and reported.");

/** One edge or size expressed against another element on the same slide. */
const frameRelation = z.looseObject({
  alignLeft: z.string().optional(),
  alignRight: z.string().optional(),
  alignTop: z.string().optional(),
  alignBottom: z.string().optional(),
  centerX: z.string().optional(),
  centerY: z.string().optional(),
  below: z.string().optional(),
  above: z.string().optional(),
  rightOf: z.string().optional(),
  leftOf: z.string().optional(),
  sameAs: z.string().optional().describe("Take the referenced element's width or height."),
  spanFrom: z.string().optional().describe("With spanTo, stretch from one element's near edge to another's far edge."),
  spanTo: z.string().optional(),
  gap: z.number().optional().describe("Distance held from the referenced element, in inches."),
  offset: z.number().optional().describe("Added after everything else, in inches."),
}).describe("A relation to an element declared earlier on the same slide.");

const frameValue = z.union([inches, frameRelation]);

const canvasBase = {
  id: z.string().min(1).describe("Unique within the slide; used by validation and revision."),
  x: inches,
  y: inches,
  w: inches,
  h: inches,
  zIndex: z.number().optional().describe("Paint order. Lower values sit behind."),
  role: z.string().optional().describe("Semantic role, e.g. title, body, caption, decorative."),
  styleRef: z.union([z.string(), z.array(z.string())]).optional()
    .describe("Named styles from creativeDirection.visualSystem.styles, applied in order. This element's own `style` is the final override."),
  layer: z.string().optional().describe("A named layer, for review and z-order grouping. Never a visual style."),
  allowBleed: z.boolean().optional().describe("This element is meant to run past the slide edge. Without it, anything outside the slide is reported as a defect."),
  intentionalOverlap: z.boolean().optional().describe("Marks a deliberate collision so QA does not report it."),
  allowOverlapWith: z.array(z.string()).optional(),
  place: z.object({
    x: frameValue.optional(),
    y: frameValue.optional(),
    w: frameValue.optional(),
    h: frameValue.optional(),
  }).optional().describe("Placement stated against elements already on this slide. Any axis given here wins over the literal x/y/w/h, and is solved into inches before the slide is composed."),
};

const textStyleSchema = z.looseObject({
  fontSize: orVar(z.number().positive()).optional(),
  fontFace: orVar(z.string()).optional(),
  color: orVar(hex).optional(),
  bold: orVar(z.boolean()).optional(),
  italic: orVar(z.boolean()).optional(),
  underline: orVar(z.boolean()).optional(),
  align: orVar(z.enum(["left", "center", "right", "justify"])).optional(),
  valign: orVar(z.enum(["top", "middle", "bottom"])).optional(),
  margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()]), variableReferenceSchema]).optional(),
  fit: orVar(z.enum(["none", "shrink", "resize"])).optional(),
  fill: orVar(hex).optional(),
  transparency: orVar(z.number().min(0).max(100)).optional(),
  lineColor: orVar(hex).optional(),
  lineWidth: orVar(z.number().nonnegative()).optional(),
  rotate: orVar(z.number()).optional(),
  lineSpacingMultiple: orVar(z.number().positive()).optional().describe("Line spacing as a multiple of the font size, e.g. 1.35."),
  lineSpacing: orVar(z.number().positive()).optional().describe("Absolute line spacing in points. Wins over lineSpacingMultiple."),
  charSpacing: orVar(z.number()).optional().describe("Tracking in points; negative tightens."),
  indent: orVar(z.number()).optional().describe("First-line indent in inches."),
  columns: orVar(z.number().int().min(1).max(16)).optional().describe("Newspaper-style columns inside this one text box."),
  noBreak: orVar(z.boolean()).optional().describe("Replaces spaces with non-breaking spaces so the string never wraps mid-phrase."),
  bullet: z.union([
    z.boolean(),
    z.looseObject({
      type: z.enum(["bullet", "number"]).optional(),
      code: z.string().optional().describe("A Unicode code point in hex, e.g. \"2022\"."),
      indent: z.number().optional(),
    }),
  ]).optional(),
  options: nativeOptions.optional(),
});

export const canvasTextSchema = z.object({
  ...canvasBase,
  type: z.literal("text"),
  text: z.string().optional(),
  runs: z.array(z.object({ text: z.string(), options: nativeOptions.optional() })).optional(),
  link: linkSchema.optional(),
  style: textStyleSchema.optional(),
}).refine(
  (element) => element.text !== undefined || (element.runs?.length ?? 0) > 0,
  { message: "a text element needs either text or at least one run" },
);

export const canvasShapeSchema = z.object({
  ...canvasBase,
  type: z.literal("shape"),
  shape: z.string().optional().describe("Any PptxGenJS shape name. Not a whitelist."),
  link: linkSchema.optional(),
  style: z.looseObject({
    fill: orVar(hex).optional(),
    transparency: orVar(z.number().min(0).max(100)).optional(),
    lineColor: orVar(hex).optional(),
    lineWidth: orVar(z.number().nonnegative()).optional(),
    rotate: orVar(z.number()).optional(),
    options: nativeOptions.optional(),
  }).optional(),
});

const connectorEndpointSchema = z.union([
  z.string().min(1),
  z.object({
    id: z.string().min(1),
    side: z.enum(["top", "right", "bottom", "left", "auto"]).optional()
      .describe("Which edge to leave from or arrive at. Defaults to the edge facing the other element."),
  }),
]).describe("An element id on the same slide, optionally with the side to use.");

export const canvasConnectorSchema = z.object({
  ...canvasBase,
  x: inches.optional(),
  y: inches.optional(),
  w: inches.optional(),
  h: inches.optional(),
  type: z.literal("connector"),
  from: connectorEndpointSchema.optional(),
  to: connectorEndpointSchema.optional(),
  route: z.enum(["straight", "elbow", "curved"]).optional()
    .describe("How the path is drawn between the two anchors. Defaults to elbow when the connector is anchored."),
  clearance: z.number().nonnegative().optional().describe("Gap held from elements the route is not joining, in inches."),
  stub: z.number().nonnegative().optional().describe("How far the route runs straight out of an anchor before it may turn, in inches."),
  mayCross: z.array(z.string()).optional().describe("Ids this route may cross without it being reported as a collision."),
  style: z.looseObject({
    color: orVar(hex).optional(),
    width: orVar(z.number().nonnegative()).optional(),
    arrow: orVar(z.boolean()).optional(),
    beginArrow: orVar(z.boolean()).optional(),
    dashed: orVar(z.boolean()).optional(),
    options: nativeOptions.optional(),
  }).optional(),
}).refine(
  (element) => (element.from !== undefined && element.to !== undefined)
    || (element.x !== undefined && element.y !== undefined && element.w !== undefined && element.h !== undefined),
  { message: "a connector needs either from and to, or an explicit x, y, w, and h" },
).describe("Anchor it with from/to and the engine routes it around whatever is in the way. Without anchors, x/y is the start point and w/h is the delta to the end point, which may be negative.");

/**
 * Where a picture came from, and whether a person made it.
 *
 * The honesty section already forbids inventing sources, data, and
 * quotations. A photograph is the same claim in visual form: an image
 * generated from a prompt and captioned as a site photo is a fabrication, and
 * a stock image used without its credit line is somebody else's licence
 * breached by a deck that will be presented to a room. Neither is something
 * Slide Agent can detect from the pixels, so the author records it.
 */
export const imageProvenanceSchema = z.looseObject({
  source: z.string().optional().describe("Where it came from: a URL, a library reference, or the prompt that produced it."),
  credit: z.string().optional().describe("The attribution line the licence requires, e.g. \"Photo by A. Name on Unsplash\"."),
  license: z.string().optional().describe("The licence you are relying on, e.g. \"CC BY 4.0\", \"Unsplash License\", \"© Acme, used with permission\"."),
  generated: z.boolean().optional().describe("True when a model produced this image rather than a camera or a person."),
  generator: z.string().optional().describe("What generated it, when `generated` is true."),
}).describe("Attribution and origin. Written into the speaker notes under [Credits].");

/**
 * Vector artwork riding alongside the raster PowerPoint actually embeds.
 * OOXML stores an SVG as an *enhancement* to a bitmap blip, so `path` on the
 * element is still required: it is what older viewers draw. `editable` is the
 * honest answer to "can someone change this in PowerPoint", not a promise.
 */
export const canvasVectorSchema = z.looseObject({
  path: z.string().min(1).describe("Path to the .svg. It is packaged with the deck and declared in the manifest."),
  editable: z.union([z.literal(false), z.literal(true), z.literal("partial")])
    .describe("false: scalable artwork only. \"partial\": some parts are separable. true: fully shape-editable after ungrouping."),
  source: z.string().optional(),
  license: z.string().optional(),
}).describe("Scalable artwork carried with the raster image. Declares its own editability.");

export const imageTreatmentSchema = z.looseObject({
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional()
    .describe("Where the subject sits, 0–1 in each axis. Drives `cover` cropping so the subject survives the crop."),
  crop: z.looseObject({
    left: z.number().min(0).max(1).optional(),
    right: z.number().min(0).max(1).optional(),
    top: z.number().min(0).max(1).optional(),
    bottom: z.number().min(0).max(1).optional(),
  }).optional().describe("Explicit crop as a fraction of the source, per edge."),
  maskShape: orVar(z.string()).optional().describe("A PowerPoint shape name used as the picture's outline, e.g. \"ellipse\"."),
  tint: z.looseObject({ color: orVar(hex), amount: orVar(z.number().min(0).max(1)).optional() }).optional(),
  duotone: z.looseObject({ shadow: orVar(hex), highlight: orVar(hex) }).optional(),
  grayscale: orVar(z.boolean()).optional(),
}).describe("Deterministic, opt-in picture treatment. Applied on write; the source file is never modified.");

export const canvasImageSchema = z.object({
  ...canvasBase,
  type: z.literal("image"),
  path: z.string().min(1).describe("Local path, or an http(s) URL when remote assets are explicitly enabled."),
  alt: z.string().min(1).describe("Required for accessibility. Describe the content, not the file."),
  provenance: imageProvenanceSchema.optional(),
  vector: canvasVectorSchema.optional(),
  treatment: imageTreatmentSchema.optional(),
  link: linkSchema.optional(),
  fit: z.enum(["cover", "contain", "stretch"]).optional(),
  style: z.looseObject({
    rotate: orVar(z.number()).optional(),
    transparency: orVar(z.number().min(0).max(100)).optional(),
    options: nativeOptions.optional(),
  }).optional(),
});

export const canvasTableSchema = z.object({
  ...canvasBase,
  type: z.literal("table"),
  table: tableSpecSchema,
  options: nativeOptions.optional(),
});

export const canvasChartSchema = z.object({
  ...canvasBase,
  type: z.literal("chart"),
  chart: chartSpecSchema,
  alt: z.string().optional(),
  style: z.looseObject({
    colors: orVar(z.array(orVar(hex))).optional(),
    options: nativeOptions.optional(),
  }).optional(),
});

export const canvasNativeChartSchema = z.object({
  ...canvasBase,
  type: z.literal("native-chart"),
  nativeType: z.string().min(1),
  data: z.array(z.record(z.string(), z.unknown())).min(1),
  alt: z.string().optional(),
  options: nativeOptions.optional(),
}).describe("Escape hatch for any chart type or data shape PptxGenJS supports.");

export const canvasDiagramSchema = z.object({
  ...canvasBase,
  type: z.literal("diagram"),
  grammar: z.string().min(1)
    .describe("A named diagram form; Slide Agent handles routing, spacing, and label placement. Built in: layered, swimlane, sequence, hierarchy, quadrant. A host can register more — ask for capabilities. An unknown name fails the build with the list of what is available."),
  spec: z.record(z.string(), z.unknown()).describe("The grammar's own payload. Fetch its schema from the contract."),
  alt: z.string().optional(),
}).describe("A diagram expressed as a relationship rather than as hand-placed shapes.");

/**
 * A logical group. Children sit at offsets from the group's own origin and
 * expand into ordinary native elements, so every part stays individually
 * selectable in PowerPoint. That is deliberately not a native OOXML group:
 * grouping survives Office but degrades unevenly in other viewers, and an
 * editability claim that only holds in one application is not worth making.
 */
export const canvasGroupSchema: z.ZodType<Record<string, unknown>> = z.object({
  ...canvasBase,
  type: z.literal("group"),
  children: z.array(z.lazy(() => canvasElementSchema)).min(1)
    .describe("Child elements. Their x/y are offsets from the group's x/y, in inches."),
  scale: z.number().positive().optional().describe("Uniform scale applied to every child offset and size. Defaults to 1."),
  alt: z.string().optional(),
}) as unknown as z.ZodType<Record<string, unknown>>;

/**
 * One placement of a symbol the deck itself declared. Slide Agent ships no
 * icon set: a symbol is whatever collection of elements the author decided is
 * worth reusing, and an instance may override its text, colours, and styles.
 */
export const canvasSymbolInstanceSchema = z.object({
  ...canvasBase,
  type: z.literal("symbol-instance"),
  symbol: z.string().min(1).describe("The id of a symbol declared in the scene's symbol records."),
  scale: z.number().positive().optional(),
  overrides: z.looseObject({
    text: z.record(z.string(), z.string()).optional().describe("Child element id → replacement text."),
    color: z.record(z.string(), orVar(hex)).optional().describe("Child element id → replacement colour."),
    style: z.record(z.string(), z.record(z.string(), z.unknown())).optional().describe("Child element id → style overrides."),
  }).optional(),
  alt: z.string().optional(),
});

export const canvasElementSchema: z.ZodType<Record<string, unknown>> = z.lazy(() => z.discriminatedUnion("type", [
  canvasTextSchema,
  canvasShapeSchema,
  canvasConnectorSchema,
  canvasImageSchema,
  canvasTableSchema,
  canvasChartSchema,
  canvasNativeChartSchema,
  canvasDiagramSchema,
  canvasGroupSchema as never,
  canvasSymbolInstanceSchema,
])) as unknown as z.ZodType<Record<string, unknown>>;

export const deckSymbolSchema = z.looseObject({
  id: z.string().min(1),
  w: z.number().positive().describe("Design-time width the children were authored against, in inches."),
  h: z.number().positive(),
  elements: z.array(canvasElementSchema).min(1),
  description: z.string().optional(),
}).describe("An author-defined reusable element collection. Never a built-in vocabulary.");

export const creativePaletteSchema = z.looseObject({
  background: hex.optional(),
  surface: hex.optional(),
  ink: hex.optional(),
  muted: hex.optional(),
  accent: hex.optional(),
  accentAlt: hex.optional(),
  accentSoft: hex.optional(),
  rule: hex.optional(),
  positive: hex.optional(),
  negative: hex.optional(),
  warning: hex.optional(),
  colors: z.array(hex).optional().describe("Additional unnamed colors, in priority order."),
  custom: z.record(z.string(), hex).optional().describe("Named colors specific to this deck."),
});

export const creativeTypographySchema = z.looseObject({
  display: z.string().optional(),
  heading: z.string().optional(),
  body: z.string().optional(),
  mono: z.string().optional(),
  numeric: z.string().optional(),
  fallbacks: z.array(z.string()).optional(),
  scale: z.array(z.number().positive()).min(2).optional()
    .describe("The point sizes this deck commits to, largest first. Elements that step off it are reported, never refused."),
});

/**
 * The deck's own design language, in the deck's own words.
 *
 * Every name here is chosen by the author. Slide Agent reserves none of them —
 * not `card`, not `premium`, not `editorial`, not `modern` — and adds none.
 * Variables are general JSON rather than a fixed colour/spacing/type token
 * schema, because a deck about tidal charts may need a variable that is a list
 * of depths, and a token vocabulary invented here would only be a smaller cage.
 */
export const deckVisualSystemSchema = z.looseObject({
  variables: z.record(z.string(), jsonValueSchema).optional()
    .describe("Arbitrary named values. Reference one from any style property with {\"$var\":\"name\"}."),
  styles: z.record(z.string(), z.looseObject({
    basedOn: z.array(z.string()).optional().describe("Other style names, merged in order before this style's own values."),
    style: z.record(z.string(), z.unknown()).describe("Element style properties. Same shape as an element's own `style`."),
  })).optional().describe("Arbitrary reusable style names. Reference them from an element with `styleRef`."),
  motifs: z.record(z.string(), z.looseObject({
    description: z.string(),
    meaning: z.string().optional(),
    usage: z.string().optional(),
    avoid: z.array(z.string()).optional(),
  })).optional().describe("Subject-derived visual ideas and what they mean. Planning metadata; nothing is rendered from these."),
  constraints: z.looseObject({
    hard: z.array(z.string()).optional().describe("Rules this deck must not break."),
    soft: z.array(z.string()).optional(),
  }).optional().describe("The author's own rules, not engine presets."),
}).describe("The deck's own variables, named styles, motifs, and rules. Names are arbitrary; Slide Agent reserves none.");

export const creativeDirectionSchema = z.looseObject({
  name: z.string().optional(),
  concept: z.string().optional(),
  rationale: z.string().optional(),
  mood: z.array(z.string()).optional(),
  palette: creativePaletteSchema.optional(),
  typography: creativeTypographySchema.optional(),
  visualSystem: deckVisualSystemSchema.optional(),
  compositionPrinciples: z.array(z.string()).optional(),
  visualLanguage: z.string().optional(),
  imageLanguage: z.string().optional(),
  diagramLanguage: z.string().optional(),
  chartLanguage: z.string().optional(),
  shapeLanguage: z.string().optional(),
  textureLanguage: z.string().optional(),
  motionOrPacing: z.string().optional(),
  geometryLanguage: z.string().optional().describe("Open prose about corner language, edges, and shape. Never reduced to an enum."),
  spatialRhythm: z.string().optional().describe("Open prose about spacing, pacing, and how the sequence breathes."),
  materialLanguage: z.string().optional().describe("Open prose about surface, texture, grain, and material treatment."),
  density: z.enum(["sparse", "balanced", "dense"]).optional()
    .describe("Legacy hint for the fallback layouts only. Deprecated in contract 0.10 — use spatialRhythm."),
  geometry: z.enum(["sharp", "soft", "organic"]).optional()
    .describe("Legacy hint for the fallback layouts only. Deprecated in contract 0.10 — use geometryLanguage. Omitting it leaves shape language entirely to you."),
  avoid: z.array(z.string()).optional().describe("Deliberate exclusions. The renderer honours these."),
}).describe("The deck's visual thesis. Open-ended: add fields that help the model reason.");

export const designExplorationSchema = z.looseObject({
  alternatives: z.array(z.looseObject({
    name: z.string(),
    thesis: z.string(),
    differentiator: z.string().describe("What makes this thesis structurally different from the others, not just differently coloured."),
    rejectedBecause: z.string().optional(),
  })).optional(),
  chosen: z.string().optional().describe("The name of the alternative this deck commits to."),
}).describe("Visual theses considered before any coordinate was written. Concise authoring metadata, not private reasoning.");

export const sequencePlanItemSchema = z.looseObject({
  slideId: z.string().min(1),
  narrativeJob: z.string().min(1).describe("What this slide has to accomplish for the audience."),
  dominantArtifact: z.string().optional().describe("The one thing the eye should land on."),
  silhouette: z.string().optional().describe("The intended shape of the composition, in your own words."),
  energy: z.string().optional().describe("quiet, medium, loud, or your own term."),
  transition: z.string().optional(),
}).describe("One slide's declared job and intended silhouette. Later critique compares the render against this.");

export const claimLedgerItemSchema = z.looseObject({
  id: z.string().min(1),
  slideId: z.string().optional(),
  claim: z.string().min(1),
  kind: z.string().optional().describe("fact, number, quote, recommendation, illustrative, or your own term."),
  sourceIds: z.array(z.string()).optional().describe("Ids from sourceLedger."),
  asOf: z.string().optional().describe("The date this claim was true, when that matters."),
  calculation: z.string().optional().describe("How a derived number was produced."),
  status: z.string().optional().describe("verified, needs-review, or illustrative."),
}).describe("One claim and what backs it. Lets revision checks catch orphaned sources and unsupported precision.");

export const hostAuthoringCapabilitiesSchema = z.looseObject({
  vision: z.boolean().optional().describe("You can look at rendered images."),
  webResearch: z.boolean().optional(),
  imageGeneration: z.boolean().optional(),
  vectorGeneration: z.boolean().optional(),
  codeExecution: z.boolean().optional(),
  localFileAccess: z.boolean().optional(),
  availableAssetProviders: z.array(z.string()).optional(),
}).describe("What the host AI can do. Planning context only: declaring a capability grants no permission and triggers no call by the core.");

export const slideCommunicationSchema = z.looseObject({
  audienceQuestion: z.string().optional(),
  claim: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  artifact: z.string().optional(),
  explanation: z.array(z.string()).optional(),
  implication: z.string().optional(),
  action: z.string().optional(),
  secondaryLanguage: z.looseObject({
    language: z.string(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    labels: z.record(z.string(), z.string()).optional(),
  }).optional(),
}).describe("Planning metadata. Never rendered automatically and never a layout schema.");

export const deckCompletenessSchema = z.looseObject({
  audienceQuestions: z.array(z.string()).optional(),
  knowledgeMap: z.array(z.string()).optional(),
  requiredArtifacts: z.array(z.string()).optional(),
  risksOrUnknowns: z.array(z.string()).optional(),
  closingContract: z.array(z.string()).optional(),
});

export const visualSpecSchema = z.object({
  path: z.string().optional(),
  alt: z.string().min(1),
  caption: z.string().optional(),
  position: z.enum(["left", "right", "full"]).optional(),
});

export const slideSpecSchema = z.looseObject({
  id: z.string().min(1),
  kind: z.string().min(1).describe("Any semantic label. Metadata, not a whitelist."),
  layout: z.string().optional().describe("A registered fallback layout. Ignored when canvas is present."),
  title: z.string(),
  subtitle: z.string().optional(),
  sectionLabel: z.string().optional(),
  body: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  visual: visualSpecSchema.optional(),
  comparison: z.array(z.object({
    heading: z.string(),
    points: z.array(z.string()),
    emphasis: z.boolean().optional(),
  })).optional(),
  timeline: z.array(z.object({ label: z.string(), title: z.string(), detail: z.string().optional() })).optional(),
  process: z.array(z.object({ title: z.string(), detail: z.string().optional(), owner: z.string().optional() })).optional(),
  architecture: z.object({
    nodes: z.array(z.object({ id: z.string(), label: z.string(), group: z.string().optional(), emphasis: z.boolean().optional() })),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })),
    direction: z.enum(["horizontal", "vertical"]).optional(),
  }).optional(),
  table: tableSpecSchema.optional(),
  chart: chartSpecSchema.optional(),
  kpis: z.array(z.object({
    label: z.string(),
    value: z.string(),
    detail: z.string().optional(),
    trend: z.enum(["up", "down", "flat"]).optional(),
  })).optional(),
  quote: z.object({ text: z.string(), attribution: z.string().optional() }).optional(),
  roadmap: z.array(z.object({ label: z.string(), items: z.array(z.string()) })).optional(),
  custom: z.array(z.object({
    id: z.string(),
    x: inches,
    y: inches,
    w: inches,
    h: inches,
    type: z.enum(["text", "shape", "image"]),
    text: z.string().optional(),
    imagePath: z.string().optional(),
    fill: hex.optional(),
    fontSize: z.number().positive().optional(),
  })).optional(),
  communication: slideCommunicationSchema.optional(),
  designIntent: z.string().optional().describe("Why this composition communicates the claim. Never rendered."),
  composition: z.string().optional().describe("Intended hierarchy, balance, rhythm, and reading path."),
  background: orVar(hex).optional(),
  chrome: z.union([z.literal(false), z.record(z.string(), z.string())]).optional()
    .describe("How this slide treats the deck's slideChrome. false suppresses it; an object supplies values the chrome interpolates, such as a kicker."),
  canvas: z.array(canvasElementSchema).optional()
    .describe("The model's own scene. When present it *is* the layout and the registry is bypassed."),
  speakerNotes: z.array(z.string()).optional(),
  sources: z.array(sourceCitationSchema).optional(),
});

export const presentationBriefSchema = z.looseObject({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  audience: z.string().min(1),
  objective: z.string().min(1),
  presentationType: z.string().min(1),
  tone: z.string().min(1),
  visualDirection: z.string(),
  slideCount: z.number().int().positive(),
  language: z.string().min(1),
  outputRequirements: z.array(z.string()),
  keyTopics: z.array(z.string()),
  sourcePrompt: z.string(),
});

export const sourceLedgerItemSchema = sourceCitationSchema.extend({
  id: z.string().min(1).describe("Referenced from claims[].sourceIds."),
});

export const slideChromeSchema = z.looseObject({
  elements: z.array(canvasElementSchema).min(1)
    .describe("Elements repeated on every model-authored slide. Any string may interpolate {{slideNumber}}, {{slideNumberPadded}}, {{slideCount}}, {{slideTitle}}, {{deckTitle}}, or a key the slide supplies in its own `chrome`."),
  variants: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.unknown()))).optional()
    .describe("Style overrides per named variant, keyed by variant then by element id. A slide selects one with chrome: { variant: \"paper\" }. Only style properties change."),
  skipSlides: z.array(z.string()).optional().describe("Slide ids that opt out entirely, e.g. a cover."),
  idPrefix: z.string().min(1).optional().describe("Namespace applied to chrome element ids. Defaults to `chrome`."),
}).describe("Per-slide furniture the deck declares once. Slide Agent ships none and repeats only what you wrote.");

export const presentationOutlineSchema = z.looseObject({
  brief: presentationBriefSchema,
  narrative: z.string().describe("One line: what changes for the audience by the end."),
  slideChrome: slideChromeSchema.optional(),
  completeness: deckCompletenessSchema.optional(),
  creativeDirection: creativeDirectionSchema.optional(),
  exploration: designExplorationSchema.optional(),
  sequencePlan: z.array(sequencePlanItemSchema).optional(),
  claims: z.array(claimLedgerItemSchema).optional(),
  sourceLedger: z.array(sourceLedgerItemSchema).optional(),
  symbols: z.array(deckSymbolSchema).optional(),
  hostCapabilities: hostAuthoringCapabilitiesSchema.optional(),
  slides: z.array(slideSpecSchema).min(1),
});

export type CanvasElementInput = z.infer<typeof canvasElementSchema>;
export type PresentationOutlineInput = z.infer<typeof presentationOutlineSchema>;
export type CreativeDirectionInput = z.infer<typeof creativeDirectionSchema>;
