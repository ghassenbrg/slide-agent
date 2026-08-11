import type { ElementRecord } from "../types/index.js";

export function normalizedBox(element: ElementRecord): { left: number; top: number; right: number; bottom: number } {
  const left = Math.min(element.x, element.x + element.w);
  const right = Math.max(element.x, element.x + element.w);
  const top = Math.min(element.y, element.y + element.h);
  const bottom = Math.max(element.y, element.y + element.h);
  return { left, top, right, bottom };
}

export function intersectionArea(leftElement: ElementRecord, rightElement: ElementRecord): number {
  const left = normalizedBox(leftElement);
  const right = normalizedBox(rightElement);
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

export function area(element: ElementRecord): number {
  return Math.abs(element.w * element.h);
}

export function contains(outer: ElementRecord, inner: ElementRecord, tolerance = 0.03): boolean {
  const a = normalizedBox(outer);
  const b = normalizedBox(inner);
  return b.left >= a.left - tolerance && b.right <= a.right + tolerance && b.top >= a.top - tolerance && b.bottom <= a.bottom + tolerance;
}

/**
 * OOXML's `roundRect` preset default adjustment: 16.667% of the shorter side.
 * A `roundRect` authored without an explicit radius is emitted with an empty
 * `avLst`, which is not a square corner — PowerPoint applies this. Treating
 * that case as unrounded is what let the original overhang through unreported.
 */
const ROUND_RECT_DEFAULT_ADJUSTMENT = 0.16667;

/** Presets whose bounding-box corners are the corners actually drawn. */
const RECTANGULAR_SHAPES = new Set(["rect", "roundRect"]);

/**
 * Whether this element's silhouette fills its bounding box out to the corners.
 * A plain shape record carries no `shape` when it is the default rectangle;
 * pictures, tables and charts carry none either and are rectangular unless a
 * picture was masked into some other outline.
 */
export function isRectangular(element: ElementRecord): boolean {
  if (element.type === "image") return !element.maskShape;
  if (element.type === "table" || element.type === "chart") return true;
  if (element.type !== "shape") return false;
  return element.shape === undefined || RECTANGULAR_SHAPES.has(element.shape);
}

/**
 * The corner radius PowerPoint will really draw, in inches. OOXML pins the
 * adjustment to half the shorter side, so an over-large radius rounds to a
 * stadium rather than growing without limit.
 */
export function effectiveCornerRadius(element: ElementRecord): number {
  if (element.type !== "shape" || element.shape !== "roundRect") return 0;
  const shortest = Math.min(Math.abs(element.w), Math.abs(element.h));
  const radius = element.radius ?? shortest * ROUND_RECT_DEFAULT_ADJUSTMENT;
  return Math.max(0, Math.min(radius, shortest / 2));
}

/**
 * Whether `bar` draws into the notch that `card`'s rounding cuts from one of
 * its corners — the "accent bar pokes past the rounded card" defect.
 *
 * A corner is only examined when `bar` has a corner inside the card's own
 * corner square, so a partial inset that is still short of the radius is
 * caught as well as a flush one. `bar`'s own rounding pulls the point it
 * actually draws back along the diagonal, which is why an equally rounded
 * bar sits exactly on the card's arc and is never reported.
 */
export function cornerOverhang(card: ElementRecord, bar: ElementRecord, tolerance = 0.005): boolean {
  const cardRadius = effectiveCornerRadius(card);
  if (cardRadius <= 0 || !isRectangular(bar)) return false;
  const barRadius = effectiveCornerRadius(bar);
  if (barRadius >= cardRadius) return false;
  // Something merely stacked against the card's edge is a neighbour whose own
  // corner is its business. Only what is drawn on the card can poke out of it.
  if (intersectionArea(card, bar) <= 0) return false;
  const c = normalizedBox(card);
  const b = normalizedBox(bar);
  const corners = [
    { x: c.left, y: c.top, inX: 1, inY: 1 },
    { x: c.right, y: c.top, inX: -1, inY: 1 },
    { x: c.left, y: c.bottom, inX: 1, inY: -1 },
    { x: c.right, y: c.bottom, inX: -1, inY: -1 },
  ];
  const barCorners = [
    { x: b.left, y: b.top },
    { x: b.right, y: b.top },
    { x: b.left, y: b.bottom },
    { x: b.right, y: b.bottom },
  ];
  // How far the bar's own rounding pulls its drawn corner in along the diagonal.
  const pullback = barRadius * (1 - Math.SQRT1_2);
  for (const corner of corners) {
    const centre = { x: corner.x + corner.inX * cardRadius, y: corner.y + corner.inY * cardRadius };
    for (const point of barCorners) {
      if (Math.abs(point.x - corner.x) > cardRadius + tolerance) continue;
      if (Math.abs(point.y - corner.y) > cardRadius + tolerance) continue;
      // A corner floating outside the card is a neighbour, not an overhang.
      if (point.x < c.left - tolerance || point.x > c.right + tolerance) continue;
      if (point.y < c.top - tolerance || point.y > c.bottom + tolerance) continue;
      const drawn = { x: point.x + corner.inX * pullback, y: point.y + corner.inY * pullback };
      if (Math.hypot(drawn.x - centre.x, drawn.y - centre.y) > cardRadius + tolerance) return true;
    }
  }
  return false;
}
