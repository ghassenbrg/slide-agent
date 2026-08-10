import { describe, expect, it } from "vitest";
import { flatten, pathBounds, pathCrossings, routeConnector, type Box } from "../../src/design/routing.js";

const box = (x: number, y: number, w = 2, h = 1): Box => ({ x, y, w, h });

/** Every point of a path, including the samples inside curves. */
function onEdgeOf(point: { x: number; y: number }, frame: Box): boolean {
  const onVertical = Math.abs(point.x - frame.x) < 1e-6 || Math.abs(point.x - (frame.x + frame.w)) < 1e-6;
  const onHorizontal = Math.abs(point.y - frame.y) < 1e-6 || Math.abs(point.y - (frame.y + frame.h)) < 1e-6;
  return onVertical || onHorizontal;
}

describe("connector routing", () => {
  it("anchors on the edges that face each other", () => {
    const from = box(1, 3);
    const to = box(8, 3);
    const path = routeConnector({ from, to });
    const start = path.points[0]!;
    const end = path.points.at(-1)!;
    expect(start.x).toBeCloseTo(3, 6);
    expect(end.x).toBeCloseTo(8, 6);
    expect(onEdgeOf(start, from)).toBe(true);
    expect(onEdgeOf(end, to)).toBe(true);
  });

  it("connects stacked elements top to bottom", () => {
    const path = routeConnector({ from: box(4, 1), to: box(4, 5) });
    expect(path.points[0]!.y).toBeCloseTo(2, 6);
    expect(path.points.at(-1)!.y).toBeCloseTo(5, 6);
  });

  it("honours an explicitly requested side", () => {
    const path = routeConnector({ from: box(1, 3), to: box(8, 3), fromSide: "top", toSide: "top" });
    expect(path.points[0]!.y).toBeCloseTo(3, 6);
    expect(path.points.at(-1)!.y).toBeCloseTo(3, 6);
  });

  it("routes around an element sitting between the two it joins", () => {
    const blocker = { id: "blocker", box: box(4.5, 2.6, 1.4, 1.8) };
    const direct = routeConnector({ from: box(1, 3), to: box(8, 3), obstacles: [] });
    expect(pathCrossings(direct.points, [blocker]).length).toBeGreaterThan(0);

    const routed = routeConnector({ from: box(1, 3), to: box(8, 3), obstacles: [blocker] });
    expect(pathCrossings(routed.points, [blocker])).toEqual([]);
  });

  it("keeps a straight route straight", () => {
    const path = routeConnector({ from: box(1, 3), to: box(8, 3), kind: "straight" });
    expect(path.points).toHaveLength(2);
    expect(path.segments.every((segment) => segment.kind !== "cubic")).toBe(true);
  });

  it("leaves a curved route perpendicular to the edge it starts on", () => {
    const path = routeConnector({ from: box(1, 3), to: box(8, 3), kind: "curved" });
    const cubic = path.segments.find((segment) => segment.kind === "cubic");
    expect(cubic).toBeDefined();
    if (cubic?.kind !== "cubic") throw new Error("expected a cubic segment");
    // The first control point runs along the +x normal of the right edge.
    expect(cubic.c1.y).toBeCloseTo(3.5, 6);
    expect(cubic.c1.x).toBeGreaterThan(3);
  });

  it("reports bounds that cover the drawn curve, not just its endpoints", () => {
    const path = routeConnector({ from: box(1, 3), to: box(1, 6), fromSide: "left", toSide: "left", kind: "curved" });
    const bounds = pathBounds(flatten(path.segments));
    expect(bounds.x).toBeLessThan(1);
  });

  it("finds no crossing when the path runs clear of every obstacle", () => {
    const path = routeConnector({ from: box(1, 1), to: box(8, 1) });
    expect(pathCrossings(path.points, [{ id: "far", box: box(4, 5) }])).toEqual([]);
  });

  it("detects a diagonal segment cutting a corner of a box", () => {
    const crossings = pathCrossings(
      [{ x: 0, y: 0 }, { x: 4, y: 4 }],
      [{ id: "corner", box: { x: 2, y: 1.5, w: 1, h: 1 } }],
    );
    expect(crossings).toEqual(["corner"]);
  });
});
