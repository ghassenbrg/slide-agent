import { TYPE_ROLE_STEPS } from "../ir/design.js";
import {
  isContainer,
  parseCellRange,
  formatCellRange,
  walkNodes,
  type ChartKind,
  type ChartNode,
  type CompositionNode,
  type ContainerNode,
  type DiagramNode,
  type IconNode,
  type ImageNode,
  type RuleNode,
  type ShapeNode,
  type TableNode,
  type TextNode,
  type TextureNode,
} from "../ir/compose.js";
import type { Pin } from "../ir/intent.js";
import { joinPointer, type Finding } from "../ir/issues.js";
import type {
  Adjustment,
  ChartElement,
  ColorRef,
  ConnectorElement,
  ElementRole,
  FitStatus,
  IconElement,
  ImageElement,
  Rect,
  SceneElement,
  ShapeElement,
  ShapeStyle,
  TableElement,
  TextElement,
  TextParagraph,
} from "../ir/scene.js";
import type { SuggestedEdit } from "../ir/verdict.js";
import { computeFacts, chartFormProblem, suggestChartKind, toChartData } from "../charts/stats.js";
import { resolveIcon } from "../icons/index.js";
import { resolveColor, roleColor, type ThemeSpec } from "../tokens/compile.js";
import { contrastRatio } from "../tokens/color.js";
import type { LayoutInput, LoadedFace, TextEngine } from "../text/measure.js";
import { parseRichText, plainText, type RichParagraph } from "../text/rich.js";
import { buildDiagram } from "./diagram.js";
import {
  PT,
  cellRect,
  contentArea,
  extendToPage,
  frGrow,
  gridGeometry,
  pageRect,
  rect,
  resolveLength,
  resolvePad,
  roundRect,
  type GridGeometry,
} from "./geometry.js";
import {
  faceForRun,
  faceSet,
  fontRoleFor,
  parseStep,
  sizeForRole,
  textColor,
  textStyle,
  weightFor,
  type FaceSet,
  type Ground,
} from "./style.js";
import { buildTexture } from "./texture.js";

export interface AssetInfo {
  file?: string;
  width?: number;
  height?: number;
  sha256?: string;
  error?: string;
}

export interface SolveInput {
  root: CompositionNode;
  theme: ThemeSpec;
  text: TextEngine;
  slide: { id: string; index: number; count: number; path: string; pins: Pin[]; tags: string[]; background?: string };
  fit: "ask" | "auto";
  data: Record<string, unknown>;
  assets: Map<string, AssetInfo>;
  /** Directed decks keep design-changing fit moves as choices; draft slides may take them. */
  draft: boolean;
}

export interface OverflowRecord {
  key: number;
  node: TextNode;
  element: string;
  needed: number;
  available: number;
  size: number;
  steps: number;
  gridAncestor?: { node: CompositionNode; range: { column: [number, number]; row: [number, number] }; grid: { columns: number; rows: number } };
}

export interface SolvedSlide {
  elements: SceneElement[];
  findings: Finding[];
  suggestedEdits: SuggestedEdit[];
  background: ColorRef;
  overflows: OverflowRecord[];
  decisions: Array<{ kind: string; detail: string }>;
}

interface Inherit {
  ground: Ground;
  tone?: string;
  sizeStep: number;
  gridAncestor?: OverflowRecord["gridAncestor"];
}

const FILL_KINDS = new Set(["shape", "image", "chart", "diagram", "texture", "layer", "free", "grid"]);
const EPSILON = 0.004;

/** Everything a composition needs from the text engine, loaded before a synchronous solve. */
export async function preloadFaces(root: CompositionNode, theme: ThemeSpec, text: TextEngine): Promise<void> {
  const requests: Array<{ family: string; weight: number; italic: boolean }> = [];
  walkNodes(root, (node) => {
    if (node.kind !== "text") return;
    const choice = fontRoleFor(node);
    const weight = weightFor(node, theme, choice);
    if (typeof choice === "string") {
      if (weight !== undefined && weight !== theme.fonts[choice].weight) requests.push({ family: theme.fonts[choice].spec.family, weight, italic: false });
    } else {
      const base = weight ?? 400;
      for (const [w, italic] of [[base, false], [Math.min(900, Math.max(700, base + 300)), false], [base, true], [Math.min(900, Math.max(700, base + 300)), true]] as const) {
        requests.push({ family: choice.family, weight: w, italic });
      }
    }
  });
  await Promise.all(requests.map((request) => text.load(request)));
}

export function solveSlide(input: SolveInput): SolvedSlide {
  // The fit ladder: solve, find text that does not fit, take automatic steps
  // (size down within the node's minStep, never below the role floor), and
  // solve again. What remains becomes choices, budgets, or a residual.
  const steps = new Map<number, number>();
  let solver = new SlideSolver(input, steps, false);
  let result = solver.run();
  for (let iteration = 0; iteration < 8 && result.overflows.length > 0; iteration += 1) {
    let changed = false;
    for (const overflow of result.overflows) {
      const node = overflow.node;
      if (sizePinned(node, input.slide.pins, input.slide.path)) continue;
      const current = steps.get(overflow.key) ?? 0;
      const allowed = node.fit?.minStep ?? -1;
      const next = current - 0.5;
      const nextSize = sizeForNode(node, input.theme, solver.inheritedStep(overflow.key) + next);
      const floor = input.theme.floors[node.role];
      const automatic = next >= allowed - 1e-9 || (input.draft || input.fit === "auto");
      if (automatic && nextSize >= floor && nextSize < overflow.size) {
        steps.set(overflow.key, next);
        changed = true;
      }
    }
    if (!changed) break;
    solver = new SlideSolver(input, steps, false);
    result = solver.run();
  }
  solver = new SlideSolver(input, steps, true);
  return solver.run();
}

function sizeForNode(node: TextNode, theme: ThemeSpec, steps: number): number {
  if (typeof node.size === "number") return Math.max(1, node.size * 1.25 ** Math.min(0, steps));
  return sizeForRole(node.role, parseStep(node.size) + steps, theme);
}

function sizePinned(node: TextNode, pins: Pin[], slidePath: string): boolean {
  return pins.some((pin) => {
    const path = typeof pin === "string" ? pin : pin.path;
    const refuse = typeof pin === "string" ? undefined : pin.refuse;
    const absolute = path.startsWith("/slides/") ? path : `${slidePath}${path}`;
    return (absolute === `${node.ptr}/size` || absolute === node.ptr) && (refuse === undefined || refuse === "type-step");
  });
}

function refusesContrast(pins: Pin[], slidePath: string, ptr: string): boolean {
  return pins.some((pin) => {
    if (typeof pin === "string") return false;
    const absolute = pin.path.startsWith("/") && pin.path.startsWith("/slides/") ? pin.path : `${slidePath}${pin.path}`;
    return pin.refuse === "contrast" && ptr.startsWith(absolute);
  });
}

class SlideSolver {
  private readonly elements: SceneElement[] = [];
  private readonly findings: Finding[] = [];
  private readonly suggestedEdits: SuggestedEdit[] = [];
  private readonly overflows: OverflowRecord[] = [];
  private readonly decisions: Array<{ kind: string; detail: string }> = [];
  private readonly ids = new Map<string, number>();
  private readonly keys = new Map<CompositionNode, number>();
  private readonly stepOffsets = new Map<number, number>();
  private order = 0;
  private overlapDepth = 0;
  private titleBound = false;
  private readonly theme: ThemeSpec;
  private readonly page: Rect;

  public constructor(private readonly input: SolveInput, private readonly steps: Map<number, number>, private readonly final: boolean) {
    this.theme = input.theme;
    this.page = pageRect(input.theme);
    let counter = 0;
    walkNodes(input.root, (node) => {
      this.keys.set(node, counter);
      counter += 1;
    });
  }

  public inheritedStep(key: number): number {
    return this.stepOffsets.get(key) ?? 0;
  }

  public run(): SolvedSlide {
    const theme = this.theme;
    const backgroundRef = this.input.slide.background ? resolveColor(this.input.slide.background, theme) : undefined;
    if (this.input.slide.background && !backgroundRef) {
      this.finding("color-unknown", "blocking", "T0", `Slide background "${this.input.slide.background}" is not a colour role, palette name, or tint.`, `${this.input.slide.path}/background`);
    }
    const background = backgroundRef ?? roleColor("background", theme);
    const ground: Ground = { hex: background.hex, token: backgroundRef ? this.input.slide.background! : "background" };

    // Texture rules the design language applies to this slide.
    for (const rule of theme.texture) {
      const apply = rule.apply;
      if (!apply) continue;
      const matchesSlide = apply.slides === "all" || (Array.isArray(apply.slides) && apply.slides.includes(this.input.slide.id));
      const matchesRole = apply.roles?.some((role) => this.input.slide.tags.includes(role)) ?? false;
      if ((apply.slides !== undefined && matchesSlide) || matchesRole || (apply.slides === undefined && apply.roles === undefined)) {
        this.emitTexture({ kind: "texture", rule: rule.id, ptr: `/design/language/texture`, provenance: "composed" }, this.page, ground, true);
      }
    }

    const root = this.input.root;
    const content = contentArea(theme);
    const rootGrid = gridGeometry(content, theme.grid.columns, theme.grid.rows, theme.space.gutter);
    const frame = root.at ? this.cellFrame(root, rootGrid) ?? content : root.box ? this.boxFrame(root.box, content) : content;
    this.place(root, frame, { ground, sizeStep: 0 }, rootGrid);

    this.checkBounds();
    return {
      elements: this.elements,
      findings: this.findings,
      suggestedEdits: this.suggestedEdits,
      background,
      overflows: this.overflows,
      decisions: this.decisions,
    };
  }

  // ------------------------------------------------------------ helpers

  private finding(code: string, severity: Finding["severity"], tier: Finding["tier"], message: string, path?: string, element?: string, hint?: string): void {
    if (!this.final && tier !== "T0") return;
    if (this.findings.some((existing) => existing.code === code && existing.path === path && existing.element === element && existing.message === message)) return;
    this.findings.push({ code, severity, tier, message, slide: this.input.slide.id, ...(path ? { path } : {}), ...(element ? { element } : {}), ...(hint ? { hint } : {}) });
  }

  private elementId(node: CompositionNode, suffix?: string): string {
    const base = node.id ?? `${node.kind}${this.keys.get(node) ?? this.elements.length}`;
    const candidate = `${this.input.slide.id}/${base}${suffix ? `-${suffix}` : ""}`;
    const seen = this.ids.get(candidate) ?? 0;
    this.ids.set(candidate, seen + 1);
    return seen === 0 ? candidate : `${candidate}-${seen + 1}`;
  }

  private provenance(node: CompositionNode): SceneElement["provenance"] {
    return {
      source: node.provenance,
      path: node.ptr,
      ...(node.component ? { component: node.component } : {}),
      ...(node.recipe ? { recipe: node.recipe } : {}),
    };
  }

  private push(element: SceneElement, node?: CompositionNode): void {
    const decorative = element.decorative ?? node?.decorative ?? false;
    element.z = (node?.z ?? 0) * 1000 + this.elements.length;
    if (!decorative && element.role !== "container" && element.role !== "decorative") {
      element.readingIndex = node?.order ?? this.order;
      this.order += 1;
    }
    if (decorative) element.decorative = true;
    if (this.overlapDepth > 0) element.overlapAllowed = true;
    if (node?.rotate) element.rotate = node.rotate;
    if (node?.pins?.length) element.pins = node.pins;
    element.frame = roundRect(element.frame);
    this.elements.push(element);
  }

  private cellFrame(node: CompositionNode, grid: GridGeometry): Rect | undefined {
    if (!node.at) return undefined;
    const parsed = parseCellRange(node.at, { columns: grid.columns, rows: grid.rows });
    if (!parsed.range) {
      this.finding("cell-range-invalid", "blocking", "T0", `${node.at}: ${parsed.error}`, joinPointer(node.ptr, "at"));
      return undefined;
    }
    return cellRect(grid, parsed.range.column, parsed.range.row);
  }

  private boxFrame(box: [number, number, number, number], frame: Rect): Rect {
    const unitX = frame.w / this.theme.grid.columns;
    const unitY = frame.h / this.theme.grid.rows;
    return rect(frame.x + box[0] * unitX, frame.y + box[1] * unitY, box[2] * unitX, box[3] * unitY);
  }

  private color(reference: string | undefined, fallback: ColorRef | undefined, path: string): ColorRef | undefined {
    if (!reference) return fallback;
    if (reference === "none") return undefined;
    const resolved = resolveColor(reference, this.theme);
    if (!resolved) {
      this.finding("color-unknown", "blocking", "T0", `"${reference}" is not a colour role, palette name, tint (name/NN), or hex.`, path);
      return fallback;
    }
    return resolved;
  }

  // ------------------------------------------------------------ placement

  private place(node: CompositionNode, frame: Rect, inherit: Inherit, parentGrid: GridGeometry): void {
    let ground = inherit.ground;
    let inner = frame;
    let tone = node.tone ?? inherit.tone;
    const nextInherit: Inherit = { ...inherit, tone: tone ?? undefined } as Inherit;

    if (node.surface !== undefined && node.kind !== "shape") {
      const surface = this.surface(node, frame);
      if (surface) {
        if (surface.fill) ground = { hex: surface.fill.hex, token: surface.fill.token ?? "surface" };
        inner = rect(frame.x + surface.pad[3], frame.y + surface.pad[0], frame.w - surface.pad[1] - surface.pad[3], frame.h - surface.pad[0] - surface.pad[2]);
      }
    }
    nextInherit.ground = ground;
    if (tone === undefined) delete nextInherit.tone;

    if (isContainer(node)) {
      const pad = resolvePad(node.pad, this.theme, frame.w);
      inner = rect(inner.x + pad[3], inner.y + pad[0], inner.w - pad[1] - pad[3], inner.h - pad[0] - pad[2]);
      nextInherit.sizeStep = inherit.sizeStep + parseStep(node.size);
      if (node.at) {
        const parsed = parseCellRange(node.at, { columns: parentGrid.columns, rows: parentGrid.rows });
        if (parsed.range) nextInherit.gridAncestor = { node, range: parsed.range, grid: { columns: parentGrid.columns, rows: parentGrid.rows } };
      }
      switch (node.kind) {
        case "grid": return this.placeGrid(node, inner, nextInherit);
        case "row":
        case "column": return this.placeFlex(node, inner, nextInherit, parentGrid);
        case "layer": return this.placeLayer(node, inner, nextInherit, parentGrid);
        case "free": return this.placeFree(node, inner, nextInherit, parentGrid);
      }
    }
    if (node.at && !isContainer(node)) {
      const parsed = parseCellRange(node.at, { columns: parentGrid.columns, rows: parentGrid.rows });
      if (parsed.range) nextInherit.gridAncestor = { node, range: parsed.range, grid: { columns: parentGrid.columns, rows: parentGrid.rows } };
    }
    this.placeLeaf(node, inner, nextInherit);
  }

  private surface(node: CompositionNode, frame: Rect): { fill?: ColorRef; pad: [number, number, number, number] } | undefined {
    const reference = node.surface!;
    let spec = typeof reference === "string" ? this.theme.surfaces[reference] : reference;
    if (typeof reference === "string" && !spec) {
      if (reference === "surface" || reference === "card") {
        spec = { fill: "surface", radius: this.theme.shape.radius };
        if (reference === "card" && node.provenance === "composed") {
          this.finding("surface-implicit", "minor", "T0", `Surface "card" is not defined in design.surfaces; drawn as a plain surface fill.`, joinPointer(node.ptr, "surface"));
        }
      } else if (node.provenance === "recipe" || node.provenance === "draft") {
        spec = reference === "band" ? { fill: "accent" } : reference === "quiet" ? { stroke: "rule", strokeWidth: 0.75 } : { fill: "surface", radius: this.theme.shape.radius };
      } else {
        this.finding("surface-unknown", "blocking", "T0", `No surface "${reference}". Define it in design.surfaces, or use "surface".`, joinPointer(node.ptr, "surface"));
        return undefined;
      }
    }
    if (!spec) return undefined;
    const drawn = extendToPage(frame, node.bleed, this.page);
    const fill = spec.fill ? this.color(spec.fill, undefined, joinPointer(node.ptr, "surface")) : undefined;
    const stroke = spec.stroke ? this.color(spec.stroke, undefined, joinPointer(node.ptr, "surface")) : undefined;
    const radius = spec.radius ?? 0;
    if (fill || stroke || spec.image) {
      const style: ShapeStyle = {
        preset: radius > 0 ? "roundRect" : "rect",
        ...(fill ? { fill } : {}),
        ...(stroke ? { stroke, strokeWidth: spec.strokeWidth ?? Math.max(0.75, this.theme.shape.stroke) } : {}),
        ...(radius ? { radius } : {}),
        ...(spec.shadow && spec.shadow !== "none" ? { shadow: spec.shadow } : this.theme.shape.shadow !== "none" && fill && radius > 0 ? { shadow: this.theme.shape.shadow } : {}),
        ...(spec.opacity !== undefined ? { opacity: spec.opacity } : node.opacity !== undefined ? { opacity: node.opacity } : {}),
      };
      this.push({
        kind: "shape",
        id: this.elementId(node, "surface"),
        role: "container",
        frame: drawn,
        z: 0,
        style,
        provenance: this.provenance(node),
      } satisfies ShapeElement, node);
    }
    // A container's own pad replaces the surface's default pad rather than adding to it.
    const padValue = spec.pad !== undefined && !(isContainer(node) && node.pad !== undefined) ? resolveLength(spec.pad, { theme: this.theme, reference: frame.w }) ?? 0 : 0;
    return { ...(fill ? { fill } : {}), pad: [padValue, padValue, padValue, padValue] };
  }

  private placeGrid(node: ContainerNode, frame: Rect, inherit: Inherit): void {
    const columns = node.grid?.columns ?? this.theme.grid.columns;
    const rows = node.grid?.rows ?? this.theme.grid.rows;
    const grid = gridGeometry(frame, columns, rows, resolveLength(node.gap, { theme: this.theme, reference: frame.w }) ?? this.theme.space.gutter);
    const occupied: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(columns).fill(false));
    let nextRow = 1;
    for (const child of node.items) {
      if (child.at) {
        const parsed = parseCellRange(child.at, { columns, rows });
        if (!parsed.range) {
          this.finding("cell-range-invalid", "blocking", "T0", `${child.at}: ${parsed.error}`, joinPointer(child.ptr, "at"));
          continue;
        }
        for (let row = parsed.range.row[0]; row <= parsed.range.row[1]; row += 1) {
          for (let column = parsed.range.column[0]; column <= parsed.range.column[1]; column += 1) occupied[row - 1]![column - 1] = true;
        }
        nextRow = Math.max(nextRow, parsed.range.row[1] + 1);
      }
    }
    for (const child of node.items) {
      let childFrame: Rect;
      if (child.at) {
        const parsed = parseCellRange(child.at, { columns, rows });
        if (!parsed.range) continue;
        childFrame = cellRect(grid, parsed.range.column, parsed.range.row);
      } else if (child.box) {
        childFrame = this.boxFrame(child.box, frame);
      } else {
        // Unplaced children flow into the next free full-width row.
        const row = Math.min(rows, nextRow);
        if (nextRow > rows) {
          this.finding("grid-no-room", "major", "T3", `No free row left for an unplaced ${child.kind}; it overlaps the last row. Give it an "at".`, child.ptr);
        }
        childFrame = cellRect(grid, [1, columns], [row, row]);
        nextRow += 1;
      }
      if (child.bleed?.length && (child.kind === "image" || child.kind === "shape" || child.kind === "texture")) childFrame = extendToPage(childFrame, child.bleed, this.page);
      this.place(child, childFrame, inherit, grid);
    }
  }

  private placeLayer(node: ContainerNode, frame: Rect, inherit: Inherit, grid: GridGeometry): void {
    this.overlapDepth += 1;
    try {
      this.placeLayerChildren(node, frame, inherit, grid);
    } finally {
      this.overlapDepth -= 1;
    }
  }

  private placeLayerChildren(node: ContainerNode, frame: Rect, inherit: Inherit, grid: GridGeometry): void {
    const anchor = node.anchor ?? "top-left";
    for (const child of node.items) {
      if (child.box) {
        this.place(child, this.boxFrame(child.box, frame), inherit, grid);
        continue;
      }
      if (child.kind === "text" || child.kind === "icon" || child.kind === "column" || child.kind === "row") {
        const width = resolveLength(child.width, { theme: this.theme, reference: frame.w }) ?? frame.w;
        const size = this.measure(child, Math.min(width, frame.w), inherit, frame.h);
        const w = child.kind === "text" && anchor !== "top-left" && anchor !== "left" && anchor !== "bottom-left" ? Math.min(width, Math.max(size.w, 0.1)) : Math.min(width, frame.w);
        const h = Math.min(frame.h, size.h);
        const x = /right/.test(anchor) ? frame.x + frame.w - w : anchor === "top" || anchor === "center" || anchor === "bottom" ? frame.x + (frame.w - w) / 2 : frame.x;
        const y = /bottom/.test(anchor) ? frame.y + frame.h - h : anchor === "left" || anchor === "center" || anchor === "right" ? frame.y + (frame.h - h) / 2 : frame.y;
        this.place(child, rect(x, y, w, h), inherit, grid);
      } else {
        this.place(child, child.bleed?.length ? extendToPage(frame, child.bleed, this.page) : frame, inherit, grid);
      }
    }
  }

  private placeFree(node: ContainerNode, frame: Rect, inherit: Inherit, grid: GridGeometry): void {
    this.overlapDepth += 1;
    try {
      for (const child of node.items) {
        const childFrame = child.box ? this.boxFrame(child.box, frame) : frame;
        this.place(child, child.bleed?.length ? extendToPage(childFrame, child.bleed, this.page) : childFrame, inherit, grid);
      }
    } finally {
      this.overlapDepth -= 1;
    }
  }

  private placeFlex(node: ContainerNode, frame: Rect, inherit: Inherit, grid: GridGeometry): void {
    const horizontal = node.kind === "row";
    const mainSize = horizontal ? frame.w : frame.h;
    const crossSize = horizontal ? frame.h : frame.w;
    const gap = resolveLength(node.gap, { theme: this.theme, reference: mainSize }) ?? 0;
    const children = node.items;
    if (children.length === 0) return;

    if (horizontal && node.wrap) {
      this.placeWrappedRow(node, frame, inherit, grid, gap);
      return;
    }

    const lengthOf = (child: CompositionNode) => horizontal ? child.width : child.height;
    const bases: number[] = [];
    const grows: number[] = [];
    const minimums: number[] = [];
    for (const child of children) {
      const explicit = resolveLength(lengthOf(child), { theme: this.theme, reference: mainSize, unit: horizontal ? grid.columnWidth + grid.gutterX : grid.rowHeight + grid.gutterY });
      const basis = resolveLength(child.basis, { theme: this.theme, reference: mainSize });
      const fr = frGrow(lengthOf(child)) ?? frGrow(child.basis);
      let grow = child.grow ?? fr ?? 0;
      let base: number;
      if (explicit !== undefined) base = explicit;
      else if (basis !== undefined) base = basis;
      else if (horizontal && lengthOf(child) === "auto") base = Math.min(mainSize, this.maxContentWidth(child, inherit, mainSize));
      else if (horizontal && child.kind !== "space" && child.kind !== "rule" && child.kind !== "icon") {
        // In a row, children share the width by `grow` (default 1): "grow: 2" is twice the width.
        base = 0;
        grow = grow > 0 ? grow : 1;
      }
      else if (grow > 0) base = 0;
      else if (child.kind === "space") base = resolveLength(child.size, { theme: this.theme, reference: mainSize }) ?? 2 * this.theme.space.unit * PT;
      else if (child.kind === "rule") base = Math.max(PT, (child.weight ?? 1) * PT);
      else if (FILL_KINDS.has(child.kind)) { base = horizontal ? 0 : this.measure(child, crossSize, inherit, 0).h; grow = 1; }
      else {
        const measured = this.measure(child, crossSize, inherit, mainSize);
        base = horizontal ? Math.min(mainSize, this.maxContentWidth(child, inherit, mainSize)) : measured.h;
      }
      bases.push(base);
      grows.push(grow);
      minimums.push(horizontal && child.kind === "text" ? this.minContentWidth(child, inherit) : 0);
    }
    const gaps = gap * (children.length - 1);
    let free = mainSize - bases.reduce((sum, value) => sum + value, 0) - gaps;
    const sizes = [...bases];
    const totalGrow = grows.reduce((sum, value) => sum + value, 0);
    if (free > EPSILON && totalGrow > 0) {
      sizes.forEach((_, index) => { sizes[index]! += (free * grows[index]!) / totalGrow; });
      free = 0;
    } else if (free < -EPSILON && horizontal) {
      // Shrink proportionally to base, never below a word's width.
      const shrinkable = sizes.map((size, index) => Math.max(0, size - minimums[index]!));
      const total = shrinkable.reduce((sum, value) => sum + value, 0);
      if (total > 0) {
        const take = Math.min(-free, total);
        sizes.forEach((_, index) => { sizes[index]! -= (take * shrinkable[index]!) / total; });
        free += take;
      }
    }

    let cursor = horizontal ? frame.x : frame.y;
    let spacing = gap;
    const justify = node.justify ?? "start";
    if (free > EPSILON) {
      if (justify === "center") cursor += free / 2;
      else if (justify === "end") cursor += free;
      else if (justify === "between" && children.length > 1) spacing = gap + free / (children.length - 1);
      else if (justify === "around") { spacing = gap + free / children.length; cursor += free / children.length / 2; }
      else if (justify === "evenly") { spacing = gap + free / (children.length + 1); cursor += free / (children.length + 1); }
    }
    if (!horizontal && free < -EPSILON) {
      // A column taller than its region: the largest type in it is what the fit
      // ladder may size down first, and what a choice is offered for.
      const texts = children.map((child, index) => ({ child, index })).filter((entry): entry is { child: TextNode; index: number } => entry.child.kind === "text");
      if (texts.length > 0) {
        const sizeOf = (child: TextNode) => sizeForNode(child, this.theme, inherit.sizeStep + (this.steps.get(this.keys.get(child) ?? -1) ?? 0));
        const largest = Math.max(...texts.map(({ child }) => sizeOf(child)));
        for (const { child, index } of texts) {
          if (sizeOf(child) < largest - 1e-6) continue;
          this.overflows.push({ key: this.keys.get(child) ?? -1, node: child, element: `${this.input.slide.id}/${child.id ?? child.kind}`, needed: bases[index]!, available: Math.max(0, bases[index]! + free), size: sizeOf(child), steps: this.steps.get(this.keys.get(child) ?? -1) ?? 0, ...(inherit.gridAncestor ? { gridAncestor: inherit.gridAncestor } : {}) });
        }
      }
      this.recordContainerOverflow(node, -free, inherit);
    }

    const frames: Rect[] = [];
    children.forEach((child, index) => {
      const main = sizes[index]!;
      const align = child.alignSelf ?? node.align ?? "stretch";
      let crossLength = crossSize;
      const explicitCross = resolveLength(horizontal ? child.height : child.width, { theme: this.theme, reference: crossSize });
      if (explicitCross !== undefined) crossLength = Math.min(crossSize, explicitCross);
      else if (align !== "stretch") {
        crossLength = horizontal
          ? Math.min(crossSize, this.measure(child, main, inherit, crossSize).h)
          : Math.min(crossSize, child.kind === "text" ? this.maxContentWidth(child, inherit, crossSize) : this.measure(child, crossSize, inherit, main).w);
      }
      const crossOffset = align === "center" ? (crossSize - crossLength) / 2 : align === "end" ? crossSize - crossLength : 0;
      const childFrame = horizontal
        ? rect(cursor, frame.y + crossOffset, main, crossLength)
        : rect(frame.x + crossOffset, cursor, crossLength, main);
      frames.push(childFrame);
      this.place(child, child.bleed?.length && (child.kind === "image" || child.kind === "shape") ? extendToPage(childFrame, child.bleed, this.page) : childFrame, inherit, grid);
      cursor += main + spacing;
    });

    if (node.connect) this.connect(node, frames, horizontal, spacing, inherit);
  }

  private placeWrappedRow(node: ContainerNode, frame: Rect, inherit: Inherit, grid: GridGeometry, gap: number): void {
    const rowGap = resolveLength(node.rowGap, { theme: this.theme, reference: frame.h }) ?? gap;
    const widths = node.items.map((child) => resolveLength(child.width ?? child.basis, { theme: this.theme, reference: frame.w }) ?? Math.min(frame.w, this.maxContentWidth(child, inherit, frame.w)));
    const lines: number[][] = [];
    let current: number[] = [];
    let used = 0;
    widths.forEach((width, index) => {
      if (current.length > 0 && used + gap + width > frame.w + EPSILON) {
        lines.push(current);
        current = [];
        used = 0;
      }
      used += (current.length ? gap : 0) + width;
      current.push(index);
    });
    if (current.length) lines.push(current);
    let y = frame.y;
    for (const line of lines) {
      const height = Math.max(...line.map((index) => this.measure(node.items[index]!, widths[index]!, inherit, frame.h).h));
      let x = frame.x;
      for (const index of line) {
        this.place(node.items[index]!, rect(x, y, widths[index]!, height), inherit, grid);
        x += widths[index]! + gap;
      }
      y += height + rowGap;
    }
    if (y - rowGap > frame.y + frame.h + EPSILON) this.recordContainerOverflow(node, y - rowGap - frame.y - frame.h, inherit);
  }

  private connect(node: ContainerNode, frames: Rect[], horizontal: boolean, spacing: number, inherit: Inherit): void {
    const tone = roleColor(this.theme.roleNames.rule ? "rule" : "muted", this.theme);
    const color = contrastRatio(tone.hex, inherit.ground.hex) >= 1.5 ? tone : roleColor("muted", this.theme);
    for (let index = 0; index + 1 < frames.length; index += 1) {
      const a = frames[index]!;
      const b = frames[index + 1]!;
      const id = this.elementId(node, `connect-${index + 1}`);
      if (node.connect === "chevron" || node.connect === "dots") {
        const size = Math.max(0.08, Math.min(spacing * 0.6, 0.28));
        const cx = horizontal ? (a.x + a.w + b.x) / 2 : a.x + a.w / 2;
        const cy = horizontal ? a.y + a.h / 2 : (a.y + a.h + b.y) / 2;
        const shape: ShapeElement = {
          kind: "shape",
          id,
          role: "decorative",
          decorative: true,
          frame: node.connect === "chevron" ? rect(cx - size * 0.35, cy - size / 2, size * 0.7, size) : rect(cx - size * 0.12, cy - size * 0.12, size * 0.24, size * 0.24),
          z: 0,
          style: { preset: node.connect === "chevron" ? "chevron" : "ellipse", fill: color },
          provenance: this.provenance(node),
          ...(horizontal || node.connect !== "chevron" ? {} : { rotate: 90 }),
        };
        if (spacing < 0.06) this.finding("connect-no-room", "minor", "T3", "The gap between connected items is too small to draw a chevron; add a gap.", joinPointer(node.ptr, "gap"));
        this.push(shape, node);
        continue;
      }
      const points = horizontal
        ? [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }]
        : [{ x: a.x + a.w / 2, y: a.y + a.h }, { x: b.x + b.w / 2, y: b.y }];
      const connector: ConnectorElement = {
        kind: "connector",
        id,
        role: "connector",
        frame: rect(Math.min(points[0]!.x, points[1]!.x), Math.min(points[0]!.y, points[1]!.y), Math.abs(points[1]!.x - points[0]!.x), Math.abs(points[1]!.y - points[0]!.y)),
        z: 0,
        points,
        style: { preset: "line", stroke: color, strokeWidth: 1.25, ...(node.connect === "arrow" ? { arrowEnd: true } : {}) },
        provenance: this.provenance(node),
        decorative: true,
      };
      this.push(connector, node);
    }
  }

  // ------------------------------------------------------------ measurement

  private textInput(node: TextNode, width: number, inherit: Inherit, extraSteps = 0): { layout: LayoutInput; faces: FaceSet; size: number; paragraphs: RichParagraph[]; weight: number | undefined } {
    const key = this.keys.get(node) ?? -1;
    const fitSteps = this.steps.get(key) ?? 0;
    this.stepOffsets.set(key, inherit.sizeStep);
    const size = sizeForNode(node, this.theme, inherit.sizeStep + fitSteps + extraSteps);
    const choice = fontRoleFor(node);
    const weight = weightFor(node, this.theme, choice);
    const faces = faceSet(this.theme, choice, weight, (family, w, italic) => this.input.text.face({ family, weight: w, italic }));
    const paragraphs = parseRichText(node.text, { ...(node.list ? { list: node.list } : {}) });
    const spec = faces.role ? this.theme.fonts[faces.role].spec : undefined;
    const tracking = node.tracking ?? spec?.tracking;
    const textCase = node.case ?? spec?.case;
    return {
      faces,
      size,
      paragraphs,
      weight,
      layout: {
        paragraphs,
        size,
        leading: node.leading ?? this.theme.leading[node.role],
        width,
        ...(tracking !== undefined ? { tracking } : {}),
        ...(textCase ? { textCase } : {}),
        paragraphSpacing: paragraphs.length > 1 ? 0.35 : 0,
        faceFor: (run) => faceForRun(faces, run, false),
      },
    };
  }

  private maxContentWidth(node: CompositionNode, inherit: Inherit, limit: number): number {
    if (node.kind === "text") return Math.min(limit, this.input.text.layout(this.textInput(node, 1000, inherit).layout).widest + 0.02);
    if (node.kind === "icon") return this.iconSize(node, inherit);
    if (isContainer(node) && (node.kind === "row" || node.kind === "column")) {
      const pad = resolvePad(node.pad, this.theme, limit);
      const gap = resolveLength(node.gap, { theme: this.theme, reference: limit }) ?? 0;
      const widths = node.items.map((child) => this.maxContentWidth(child, inherit, limit));
      const inner = node.kind === "row" ? widths.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, widths.length - 1) : Math.max(0, ...widths);
      return Math.min(limit, inner + pad[1] + pad[3] + (node.surface ? this.surfacePad(node, limit) * 2 : 0));
    }
    return limit;
  }

  private minContentWidth(node: TextNode, inherit: Inherit): number {
    return this.input.text.minContentWidth(this.textInput(node, 1000, inherit).layout);
  }

  private surfacePad(node: CompositionNode, reference: number): number {
    if (!node.surface || (isContainer(node) && node.pad !== undefined)) return 0;
    const spec = typeof node.surface === "string" ? this.theme.surfaces[node.surface] : node.surface;
    return spec?.pad !== undefined ? resolveLength(spec.pad, { theme: this.theme, reference }) ?? 0 : 0;
  }

  private iconSize(node: IconNode, inherit: Inherit): number {
    if (typeof node.size === "number") return node.size * PT;
    const body = sizeForRole("body", parseStep(node.size) + inherit.sizeStep, this.theme);
    return body * 1.6 * PT;
  }

  /** Intrinsic size of a node laid out at `width`. */
  private measure(node: CompositionNode, width: number, inherit: Inherit, availableHeight: number): { w: number; h: number } {
    const explicitH = resolveLength(node.height, { theme: this.theme, reference: availableHeight });
    switch (node.kind) {
      case "text": {
        const { layout } = this.textInput(node, width, inherit);
        const measured = this.input.text.layout(layout);
        return { w: Math.min(width, measured.widest), h: explicitH ?? measured.height };
      }
      case "icon": {
        const size = this.iconSize(node, inherit);
        return { w: size, h: explicitH ?? size };
      }
      case "space": {
        const size = resolveLength(node.size, { theme: this.theme, reference: availableHeight }) ?? 2 * this.theme.space.unit * PT;
        return { w: size, h: size };
      }
      case "rule":
        return { w: width, h: Math.max(PT, (node.weight ?? 1) * PT) };
      case "image": {
        const info = this.input.assets.get(node.asset);
        const ratio = info?.width && info.height ? info.width / info.height : 16 / 9;
        return { w: width, h: explicitH ?? width / ratio };
      }
      case "shape":
        return { w: width, h: explicitH ?? (node.ratio ? width / node.ratio : 0) };
      case "table": {
        const table = this.tableModel(node);
        if (!table) return { w: width, h: explicitH ?? 0 };
        const size = sizeForRole("small", parseStep(node.size) + inherit.sizeStep, this.theme);
        const rowHeight = (size * 1.25) / 72 + 0.12;
        return { w: width, h: explicitH ?? rowHeight * (table.rows.length + (node.header === false ? 0 : 1)) };
      }
      case "chart":
      case "diagram":
        return { w: width, h: explicitH ?? 0 };
      case "row":
      case "column": {
        const pad = resolvePad(node.pad, this.theme, width);
        const surfacePad = this.surfacePad(node, width);
        const innerWidth = Math.max(0.05, width - pad[1] - pad[3] - surfacePad * 2);
        const gap = resolveLength(node.gap, { theme: this.theme, reference: width }) ?? 0;
        const childInherit = { ...inherit, sizeStep: inherit.sizeStep + parseStep(node.size) };
        let height: number;
        if (node.kind === "column") {
          height = node.items.reduce((sum, child) => sum + this.measure(child, innerWidth, childInherit, availableHeight).h, 0) + gap * Math.max(0, node.items.length - 1);
        } else {
          const count = Math.max(1, node.items.length);
          const each = (innerWidth - gap * (count - 1)) / count;
          height = Math.max(0, ...node.items.map((child) => this.measure(child, each, childInherit, availableHeight).h));
        }
        return { w: width, h: explicitH ?? height + pad[0] + pad[2] + surfacePad * 2 };
      }
      default:
        return { w: width, h: explicitH ?? 0 };
    }
  }

  // ------------------------------------------------------------ leaves

  private placeLeaf(node: CompositionNode, frame: Rect, inherit: Inherit): void {
    switch (node.kind) {
      case "text": return this.emitText(node, frame, inherit);
      case "shape": return this.emitShape(node, frame, inherit);
      case "image": return this.emitImage(node, frame);
      case "icon": return this.emitIcon(node, frame, inherit);
      case "chart": return this.emitChart(node, frame, inherit);
      case "table": return this.emitTable(node, frame, inherit);
      case "diagram": return this.emitDiagram(node, frame, inherit);
      case "texture": return this.emitTexture(node, frame, inherit.ground, false);
      case "rule": return this.emitRule(node, frame, inherit);
      case "space": return;
      case "use":
        this.finding("component-unexpanded", "blocking", "T0", `Component "${node.component}" was not expanded.`, node.ptr);
        return;
    }
  }

  private emitText(node: TextNode, frame: Rect, inherit: Inherit): void {
    const prepared = this.textInput(node, frame.w, inherit);
    let layout = this.input.text.layout(prepared.layout);
    let textFrame = frame;
    const balance = node.balance ?? (node.role === "title" || node.role === "display" || node.role === "subtitle" || node.role === "quote");
    if (balance && layout.lineCount > 1 && layout.lineCount <= 4) {
      const width = this.input.text.balancedWidth(prepared.layout);
      if (width < frame.w - 0.05) {
        const offset = node.align === "center" ? (frame.w - width) / 2 : node.align === "right" ? frame.w - width : 0;
        textFrame = rect(frame.x + offset, frame.y, width, frame.h);
        layout = this.input.text.layout({ ...prepared.layout, width });
      }
    }
    const key = this.keys.get(node) ?? -1;
    const id = this.elementId(node);
    const bold = prepared.faces.regular.bold;
    const refused = refusesContrast(this.input.slide.pins, this.input.slide.path, node.ptr);
    const colored = textColor(node, inherit.tone, inherit.ground, prepared.size, bold, this.theme, refused);
    if (colored.unknown) this.finding("color-unknown", "blocking", "T0", `"${colored.unknown}" is not a colour role, palette name, tint, or hex.`, joinPointer(node.ptr, node.color ? "color" : "tone"), id);
    if (colored.failure) {
      this.finding("contrast-pinned", "blocking", "T1", `Text contrast ${colored.failure.ratio.toFixed(2)}:1 is under ${colored.failure.required}:1 and the adjustment is refused by a pin.`, node.ptr, id, "Contrast is a hard constraint: remove the pin or choose a passing tone.");
    }
    const style = textStyle(node, this.theme, prepared.faces, prepared.size, colored.color, prepared.weight);
    const adjustments: Adjustment[] = [];
    if (colored.adjustment) adjustments.push(colored.adjustment);
    const fitSteps = this.steps.get(key) ?? 0;
    const authoredSize = sizeForNode(node, this.theme, inherit.sizeStep);
    if (fitSteps !== 0) {
      adjustments.push({ kind: "type-step", from: authoredSize, to: prepared.size, reason: `${node.role} ${authoredSize} → ${prepared.size} pt to fit its region`, path: joinPointer(node.ptr, "size") });
    }

    const floor = this.theme.floors[node.role];
    if (prepared.size < floor - 1e-6 && typeof node.size !== "number") {
      this.finding("type-below-floor", "blocking", "T1", `${node.role} at ${prepared.size} pt is under the ${floor} pt legibility floor for ${this.theme.format}.`, joinPointer(node.ptr, "size"), id, `Use a larger step; ${node.role} must be at least ${floor} pt.`);
    } else if (typeof node.size === "number" && node.size < floor - 1e-6 && !node.decorative) {
      this.finding("type-below-floor", "blocking", "T1", `A literal ${node.size} pt ${node.role} is under the ${floor} pt legibility floor.`, joinPointer(node.ptr, "size"), id);
    }

    const needed = layout.height;
    const maximumLines = node.lines;
    // A word wider than its box breaks mid-word in PowerPoint: that does not fit either.
    const widest = this.input.text.minContentWidth(prepared.layout);
    const wordBroken = widest > textFrame.w + EPSILON;
    const overflowing = needed > frame.h + EPSILON || (maximumLines !== undefined && layout.lineCount > maximumLines) || wordBroken;
    let status: FitStatus = fitSteps !== 0 ? "scaled" : "fit";
    const steps: string[] = ["measure"];
    if (fitSteps !== 0) steps.push(`size ${authoredSize}→${prepared.size}`);
    if (overflowing) {
      const record: OverflowRecord = {
        key,
        node,
        element: id,
        needed,
        available: frame.h,
        size: prepared.size,
        steps: fitSteps,
        ...(inherit.gridAncestor ? { gridAncestor: inherit.gridAncestor } : {}),
      };
      this.overflows.push(record);
      if (this.final) status = this.resolveOverflow(record, prepared, frame, inherit, wordBroken && needed <= frame.h + EPSILON);
    }

    for (const face of [prepared.faces.regular]) this.glyphCoverage(node, face, id);

    const paragraphs: TextParagraph[] = prepared.paragraphs.map((paragraph) => ({
      runs: paragraph.runs.map((run) => ({
        text: run.text,
        ...(run.bold ? { bold: true } : {}),
        ...(run.italic ? { italic: true } : {}),
        ...(run.mono ? { mono: true, font: this.theme.fonts.mono.regular.typeface } : {}),
        ...(run.link ?? node.link ? { link: run.link ?? node.link } : {}),
      })),
      ...(paragraph.bullet ? { bullet: paragraph.bullet } : {}),
      ...(paragraph.level ? { level: paragraph.level } : {}),
    }));

    const role = node.role === "title" ? "title" : node.role === "subtitle" ? "subtitle" : node.role === "caption" ? "caption" : node.role === "label" ? "label" : node.role === "display" ? "metric" : node.role === "quote" ? "quote" : "body";
    const element: TextElement = {
      kind: "text",
      id,
      role: node.decorative ? "decorative" : role as ElementRole,
      typeRole: node.role,
      frame: textFrame,
      z: 0,
      paragraphs,
      style,
      provenance: this.provenance(node),
      fit: { status, steps, lines: layout.lineCount },
      ground: inherit.ground.token,
      ...(adjustments.length ? { adjustments } : {}),
    };
    if (node.role === "title" && !this.titleBound && !node.decorative) {
      element.placeholder = { type: "title" };
      this.titleBound = true;
    }
    this.push(element, node);
  }

  private glyphCoverage(node: TextNode, face: LoadedFace, element: string): void {
    if (face.source !== "font-file" || !this.final) return;
    const missing = new Set<string>();
    for (const character of node.text) {
      const code = character.codePointAt(0)!;
      if (code > 0x20 && !/\s/.test(character) && !face.hasGlyph(code) && !"*_`[]()".includes(character)) missing.add(character);
    }
    if (missing.size > 0) {
      this.finding("glyph-missing", "major", "T1", `${face.typeface} has no glyphs for ${[...missing].slice(0, 8).join(" ")}; PowerPoint will substitute another face.`, node.ptr, element, "Choose a face that covers this script, or add a script pack.");
    }
  }

  /** Steps 5–7 of the fit ladder for one residual overflow. */
  private resolveOverflow(record: OverflowRecord, prepared: ReturnType<SlideSolver["textInput"]>, frame: Rect, inherit: Inherit, widthOnly = false): FitStatus {
    const node = record.node;
    const floor = this.theme.floors[node.role];
    const editId = `fit-${this.input.slide.id}-${this.suggestedEdits.length + 1}`;
    const options: NonNullable<SuggestedEdit["options"]> = [];
    const currentStep = parseStep(node.size) + record.steps;
    for (let extra = 0.5; extra <= 3; extra += 0.5) {
      const size = sizeForNode(node, this.theme, inherit.sizeStep + record.steps - extra);
      if (size < floor) break;
      const fits = this.input.text.layout({ ...prepared.layout, size }).height <= frame.h + EPSILON
        && this.input.text.minContentWidth({ ...prepared.layout, size }) <= frame.w + EPSILON;
      if (fits) {
        options.push({ do: "size", path: joinPointer(node.ptr, "size"), value: formatStep(currentStep - extra), effect: `${node.role} ${prepared.size} → ${size} pt` });
        break;
      }
    }
    const ancestor = record.gridAncestor;
    if (ancestor) {
      const { range, grid } = ancestor;
      const deficit = record.needed - record.available;
      const extraRows = Math.max(1, Math.ceil(deficit / (frame.h / Math.max(1, range.row[1] - range.row[0] + 1))));
      if (range.row[1] + extraRows <= grid.rows) {
        options.push({ do: "span", path: joinPointer(ancestor.node.ptr, "at"), value: formatCellRange({ column: range.column, row: [range.row[0], range.row[1] + extraRows] }), effect: `region +${extraRows} row${extraRows > 1 ? "s" : ""}` });
      } else if (range.row[0] - extraRows >= 1) {
        options.push({ do: "span", path: joinPointer(ancestor.node.ptr, "at"), value: formatCellRange({ column: range.column, row: [range.row[0] - extraRows, range.row[1]] }), effect: `region +${extraRows} row${extraRows > 1 ? "s" : ""} upward` });
      }
    }
    options.push({ do: "split", path: this.input.slide.path, effect: "continue on a new slide" });

    const plain = plainText(prepared.paragraphs);
    if (widthOnly) {
      this.suggestedEdits.push({ id: editId, kind: "choose", slide: this.input.slide.id, path: node.ptr, why: `a word in this ${node.role} is wider than its ${(frame.w * 72).toFixed(0)} pt box at ${prepared.size} pt`, options });
      this.finding("word-broken", "major", "T1", `A word in this ${node.role} is wider than its box and breaks mid-word.`, node.ptr, record.element, `Choose an option in ${editId}: a smaller step, a wider region, or a shorter word.`);
      return "choice-pending";
    }
    const budget = this.characterBudget(prepared, frame.h);
    this.suggestedEdits.push({
      id: editId,
      kind: "choose",
      slide: this.input.slide.id,
      path: node.ptr,
      why: `${node.role} needs ${(record.needed * 72).toFixed(0)} pt of height; its region has ${(record.available * 72).toFixed(0)} pt at ${prepared.size} pt`,
      options,
    });
    if (budget < plain.length) {
      this.suggestedEdits.push({
        id: `${editId}-shorten`,
        kind: "shorten",
        slide: this.input.slide.id,
        path: joinPointer(node.ptr, "text"),
        maxChars: budget,
        currentChars: plain.length,
        why: `fits ${budget} characters at ${prepared.size} pt in this region`,
      });
    }
    this.finding(
      "text-overflow",
      this.input.draft || this.input.fit === "auto" ? "blocking" : "blocking",
      "T1",
      `${node.role} text does not fit its region (${(record.needed * 72).toFixed(0)} pt needed, ${(record.available * 72).toFixed(0)} pt available).`,
      node.ptr,
      record.element,
      `Choose an option in ${editId}${budget < plain.length ? `, or shorten to ≤ ${budget} characters` : ""}.`,
    );
    return this.input.draft || this.input.fit === "auto" ? "overflow" : "choice-pending";
  }

  private characterBudget(prepared: ReturnType<SlideSolver["textInput"]>, height: number): number {
    const text = plainText(prepared.paragraphs);
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const candidate = text.slice(0, middle);
      const fits = this.input.text.layout({ ...prepared.layout, paragraphs: parseRichText(candidate) }).height <= height + EPSILON;
      if (fits) low = middle;
      else high = middle - 1;
    }
    // Round down to a word boundary so the budget is a length a sentence can end at.
    const cut = text.slice(0, low);
    const boundary = low < text.length ? cut.replace(/\s+\S*$/, "").length : low;
    return Math.max(0, boundary);
  }

  private recordContainerOverflow(node: ContainerNode, amount: number, inherit: Inherit): void {
    if (!this.final) return;
    // Text children report their own overflow; this is for content that is not text.
    const hasText = node.items.some((child) => child.kind === "text");
    if (hasText && amount < 0.05) return;
    this.finding("content-overflow", "blocking", "T1", `The ${node.kind}'s content is ${(amount * 72).toFixed(0)} pt taller than its region.`, node.ptr, undefined, "Give the region more rows, reduce content, or let a child grow instead of taking its natural height.");
    void inherit;
  }

  private emitShape(node: ShapeNode, frame: Rect, inherit: Inherit): void {
    const fill = node.fill === undefined && node.stroke === undefined
      ? roleColor("accent", this.theme)
      : this.color(node.fill, undefined, joinPointer(node.ptr, "fill"));
    const stroke = this.color(node.stroke, undefined, joinPointer(node.ptr, "stroke"));
    const drawn = node.ratio && frame.h > 0 ? fitRatio(frame, node.ratio) : frame;
    const element: ShapeElement = {
      kind: "shape",
      id: this.elementId(node),
      role: node.decorative || !node.text ? "decorative" : "body",
      frame: drawn,
      z: 0,
      style: {
        preset: node.path ? "custom" : node.preset ?? (node.radius ? "roundRect" : "rect"),
        ...(fill ? { fill } : {}),
        ...(stroke ? { stroke, strokeWidth: node.strokeWidth ?? Math.max(0.75, this.theme.shape.stroke) } : {}),
        ...(node.radius !== undefined ? { radius: node.radius } : {}),
        ...(node.path ? { path: node.path } : {}),
        ...(node.opacity !== undefined ? { opacity: node.opacity } : {}),
      },
      provenance: this.provenance(node),
      ...(node.decorative || !node.text ? { decorative: true } : {}),
    };
    if (node.text) {
      const textNode: TextNode = { kind: "text", text: node.text, role: "body", ptr: node.ptr, provenance: node.provenance, align: "center", valign: "middle" };
      const ground: Ground = fill ? { hex: fill.hex, token: fill.token ?? "fill" } : inherit.ground;
      const prepared = this.textInput(textNode, drawn.w * 0.9, { ...inherit, ground });
      const colored = textColor(textNode, inherit.tone, ground, prepared.size, false, this.theme, false);
      element.text = { paragraphs: prepared.paragraphs.map((paragraph) => ({ runs: paragraph.runs.map((run) => ({ text: run.text })) })), style: textStyle(textNode, this.theme, prepared.faces, prepared.size, colored.color, prepared.weight) };
      const height = this.input.text.layout(prepared.layout).height;
      if (height > drawn.h) this.finding("text-overflow", "blocking", "T1", "The shape's label does not fit inside it.", joinPointer(node.ptr, "text"), element.id);
    }
    if (node.preset && !PRESET_SHAPES.has(node.preset)) {
      this.finding("shape-preset-unknown", "blocking", "T0", `"${node.preset}" is not a DrawingML preset shape.`, joinPointer(node.ptr, "preset"), element.id);
    }
    this.push(element, node);
  }

  private emitImage(node: ImageNode, frame: Rect): void {
    const info = this.input.assets.get(node.asset);
    const id = this.elementId(node);
    if (!info || info.error || !info.file) {
      this.finding("image-unavailable", "blocking", "T0", `Image ${node.asset} cannot be used: ${info?.error ?? "not found"}.`, joinPointer(node.ptr, "asset"), id);
      return;
    }
    const fit = node.fit ?? "cover";
    let drawn = frame;
    let crop: ImageElement["crop"];
    if (info.width && info.height && frame.w > 0 && frame.h > 0) {
      const sourceAspect = info.width / info.height;
      const frameAspect = frame.w / frame.h;
      if (fit === "contain") {
        drawn = sourceAspect > frameAspect
          ? rect(frame.x, frame.y + (frame.h - frame.w / sourceAspect) / 2, frame.w, frame.w / sourceAspect)
          : rect(frame.x + (frame.w - frame.h * sourceAspect) / 2, frame.y, frame.h * sourceAspect, frame.h);
      } else if (Math.abs(sourceAspect - frameAspect) > 0.001) {
        const focal = { x: node.focal?.[0] ?? 0.5, y: node.focal?.[1] ?? 0.5 };
        if (sourceAspect > frameAspect) {
          const keep = frameAspect / sourceAspect;
          const trim = 1 - keep;
          const left = Math.max(0, Math.min(trim, focal.x - keep / 2));
          crop = { left, right: trim - left, top: 0, bottom: 0 };
        } else {
          const keep = sourceAspect / frameAspect;
          const trim = 1 - keep;
          const top = Math.max(0, Math.min(trim, focal.y - keep / 2));
          crop = { left: 0, right: 0, top, bottom: trim - top };
        }
      }
      const effectiveDpi = Math.min(info.width / (drawn.w * (1 - (crop ? crop.left + crop.right : 0))), info.height / (drawn.h * (1 - (crop ? crop.top + crop.bottom : 0))));
      if (effectiveDpi < 96) {
        this.finding("image-low-resolution", effectiveDpi < 60 ? "major" : "minor", "T3", `Image is ${Math.round(effectiveDpi)} DPI at this size; it will look soft when projected.`, joinPointer(node.ptr, "asset"), id, "Use a larger source image or a smaller region.");
      }
    }
    if (node.crop) {
      crop = { left: node.crop.left ?? 0, top: node.crop.top ?? 0, right: node.crop.right ?? 0, bottom: node.crop.bottom ?? 0 };
    }
    const treatment = node.treatment ?? this.theme.imagery.treatment;
    const element: ImageElement = {
      kind: "image",
      id,
      role: node.decorative ? "decorative" : "media",
      frame: drawn,
      z: 0,
      asset: info.file,
      ...(info.sha256 ? { sha256: info.sha256 } : {}),
      ...(info.width ? { pixelWidth: info.width } : {}),
      ...(info.height ? { pixelHeight: info.height } : {}),
      ...(crop ? { crop } : {}),
      ...(treatment && treatment !== "none" ? { treatment } : {}),
      ...(treatment === "tint" || treatment === "duotone" ? { tint: this.color(this.theme.imagery.tint ?? "accent", roleColor("accent", this.theme), joinPointer(node.ptr, "treatment"))! } : {}),
      ...(node.radius ?? this.theme.imagery.radius ? { radius: node.radius ?? this.theme.imagery.radius } : {}),
      ...(node.alt ? { alt: node.alt } : {}),
      provenance: this.provenance(node),
    };
    this.push(element, node);
  }

  private emitIcon(node: IconNode, frame: Rect, inherit: Inherit): void {
    const id = this.elementId(node);
    const resolved = resolveIcon(node.name);
    if (!resolved.icon) {
      this.suggestedEdits.push({ id: `icon-${id}`, kind: "icon", slide: this.input.slide.id, path: joinPointer(node.ptr, "icon"), why: `no icon "${node.name}"`, options: resolved.alternatives.map((name) => ({ do: "icon" as const, path: joinPointer(node.ptr, "icon"), value: name, effect: name })) });
      this.finding("icon-unknown", "blocking", "T0", `No icon "${node.name}".${resolved.alternatives.length ? ` Closest: ${resolved.alternatives.join(", ")}.` : ""}`, joinPointer(node.ptr, "icon"), id);
      return;
    }
    if (resolved.query) this.decisions.push({ kind: "icon-search", detail: `${node.name} → ${resolved.icon.name}${resolved.alternatives.length ? ` (also: ${resolved.alternatives.join(", ")})` : ""}` });
    const size = Math.min(this.iconSize(node, inherit), frame.w, frame.h > 0 ? frame.h : Number.POSITIVE_INFINITY);
    const color = this.color(node.tone ?? inherit.tone, roleColor("accent", this.theme), joinPointer(node.ptr, "tone"))!;
    if (contrastRatio(color.hex, inherit.ground.hex) < 3) {
      this.finding("icon-contrast", "major", "T1", `The icon is ${contrastRatio(color.hex, inherit.ground.hex).toFixed(2)}:1 against its ground; graphics need 3:1.`, joinPointer(node.ptr, "tone"), id);
    }
    const element: IconElement = {
      kind: "icon",
      id,
      role: node.decorative ? "decorative" : "media",
      frame: rect(frame.x, frame.y, size, size),
      z: 0,
      name: resolved.icon.name,
      paths: resolved.icon.paths.map((d) => ({ d, fill: false })),
      color,
      strokeWidth: node.strokeWidth ?? resolved.icon.stroke,
      provenance: this.provenance(node),
      decorative: node.decorative ?? true,
    };
    this.push(element, node);
  }

  private chartData(node: ChartNode | TableNode): unknown {
    if (typeof node.data !== "string") return node.data;
    const named = this.input.data[node.data];
    if (named === undefined) {
      this.finding("data-unknown", "blocking", "T0", `No dataset "${node.data}" in the intent's data.`, joinPointer(node.ptr, node.kind, "data"));
    }
    return named;
  }

  private emitChart(node: ChartNode, frame: Rect, inherit: Inherit): void {
    const id = this.elementId(node);
    const data = toChartData(this.chartData(node));
    if (!data) {
      this.finding("chart-data-invalid", "blocking", "T0", "Chart data needs {categories, series:[{name, values}]} or {columns, rows}.", joinPointer(node.ptr, "chart", "data"), id);
      return;
    }
    let kind: ChartKind = node.chart ?? "column";
    if (!node.chart) {
      kind = suggestChartKind(data);
      if (!this.input.draft) this.decisions.push({ kind: "chart-form-default", detail: `${id}: no form given; drew ${kind}` });
    }
    const problem = chartFormProblem(kind, data);
    if (problem) {
      this.finding("chart-type-mismatch", "minor", "T4", `A ${kind} chart here misleads: ${problem.reason}. Consider ${problem.alternatives.join(" or ")}.`, joinPointer(node.ptr, "chart"), id);
    }
    const facts = computeFacts(data);
    const annotations: string[] = [];
    for (const reference of node.annotate ?? []) {
      const fact = facts.find((candidate) => candidate.id === reference || candidate.id.startsWith(`${reference}:`));
      if (!fact) this.finding("fact-unknown", "major", "T4", `No computed fact "${reference}". Facts: ${facts.slice(0, 6).map((candidate) => candidate.id).join(", ")}…`, joinPointer(node.ptr, "annotate"), id);
      else annotations.push(fact.text);
    }
    const highlight = (Array.isArray(node.highlight) ? node.highlight : node.highlight !== undefined ? [node.highlight] : [])
      .map((entry) => typeof entry === "number" ? entry : data.categories.findIndex((category) => String(category) === String(entry)))
      .filter((index) => index >= 0);
    const palette = this.theme.data.length ? this.theme.data : [this.theme.roles.accent];
    const colors: ColorRef[] = data.series.map((_, index) => {
      const hex = palette[index % palette.length]!;
      const name = Object.entries(this.theme.palette).find(([, value]) => value === hex)?.[0];
      const slot = name ? this.theme.slotOfName[name] : undefined;
      return { hex, ...(slot ? { slot } : {}), ...(name ? { token: name } : {}) };
    });
    const style = this.theme.charts;
    const size = sizeForRole("small", inherit.sizeStep, this.theme);
    const element: ChartElement = {
      kind: "chart",
      id,
      role: "data",
      frame,
      z: 0,
      chart: kind,
      data,
      colors,
      highlight,
      style: {
        font: this.theme.fonts.body.regular.typeface,
        size: Math.max(this.theme.floors.small, Math.min(size, 16)),
        text: roleColor("text", this.theme),
        muted: roleColor("muted", this.theme),
        rule: roleColor(this.theme.roleNames.rule ? "rule" : "muted", this.theme),
        axis: node.axis ?? style.axis ?? "hairline",
        gridlines: style.gridlines ?? "subtle",
        labels: node.labels ?? style.labels ?? "none",
        legend: node.legend ?? style.legend ?? (data.series.length > 1 ? "top" : "none"),
      },
      ...(node.title ? { title: node.title } : {}),
      ...(annotations.length ? { facts: annotations } : {}),
      alt: node.alt ?? `${kind} chart of ${data.series.map((series) => series.name).join(", ")} by ${data.categories.length} categories`,
      provenance: this.provenance(node),
    };
    const highlightColor = style.highlight ? this.color(style.highlight, undefined, "/design/language/charts/highlight") : undefined;
    if (highlight.length) element.style.highlight = highlightColor ?? roleColor("accent", this.theme);
    if (frame.h < 1.2 || frame.w < 1.6) this.finding("chart-too-small", "major", "T3", `The chart region is ${frame.w.toFixed(1)}×${frame.h.toFixed(1)} in; axes and labels will not be legible.`, node.ptr, id);
    this.push(element, node);
  }

  private tableModel(node: TableNode): { columns: string[]; rows: string[][] } | undefined {
    const raw = this.chartData(node) as { columns?: unknown; rows?: unknown } | undefined;
    if (!raw || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return undefined;
    return {
      columns: (raw.columns as unknown[]).map((column) => String(column)),
      rows: (raw.rows as unknown[][]).map((row) => (Array.isArray(row) ? row : []).map((cell) => cell === null || cell === undefined ? "" : String(cell))),
    };
  }

  private emitTable(node: TableNode, frame: Rect, inherit: Inherit): void {
    const id = this.elementId(node);
    const model = this.tableModel(node);
    if (!model) {
      this.finding("table-data-invalid", "blocking", "T0", "Table data needs {columns: [...], rows: [[...]]}.", joinPointer(node.ptr, "table", "data"), id);
      return;
    }
    const header = node.header !== false;
    let size = sizeForRole("small", parseStep(node.size) + inherit.sizeStep, this.theme);
    const face = this.theme.fonts.body.regular;
    const bold = this.theme.fonts.body.bold;
    const columnCount = model.columns.length;
    const cellPad = 0.08;
    const measureColumns = (pt: number) => model.columns.map((column, index) => {
      const cells = [column, ...model.rows.map((row) => row[index] ?? "")];
      return Math.max(...cells.map((cell, row) => this.input.text.width(cell, row === 0 && header ? bold : face, pt))) + cellPad * 2;
    });
    let natural = measureColumns(size);
    let total = natural.reduce((sum, value) => sum + value, 0);
    const adjustments: Adjustment[] = [];
    while (total > frame.w && size > this.theme.floors.small) {
      const next = Math.max(this.theme.floors.small, size - 1);
      adjustments.push({ kind: "type-step", from: size, to: next, reason: "table columns wider than the region" });
      size = next;
      natural = measureColumns(size);
      total = natural.reduce((sum, value) => sum + value, 0);
    }
    const scale = frame.w / Math.max(total, 0.01);
    const columnWidths = natural.map((width) => width * (total > frame.w ? scale : scale));
    const rowHeights: number[] = [];
    const lineHeight = (size * 1.2) / 72;
    const allRows = header ? [model.columns, ...model.rows] : model.rows;
    for (const [rowIndex, row] of allRows.entries()) {
      let lines = 1;
      row.forEach((cell, columnIndex) => {
        const width = Math.max(0.05, (columnWidths[columnIndex] ?? 0.5) - cellPad * 2);
        const layout = this.input.text.layout({ paragraphs: parseRichText(cell), size, leading: 1.2, width, faceFor: () => rowIndex === 0 && header ? bold : face });
        lines = Math.max(lines, layout.lineCount);
      });
      rowHeights.push(lines * lineHeight + 0.1);
    }
    const height = rowHeights.reduce((sum, value) => sum + value, 0);
    if (height > frame.h + EPSILON) {
      this.finding("table-overflow", "blocking", "T1", `The table needs ${(height * 72).toFixed(0)} pt of height; its region has ${(frame.h * 72).toFixed(0)} pt.`, node.ptr, id, "Give the table more rows of the grid, split it, or show fewer rows.");
    }
    if (columnCount > 8) this.finding("table-too-wide", "minor", "T4", `${columnCount} columns are hard to read on a slide.`, node.ptr, id);
    const surfaceHex = this.theme.roles.surface;
    const element: TableElement = {
      kind: "table",
      id,
      role: "data",
      frame: rect(frame.x, frame.y, frame.w, Math.min(frame.h, height)),
      z: 0,
      columns: model.columns,
      rows: model.rows,
      columnWidths,
      rowHeights,
      header,
      ...(node.highlight ? { highlight: node.highlight } : {}),
      style: {
        font: face.typeface,
        size,
        text: roleColor("text", this.theme),
        headerText: roleColor("text", this.theme),
        ...(surfaceHex !== inherit.ground.hex ? { headerFill: roleColor("surface", this.theme) } : {}),
        rule: roleColor(this.theme.roleNames.rule ? "rule" : "muted", this.theme),
        highlightFill: resolveColor(`${this.theme.roleNames.accent}/80`, this.theme) ?? roleColor("surface", this.theme),
        align: model.columns.map((_, index) => node.align?.[index] ?? (model.rows.every((row) => /^[-+$€£]?[\d.,]+[%kKmMbB]?$/.test((row[index] ?? "").trim()) || !row[index]) ? "right" : "left")),
      },
      alt: node.alt ?? `Table with ${model.rows.length} rows: ${model.columns.join(", ")}`,
      provenance: this.provenance(node),
      ...(adjustments.length ? { adjustments } : {}),
    };
    this.push(element, node);
  }

  private emitDiagram(node: DiagramNode, frame: Rect, inherit: Inherit): void {
    const built = buildDiagram(node, frame, {
      theme: this.theme,
      text: this.input.text,
      ground: inherit.ground,
      idFor: (suffix) => this.elementId(node, suffix),
      provenance: this.provenance(node),
      page: this.page,
    });
    for (const finding of built.findings) this.finding(finding.code, finding.severity, finding.tier, finding.message, finding.path ?? node.ptr, finding.element);
    for (const element of built.elements) this.push(element, element.decorative ? { ...node, decorative: true } : node);
  }

  private emitTexture(node: TextureNode, frame: Rect, ground: Ground, fromRule: boolean): void {
    const built = buildTexture(node, frame, {
      theme: this.theme,
      text: this.input.text,
      ground,
      page: this.page,
      slide: { index: this.input.slide.index, count: this.input.slide.count },
      idFor: (suffix) => this.elementId(node, suffix),
      provenance: this.provenance(node),
    });
    if (built.error && !fromRule) this.finding("texture-unknown", "blocking", "T0", built.error, joinPointer(node.ptr, "texture"));
    for (const element of built.elements) this.push(element, { ...node, decorative: true });
  }

  private emitRule(node: RuleNode, frame: Rect, inherit: Inherit): void {
    const weight = Math.max(0.25, node.weight ?? 1) * PT;
    const vertical = node.orientation === "vertical";
    const color = this.color(node.tone ?? undefined, roleColor(this.theme.roleNames.rule ? "rule" : "muted", this.theme), joinPointer(node.ptr, "tone"))!;
    void inherit;
    this.push({
      kind: "shape",
      id: this.elementId(node),
      role: "decorative",
      decorative: true,
      frame: vertical ? rect(frame.x + frame.w / 2 - weight / 2, frame.y, weight, frame.h) : rect(frame.x, frame.y + frame.h / 2 - weight / 2, frame.w, weight),
      z: 0,
      style: { preset: "rect", fill: color },
      provenance: this.provenance(node),
    }, node);
  }

  private checkBounds(): void {
    if (!this.final) return;
    const page = this.page;
    for (const element of this.elements) {
      const { x, y, w, h } = element.frame;
      const outside = x < -0.01 || y < -0.01 || x + w > page.w + 0.01 || y + h > page.h + 0.01;
      if (outside) {
        this.finding("out-of-bounds", "blocking", "T1", `${element.id} extends past the slide edge.`, element.provenance.path, element.id, "Declare bleed on the region if this is intended, or keep it inside the grid.");
      }
    }
  }
}

function fitRatio(frame: Rect, ratio: number): Rect {
  const frameRatio = frame.w / frame.h;
  if (frameRatio > ratio) {
    const w = frame.h * ratio;
    return rect(frame.x + (frame.w - w) / 2, frame.y, w, frame.h);
  }
  const h = frame.w / ratio;
  return rect(frame.x, frame.y + (frame.h - h) / 2, frame.w, h);
}

function formatStep(value: number): string {
  const rounded = Math.round(value * 2) / 2;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export const PRESET_SHAPES = new Set([
  "rect", "roundRect", "ellipse", "triangle", "rtTriangle", "diamond", "parallelogram", "trapezoid", "pentagon", "hexagon", "heptagon", "octagon",
  "decagon", "dodecagon", "star4", "star5", "star6", "star8", "star12", "chevron", "homePlate", "rightArrow", "leftArrow", "upArrow", "downArrow",
  "leftRightArrow", "notchedRightArrow", "blockArc", "arc", "chord", "pie", "donut", "noSmoking", "plus", "mathPlus", "mathMinus", "mathMultiply",
  "mathEqual", "frame", "halfFrame", "corner", "diagStripe", "plaque", "can", "cube", "bevel", "foldedCorner", "smileyFace", "heart", "lightningBolt",
  "sun", "moon", "cloud", "wave", "doubleWave", "bracketPair", "bracePair", "leftBracket", "rightBracket", "leftBrace", "rightBrace", "snip1Rect",
  "snip2SameRect", "snip2DiagRect", "snipRoundRect", "round1Rect", "round2SameRect", "round2DiagRect", "teardrop", "line", "flowChartProcess",
  "flowChartDecision", "flowChartTerminator", "flowChartDocument", "flowChartPredefinedProcess", "flowChartInputOutput", "callout1", "wedgeRectCallout",
  "wedgeRoundRectCallout", "wedgeEllipseCallout", "cloudCallout", "ribbon", "ribbon2", "gear6", "gear9", "funnel", "pieWedge", "stripedRightArrow",
  "circularArrow", "curvedRightArrow", "uturnArrow", "custom",
]);

export { TYPE_ROLE_STEPS };
