import type { ChartData, ChartKind, Provenance } from "./compose.js";
import type { Finding } from "./issues.js";

/**
 * SceneGraph v2: the canonical, round-trippable record of what was built.
 * Frames are solved inches; colours are token references where possible.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A colour as the writer should emit it: a theme slot, or a literal. */
export interface ColorRef {
  /** Resolved sRGB hex, always present, for previews and checks. */
  hex: string;
  /** Theme slot (`accent1`, `dk1`, …) when the colour maps onto one. */
  slot?: string;
  /** Token the author referenced: a role, palette name, or `name/NN`. */
  token?: string;
  /** 0–1 luminance modulation for tints, when expressible against the slot. */
  lumMod?: number;
  lumOff?: number;
  alpha?: number;
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
  color?: ColorRef;
  font?: string;
  mono?: boolean;
}

export interface TextParagraph {
  runs: TextRun[];
  bullet?: "bullet" | "number";
  level?: number;
}

export type AdjustmentKind = "contrast" | "type-step" | "snap" | "font-substitute" | "clamp-bounds";

export interface Adjustment {
  kind: AdjustmentKind;
  from: unknown;
  to: unknown;
  reason: string;
  /** JSON pointer into the intent of the property that was adjusted. */
  path?: string;
}

export type FitStatus = "fit" | "reflowed" | "scaled" | "choice-pending" | "recipe-switched" | "split" | "shortened" | "overflow";

export type ElementRole =
  | "title" | "subtitle" | "body" | "label" | "caption" | "metric" | "decorative" | "chrome"
  | "data" | "media" | "connector" | "container" | "quote";

export interface TextStyle {
  font: string;
  /** The family and weight the author asked for, so previews measure with the same faces as the fit engine. */
  family?: string;
  weight?: number;
  /** "display" | "body" | "mono" when the face is a theme font. */
  fontRole?: "display" | "body" | "mono";
  size: number;
  bold: boolean;
  italic: boolean;
  color: ColorRef;
  align: "left" | "center" | "right" | "justify";
  valign: "top" | "middle" | "bottom";
  tracking?: number;
  leading: number;
  case?: "none" | "upper" | "lower" | "title" | "small-caps";
  inset: [number, number, number, number];
}

export interface ShapeStyle {
  preset: string;
  fill?: ColorRef;
  stroke?: ColorRef;
  strokeWidth?: number;
  radius?: number;
  shadow?: "none" | "soft" | "hard";
  opacity?: number;
  path?: string;
  dash?: "solid" | "dash" | "dot";
  arrowEnd?: boolean;
  gradient?: { from: ColorRef; to: ColorRef; angle: number; toAlpha?: number };
}

export interface SceneElementBase {
  id: string;
  role: ElementRole;
  frame: Rect;
  rotate?: number;
  z: number;
  placeholder?: { type: "title" | "ctrTitle" | "subTitle" | "body" | "sldNum" | "ftr"; idx?: number };
  provenance: { source: Provenance; path: string; component?: string; recipe?: string };
  adjustments?: Adjustment[];
  pins?: string[];
  alt?: string;
  decorative?: boolean;
  readingIndex?: number;
  fit?: { status: FitStatus; steps: string[]; lines?: number; capacityChars?: number };
  /** Surfaces this element sits on, nearest last, used for contrast checks. */
  ground?: string;
  /** Placed inside a layer or free container, where overlap is declared rather than a defect. */
  overlapAllowed?: boolean;
}

export interface TextElement extends SceneElementBase {
  kind: "text";
  paragraphs: TextParagraph[];
  style: TextStyle;
  typeRole: string;
  shape?: ShapeStyle;
}

export interface ShapeElement extends SceneElementBase {
  kind: "shape";
  style: ShapeStyle;
  text?: { paragraphs: TextParagraph[]; style: TextStyle };
}

export interface ImageElement extends SceneElementBase {
  kind: "image";
  asset: string;
  sha256?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  crop?: { left: number; top: number; right: number; bottom: number };
  treatment?: "none" | "grayscale" | "duotone" | "tint";
  tint?: ColorRef;
  radius?: number;
}

export interface IconElement extends SceneElementBase {
  kind: "icon";
  name: string;
  /** SVG path data in a 24×24 box. */
  paths: Array<{ d: string; fill: boolean }>;
  color: ColorRef;
  strokeWidth: number;
}

export interface ChartElement extends SceneElementBase {
  kind: "chart";
  chart: ChartKind;
  data: ChartData;
  colors: ColorRef[];
  highlight: number[];
  style: {
    font: string;
    size: number;
    text: ColorRef;
    muted: ColorRef;
    rule: ColorRef;
    axis: "none" | "hairline" | "regular";
    gridlines: "none" | "major" | "subtle";
    labels: "none" | "end" | "inside" | "outside";
    legend: "none" | "top" | "bottom" | "right";
    /** Colour for highlighted categories; the rest are drawn in their series colour at reduced emphasis. */
    highlight?: ColorRef;
  };
  title?: string;
  facts?: string[];
}

export interface TableElement extends SceneElementBase {
  kind: "table";
  columns: string[];
  rows: Array<Array<string>>;
  columnWidths: number[];
  rowHeights: number[];
  header: boolean;
  highlight?: { row?: number; column?: number };
  style: { font: string; size: number; text: ColorRef; headerText: ColorRef; headerFill?: ColorRef; rule: ColorRef; highlightFill: ColorRef; align: Array<"left" | "center" | "right"> };
}

export interface ConnectorElement extends SceneElementBase {
  kind: "connector";
  /** Absolute points in inches. */
  points: Array<{ x: number; y: number }>;
  style: ShapeStyle;
  from?: string;
  to?: string;
}

export interface GroupElement extends SceneElementBase {
  kind: "group";
  children: string[];
}

export type SceneElement = TextElement | ShapeElement | ImageElement | IconElement | ChartElement | TableElement | ConnectorElement | GroupElement;

export interface SceneSlide {
  id: string;
  index: number;
  message: string;
  mode: "compose" | "recipe" | "auto" | "canvas";
  recipe?: string;
  layout: "title" | "section" | "title-content" | "title-only" | "blank";
  background: ColorRef;
  elements: SceneElement[];
  notes?: string;
  hidden?: boolean;
  /** Occupancy signature over a 12×7 grid, weighted by role. */
  signature: number[];
  density: number;
  findings: Finding[];
  /** Choices and budgets raised by this slide's fit, kept so an incremental build can carry them. */
  suggestedEdits?: import("./verdict.js").SuggestedEdit[];
  hash: string;
}

export interface SceneFont {
  family: string;
  role: "display" | "body" | "mono";
  resolved: string;
  file?: string;
  sha256?: string;
  embeddable: boolean;
  embed: boolean;
  metrics: "font-file" | "table" | "class-fallback";
  substitute?: string;
}

export interface SceneGraph {
  schema: "slide-agent.scene/2";
  engine: string;
  format: string;
  size: { width: number; height: number };
  title: string;
  author?: string;
  language: string;
  theme: {
    colors: Record<string, string>;
    fonts: { major: string; minor: string; mono?: string };
  };
  fonts: SceneFont[];
  slides: SceneSlide[];
  chrome?: { slideNumber: boolean; footer?: string; color: ColorRef; font: string; size: number; position: string };
}
