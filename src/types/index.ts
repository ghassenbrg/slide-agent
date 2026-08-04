export type SlideKind =
  | "title"
  | "section"
  | "executive-summary"
  | "text-image"
  | "comparison"
  | "timeline"
  | "process"
  | "architecture"
  | "table"
  | "chart"
  | "kpi"
  | "quote"
  | "roadmap"
  | "closing"
  | "custom"
  | (string & {});

export type ChartKind = "bar" | "line" | "pie" | "area" | "waterfall";
export type PresentationType =
  | "business"
  | "sales"
  | "technical"
  | "educational"
  | "report"
  | "proposal"
  | "workshop"
  | "general";

export interface SourceCitation {
  label?: string;
  url?: string;
  note?: string;
}

export interface VisualSpec {
  path?: string;
  alt: string;
  caption?: string;
  position?: "left" | "right" | "full";
}

export interface ComparisonColumn {
  heading: string;
  points: string[];
  emphasis?: boolean;
}

export interface TimelineItem {
  label: string;
  title: string;
  detail?: string;
}

export interface ProcessStep {
  title: string;
  detail?: string;
  owner?: string;
}

export interface DiagramNode {
  id: string;
  label: string;
  group?: string;
  emphasis?: boolean;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ArchitectureSpec {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  direction?: "horizontal" | "vertical";
}

export interface TableSpec {
  headers: string[];
  rows: Array<Array<string | number>>;
  columnWidths?: number[];
  highlightRows?: number[];
}

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartSpec {
  kind: ChartKind;
  labels: string[];
  series: ChartSeries[];
  unit?: string;
  showLegend?: boolean;
  showValues?: boolean;
}

export interface KpiSpec {
  label: string;
  value: string;
  detail?: string;
  trend?: "up" | "down" | "flat";
}

export interface RoadmapLane {
  label: string;
  items: string[];
}

/**
 * A model-authored visual system for one deck. These fields are deliberately
 * open-ended: they communicate intent to an AI host and only the supplied
 * concrete colors/fonts are normalized by the renderer.
 */
export interface CreativePalette extends Partial<ColorsConfig> {
  colors?: string[];
  custom?: Record<string, string>;
}

export interface CreativeTypography {
  display?: string;
  heading?: string;
  body?: string;
  mono?: string;
  numeric?: string;
  fallbacks?: string[];
}

export interface CreativeDirection {
  name?: string;
  concept?: string;
  rationale?: string;
  mood?: string[];
  palette?: CreativePalette;
  typography?: CreativeTypography;
  compositionPrinciples?: string[];
  visualLanguage?: string;
  imageLanguage?: string;
  diagramLanguage?: string;
  chartLanguage?: string;
  shapeLanguage?: string;
  textureLanguage?: string;
  motionOrPacing?: string;
  avoid?: string[];
  [key: string]: unknown;
}

/**
 * The communication contract for one slide. It preserves the model's reasoning
 * about what the audience needs without prescribing how the slide must look.
 */
export interface SlideCommunicationPlan {
  audienceQuestion?: string;
  claim?: string;
  evidence?: string[];
  artifact?: string;
  explanation?: string[];
  implication?: string;
  action?: string;
  secondaryLanguage?: {
    language: string;
    title?: string;
    subtitle?: string;
    labels?: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * An open-ended knowledge map for the whole deck. This supports completeness
 * and audience-question coverage; it is not a mandatory section checklist.
 */
export interface DeckCompletenessPlan {
  audienceQuestions?: string[];
  knowledgeMap?: string[];
  requiredArtifacts?: string[];
  risksOrUnknowns?: string[];
  closingContract?: string[];
  [key: string]: unknown;
}

export interface CanvasTextRun {
  text: string;
  options?: Record<string, unknown>;
}

export interface CanvasElementBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex?: number;
  role?: string;
  intentionalOverlap?: boolean;
  allowOverlapWith?: string[];
}

export interface CanvasTextElement extends CanvasElementBase {
  type: "text";
  text?: string;
  runs?: CanvasTextRun[];
  style?: {
    fontSize?: number;
    fontFace?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    align?: "left" | "center" | "right" | "justify";
    valign?: "top" | "middle" | "bottom";
    margin?: number | [number, number, number, number];
    fit?: "none" | "shrink" | "resize";
    fill?: string;
    transparency?: number;
    lineColor?: string;
    lineWidth?: number;
    rotate?: number;
    options?: Record<string, unknown>;
  };
}

export interface CanvasShapeElement extends CanvasElementBase {
  type: "shape";
  /** Any PptxGenJS shape name, not a Slide Agent whitelist. */
  shape?: string;
  style?: {
    fill?: string;
    transparency?: number;
    lineColor?: string;
    lineWidth?: number;
    rotate?: number;
    options?: Record<string, unknown>;
  };
}

export interface CanvasConnectorElement extends CanvasElementBase {
  type: "connector";
  style?: {
    color?: string;
    width?: number;
    arrow?: boolean;
    beginArrow?: boolean;
    dashed?: boolean;
    options?: Record<string, unknown>;
  };
}

export interface CanvasImageElement extends CanvasElementBase {
  type: "image";
  path: string;
  alt: string;
  fit?: "cover" | "contain" | "stretch";
  style?: {
    rotate?: number;
    transparency?: number;
    options?: Record<string, unknown>;
  };
}

export interface CanvasTableElement extends CanvasElementBase {
  type: "table";
  table: TableSpec;
  options?: Record<string, unknown>;
}

export interface CanvasChartElement extends CanvasElementBase {
  type: "chart";
  chart: ChartSpec;
  style?: {
    colors?: string[];
    options?: Record<string, unknown>;
  };
}

/** Escape hatch for any chart type/data shape supported by PptxGenJS. */
export interface CanvasNativeChartElement extends CanvasElementBase {
  type: "native-chart";
  nativeType: string;
  data: Array<Record<string, unknown>>;
  alt?: string;
  options?: Record<string, unknown>;
}

export type CanvasElementSpec =
  | CanvasTextElement
  | CanvasShapeElement
  | CanvasConnectorElement
  | CanvasImageElement
  | CanvasTableElement
  | CanvasChartElement
  | CanvasNativeChartElement;

export interface CustomRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: "text" | "shape" | "image";
  text?: string;
  imagePath?: string;
  fill?: string;
  fontSize?: number;
}

export interface SlideSpec {
  id: string;
  kind: SlideKind;
  layout?: string;
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  body?: string;
  bullets?: string[];
  visual?: VisualSpec;
  comparison?: ComparisonColumn[];
  timeline?: TimelineItem[];
  process?: ProcessStep[];
  architecture?: ArchitectureSpec;
  table?: TableSpec;
  chart?: ChartSpec;
  kpis?: KpiSpec[];
  quote?: { text: string; attribution?: string };
  roadmap?: RoadmapLane[];
  custom?: CustomRegion[];
  /** Content and reasoning metadata; it never forces a visible layout. */
  communication?: SlideCommunicationPlan;
  /** Internal creative instruction; it is never rendered automatically. */
  designIntent?: string;
  /** Free-form description of the intended spatial composition. */
  composition?: string;
  /** Per-slide background color without a leading #. */
  background?: string;
  /**
   * Model-authored editable slide scene. When present, it is the layout: the
   * fixed layout registry is bypassed completely.
   */
  canvas?: CanvasElementSpec[];
  speakerNotes?: string[];
  sources?: SourceCitation[];
}

export interface PresentationBrief {
  title: string;
  subtitle?: string;
  audience: string;
  objective: string;
  presentationType: PresentationType;
  tone: string;
  visualDirection: string;
  slideCount: number;
  language: string;
  outputRequirements: string[];
  keyTopics: string[];
  sourcePrompt: string;
}

export interface PresentationOutline {
  brief: PresentationBrief;
  narrative: string;
  completeness?: DeckCompletenessPlan;
  creativeDirection?: CreativeDirection;
  slides: SlideSpec[];
}

export interface DimensionsConfig {
  layout: "LAYOUT_WIDE" | "LAYOUT_STANDARD";
  width: number;
  height: number;
  margin: number;
  titleBandHeight: number;
  footerHeight: number;
}

export interface ColorsConfig {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentAlt: string;
  accentSoft: string;
  rule: string;
  positive: string;
  negative: string;
  warning: string;
}

export interface FontsConfig {
  heading: string;
  body: string;
  mono: string;
  fallbacks: string[];
  supported: string[];
  minimums: {
    deckTitle: number;
    slideTitle: number;
    subheading: number;
    body: number;
    caption: number;
  };
}

export interface GenerationConfig {
  defaultSlideCount: number;
  minimumSlideCount: number;
  maximumSlideCount: number;
  maximumBulletsPerSlide: number;
  maximumWordsPerBullet: number;
  maximumBodyWords: number;
  maximumRetries: number;
  renderWidth: number;
  renderHeight: number;
  failOnWarnings: boolean;
  includeSpeakerNotes: boolean;
  includeSlideNumbers: boolean;
}

export interface SlideAgentConfig {
  dimensions: DimensionsConfig;
  colors: ColorsConfig;
  fonts: FontsConfig;
  generation: GenerationConfig;
}

export type ElementType = "text" | "shape" | "image" | "table" | "chart" | "connector";

export interface ElementRecord {
  id: string;
  name: string;
  type: ElementType;
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fontSize?: number;
  fontFace?: string;
  textColor?: string;
  fillColor?: string;
  /** PowerPoint autofit mode; `shrink` lets the viewer reduce text to fit. */
  fit?: "none" | "shrink" | "resize";
  bold?: boolean;
  imagePath?: string;
  /** Alternative text for images and charts; drives accessibility checks. */
  altText?: string;
  intentionalOverlap?: boolean;
  allowOverlapWith?: string[];
  metadata?: Record<string, unknown>;
}

export interface SlideManifest {
  number: number;
  id: string;
  title: string;
  kind: SlideKind;
  /** Resolved slide background used for contrast analysis. */
  backgroundColor?: string;
  compositionMode?: "model-authored" | "fallback-layout";
  designIntent?: string;
  elements: ElementRecord[];
  notes: string[];
}

export interface DeckManifest {
  schemaVersion: "1.0";
  presentationTitle: string;
  width: number;
  height: number;
  createdAt: string;
  creativeDirection?: CreativeDirection;
  /**
   * SHA-256 of the exported .pptx this manifest describes. Lets later
   * validation runs prove a discovered manifest still matches the package
   * before trusting its authoring metadata (for example intentional overlap).
   */
  packageSha256?: string;
  slides: SlideManifest[];
}

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  slide?: number;
  elementIds?: string[];
  details?: Record<string, unknown>;
  fixable: boolean;
  fixed?: boolean;
  /** Why a fixable issue could not be repaired automatically. */
  unfixedReason?: string;
}

export interface ValidationReport {
  schemaVersion: "1.0";
  status: "pass" | "warning" | "fail";
  presentation: string;
  checkedAt: string;
  slideCount: number;
  summary: { errors: number; warnings: number; info: number };
  iterations: number;
  issues: ValidationIssue[];
  render?: {
    status: "pass" | "fail" | "skipped";
    previewFiles: string[];
    pdfPath?: string;
    error?: string;
  };
}

export interface ExecutionMetadata {
  requestId: string;
  command: "create" | "edit" | "render" | "validate";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  retries: number;
  version: string;
}

export interface AgentResult {
  status: "success" | "warning" | "error";
  /** The main file a human normally wants to open. */
  primaryOutput?: string;
  /** Top-level files intended for the user. */
  deliverables?: string[];
  /** Previews, logs, manifests, and model round-trip files. */
  artifacts?: string[];
  generatedFiles: string[];
  slideCount: number;
  warnings: string[];
  /** Repairs the auto-fixer applied. Informational: they do not degrade status. */
  repairs?: string[];
  validation?: ValidationReport;
  errors: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  metadata: ExecutionMetadata;
}

export interface CreateRequest {
  command: "create";
  prompt?: string;
  brief?: Partial<PresentationBrief>;
  outline?: PresentationOutline;
  /** Path to a line-oriented model-authored scene blueprint. */
  scene?: string;
  /** Inline scene blueprint; useful for extension APIs. */
  sceneNdjson?: string;
  /** Host-model creative direction; overrides the one embedded in an outline. */
  creativeDirection?: CreativeDirection;
  output: string;
  previewsDir?: string;
  reportPath?: string;
  metadataPath?: string;
  /** Defaults to artifacts/intermediate_files/<name>.inspect.ndjson. */
  inspectPath?: string;
  configDir?: string;
  render?: boolean;
  validate?: boolean;
  autoFix?: boolean;
  maxRetries?: number;
}

export interface ReplaceTextOperation {
  type: "replace-text";
  find: string;
  replace: string;
  slide?: number;
  replaceAll?: boolean;
}

export interface RemoveSlideOperation {
  type: "remove-slide";
  slide: number;
}

export interface DuplicateSlideOperation {
  type: "duplicate-slide" | "add-slide";
  slide: number;
  insertAt?: number;
  replacements?: Array<{ find: string; replace: string }>;
}

export interface ReorderSlidesOperation {
  type: "reorder-slides";
  order: number[];
}

export interface ApplyThemeOperation {
  type: "apply-theme";
  colors?: Partial<ColorsConfig>;
  headingFont?: string;
  bodyFont?: string;
}

export interface ReplaceImageOperation {
  type: "replace-image";
  slide: number;
  imagePath: string;
  name?: string;
  relationshipId?: string;
}

export interface UpdateTableOperation {
  type: "update-table";
  slide: number;
  rows: Array<Array<string | number>>;
  name?: string;
  tableIndex?: number;
}

export interface UpdateChartOperation {
  type: "update-chart";
  slide: number;
  chartIndex?: number;
  labels: string[];
  series: ChartSeries[];
}

export type EditOperation =
  | ReplaceTextOperation
  | RemoveSlideOperation
  | DuplicateSlideOperation
  | ReorderSlidesOperation
  | ApplyThemeOperation
  | ReplaceImageOperation
  | UpdateTableOperation
  | UpdateChartOperation;

export interface EditRequest {
  command: "edit";
  input: string;
  output: string;
  operations: EditOperation[];
  previewsDir?: string;
  beforePreviewsDir?: string;
  reportPath?: string;
  render?: boolean;
  validate?: boolean;
  preserveUnsupported?: boolean;
  configDir?: string;
}

export interface RenderRequest {
  command: "render";
  input: string;
  output: string;
  width?: number;
  height?: number;
}

export interface ValidateRequest {
  command: "validate";
  input: string;
  /** Validation report JSON path; defaults to artifacts/logs next to the deck. */
  report?: string;
  manifest?: string;
  previewsDir?: string;
  configDir?: string;
  render?: boolean;
}

export type StructuredAgentRequest = CreateRequest | EditRequest | RenderRequest | ValidateRequest;

export interface LayoutContext {
  slideNumber: number;
  totalSlides: number;
  config: SlideAgentConfig;
}

export interface RenderResult {
  previewFiles: string[];
  pdfPath: string;
  width: number;
  height: number;
}

export interface PptxInspection {
  manifest: DeckManifest;
  warnings: string[];
  unsupportedFeatures: string[];
}
