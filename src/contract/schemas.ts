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
  kind: z.enum(["bar", "line", "pie", "area", "waterfall"]),
  labels: z.array(z.string()).min(1),
  series: z.array(chartSeriesSchema).min(1),
  unit: z.string().optional(),
  showLegend: z.boolean().optional(),
  showValues: z.boolean().optional(),
}).refine(
  (chart) => chart.series.every((series) => series.values.length === chart.labels.length),
  { message: "every series must have exactly one value per category label" },
).refine(
  (chart) => chart.kind !== "pie" || chart.series.length === 1,
  { message: "a pie chart takes exactly one series" },
);

const nativeOptions = z.record(z.string(), z.unknown())
  .describe("Advanced PptxGenJS options passed through unchanged. Verify the render.");

const canvasBase = {
  id: z.string().min(1).describe("Unique within the slide; used by validation and revision."),
  x: inches,
  y: inches,
  w: inches,
  h: inches,
  zIndex: z.number().optional().describe("Paint order. Lower values sit behind."),
  role: z.string().optional().describe("Semantic role, e.g. title, body, caption, decorative."),
  intentionalOverlap: z.boolean().optional().describe("Marks a deliberate collision so QA does not report it."),
  allowOverlapWith: z.array(z.string()).optional(),
};

const textStyleSchema = z.looseObject({
  fontSize: z.number().positive().optional(),
  fontFace: z.string().optional(),
  color: hex.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  valign: z.enum(["top", "middle", "bottom"]).optional(),
  margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
  fit: z.enum(["none", "shrink", "resize"]).optional(),
  fill: hex.optional(),
  transparency: z.number().min(0).max(100).optional(),
  lineColor: hex.optional(),
  lineWidth: z.number().nonnegative().optional(),
  rotate: z.number().optional(),
  options: nativeOptions.optional(),
});

export const canvasTextSchema = z.object({
  ...canvasBase,
  type: z.literal("text"),
  text: z.string().optional(),
  runs: z.array(z.object({ text: z.string(), options: nativeOptions.optional() })).optional(),
  style: textStyleSchema.optional(),
}).refine(
  (element) => element.text !== undefined || (element.runs?.length ?? 0) > 0,
  { message: "a text element needs either text or at least one run" },
);

export const canvasShapeSchema = z.object({
  ...canvasBase,
  type: z.literal("shape"),
  shape: z.string().optional().describe("Any PptxGenJS shape name. Not a whitelist."),
  style: z.looseObject({
    fill: hex.optional(),
    transparency: z.number().min(0).max(100).optional(),
    lineColor: hex.optional(),
    lineWidth: z.number().nonnegative().optional(),
    rotate: z.number().optional(),
    options: nativeOptions.optional(),
  }).optional(),
});

export const canvasConnectorSchema = z.object({
  ...canvasBase,
  type: z.literal("connector"),
  style: z.looseObject({
    color: hex.optional(),
    width: z.number().nonnegative().optional(),
    arrow: z.boolean().optional(),
    beginArrow: z.boolean().optional(),
    dashed: z.boolean().optional(),
    options: nativeOptions.optional(),
  }).optional(),
}).describe("x/y is the start point; w/h is the delta to the end point and may be negative.");

export const canvasImageSchema = z.object({
  ...canvasBase,
  type: z.literal("image"),
  path: z.string().min(1).describe("Local path, or an http(s) URL when remote assets are explicitly enabled."),
  alt: z.string().min(1).describe("Required for accessibility. Describe the content, not the file."),
  fit: z.enum(["cover", "contain", "stretch"]).optional(),
  style: z.looseObject({
    rotate: z.number().optional(),
    transparency: z.number().min(0).max(100).optional(),
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
    colors: z.array(hex).optional(),
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
  grammar: z.enum(["layered", "swimlane", "sequence", "hierarchy", "quadrant"])
    .describe("A named diagram form. Slide Agent handles routing, spacing, and label placement."),
  spec: z.record(z.string(), z.unknown()).describe("The grammar's own payload. Fetch its schema from the contract."),
  alt: z.string().optional(),
}).describe("A diagram expressed as a relationship rather than as hand-placed shapes.");

export const canvasElementSchema = z.discriminatedUnion("type", [
  canvasTextSchema,
  canvasShapeSchema,
  canvasConnectorSchema,
  canvasImageSchema,
  canvasTableSchema,
  canvasChartSchema,
  canvasNativeChartSchema,
  canvasDiagramSchema,
]);

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
});

export const creativeDirectionSchema = z.looseObject({
  name: z.string().optional(),
  concept: z.string().optional(),
  rationale: z.string().optional(),
  mood: z.array(z.string()).optional(),
  palette: creativePaletteSchema.optional(),
  typography: creativeTypographySchema.optional(),
  compositionPrinciples: z.array(z.string()).optional(),
  visualLanguage: z.string().optional(),
  imageLanguage: z.string().optional(),
  diagramLanguage: z.string().optional(),
  chartLanguage: z.string().optional(),
  shapeLanguage: z.string().optional(),
  textureLanguage: z.string().optional(),
  motionOrPacing: z.string().optional(),
  density: z.enum(["sparse", "balanced", "dense"]).optional(),
  geometry: z.enum(["sharp", "soft", "organic"]).optional(),
  avoid: z.array(z.string()).optional().describe("Deliberate exclusions. The renderer honours these."),
}).describe("The deck's visual thesis. Open-ended: add fields that help the model reason.");

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
  background: hex.optional(),
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

export const presentationOutlineSchema = z.looseObject({
  brief: presentationBriefSchema,
  narrative: z.string().describe("One line: what changes for the audience by the end."),
  completeness: deckCompletenessSchema.optional(),
  creativeDirection: creativeDirectionSchema.optional(),
  slides: z.array(slideSpecSchema).min(1),
});

export type CanvasElementInput = z.infer<typeof canvasElementSchema>;
export type PresentationOutlineInput = z.infer<typeof presentationOutlineSchema>;
export type CreativeDirectionInput = z.infer<typeof creativeDirectionSchema>;
