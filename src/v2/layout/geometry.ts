import type { Length } from "../ir/compose.js";
import type { Rect } from "../ir/scene.js";
import type { ThemeSpec } from "../tokens/compile.js";

export const PT = 1 / 72;

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

export function inset(frame: Rect, [top, right, bottom, left]: [number, number, number, number]): Rect {
  return rect(frame.x + left, frame.y + top, frame.w - left - right, frame.h - top - bottom);
}

export function contentArea(theme: ThemeSpec): Rect {
  const margin = theme.space.margin;
  return rect(margin, margin, theme.slide.width - margin * 2, theme.slide.height - margin * 2);
}

export function pageRect(theme: ThemeSpec): Rect {
  return rect(0, 0, theme.slide.width, theme.slide.height);
}

export interface LengthContext {
  theme: ThemeSpec;
  /** The parent's size along the axis this length measures, for percentages. */
  reference: number;
  /** Grid unit along this axis, for `u` lengths. */
  unit?: number;
}

/**
 * A length in inches, or `undefined` for `auto` and for `fr` (which the flex
 * solver reads as grow). Numbers are points.
 */
export function resolveLength(value: Length | undefined, context: LengthContext): number | undefined {
  if (value === undefined || value === "auto") return undefined;
  if (typeof value === "number") return value * PT;
  const space = /^space\.(\d+(?:\.\d+)?)$/.exec(value);
  if (space) return Number(space[1]) * context.theme.space.unit * PT;
  const match = /^(-?\d+(?:\.\d+)?)(pt|in|%|fr|u)?$/.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  switch (match[2]) {
    case "in": return amount;
    case "%": return (amount / 100) * context.reference;
    case "fr": return undefined;
    case "u": return amount * (context.unit ?? context.reference / context.theme.grid.columns);
    default: return amount * PT;
  }
}

export function frGrow(value: Length | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d+(?:\.\d+)?)fr$/.exec(value);
  return match ? Number(match[1]) : undefined;
}

/** `pad` as [top, right, bottom, left] in inches, CSS-style shorthand. */
export function resolvePad(value: Length | Length[] | undefined, theme: ThemeSpec, reference: number): [number, number, number, number] {
  if (value === undefined) return [0, 0, 0, 0];
  const values = (Array.isArray(value) ? value : [value]).map((item) => resolveLength(item, { theme, reference }) ?? 0);
  const [a = 0, b = a, c = a, d = b] = values;
  return [a, b, c, d];
}

export interface GridGeometry {
  frame: Rect;
  columns: number;
  rows: number;
  columnWidth: number;
  rowHeight: number;
  gutterX: number;
  gutterY: number;
}

export function gridGeometry(frame: Rect, columns: number, rows: number, gutter: number): GridGeometry {
  const gutterX = Math.min(gutter, (frame.w / columns) * 0.5);
  const gutterY = Math.min(gutter, (frame.h / rows) * 0.5);
  return {
    frame,
    columns,
    rows,
    columnWidth: (frame.w - gutterX * (columns - 1)) / columns,
    rowHeight: (frame.h - gutterY * (rows - 1)) / rows,
    gutterX,
    gutterY,
  };
}

export function cellRect(grid: GridGeometry, column: [number, number], row: [number, number]): Rect {
  const x = grid.frame.x + (column[0] - 1) * (grid.columnWidth + grid.gutterX);
  const y = grid.frame.y + (row[0] - 1) * (grid.rowHeight + grid.gutterY);
  const w = (column[1] - column[0] + 1) * grid.columnWidth + (column[1] - column[0]) * grid.gutterX;
  const h = (row[1] - row[0] + 1) * grid.rowHeight + (row[1] - row[0]) * grid.gutterY;
  return rect(x, y, w, h);
}

export function extendToPage(frame: Rect, sides: string[] | undefined, page: Rect): Rect {
  if (!sides?.length) return frame;
  let { x, y, w, h } = frame;
  if (sides.includes("left")) { w += x - page.x; x = page.x; }
  if (sides.includes("top")) { h += y - page.y; y = page.y; }
  if (sides.includes("right")) w = page.x + page.w - x;
  if (sides.includes("bottom")) h = page.y + page.h - y;
  return rect(x, y, w, h);
}

export function union(frames: Rect[]): Rect | undefined {
  if (frames.length === 0) return undefined;
  const x = Math.min(...frames.map((frame) => frame.x));
  const y = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.w));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.h));
  return rect(x, y, right - x, bottom - y);
}

export function intersects(a: Rect, b: Rect, tolerance = 0.01): boolean {
  return a.x + tolerance < b.x + b.w && b.x + tolerance < a.x + a.w && a.y + tolerance < b.y + b.h && b.y + tolerance < a.y + a.h;
}

export function contains(outer: Rect, inner: Rect, tolerance = 0.01): boolean {
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance && inner.y + inner.h <= outer.y + outer.h + tolerance;
}

export function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function roundRect(frame: Rect): Rect {
  return { x: round(frame.x), y: round(frame.y), w: round(frame.w), h: round(frame.h) };
}
