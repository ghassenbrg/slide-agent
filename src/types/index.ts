import type { VisualReviewFinding } from "../review/types.js";
import type { RelativeFrame } from "../design/relations.js";
import type { TokenBudget } from "../evaluation/token-budget.js";

export type { ReviewPacket, VisualReviewFinding, VisualFindingSeverity } from "../review/types.js";
export type { TokenBudget } from "../evaluation/token-budget.js";
export type { FrameRelation, FrameValue, RelativeFrame } from "../design/relations.js";

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

export type ChartKind =
  | "bar"
  | "bar-stacked"
  | "bar-horizontal"
  | "line"
  | "pie"
  | "doughnut"
  | "area"
  | "scatter"
  | "radar"
  | "waterfall";
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

/** Any value JSON can express. Deck variables are deliberately this open. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** A reference from a style value to a deck variable: `{"$var":"map-ink"}`. */
export interface VariableReference {
  $var: string;
}

/**
 * A deck-specific visual system invented by the author.
 *
 * Nothing here is chosen from a Slide Agent list. `variables` are arbitrary
 * JSON under names the author picked, `styles` are arbitrary reusable property
 * bags, `motifs` record subject-derived ideas and what they mean, and
 * `constraints` are the author's own rules — not engine presets. Slide Agent
 * resolves references and validates types; it never renames, substitutes, or
 * normalizes the vocabulary.
 */
export interface DeckVisualSystem {
  /** Arbitrary names chosen by the author. */
  variables?: Record<string, JsonValue>;
  /** Arbitrary reusable style names, with optional inheritance. */
  styles?: Record<string, {
    basedOn?: string[];
    style: Record<string, unknown>;
  }>;
  /** Subject-derived visual ideas and what they mean. */
  motifs?: Record<string, {
    description: string;
    meaning?: string;
    usage?: string;
    avoid?: string[];
  }>;
  /** Author-declared rules, not engine presets. */
  constraints?: {
    hard?: string[];
    soft?: string[];
  };
  [key: string]: unknown;
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
  /**
   * The point sizes this deck commits to, largest first.
   *
   * A ladder is what separates a type system from a series of separate
   * decisions. Declaring one lets the report say which elements stepped off it,
   * which is a question nobody can answer by looking at a list of sizes. It is
   * a statement of intent, not a constraint: an element may use any size it
   * likes, and the deviation is reported rather than refused.
   */
  scale?: number[];
}

export interface CreativeDirection {
  name?: string;
  concept?: string;
  rationale?: string;
  mood?: string[];
  palette?: CreativePalette;
  typography?: CreativeTypography;
  /** The deck's own variables, named styles, motifs, and declared rules. */
  visualSystem?: DeckVisualSystem;
  compositionPrinciples?: string[];
  visualLanguage?: string;
  imageLanguage?: string;
  diagramLanguage?: string;
  chartLanguage?: string;
  shapeLanguage?: string;
  textureLanguage?: string;
  motionOrPacing?: string;
  /** Open prose. Never reduced to an enum; `geometry` is the legacy hint. */
  geometryLanguage?: string;
  /** Open prose describing the deck's spacing and pacing logic. */
  spatialRhythm?: string;
  /** Open prose describing surface, texture, and material treatment. */
  materialLanguage?: string;
  /**
   * Legacy closed enums kept for compatibility with contract 0.9 hosts. They
   * feed the fallback layouts only; a model-authored canvas is never restyled
   * from them. Prefer `geometryLanguage` and `spatialRhythm`.
   *
   * @deprecated since contract 0.10
   */
  density?: "sparse" | "balanced" | "dense" | (string & {});
  /** @deprecated since contract 0.10 — see `geometryLanguage`. */
  geometry?: "sharp" | "soft" | "organic" | (string & {});
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
  /**
   * Named styles from `creativeDirection.visualSystem.styles`, applied in
   * order. The element's own `style` is the final override.
   */
  styleRef?: string | string[];
  /** A named layer, for review and z-order grouping. Never a visual style. */
  layer?: string;
  /**
   * Declares that this element is meant to run past the slide edge.
   *
   * A full-bleed plate and a word cropped by the top of the page are ordinary
   * design, not defects — but they are indistinguishable from a mistake unless
   * the author says which one it is. Saying so here keeps the check meaningful
   * for everything that did not.
   */
  allowBleed?: boolean;
  intentionalOverlap?: boolean;
  allowOverlapWith?: string[];
  /**
   * Placement stated against elements already on the slide.
   *
   * Any axis given here wins over the literal `x`/`y`/`w`/`h`. Relations are
   * solved before the slide is composed and the solved inches are what the
   * scene and the manifest carry, so nothing downstream sees a relation.
   */
  place?: RelativeFrame;
}

/**
 * A hyperlink target. Only http, https, and mailto survive validation; a
 * `slide` link points inside the same deck.
 */
export type CanvasLink = string | { url: string; tooltip?: string } | { slide: number; tooltip?: string };

/** Paragraph-level typography, exposed in the schema rather than in `options`. */
export interface CanvasTextStyle {
  fontSize?: number;
  fontFace?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right" | "justify";
  valign?: "top" | "middle" | "bottom";
  margin?: number | [number, number, number, number];
  fit?: "none" | "shrink" | "resize";
  fill?: string;
  transparency?: number;
  lineColor?: string;
  lineWidth?: number;
  rotate?: number;
  /** Multiple of the font size, e.g. 1.35. Converted to points on write. */
  lineSpacingMultiple?: number;
  /** Absolute line spacing in points. Wins over `lineSpacingMultiple`. */
  lineSpacing?: number;
  /** Tracking in points; negative tightens. */
  charSpacing?: number;
  /** First-line/paragraph indent in inches. */
  indent?: number;
  /** Newspaper-style text columns inside the one text box. */
  columns?: number;
  /** Replaces spaces with non-breaking spaces so the string never splits. */
  noBreak?: boolean;
  bullet?: boolean | { type?: "bullet" | "number"; code?: string; indent?: number };
  options?: Record<string, unknown>;
}

export interface CanvasTextElement extends CanvasElementBase {
  type: "text";
  text?: string;
  runs?: CanvasTextRun[];
  link?: CanvasLink;
  style?: CanvasTextStyle;
}

export interface CanvasShapeElement extends CanvasElementBase {
  type: "shape";
  /** Any PptxGenJS shape name, not a Slide Agent whitelist. */
  shape?: string;
  link?: CanvasLink;
  style?: {
    fill?: string;
    transparency?: number;
    lineColor?: string;
    lineWidth?: number;
    /**
     * Corner radius in inches for a `roundRect`. Left unstated, PowerPoint
     * rounds by 16.667% of the shorter side — which is not a square corner,
     * and is what anything drawn flush to the corner has to be inset by.
     */
    radius?: number;
    rotate?: number;
    options?: Record<string, unknown>;
  };
}

/** Which edge of an element a connector leaves from or arrives at. */
export type ConnectorEndpointSide = "top" | "right" | "bottom" | "left" | "auto";

/** An element id, optionally with the side the connector should use. */
export type ConnectorEndpoint = string | { id: string; side?: ConnectorEndpointSide };

/**
 * A line between two points, or — when `from` and `to` name elements — a route
 * the engine resolves against the real frames on the slide.
 *
 * Anchored connectors are the reason a diagram reads as drawn rather than
 * sketched: the arrow meets the edge of the shape it points at, it stands off
 * far enough that the head is legible, and it goes around anything in the way.
 * None of that is a judgement about the diagram, so none of it belongs to the
 * author.
 */
export interface CanvasConnectorElement extends Omit<CanvasElementBase, "x" | "y" | "w" | "h"> {
  type: "connector";
  /** Start point when the connector is not anchored. */
  x?: number;
  y?: number;
  /** Delta to the end point when the connector is not anchored; may be negative. */
  w?: number;
  h?: number;
  /** Start element. With `to`, x/y/w/h are computed and may be omitted. */
  from?: ConnectorEndpoint;
  /** End element. */
  to?: ConnectorEndpoint;
  /** How the path is drawn between the anchors. Defaults to `elbow`. */
  route?: "straight" | "elbow" | "curved";
  /** Gap held from elements the route is not joining, in inches. */
  clearance?: number;
  /** How far the route runs straight out of an anchor before turning, in inches. */
  stub?: number;
  /** Ids the route may cross without it being reported. */
  mayCross?: string[];
  style?: {
    color?: string;
    width?: number;
    arrow?: boolean;
    beginArrow?: boolean;
    dashed?: boolean;
    options?: Record<string, unknown>;
  };
}

/** Attribution and origin for one image. See `imageProvenanceSchema`. */
export interface ImageProvenance {
  source?: string;
  credit?: string;
  license?: string;
  generated?: boolean;
  generator?: string;
  [key: string]: unknown;
}

/** How much of an element survives as an editable PowerPoint object. */
export type Editability =
  | "native"
  | "grouped-native"
  | "embedded-vector"
  | "embedded-raster"
  | "generated-native";

/**
 * Vector artwork carried alongside the raster PowerPoint actually embeds.
 * OOXML stores an SVG as an *enhancement* to a bitmap blip, so the raster in
 * `path` is not optional — it is what older viewers draw.
 */
export interface CanvasVectorArtwork {
  /** Path to the .svg. Travels with the package and is declared in the manifest. */
  path: string;
  /** Honest editability. Vector artwork is scalable, not shape-editable. */
  editable: false | "partial" | true;
  /** Where the artwork came from, and who may use it. */
  source?: string;
  license?: string;
}

/** Deterministic, opt-in pixel work applied before the image is embedded. */
export interface ImageTreatment {
  /** Where the subject sits, 0–1 in each axis. Drives `cover` cropping. */
  focalPoint?: { x: number; y: number };
  /** Explicit crop as fractions of the source, per edge. */
  crop?: { left?: number; right?: number; top?: number; bottom?: number };
  /** A PowerPoint shape name used as a mask, e.g. `ellipse`. */
  maskShape?: string;
  /** Flat colour wash: `color` at `amount` (0–1) over the image. */
  tint?: { color: string; amount?: number };
  /** Two-tone mapping from shadow to highlight. */
  duotone?: { shadow: string; highlight: string };
  grayscale?: boolean;
}

export interface CanvasImageElement extends CanvasElementBase {
  type: "image";
  path: string;
  alt: string;
  provenance?: ImageProvenance;
  vector?: CanvasVectorArtwork;
  treatment?: ImageTreatment;
  link?: CanvasLink;
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

/** A diagram described as a relationship; Slide Agent places the geometry. */
export interface CanvasDiagramElement extends CanvasElementBase {
  type: "diagram";
  /** A built-in grammar or one a host registered. Checked when the slide is built. */
  grammar: string;
  spec: Record<string, unknown>;
  alt?: string;
}

/**
 * A logical group. Children are positioned relative to the group's origin and
 * expand into ordinary native elements, so every part stays individually
 * editable in PowerPoint — which a native group does not reliably guarantee
 * across viewers. The relative transform is preserved on round-trip.
 */
export interface CanvasGroupElement extends CanvasElementBase {
  type: "group";
  children: CanvasElementSpec[];
  /** Uniform scale applied to every child's offset and size. Defaults to 1. */
  scale?: number;
  alt?: string;
}

/** Per-instance overrides for one symbol placement, addressed by child id. */
export interface SymbolInstanceOverrides {
  text?: Record<string, string>;
  color?: Record<string, string>;
  style?: Record<string, Record<string, unknown>>;
}

/**
 * One placement of an author-defined symbol. Symbols are declared by the deck
 * — Slide Agent ships no icon vocabulary — and expand into native elements.
 */
export interface CanvasSymbolInstanceElement extends CanvasElementBase {
  type: "symbol-instance";
  /** Name of a symbol declared in the scene. */
  symbol: string;
  scale?: number;
  overrides?: SymbolInstanceOverrides;
  alt?: string;
}

/** A reusable collection of authored elements, defined by the deck itself. */
export interface DeckSymbol {
  id: string;
  /** Design-time width and height the children were authored against. */
  w: number;
  h: number;
  elements: CanvasElementSpec[];
  description?: string;
}

export type CanvasElementSpec =
  | CanvasTextElement
  | CanvasShapeElement
  | CanvasConnectorElement
  | CanvasImageElement
  | CanvasTableElement
  | CanvasChartElement
  | CanvasNativeChartElement
  | CanvasDiagramElement
  | CanvasGroupElement
  | CanvasSymbolInstanceElement;

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
  /**
   * How this slide treats the deck's `slideChrome`. `false` suppresses it —
   * a cover rarely wants a page number — and an object supplies values the
   * chrome interpolates, such as this slide's kicker.
   */
  chrome?: false | Record<string, string>;
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

/**
 * The visual theses the author considered and the one it committed to. Concise
 * authoring metadata, never private chain-of-thought: it is what later critique
 * compares the render against.
 */
export interface DesignExploration {
  alternatives?: Array<{
    name: string;
    thesis: string;
    differentiator: string;
    rejectedBecause?: string;
  }>;
  chosen?: string;
  [key: string]: unknown;
}

/** One slide's declared narrative job and intended silhouette. */
export interface SequencePlanItem {
  slideId: string;
  narrativeJob: string;
  dominantArtifact?: string;
  silhouette?: string;
  energy?: "quiet" | "medium" | "loud" | (string & {});
  transition?: string;
  [key: string]: unknown;
}

/**
 * One factual claim the deck makes and what backs it. Concise evidence
 * metadata: it lets revision checks catch orphaned sources, stale
 * qualifications, and unsupported precision.
 */
export interface ClaimLedgerItem {
  id: string;
  slideId?: string;
  claim: string;
  kind?: "fact" | "number" | "quote" | "recommendation" | "illustrative" | (string & {});
  sourceIds?: string[];
  asOf?: string;
  calculation?: string;
  status?: "verified" | "needs-review" | "illustrative" | (string & {});
  [key: string]: unknown;
}

/**
 * What the *host AI* can do, declared so the contract can recommend a workflow
 * that uses those strengths. Planning context, never a security grant: the core
 * performs no provider call of its own regardless of what is declared here.
 */
export interface HostAuthoringCapabilities {
  vision?: boolean;
  webResearch?: boolean;
  imageGeneration?: boolean;
  vectorGeneration?: boolean;
  codeExecution?: boolean;
  localFileAccess?: boolean;
  availableAssetProviders?: string[];
  [key: string]: unknown;
}

/**
 * Elements repeated on every model-authored slide, declared once by the deck.
 *
 * Slide Agent ships none of these and has no opinion about whether a deck
 * should have any. It repeats what the author wrote and fills in the few values
 * that differ per slide.
 */
export interface SlideChrome {
  /**
   * The elements to repeat. Any string may interpolate `{{slideNumber}}`,
   * `{{slideNumberPadded}}`, `{{slideCount}}`, `{{slideTitle}}`,
   * `{{deckTitle}}`, or any key a slide supplies in its own `chrome`.
   */
  elements: CanvasElementSpec[];
  /**
   * Style overrides per named variant, keyed by variant then by element id.
   *
   * A slide picks one with `chrome: { variant: "paper" }`. Only style
   * properties change; the elements, their text, and their positions remain a
   * single declaration, so a deck can alternate light and dark slides without
   * either giving up its chrome or restating it.
   */
  variants?: Record<string, Record<string, Record<string, unknown>>>;
  /** Slide ids that opt out entirely, e.g. a cover. */
  skipSlides?: string[];
  /** Namespace applied to chrome element ids. Defaults to `chrome`. */
  idPrefix?: string;
}

export interface PresentationOutline {
  brief: PresentationBrief;
  narrative: string;
  /** Elements repeated on every model-authored slide. */
  slideChrome?: SlideChrome;
  completeness?: DeckCompletenessPlan;
  creativeDirection?: CreativeDirection;
  /** Visual theses considered, and the one this deck commits to. */
  exploration?: DesignExploration;
  /** Per-slide narrative job and intended silhouette, authored before coordinates. */
  sequencePlan?: SequencePlanItem[];
  /** Claims this deck makes and what backs each of them. */
  claims?: ClaimLedgerItem[];
  /** Cited sources the claim ledger refers to by id. */
  sourceLedger?: Array<SourceCitation & { id: string }>;
  /** Author-defined reusable element collections. Never a built-in vocabulary. */
  symbols?: DeckSymbol[];
  /** What the host AI that authored this deck could do. Planning context only. */
  hostCapabilities?: HostAuthoringCapabilities;
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
  /** 0–100. A translucent fill is not the colour a reader sees behind text. */
  fillTransparency?: number;
  /** PowerPoint autofit mode; `shrink` lets the viewer reduce text to fit. */
  fit?: "none" | "shrink" | "resize";
  bold?: boolean;
  /** The PptxGenJS shape name, recorded only when it isn't the plain-rectangle default. */
  shape?: string;
  /**
   * Corner radius in inches, when the author set one explicitly. A `roundRect`
   * without one is still rounded — PowerPoint applies its own preset default —
   * so absence here means "unstated", not "square".
   */
  radius?: number;
  /** The outline a picture was masked into, when it is not a plain rectangle. */
  maskShape?: string;
  imagePath?: string;
  /** Alternative text for images and charts; drives accessibility checks. */
  altText?: string;
  /** A checked hyperlink target: an absolute URL, or `slide:N` within the deck. */
  link?: string;
  /**
   * What the author wrote in `path`, before the resolver turned it into a
   * local file. Without it the manifest records only a cache path, so a deck
   * built from a URL could not say where its pictures came from.
   */
  imageSource?: string;
  provenance?: ImageProvenance;
  /**
   * How much of this element a person can actually edit in PowerPoint. Stated
   * per element because it is not uniform: text and charts are native objects,
   * a photograph is pixels, and artwork may be scalable but not shape-editable.
   */
  editability?: Editability;
  /** The author declared this element runs past the slide edge on purpose. */
  allowBleed?: boolean;
  /** The group or symbol instance this element was expanded from. */
  groupId?: string;
  /** The author's named layer, carried through for review. */
  layer?: string;
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
  provenance?: DeckProvenance;
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
  /**
   * Where this manifest came from. `authored` was written by a build and
   * carries the author's intent — deliberate overlap, roles, alt text.
   * `inspected` was recovered from the package alone, where none of that
   * intent survives, so checks that depend on it soften rather than fail.
   */
  source?: "authored" | "inspected";
  slides: SlideManifest[];
}

export interface QualityDimensionScore {
  id: "hierarchy" | "contrast" | "density" | "variety" | "evidence" | "accessibility";
  score: number;
  summary: string;
  advice?: string;
}

export interface QualityScore {
  overall: number;
  band: "weak" | "workable" | "strong";
  dimensions: QualityDimensionScore[];
}

/**
 * One file in a delivered package, identified by content rather than by name.
 *
 * A report that names a preview proves nothing: the preview may be from the
 * revision before last. A report that names its hash, and the hash of the PPTX
 * it was rendered from, cannot describe a deck it did not see.
 */
export interface ArtifactIdentity {
  /** Relative to the package root, so the record survives being moved. */
  path: string;
  sha256: string;
  bytes: number;
  /** Paths of the artifacts this one was produced from. */
  derivedFrom?: string[];
  createdAt: string;
}

/** Every artifact of one build, and what produced what. */
export interface ArtifactGraph {
  schemaVersion: "1.0";
  root: string;
  pptx: ArtifactIdentity;
  scene?: ArtifactIdentity;
  manifest?: ArtifactIdentity;
  validation?: ArtifactIdentity;
  review?: ArtifactIdentity;
  pdf?: ArtifactIdentity;
  previews: ArtifactIdentity[];
  assets: ArtifactIdentity[];
  render: { backend: string; version?: string; mode: "render" | "schematic" | "none" };
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

/** How much of the intended text survived to the render, and how sure we are. */
export interface RenderFidelityReport {
  status: "pass" | "review" | "fail" | "skipped";
  method: "pdf-text" | "ocr" | "none";
  confidence: "high" | "medium" | "low";
  /**
   * How many slides were compared.
   *
   * `slides` lists only the ones that mismatched, so this is what says the
   * silence is a clean result rather than a check that never ran.
   */
  checked?: number;
  /** Slides whose render did not match what was authored. Clean slides are omitted. */
  slides: Array<{
    slide: number;
    missing: string[];
    unexpected: string[];
    truncated: Array<{ intended: string; observed: string }>;
    repeated: string[];
    /** Words split by a line break where the source had none. */
    splitWords: string[];
    /** Intended text that OCR read at a materially different size or position. */
    substitutedFonts?: string[];
  }>;
  note?: string;
}

/** What a clean-directory rebuild of the emitted scene proved. */
export interface RoundTripReport {
  status: "pass" | "fail" | "skipped";
  slideCountMatches?: boolean;
  elementIdsMatch?: boolean;
  missingElementIds?: string[];
  /** Element properties that differed between the original and the rebuild. */
  changedProperties?: Array<{ slide: number; elementId: string; property: string; before: unknown; after: unknown }>;
  reason?: string;
}

export interface ValidationReport {
  schemaVersion: "1.0";
  /**
   * Kept for contract 0.9 hosts and documented as package-oriented. It mirrors
   * `packageStatus`; a future breaking contract removes it.
   *
   * @deprecated since contract 0.10 — read `packageStatus` and `presentationReadiness`.
   */
  status: "pass" | "warning" | "fail";
  /**
   * Deterministic file, schema, asset, link, render-freshness, and round-trip
   * integrity. "Does this package hold together?"
   */
  packageStatus: "pass" | "warning" | "fail";
  /**
   * "Would you put this in front of the audience?" — a different question from
   * whether the file opens, and never a weighted average: one critical
   * dimension blocks readiness however good the rest is.
   */
  presentationReadiness: "ready" | "review" | "not-ready";
  /** Why readiness landed where it did, in the order that decided it. */
  readinessReasons: string[];
  presentation: string;
  checkedAt: string;
  slideCount: number;
  summary: { errors: number; warnings: number; info: number };
  iterations: number;
  issues: ValidationIssue[];
  /**
   * Engine heuristics, named as such. They are proxies for design qualities,
   * not measurements of them, and they are not a quality score.
   */
  heuristics?: QualityScore;
  /**
   * @deprecated since contract 0.10 — the same object as `heuristics`, kept so
   * 0.9 readers do not break.
   */
  quality?: QualityScore;
  /** Every artifact this report describes, bound by content hash. */
  artifacts?: ArtifactGraph;
  fidelity?: RenderFidelityReport;
  roundTrip?: RoundTripReport;
  /** Findings from a host or an installed visual reviewer. */
  visualFindings?: VisualReviewFinding[];
  /**
   * Whether anybody recorded a judgement on this deck's renders.
   *
   * Only set when this run authored the deck; absent for a package that
   * arrived from elsewhere, whose review history is unknowable.
   */
  reviewed?: boolean;
  /** Repairs proposed but not applied, under `suggest` mode. */
  suggestedRepairs?: SuggestedRepair[];
  /** Repairs actually applied, with rollback data. */
  appliedRepairs?: AppliedRepair[];
  render?: {
    status: "pass" | "fail" | "skipped";
    previewFiles: string[];
    pdfPath?: string;
    /** `schematic` previews are drawings of the geometry, not rendered slides. */
    mode?: "render" | "schematic";
    error?: string;
  };
}

/** How much freedom the repair loop has over model-authored values. */
export type RepairMode = "safe" | "suggest" | "off";

export interface SuggestedRepair {
  issueCode: string;
  slide?: number;
  elementIds?: string[];
  property: string;
  before: unknown;
  after: unknown;
  rationale: string;
  /** True when the change would alter a value the author wrote deliberately. */
  changesAuthorIntent: boolean;
}

export interface AppliedRepair extends SuggestedRepair {
  appliedAt: string;
  /** What to write back to undo it. */
  rollback: { property: string; value: unknown };
  /** Whether the render and its text survived the change unchanged. */
  renderRegression: "none" | "not-checked" | "detected";
}

/**
 * Where the deck's design came from. `template-draft` decks contain
 * placeholders and no art direction; callers must not present them as
 * finished work.
 */
export type DeckProvenance = "model-authored" | "template-draft";

export interface ExecutionMetadata {
  requestId: string;
  command: "create" | "edit" | "render" | "validate" | "revise" | "patch";
  /** The authoring contract this engine implements. */
  contractVersion?: string;
  provenance?: DeckProvenance;
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
  /** "Does this package hold together?" — lifted out of the report for callers. */
  packageStatus?: ValidationReport["packageStatus"];
  /** "Would you put this in front of the audience?" */
  presentationReadiness?: ValidationReport["presentationReadiness"];
  /** What a `patch` changed, and — just as importantly — what it did not. */
  patch?: {
    changes: unknown[];
    untouched: Array<{ slide: number; elementIds: string[] }>;
    diff: string;
    applied: boolean;
    /**
     * The slides this patch altered, absent when it altered the deck as a
     * whole. What lets a one-element patch return one render rather than every
     * render the rebuild produced.
     */
    changedSlides?: number[];
  };
  /**
   * Slides this command is known to have altered, 1-based.
   *
   * Set by the commands that can know — `patch` from its own diff, `revise`
   * from its target, `edit` from the slides its operations name. Absent means
   * "not determinable", which is a different answer from "none" and is treated
   * as such: a preview selection of `changed` returns everything and says why.
   */
  changedSlides?: number[];
  errors: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  /**
   * What this result cost the reader, and what the richer option would cost.
   *
   * Attached at the boundary that serializes the result, because that is the
   * only place the images are known. A caller reading an `AgentResult` straight
   * off the TypeScript API pays no image cost and sees no budget.
   */
  tokenBudget?: TokenBudget;
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
  /**
   * Path to a JavaScript module that builds the deck and exports it.
   *
   * The script is imported into this process and runs with the privileges of
   * the caller — the same trust decision as running it with `node`. It is only
   * ever a path the caller supplied; nothing discovers or fetches scripts.
   */
  script?: string;
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
  /**
   * Permits fetching `http(s)` image URLs. Off by default: a canvas is
   * model-authored and often derived from untrusted input, so remote fetches
   * are an explicit choice. Private and link-local addresses stay blocked
   * even when this is enabled.
   */
  allowRemoteAssets?: boolean;
  /**
   * Rebuild the emitted scene in a clean temporary directory using only the
   * packaged assets, and compare the result. Off by default because it doubles
   * the build; on for any run whose output is going to be delivered.
   */
  roundTrip?: boolean;
  /** How much freedom the repair loop has. Defaults to `suggest` on a canvas. */
  repair?: RepairMode;
  /**
   * Where a relative asset path inside a supplied scene resolves from.
   * Defaults to the scene file's own directory.
   */
  assetBaseDir?: string;
  /** Path to a brand-kit JSON file constraining palette, type, logo, footer. */
  brand?: string;
  /**
   * Renders `communication.secondaryLanguage` alongside the primary text.
   * `parallel` and `stacked` place it on the slide; `notes` keeps the slide
   * monolingual and puts the translation in the speaker notes.
   */
  bilingual?: "parallel" | "stacked" | "notes";
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

/**
 * Copy one slide out of another presentation. The slide arrives with its own
 * shapes, images, charts, and speaker notes, remapped onto a layout in the
 * destination deck so the result carries one theme rather than two.
 */
export interface ImportSlideOperation {
  type: "import-slide";
  /** Path to the source .pptx. */
  source: string;
  /** 1-based slide number in the source deck. */
  slide: number;
  /** 1-based position in the destination deck. Appends when omitted. */
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
  | ImportSlideOperation
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
  /**
   * What a reviewer saw in the renders.
   *
   * This is how the loop closes. A deck this engine built is held at `review`
   * until somebody records a judgement on it; supplying findings here — even a
   * single one at severity `none` saying the slides are sound — is that record.
   */
  visualFindings?: VisualReviewFinding[];
  /** Validation report JSON path; defaults to artifacts/logs next to the deck. */
  report?: string;
  manifest?: string;
  previewsDir?: string;
  configDir?: string;
  render?: boolean;
  /** Rebuild the emitted scene in a clean directory and compare the result. */
  roundTrip?: boolean;
}

export interface ReviseRequest {
  command: "revise";
  /** The existing deck. Its scene blueprint is discovered beside it. */
  input: string;
  output: string;
  /** 1-based slide number to replace. */
  slide: number;
  /** Replacement NDJSON records for that slide only. */
  sceneNdjson: string;
  /** Override the scene path when it does not sit beside the deck. */
  scene?: string;
  configDir?: string;
  render?: boolean;
  validate?: boolean;
  autoFix?: boolean;
  maxRetries?: number;
  allowRemoteAssets?: boolean;
}

/**
 * Change specific elements on specific slides without restating the rest.
 *
 * `revise` replaces a whole slide; this replaces a caption. The difference
 * matters because every restatement is a chance to lose a decision the author
 * made earlier, and critique is only cheap if acting on it is cheap.
 */
export interface PatchRequest {
  command: "patch";
  /** The existing deck. Its scene blueprint is discovered beside it. */
  input: string;
  output: string;
  operations: unknown[];
  /** Override the scene path when it does not sit beside the deck. */
  scene?: string;
  /** Report the semantic diff without writing anything. */
  dryRun?: boolean;
  configDir?: string;
  render?: boolean;
  validate?: boolean;
  roundTrip?: boolean;
  allowRemoteAssets?: boolean;
}

export type StructuredAgentRequest =
  | CreateRequest
  | EditRequest
  | RenderRequest
  | ValidateRequest
  | ReviseRequest
  | PatchRequest;

export interface LayoutContext {
  slideNumber: number;
  totalSlides: number;
  config: SlideAgentConfig;
}

export interface RenderResult {
  previewFiles: string[];
  /** Absent for a schematic preview, which produces no PDF. */
  pdfPath?: string;
  width: number;
  height: number;
  /**
   * `render` is LibreOffice's true render. `schematic` is Slide Agent's own
   * drawing of the deck's geometry, used when the preview tools are absent —
   * accurate about position, size, colour, and wrapping, and about nothing
   * else. Callers that need a faithful image must check this.
   */
  mode?: "render" | "schematic";
}

export interface PptxInspection {
  manifest: DeckManifest;
  warnings: string[];
  unsupportedFeatures: string[];
}
