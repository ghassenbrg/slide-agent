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
