/**
 * Places the nodes of a diagram, so the author only decides what a node looks
 * like.
 *
 * Routing edges was the first half of this problem and it is solved elsewhere;
 * this is the other half. Deciding that six stages sit on an even rhythm, that
 * a fan-out belongs one rank to the right of what it fans from, and that two
 * edges should not cross if a different ordering avoids it, is arithmetic with
 * a known answer. Making an author do it by hand is how diagrams end up as
 * labels on diagonals: the geometry costs more attention than the idea, so the
 * idea gets simplified until the geometry is cheap.
 *
 * What is deliberately *not* here: what a node is. This module returns
 * rectangles. Whether a rectangle becomes a rounded card with an accent bar, a
 * circle with a port, or a line of type is the author's decision, made in their
 * own components, in their own visual language. An engine that also drew the
 * node would be a template with extra steps.
 *
 * The algorithm is a small layered layout — rank assignment, crossing reduction
 * by barycentre, then coordinates. It is not a general graph drawer and does
 * not try to be: slides hold a dozen nodes, the reading direction is almost
 * always left-to-right or top-down, and a deterministic answer matters more
 * than an optimal one.
 */
import { SlideAgentError } from "../utils/errors.js";

export interface GraphNode {
  id: string;
  /** Width in inches. Defaults to the layout's `nodeWidth`. */
  w?: number;
  /** Height in inches. Defaults to the layout's `nodeHeight`. */
  h?: number;
  /**
   * Pins this node to a rank. Without it the rank is derived from the edges:
   * one further along than everything pointing at it.
   */
  rank?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Kept for the caller; the layout does not read it. */
  label?: string;
}

export interface GraphLayoutSpec {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Which way the ranks advance. Defaults to `right`. */
  direction?: "right" | "down";
  /** The area to lay out within, in inches. */
  frame: { x: number; y: number; w: number; h: number };
  nodeWidth?: number;
  nodeHeight?: number;
  /** Gap between ranks. Defaults to a comfortable reading distance. */
  rankGap?: number;
  /** Gap between nodes within a rank. */
  nodeGap?: number;
  /**
   * Stretch the ranks to fill the frame along the reading axis.
   *
   * On by default: a flow that stops two thirds of the way across a slide reads
   * as unfinished rather than as restraint. Turn it off when the diagram should
   * keep its natural size inside a larger area.
   */
  fill?: boolean;
}

export interface PlacedNode {
  id: string;
  rank: number;
  /** Position within the rank, from 0. */
  order: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphLayout {
  nodes: PlacedNode[];
  byId: Map<string, PlacedNode>;
  /** Edges with any reversed back-edges restored to their authored direction. */
  edges: GraphEdge[];
  rankCount: number;
}

const DEFAULTS = { nodeWidth: 1.9, nodeHeight: 0.95, rankGap: 0.55, nodeGap: 0.3 };

/**
 * Ranks every node by longest path from a source.
 *
 * Cycles are broken by ignoring the edge that closes them, which keeps a
 * feedback loop — a review step pointing back at an earlier stage — from
 * collapsing the whole diagram into one rank. The edge is still returned and
 * still drawn; it just does not get a vote on where things sit.
 */
function assignRanks(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }

  const rank = new Map<string, number>();
  const state = new Map<string, "open" | "done">();

  const visit = (id: string): number => {
    const settled = rank.get(id);
    if (settled !== undefined && state.get(id) === "done") return settled;
    if (state.get(id) === "open") return 0;
    state.set(id, "open");
    let depth = 0;
    for (const next of outgoing.get(id) ?? []) {
      depth = Math.max(depth, visit(next) + 1);
    }
    state.set(id, "done");
    rank.set(id, depth);
    return depth;
  };

  for (const node of nodes) visit(node.id);

  // `visit` measures distance to a sink; ranks read better counted from the
  // source, so they are inverted once every depth is known.
  const deepest = Math.max(0, ...rank.values());
  const ranked = new Map<string, number>();
  for (const node of nodes) {
    ranked.set(node.id, node.rank ?? deepest - (rank.get(node.id) ?? 0));
  }
  return ranked;
}

/**
 * Orders nodes within each rank so edges cross as little as possible.
 *
 * The barycentre heuristic: a node sits at the average position of what it
 * connects to in the neighbouring rank. Four sweeps is well past the point of
 * diminishing returns at slide scale, and stopping at a fixed count keeps the
 * result identical on every run — a layout that shifted between builds would
 * make every diff unreadable.
 */
function orderRanks(ranks: Map<number, string[]>, edges: GraphEdge[]): void {
  const neighbours = new Map<string, string[]>();
  for (const edge of edges) {
    neighbours.set(edge.from, [...(neighbours.get(edge.from) ?? []), edge.to]);
    neighbours.set(edge.to, [...(neighbours.get(edge.to) ?? []), edge.from]);
  }

  const numbers = [...ranks.keys()].sort((left, right) => left - right);
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const order = sweep % 2 === 0 ? numbers : [...numbers].reverse();
    for (const number of order) {
      const previous = ranks.get(sweep % 2 === 0 ? number - 1 : number + 1);
      if (!previous) continue;
      const position = new Map(previous.map((id, index) => [id, index]));
      const current = ranks.get(number)!;
      const barycentre = new Map<string, number>();
      current.forEach((id, index) => {
        const anchors = (neighbours.get(id) ?? []).map((other) => position.get(other)).filter((value): value is number => value !== undefined);
        // A node with no neighbour in the adjacent rank keeps its own place
        // rather than being swept to the front by an average of nothing.
        barycentre.set(id, anchors.length ? anchors.reduce((sum, value) => sum + value, 0) / anchors.length : index);
      });
      current.sort((left, right) => (barycentre.get(left)! - barycentre.get(right)!));
    }
  }
}

/** Lays a graph out inside a frame and returns where every node goes. */
export function layoutGraph(spec: GraphLayoutSpec): GraphLayout {
  const direction = spec.direction ?? "right";
  const nodeWidth = spec.nodeWidth ?? DEFAULTS.nodeWidth;
  const nodeHeight = spec.nodeHeight ?? DEFAULTS.nodeHeight;
  const rankGap = spec.rankGap ?? DEFAULTS.rankGap;
  const nodeGap = spec.nodeGap ?? DEFAULTS.nodeGap;
  const fill = spec.fill ?? true;

  const ranked = assignRanks(spec.nodes, spec.edges);
  const ranks = new Map<number, string[]>();
  for (const node of spec.nodes) {
    const number = ranked.get(node.id) ?? 0;
    ranks.set(number, [...(ranks.get(number) ?? []), node.id]);
  }
  orderRanks(ranks, spec.edges);

  const sizeOf = new Map(spec.nodes.map((node) => [node.id, {
    w: node.w ?? nodeWidth,
    h: node.h ?? nodeHeight,
  }]));
  const numbers = [...ranks.keys()].sort((left, right) => left - right);

  // Along the reading axis: one slot per rank, each as deep as its deepest
  // node, distributed across the frame when filling.
  const rankExtent = numbers.map((number) => Math.max(
    ...ranks.get(number)!.map((id) => direction === "right" ? sizeOf.get(id)!.w : sizeOf.get(id)!.h),
  ));
  const along = direction === "right" ? spec.frame.w : spec.frame.h;
  const naturalAlong = rankExtent.reduce((sum, value) => sum + value, 0) + rankGap * Math.max(0, numbers.length - 1);
  const extentAlong = rankExtent.reduce((sum, value) => sum + value, 0);
  if (extentAlong > along + 1e-6) {
    throw new SlideAgentError(
      "GRAPH_DOES_NOT_FIT",
      `A graph of ${numbers.length} rank(s) needs ${extentAlong.toFixed(2)}in along the ${direction === "right" ? "width" : "height"} but was given ${along.toFixed(2)}in. Give it a larger frame, smaller nodes, or fewer ranks — the nodes would otherwise be placed off the slide.`,
      { ranks: numbers.length, needed: extentAlong, available: along, direction },
    );
  }
  // Filling distributes the slack; when there is none the gap compresses to
  // zero rather than pushing the last rank past the edge of the frame.
  const gapAlong = numbers.length > 1
    ? fill
      ? Math.max(0, (along - extentAlong) / (numbers.length - 1))
      : Math.min(rankGap, (along - extentAlong) / (numbers.length - 1))
    : 0;
  const startAlong = (direction === "right" ? spec.frame.x : spec.frame.y)
    + (fill ? 0 : Math.max(0, (along - naturalAlong) / 2));

  const placed: PlacedNode[] = [];
  let cursor = startAlong;
  numbers.forEach((number, rankIndex) => {
    const ids = ranks.get(number)!;
    // Across the rank: nodes centred on the frame's other axis.
    const across = direction === "right" ? spec.frame.h : spec.frame.w;
    const extents = ids.map((id) => direction === "right" ? sizeOf.get(id)!.h : sizeOf.get(id)!.w);
    const extentAcross = extents.reduce((sum, value) => sum + value, 0);
    if (extentAcross > across + 1e-6) {
      throw new SlideAgentError(
        "GRAPH_RANK_DOES_NOT_FIT",
        `Rank ${number} of a graph holds ${ids.length} node(s) needing ${extentAcross.toFixed(2)}in across but was given ${across.toFixed(2)}in. Split the rank, shrink the nodes, or give the graph a larger frame — they would otherwise be placed off the slide.`,
        { rank: number, nodes: ids, needed: extentAcross, available: across },
      );
    }
    // The gap between siblings compresses the same way the gap between ranks
    // does, so a full rank sits inside its frame rather than spilling out of it.
    const gapAcross = ids.length > 1 ? Math.min(nodeGap, (across - extentAcross) / (ids.length - 1)) : 0;
    const total = extentAcross + gapAcross * Math.max(0, ids.length - 1);
    let offset = (direction === "right" ? spec.frame.y : spec.frame.x) + Math.max(0, (across - total) / 2);

    ids.forEach((id, order) => {
      const size = sizeOf.get(id)!;
      const node: PlacedNode = direction === "right"
        ? { id, rank: number, order, x: cursor, y: offset, w: size.w, h: size.h }
        : { id, rank: number, order, x: offset, y: cursor, w: size.w, h: size.h };
      placed.push(node);
      offset += extents[order]! + gapAcross;
    });
    cursor += rankExtent[rankIndex]! + gapAlong;
  });

  return {
    nodes: placed,
    byId: new Map(placed.map((node) => [node.id, node])),
    edges: spec.edges,
    rankCount: numbers.length,
  };
}
