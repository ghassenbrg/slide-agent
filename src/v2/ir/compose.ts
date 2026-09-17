import { TYPE_ROLES, type SurfaceSpec, type TypeRole } from "./design.js";
import { closest, didYouMean, joinPointer, type Finding } from "./issues.js";

/**
 * `slide-agent.compose/1` — how a model says what a slide should look like.
 *
 * Authoring shape: every node is an object with exactly one *kind key*.
 *
 *   {"text": "Churn fell 41%", "role": "title"}
 *   {"at": "c1-7 r2-6", "column": {"gap": "space.2", "items": [...]}}
 *   {"grid": "12x6", "items": [...]}
 *   {"use": "gate", "n": "01", "label": "Inventory"}
 *
 * Modifiers may sit beside the kind key or inside a container's object; the
 * outer value wins when both are given. Values are named tokens (`space.3`,
 * `accent`, `card`), relative units (`2fr`, `40%`, type steps `+2`), or
 * literals, which are allowed and recorded.
 */

export const CONTAINER_KINDS = ["grid", "row", "column", "layer", "free"] as const;
export const LEAF_KINDS = ["text", "shape", "image", "icon", "chart", "table", "diagram", "use", "texture", "rule", "space"] as const;
export const NODE_KINDS = [...CONTAINER_KINDS, ...LEAF_KINDS] as const;
export type ContainerKind = typeof CONTAINER_KINDS[number];
export type LeafKind = typeof LEAF_KINDS[number];
export type NodeKind = typeof NODE_KINDS[number];

export type Length = number | string;
export type Side = "left" | "right" | "top" | "bottom";
export type Align = "start" | "center" | "end" | "stretch";
export type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";
export type Connect = "line" | "arrow" | "chevron" | "dots";
export type Provenance = "composed" | "component" | "recipe" | "draft" | "canvas";

export interface NodeBase {
  kind: NodeKind;
  /** JSON pointer into the intent this node was authored at. */
  ptr: string;
  id?: string;
  at?: string;
  box?: [number, number, number, number];
  grow?: number;
  basis?: Length;
  width?: Length;
  height?: Length;
  minHeight?: Length;
  maxWidth?: Length;
  alignSelf?: Align;
  bleed?: Side[];
  surface?: string | SurfaceSpec;
  z?: number;
  rotate?: number;
  opacity?: number;
  decorative?: boolean;
  order?: number;
  optional?: boolean;
  tone?: string;
  /** Properties the author pinned; kept across rebuilds and never adjusted silently. */
  pins?: string[];
  provenance: Provenance;
  component?: string;
  recipe?: string;
  /** Literal values the author wrote where a token would do; recorded, never refused. */
  literals?: string[];
}

export interface ContainerNode extends NodeBase {
  kind: ContainerKind;
  items: CompositionNode[];
  gap?: Length;
  rowGap?: Length;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  pad?: Length | Length[];
  connect?: Connect;
  grid?: { columns: number; rows: number };
  anchor?: Anchor;
  /** Type-step offset inherited by text descendants. */
  size?: number | string;
}

export type Anchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";

export interface TextNode extends NodeBase {
  kind: "text";
  text: string;
  role: TypeRole;
  size?: number | string;
  weight?: number | string;
  italic?: boolean;
  font?: string;
  case?: "none" | "upper" | "lower" | "title" | "small-caps";
  tracking?: number;
  align?: "left" | "center" | "right" | "justify";
  valign?: "top" | "middle" | "bottom";
  lines?: number;
  balance?: boolean;
  fit?: { minStep?: number };
  list?: "bullet" | "number" | "none";
  leading?: number;
  color?: string;
  link?: string;
}

export interface ShapeNode extends NodeBase {
  kind: "shape";
  preset?: string;
  path?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  ratio?: number;
  text?: string;
}

export interface ImageNode extends NodeBase {
  kind: "image";
  asset: string;
  alt: string;
  fit?: "cover" | "contain";
  focal?: [number, number];
  crop?: { left?: number; top?: number; right?: number; bottom?: number };
  treatment?: "none" | "grayscale" | "duotone" | "tint";
  radius?: number;
}

export interface IconNode extends NodeBase {
  kind: "icon";
  name: string;
  size?: number | string;
  strokeWidth?: number;
}

export interface ChartSeries {
  name: string;
  values: Array<number | null>;
  unit?: string;
}

export interface ChartData {
  categories: Array<string | number>;
  series: ChartSeries[];
  unit?: string;
  source?: string;
}

export type ChartKind = "bar" | "column" | "line" | "area" | "pie" | "doughnut" | "scatter" | "stacked-bar" | "stacked-column" | "waterfall";

export interface ChartNode extends NodeBase {
  kind: "chart";
  data: ChartData | string;
  chart?: ChartKind;
  highlight?: string | number | Array<string | number>;
  annotate?: string[];
  title?: string;
  labels?: "none" | "end" | "inside" | "outside";
  legend?: "none" | "top" | "bottom" | "right";
  axis?: "none" | "hairline" | "regular";
  alt?: string;
}

export interface TableNode extends NodeBase {
  kind: "table";
  data: { columns: string[]; rows: Array<Array<string | number | null>> } | string;
  highlight?: { row?: number; column?: number };
  header?: boolean;
  size?: number | string;
  align?: Array<"left" | "center" | "right">;
  alt?: string;
}

export interface DiagramNode extends NodeBase {
  kind: "diagram";
  grammar: "flow" | "layered" | "hierarchy" | "cycle" | "sequence" | "swimlane";
  nodes: Array<{ id: string; label: string; detail?: string; group?: string; emphasis?: boolean; lane?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
  groups?: Array<{ id: string; label: string }>;
  direction?: "right" | "down";
  node?: string;
  alt?: string;
}

export interface UseNode extends NodeBase {
  kind: "use";
  component: string;
  props: Record<string, unknown>;
}

export interface TextureNode extends NodeBase {
  kind: "texture";
  rule: string;
  params?: Record<string, unknown>;
}

export interface RuleNode extends NodeBase {
  kind: "rule";
  orientation?: "horizontal" | "vertical";
  weight?: number;
}

export interface SpaceNode extends NodeBase {
  kind: "space";
  size?: Length;
}

export type LeafNode = TextNode | ShapeNode | ImageNode | IconNode | ChartNode | TableNode | DiagramNode | UseNode | TextureNode | RuleNode | SpaceNode;
export type CompositionNode = ContainerNode | LeafNode;

export function isContainer(node: CompositionNode): node is ContainerNode {
  return (CONTAINER_KINDS as readonly string[]).includes(node.kind);
}

// ------------------------------------------------------------------ checkers

type Check = (value: unknown) => boolean;

const isString: Check = (value) => typeof value === "string";
const isNumber: Check = (value) => typeof value === "number" && Number.isFinite(value);
const isBoolean: Check = (value) => typeof value === "boolean";
const isLength: Check = (value) => isNumber(value) || (typeof value === "string" && /^(auto|space\.\d+(\.\d+)?|-?\d+(\.\d+)?(pt|in|%|fr)?|\d+(\.\d+)?u)$/.test(value));
const oneOf = (...values: string[]): Check => (value) => typeof value === "string" && values.includes(value);
const isStep: Check = (value) => isNumber(value) || (typeof value === "string" && /^[+-]\d+(\.\d+)?$/.test(value));
const isSides: Check = (value) => Array.isArray(value) && value.every((side) => ["left", "right", "top", "bottom"].includes(side as string));
const isBox: Check = (value) => Array.isArray(value) && value.length === 4 && value.every(isNumber);
const isPad: Check = (value) => isLength(value) || (Array.isArray(value) && value.length >= 1 && value.length <= 4 && value.every(isLength));
const isStringArray: Check = (value) => Array.isArray(value) && value.every(isString);
const isObject: Check = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isSurface: Check = (value) => isString(value) || isObject(value);
const isFit: Check = (value) => isObject(value) && Object.entries(value as object).every(([key, item]) => key === "minStep" && isNumber(item));
const anything: Check = () => true;

const COMMON: Record<string, Check> = {
  id: (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/.test(value),
  at: isString,
  box: isBox,
  grow: isNumber,
  basis: isLength,
  width: isLength,
  height: isLength,
  minHeight: isLength,
  maxWidth: isLength,
  alignSelf: oneOf("start", "center", "end", "stretch"),
  bleed: isSides,
  surface: isSurface,
  z: isNumber,
  rotate: isNumber,
  opacity: (value) => isNumber(value) && (value as number) >= 0 && (value as number) <= 1,
  decorative: isBoolean,
  order: isNumber,
  optional: isBoolean,
  tone: isString,
  pins: isStringArray,
};

const CONTAINER_PROPS: Record<string, Check> = {
  items: Array.isArray,
  gap: isLength,
  rowGap: isLength,
  align: oneOf("start", "center", "end", "stretch"),
  justify: oneOf("start", "center", "end", "between", "around", "evenly"),
  wrap: isBoolean,
  pad: isPad,
  connect: oneOf("line", "arrow", "chevron", "dots"),
  anchor: oneOf("top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"),
  each: isString,
  item: isObject,
  columns: isNumber,
  rows: isNumber,
  /** On a container: a type-step offset every text inside inherits (`"+2"` makes a card's type larger). */
  size: isStep,
};

const LEAF_PROPS: Record<LeafKind, Record<string, Check>> = {
  text: {
    role: oneOf(...TYPE_ROLES), size: isStep, weight: (value) => isNumber(value) || oneOf("light", "regular", "medium", "semibold", "bold", "black")(value),
    italic: isBoolean, font: isString, case: oneOf("none", "upper", "lower", "title", "small-caps"), tracking: isNumber,
    align: oneOf("left", "center", "right", "justify"), valign: oneOf("top", "middle", "bottom"), lines: isNumber, balance: isBoolean,
    fit: isFit, list: oneOf("bullet", "number", "none"), leading: isNumber, color: isString, link: isString,
  },
  shape: { preset: isString, path: isString, fill: isString, stroke: isString, strokeWidth: isNumber, radius: isNumber, ratio: isNumber, text: isString },
  image: { asset: isString, alt: isString, fit: oneOf("cover", "contain"), focal: (value) => Array.isArray(value) && value.length === 2 && value.every(isNumber), crop: isObject, treatment: oneOf("none", "grayscale", "duotone", "tint"), radius: isNumber },
  icon: { name: isString, size: isStep, strokeWidth: isNumber },
  chart: {
    data: (value) => isObject(value) || isString(value), chart: oneOf("bar", "column", "line", "area", "pie", "doughnut", "scatter", "stacked-bar", "stacked-column", "waterfall"),
    kind: oneOf("bar", "column", "line", "area", "pie", "doughnut", "scatter", "stacked-bar", "stacked-column", "waterfall"),
    highlight: anything, annotate: isStringArray, title: isString, labels: oneOf("none", "end", "inside", "outside"), legend: oneOf("none", "top", "bottom", "right"), axis: oneOf("none", "hairline", "regular"), alt: isString,
  },
  table: { data: (value) => isObject(value) || isString(value), highlight: isObject, header: isBoolean, size: isStep, align: isStringArray, alt: isString },
  diagram: { grammar: oneOf("flow", "layered", "hierarchy", "cycle", "sequence", "swimlane"), nodes: Array.isArray, edges: Array.isArray, groups: Array.isArray, direction: oneOf("right", "down"), node: isString, emphasis: anything, alt: isString },
  use: {},
  texture: { rule: isString, params: isObject },
  rule: { orientation: oneOf("horizontal", "vertical"), weight: isNumber },
  space: { size: isLength },
};

// --------------------------------------------------------------- normaliser

export interface NormalizeContext {
  provenance: Provenance;
  component?: string;
  recipe?: string;
  findings: Finding[];
  slide?: string;
}

function kindKeys(raw: Record<string, unknown>): NodeKind[] {
  return (NODE_KINDS as readonly string[]).filter((kind) => Object.hasOwn(raw, kind)) as NodeKind[];
}

function finding(context: NormalizeContext, path: string, message: string, code = "compose-invalid", severity: Finding["severity"] = "blocking"): void {
  context.findings.push({ code, severity, tier: "T0", message, path, ...(context.slide ? { slide: context.slide } : {}) });
}

/** A literal where a token is available: `size: 180`, `color: "#FF0000"`, `gap: 12`. */
function literalsIn(props: Record<string, unknown>): string[] {
  const literals: string[] = [];
  for (const key of ["size", "gap", "pad", "width", "height", "basis"]) {
    if (typeof props[key] === "number") literals.push(key);
  }
  if (typeof props.color === "string") literals.push("color");
  for (const key of ["fill", "stroke", "tone"]) {
    if (typeof props[key] === "string" && /^#|^oklch\(/i.test(props[key] as string)) literals.push(key);
  }
  return literals;
}

/**
 * Turn authored JSON into canonical nodes, collecting every problem with its
 * JSON pointer instead of stopping at the first. `use` nodes are kept as they
 * are; expansion (`compose/expand.ts`) replaces them before solving.
 */
export function normalizeNode(raw: unknown, path: string, context: NormalizeContext): CompositionNode | undefined {
  if (!isObject(raw)) {
    finding(context, path, `A composition node is an object with one kind key (${NODE_KINDS.join(", ")}).`);
    return undefined;
  }
  const withMeta = raw as Record<string, unknown>;
  // `$`-prefixed keys are engine metadata stamped during expansion, never authored.
  const meta = {
    ptr: typeof withMeta.$ptr === "string" ? withMeta.$ptr : undefined,
    provenance: typeof withMeta.$prov === "string" ? withMeta.$prov as Provenance : undefined,
    component: typeof withMeta.$component === "string" ? withMeta.$component : undefined,
    recipe: typeof withMeta.$recipe === "string" ? withMeta.$recipe : undefined,
  };
  const source: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(withMeta)) if (!key.startsWith("$")) source[key] = item;
  if (meta.ptr) path = meta.ptr;
  if (meta.provenance || meta.component || meta.recipe) {
    context = {
      ...context,
      ...(meta.provenance ? { provenance: meta.provenance } : {}),
      ...(meta.component ? { component: meta.component } : {}),
      ...(meta.recipe ? { recipe: meta.recipe } : {}),
    };
  }
  const kinds = kindKeys(source);
  if (kinds.length === 0) {
    const guesses = closest(Object.keys(source)[0] ?? "", NODE_KINDS);
    finding(context, path, `No kind key. A node needs one of: ${NODE_KINDS.join(", ")}.${guesses.length ? ` Did you mean "${guesses[0]}"?` : ""}`);
    return undefined;
  }
  // `text` is also a shape property; a shape with a label is still a shape.
  const kind = kinds.length === 2 && kinds.includes("shape") && kinds.includes("text") ? "shape" : kinds[0]!;
  if (kinds.length > 1 && !(kinds.length === 2 && kind === "shape")) {
    finding(context, path, `One node, one kind: found ${kinds.join(" and ")}. Nest one inside the other.`);
    return undefined;
  }

  const value = source[kind];
  const outer: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) if (key !== kind) outer[key] = item;

  const base = {
    ptr: path,
    provenance: context.provenance,
    ...(context.component ? { component: context.component } : {}),
    ...(context.recipe ? { recipe: context.recipe } : {}),
  };

  if ((CONTAINER_KINDS as readonly string[]).includes(kind)) {
    let inner: Record<string, unknown> = {};
    let grid: { columns: number; rows: number } | undefined;
    if (kind === "grid" && typeof value === "string") {
      const match = /^(\d{1,2})\s*[x×]\s*(\d{1,2})$/.exec(value.trim());
      if (!match) finding(context, joinPointer(path, "grid"), `A grid is written "COLUMNSxROWS", e.g. "12x6"; got "${value}".`);
      else grid = { columns: Number(match[1]), rows: Number(match[2]) };
    } else if (isObject(value)) {
      inner = value as Record<string, unknown>;
    } else if (value !== true && !(kind === "grid" && value === undefined)) {
      finding(context, joinPointer(path, kind), `"${kind}" takes an object with items${kind === "grid" ? ", or a \"COLUMNSxROWS\" string" : ""}.`);
    }
    const props = { ...inner, ...outer };
    if (kind === "grid" && !grid && typeof props.columns === "number" && typeof props.rows === "number") {
      grid = { columns: props.columns, rows: props.rows };
    }
    if (kind === "grid" && typeof inner.grid === "string") {
      const match = /^(\d{1,2})\s*[x×]\s*(\d{1,2})$/.exec(inner.grid);
      if (match) grid = { columns: Number(match[1]), rows: Number(match[2]) };
    }
    const allowed = { ...COMMON, ...CONTAINER_PROPS, ...(kind === "grid" ? { grid: isString } : {}) };
    checkProps(props, allowed, path, context, kind);
    const itemsPath = Object.hasOwn(inner, "items") ? joinPointer(path, kind, "items") : joinPointer(path, "items");
    const rawItems = Array.isArray(props.items) ? props.items : [];
    if (!Array.isArray(props.items) && props.each === undefined) {
      finding(context, joinPointer(path, kind), `A ${kind} needs "items": an array of nodes.`);
    }
    const items: CompositionNode[] = [];
    rawItems.forEach((item, index) => {
      const normalized = normalizeNode(item, joinPointer(itemsPath, index), context);
      if (normalized) items.push(normalized);
    });
    const node: ContainerNode = {
      ...pick(props, Object.keys(COMMON)),
      ...pick(props, ["gap", "rowGap", "align", "justify", "wrap", "pad", "connect", "anchor", "size"]),
      ...base,
      kind: kind as ContainerKind,
      items,
      ...(grid ? { grid } : {}),
    } as ContainerNode;
    const literals = literalsIn(props);
    if (literals.length) node.literals = literals;
    return node;
  }

  const leafKind = kind as LeafKind;
  let props: Record<string, unknown>;
  switch (leafKind) {
    case "text": {
      if (typeof value === "number" && Number.isFinite(value)) {
        props = { ...outer, text: String(value) };
        if (props.role === undefined) props.role = "body";
        break;
      }
      if (typeof value !== "string" && !(isObject(value) && typeof (value as { text?: unknown }).text === "string")) {
        finding(context, joinPointer(path, "text"), "\"text\" takes a string. Use **bold**, *italic*, [link](url), and new lines inside it.");
        return undefined;
      }
      props = typeof value === "string" ? { ...outer, text: value } : { ...(value as object), ...outer };
      if (props.role === undefined) props.role = "body";
      break;
    }
    case "image":
      props = typeof value === "string" ? { ...outer, asset: value } : { ...(isObject(value) ? value as object : {}), ...outer };
      break;
    case "icon":
      props = typeof value === "string" ? { ...outer, name: value } : { ...(isObject(value) ? value as object : {}), ...outer };
      break;
    case "texture":
      props = typeof value === "string" ? { ...outer, rule: value } : { ...(isObject(value) ? value as object : {}), ...outer };
      break;
    case "use":
      if (typeof value !== "string") {
        finding(context, joinPointer(path, "use"), "\"use\" names a component: {\"use\": \"gate\", …props}.");
        return undefined;
      }
      return { ...pick(outer, Object.keys(COMMON)), ...base, kind: "use", component: value, props: omit(outer, Object.keys(COMMON)) } as UseNode;
    case "rule":
      props = typeof value === "string" ? { ...outer, orientation: value } : { ...(isObject(value) ? value as object : {}), ...outer };
      break;
    case "space":
      props = isLength(value) && value !== true ? { ...outer, size: value } : { ...(isObject(value) ? value as object : {}), ...outer };
      break;
    case "shape":
      props = typeof value === "string" ? { ...outer, preset: value } : { ...(isObject(value) ? value as object : {}), ...outer };
      break;
    default:
      if (!isObject(value)) {
        finding(context, joinPointer(path, leafKind), `"${leafKind}" takes an object.`);
        return undefined;
      }
      props = { ...(value as object), ...outer };
  }

  checkProps(props, { ...COMMON, ...LEAF_PROPS[leafKind], ...(leafKind === "text" ? { text: isString } : {}), ...(leafKind === "shape" ? { text: isString } : {}) }, path, context, leafKind);
  if (leafKind === "chart" && props.kind !== undefined && props.chart === undefined) props.chart = props.kind;
  const node = { ...props, ...base, kind: leafKind } as LeafNode;
  if (leafKind === "chart") delete (node as { kind: string; chartKind?: string }).chartKind;
  const literals = literalsIn(props);
  if (literals.length) node.literals = literals;

  if (leafKind === "image" && typeof props.alt !== "string" && props.decorative !== true) {
    context.findings.push({ code: "alt-missing", severity: "blocking", tier: "T0", message: "Images need alt text, or decorative: true.", path: joinPointer(path, "image", "alt"), ...(context.slide ? { slide: context.slide } : {}), hint: "Add \"alt\" describing what the image shows, or mark it decorative." });
  }
  if (leafKind === "image" && typeof props.asset !== "string") finding(context, joinPointer(path, "image"), "An image needs an asset path.");
  if (leafKind === "icon" && typeof props.name !== "string") finding(context, joinPointer(path, "icon"), "An icon needs a name, e.g. \"shield-check\", or \"?security\" to search.");
  if (leafKind === "chart" && props.data === undefined) finding(context, joinPointer(path, "chart"), "A chart needs data: {categories, series:[{name, values}]}.");
  if (leafKind === "table" && props.data === undefined) finding(context, joinPointer(path, "table"), "A table needs data: {columns, rows}.");
  if (leafKind === "diagram") {
    if (!Array.isArray(props.nodes)) finding(context, joinPointer(path, "diagram"), "A diagram needs nodes: [{id, label}].");
    if (!Array.isArray(props.edges)) props.edges = [];
    if (typeof props.grammar !== "string") (node as DiagramNode).grammar = "flow";
  }
  if (leafKind === "texture" && typeof props.rule !== "string") finding(context, joinPointer(path, "texture"), "A texture names a rule from design.texture or a primitive.");
  return node;
}

function checkProps(props: Record<string, unknown>, allowed: Record<string, Check>, path: string, context: NormalizeContext, kind: string): void {
  for (const [key, item] of Object.entries(props)) {
    if (key.startsWith("$")) {
      delete props[key];
      continue;
    }
    const check = allowed[key];
    if (!check) {
      finding(context, joinPointer(path, key), `"${key}" is not a property of ${kind}.${didYouMean(key, Object.keys(allowed))}`, "compose-unknown-property");
      continue;
    }
    if (item !== undefined && !check(item)) {
      finding(context, joinPointer(path, key), `"${key}" has an invalid value: ${JSON.stringify(item)?.slice(0, 60)}.`, "compose-invalid-value");
    }
  }
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) picked[key] = source[key];
  return picked;
}

function omit(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) if (!keys.includes(key)) kept[key] = item;
  return kept;
}

// ---------------------------------------------------------------- cell ranges

export interface CellRange {
  column: [number, number];
  row: [number, number];
}

/**
 * `"c1-7 r2-6"`, `"c3 r1"`, `"c1-12"` (all rows), `"r2-3"` (all columns).
 * One-based and inclusive, like CSS grid lines written as cells.
 */
export function parseCellRange(value: string, grid: { columns: number; rows: number }): { range?: CellRange; error?: string } {
  const parts = value.trim().toLowerCase().split(/\s+/);
  let column: [number, number] = [1, grid.columns];
  let row: [number, number] = [1, grid.rows];
  for (const part of parts) {
    const match = /^([cr])(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
    if (!match) return { error: `"${value}" is not a cell range; write it like "c1-7 r2-6".` };
    const start = Number(match[2]);
    const end = match[3] === undefined ? start : Number(match[3]);
    if (end < start) return { error: `"${part}" ends before it starts.` };
    if (match[1] === "c") {
      if (end > grid.columns || start < 1) return { error: `column ${end > grid.columns ? end : start} outside a ${grid.columns}-column grid` };
      column = [start, end];
    } else {
      if (end > grid.rows || start < 1) return { error: `row ${end > grid.rows ? end : start} outside a ${grid.rows}-row grid` };
      row = [start, end];
    }
  }
  return { range: { column, row } };
}

export function formatCellRange(range: CellRange): string {
  const format = (prefix: string, [start, end]: [number, number]) => start === end ? `${prefix}${start}` : `${prefix}${start}-${end}`;
  return `${format("c", range.column)} ${format("r", range.row)}`;
}

/** Walks every node, depth first, in document order. */
export function walkNodes(node: CompositionNode, visit: (node: CompositionNode, parent?: ContainerNode) => void, parent?: ContainerNode): void {
  visit(node, parent);
  if (isContainer(node)) for (const child of node.items) walkNodes(child, visit, node);
}
