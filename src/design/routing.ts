/**
 * Connector routing.
 *
 * A connector used to be a free vector: the author supplied a start point and a
 * delta, and the engine drew exactly that line. Every consequence of that
 * decision landed on the author — which edge of a hexagon an arrow should leave
 * from, how far to stand off so the head does not touch the stroke, and whether
 * the straight line between two boxes happens to cross a third. Authors priced
 * that work honestly and drew fewer, worse diagrams.
 *
 * This module moves the geometry to the engine. The author says which elements
 * are joined and, if they care, which sides to leave from; the router resolves
 * anchors on the real element frames, keeps a clearance around every other
 * element on the slide, and returns a path. Nothing here decides what a diagram
 * *means* — node shape, colour, and label are still entirely the author's.
 *
 * The routing is deliberately a small deterministic search over a handful of
 * candidate orthogonal paths rather than a general pathfinder. A slide holds
 * tens of elements, not thousands; candidates are scored on obstacle crossings
 * first, then bends, then length, and the winner is stable across runs. When
 * every candidate crosses something the least-bad one is still returned, and
 * the crossing is reported by validation rather than hidden.
 */

/** A point in slide inches. */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned box in slide inches. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Which edge of an element a connector leaves from or arrives at. */
export type ConnectorSide = "top" | "right" | "bottom" | "left" | "auto";

/** How the path between two anchors is drawn. */
export type RouteKind = "straight" | "elbow" | "curved";

export type PathSegment =
  | { kind: "move"; to: Point }
  | { kind: "line"; to: Point }
  | { kind: "cubic"; c1: Point; c2: Point; to: Point };

export interface RoutedPath {
  segments: PathSegment[];
  /** The polyline the segments trace, used for bounds and crossing checks. */
  points: Point[];
  kind: RouteKind;
  /** Elements the path deliberately touches: the two it joins. */
  touches: string[];
}

const SIDES = ["top", "right", "bottom", "left"] as const;
type FixedSide = (typeof SIDES)[number];

const NORMALS: Record<FixedSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function centerOf(box: Box): Point {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

/** The midpoint of one edge, and the outward direction from it. */
function anchorOn(box: Box, side: FixedSide): { point: Point; normal: Point } {
  const center = centerOf(box);
  const point = side === "top"
    ? { x: center.x, y: box.y }
    : side === "bottom"
      ? { x: center.x, y: box.y + box.h }
      : side === "left"
        ? { x: box.x, y: center.y }
        : { x: box.x + box.w, y: center.y };
  return { point, normal: NORMALS[side] };
}

/**
 * Picks the edge that faces the other element.
 *
 * The dominant axis of the centre-to-centre vector wins, which is what a person
 * drawing the same diagram would do: boxes side by side connect left-to-right,
 * boxes stacked connect top-to-bottom. Comparing the gap rather than the raw
 * delta keeps a wide, short box from choosing its long edge merely because the
 * horizontal distance between centres is larger.
 */
function faceToward(box: Box, toward: Box): FixedSide {
  const from = centerOf(box);
  const to = centerOf(toward);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const gapX = Math.abs(dx) - (box.w + toward.w) / 2;
  const gapY = Math.abs(dy) - (box.h + toward.h) / 2;
  if (gapX >= gapY) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function resolveSide(box: Box, toward: Box, requested: ConnectorSide | undefined): FixedSide {
  if (!requested || requested === "auto") return faceToward(box, toward);
  return requested;
}

function outside(point: Point, bounds: Box): boolean {
  return point.x < bounds.x - 1e-6 || point.y < bounds.y - 1e-6
    || point.x > bounds.x + bounds.w + 1e-6 || point.y > bounds.y + bounds.h + 1e-6;
}

function offset(point: Point, normal: Point, distance: number): Point {
  return { x: point.x + normal.x * distance, y: point.y + normal.y * distance };
}

function grow(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, w: box.w + by * 2, h: box.h + by * 2 };
}

/** Whether a segment touches a box, treating a shared edge as clear. */
function segmentCrossesBox(a: Point, b: Point, box: Box): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  // Cheap rejection first; most segment/box pairs on a slide are far apart.
  if (maxX <= box.x || minX >= box.x + box.w) return false;
  if (maxY <= box.y || minY >= box.y + box.h) return false;

  // Axis-aligned segments are the common case and the overlap test above is
  // already exact for them.
  if (a.x === b.x || a.y === b.y) return true;

  // Diagonal: separating-axis on the segment's own normal.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  let positive = false;
  let negative = false;
  for (const corner of corners) {
    const side = dx * (corner.y - a.y) - dy * (corner.x - a.x);
    if (side > 0) positive = true;
    else if (side < 0) negative = true;
    else return true;
  }
  return positive && negative;
}

export function pathCrossings(points: Point[], obstacles: Array<{ id: string; box: Box }>): string[] {
  const hit = new Set<string>();
  for (let index = 0; index + 1 < points.length; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    for (const obstacle of obstacles) {
      if (hit.has(obstacle.id)) continue;
      if (segmentCrossesBox(a, b, obstacle.box)) hit.add(obstacle.id);
    }
  }
  return [...hit];
}

function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index + 1 < points.length; index += 1) {
    total += Math.abs(points[index + 1]!.x - points[index]!.x)
      + Math.abs(points[index + 1]!.y - points[index]!.y);
  }
  return total;
}

/** Drops points that sit on the straight line between their neighbours. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out.at(-1);
    if (last && Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.y - point.y) < 1e-6) continue;
    out.push(point);
  }
  for (let index = 1; index + 1 < out.length;) {
    const previous = out[index - 1]!;
    const current = out[index]!;
    const next = out[index + 1]!;
    const collinearX = Math.abs(previous.x - current.x) < 1e-6 && Math.abs(current.x - next.x) < 1e-6;
    const collinearY = Math.abs(previous.y - current.y) < 1e-6 && Math.abs(current.y - next.y) < 1e-6;
    if (collinearX || collinearY) out.splice(index, 1);
    else index += 1;
  }
  return out;
}

function bendCount(points: Point[]): number {
  return Math.max(0, points.length - 2);
}

/**
 * Candidate orthogonal routes between two stub ends.
 *
 * Besides the obvious doglegs this offers a lane just outside each edge of
 * every obstacle. That is what makes going *around* something possible: the
 * useful detours are the ones that graze an obstacle's boundary, and they
 * cannot be guessed from the two joined frames alone. The set stays small —
 * four lanes per obstacle on a slide holding tens of elements — so scoring
 * every candidate is cheaper than a general pathfinder and gives the same
 * answer on every run.
 */
function candidates(
  start: Point,
  end: Point,
  startAxis: "x" | "y",
  endAxis: "x" | "y",
  obstacles: Array<{ id: string; box: Box }>,
  clearance: number,
  bounds?: Box,
): Point[][] {
  const gap = Math.max(clearance, 0.12);
  const xLanes = new Set<number>([(start.x + end.x) / 2]);
  const yLanes = new Set<number>([(start.y + end.y) / 2]);
  const inBoundsX = (value: number) => bounds ? Math.min(Math.max(value, bounds.x), bounds.x + bounds.w) : value;
  const inBoundsY = (value: number) => bounds ? Math.min(Math.max(value, bounds.y), bounds.y + bounds.h) : value;
  for (const { box } of obstacles) {
    xLanes.add(inBoundsX(box.x - gap));
    xLanes.add(inBoundsX(box.x + box.w + gap));
    yLanes.add(inBoundsY(box.y - gap));
    yLanes.add(inBoundsY(box.y + box.h + gap));
  }

  const routes: Point[][] = [];
  for (const x of xLanes) routes.push([start, { x, y: start.y }, { x, y: end.y }, end]);
  for (const y of yLanes) routes.push([start, { x: start.x, y }, { x: end.x, y }, end]);
  // Single-bend L-shapes, which are the tidiest answer whenever they are clear.
  routes.push([start, { x: end.x, y: start.y }, end]);
  routes.push([start, { x: start.x, y: end.y }, end]);

  // A route that turns immediately against its own normal reads as a kink, so
  // the natural dogleg for the two axes is offered first and wins any tie.
  if (startAxis === "x" && endAxis === "x") {
    routes.unshift([start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]);
  } else if (startAxis === "y" && endAxis === "y") {
    routes.unshift([start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end]);
  } else if (startAxis === "x") {
    routes.unshift([start, { x: end.x, y: start.y }, end]);
  } else {
    routes.unshift([start, { x: start.x, y: end.y }, end]);
  }
  return routes;
}

export interface RouteRequest {
  from: Box;
  to: Box;
  fromSide?: ConnectorSide;
  toSide?: ConnectorSide;
  kind?: RouteKind;
  /** Gap held between the path and any element it is not joining, in inches. */
  clearance?: number;
  /** How far the path runs straight out of an anchor before it may turn. */
  stub?: number;
  /** Everything the path should try to avoid, excluding the joined elements. */
  obstacles?: Array<{ id: string; box: Box }>;
  /**
   * The area the route must stay inside, normally the slide.
   *
   * Routing around an obstacle can otherwise pick a lane past the edge of the
   * slide, which is a worse answer than crossing the thing it was avoiding: an
   * arrow that leaves the page reads as a bug, and every viewer clips it
   * differently.
   */
  bounds?: Box;
}

const DEFAULT_CLEARANCE = 0.08;
const DEFAULT_STUB = 0.18;

/**
 * Resolves a path between two element frames.
 *
 * Anchors sit on the true edge midpoints, so an arrow into a circle or a
 * hexagon lands where the shape is rather than where its bounding box is. The
 * returned polyline always starts and ends exactly on those anchors: the stub
 * offsets shape the interior of the route, they are not where the line stops.
 */
export function routeConnector(request: RouteRequest): RoutedPath {
  const kind = request.kind ?? "elbow";
  const clearance = Math.max(0, request.clearance ?? DEFAULT_CLEARANCE);
  const stub = Math.max(0, request.stub ?? DEFAULT_STUB);

  const fromSide = resolveSide(request.from, request.to, request.fromSide);
  const toSide = resolveSide(request.to, request.from, request.toSide);
  const startAnchor = anchorOn(request.from, fromSide);
  const endAnchor = anchorOn(request.to, toSide);

  if (kind === "straight") {
    const points = [startAnchor.point, endAnchor.point];
    return { segments: toSegments(points, "straight"), points, kind, touches: [] };
  }

  const start = offset(startAnchor.point, startAnchor.normal, stub);
  const end = offset(endAnchor.point, endAnchor.normal, stub);
  const startAxis = startAnchor.normal.x === 0 ? "y" : "x";
  const endAxis = endAnchor.normal.x === 0 ? "y" : "x";

  const padded = (request.obstacles ?? []).map((obstacle) => ({
    id: obstacle.id,
    box: grow(obstacle.box, clearance),
  }));

  let best: { points: Point[]; score: number } | undefined;
  for (const middle of candidates(start, end, startAxis, endAxis, padded, clearance, request.bounds)) {
    const points = simplify([startAnchor.point, ...middle, endAnchor.point]);
    const crossings = pathCrossings(points, padded).length;
    // Leaving the page is the one outcome worse than crossing something: an
    // arrow that runs off the slide reads as a defect and clips differently in
    // every viewer, where a crossing at least still describes a relationship.
    const escaped = request.bounds ? points.filter((point) => outside(point, request.bounds!)).length : 0;
    const score = escaped * 100000 + crossings * 1000 + bendCount(points) * 3 + polylineLength(points);
    if (!best || score < best.score) best = { points, score };
  }

  const points = best?.points ?? simplify([startAnchor.point, start, end, endAnchor.point]);
  if (kind === "curved") {
    const segments = curveThrough(startAnchor, endAnchor);
    // Bounds and crossing checks run on the curve the viewer sees, not on the
    // orthogonal candidate it was chosen against.
    return { segments, points: flatten(segments), kind, touches: [] };
  }
  return { segments: toSegments(points, "elbow"), points, kind, touches: [] };
}

function toSegments(points: Point[], _kind: RouteKind): PathSegment[] {
  const segments: PathSegment[] = [];
  points.forEach((point, index) => {
    segments.push(index === 0 ? { kind: "move", to: point } : { kind: "line", to: point });
  });
  return segments;
}

/**
 * A single cubic whose control points run along the anchor normals, so the
 * curve leaves and arrives perpendicular to the edges it touches.
 */
function curveThrough(
  start: { point: Point; normal: Point },
  end: { point: Point; normal: Point },
): PathSegment[] {
  const distance = Math.hypot(end.point.x - start.point.x, end.point.y - start.point.y);
  const pull = Math.max(0.3, distance * 0.4);
  return [
    { kind: "move", to: start.point },
    {
      kind: "cubic",
      c1: offset(start.point, start.normal, pull),
      c2: offset(end.point, end.normal, pull),
      to: end.point,
    },
  ];
}

/**
 * Samples curved segments into a polyline.
 *
 * Bounds, crossing checks, and the overlap report all need a shape they can
 * reason about with straight-line maths. Sixteen samples per cubic is well
 * inside a hairline at slide scale, so the approximation never disagrees with
 * the drawing by anything a reader could see.
 */
export function flatten(segments: PathSegment[], samples = 16): Point[] {
  const points: Point[] = [];
  let cursor: Point = { x: 0, y: 0 };
  for (const segment of segments) {
    if (segment.kind === "move") {
      cursor = segment.to;
      points.push(cursor);
      continue;
    }
    if (segment.kind === "line") {
      cursor = segment.to;
      points.push(cursor);
      continue;
    }
    const from = cursor;
    for (let step = 1; step <= samples; step += 1) {
      const t = step / samples;
      const inverse = 1 - t;
      points.push({
        x: inverse ** 3 * from.x + 3 * inverse ** 2 * t * segment.c1.x + 3 * inverse * t ** 2 * segment.c2.x + t ** 3 * segment.to.x,
        y: inverse ** 3 * from.y + 3 * inverse ** 2 * t * segment.c1.y + 3 * inverse * t ** 2 * segment.c2.y + t ** 3 * segment.to.y,
      });
    }
    cursor = segment.to;
  }
  return points;
}

/** The tight box around a routed path. */
export function pathBounds(points: Point[]): Box {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
