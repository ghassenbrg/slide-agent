import { describe, expect, it } from "vitest";
import { layoutGraph, type GraphEdge } from "../../src/design/graph-layout.js";

const frame = { x: 0, y: 0, w: 12, h: 6 };

function chain(count: number): { nodes: Array<{ id: string }>; edges: GraphEdge[] } {
  const nodes = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }));
  const edges = nodes.slice(1).map((node, index) => ({ from: `n${index}`, to: node.id }));
  return { nodes, edges };
}

describe("graph layout", () => {
  it("puts a chain on one rank each, in order, left to right", () => {
    const layout = layoutGraph({ ...chain(5), frame });
    expect(layout.rankCount).toBe(5);
    const xs = layout.nodes
      .sort((left, right) => left.rank - right.rank)
      .map((node) => node.x);
    expect(xs).toEqual([...xs].sort((left, right) => left - right));
  });

  it("spaces the ranks evenly", () => {
    const layout = layoutGraph({ ...chain(4), frame, nodeWidth: 2 });
    const ordered = [...layout.nodes].sort((left, right) => left.rank - right.rank);
    const gaps = ordered.slice(1).map((node, index) => node.x - (ordered[index]!.x + ordered[index]!.w));
    const distinct = new Set(gaps.map((gap) => Number(gap.toFixed(6))));
    expect(distinct.size).toBe(1);
  });

  it("fills the frame along the reading axis by default", () => {
    const layout = layoutGraph({ ...chain(4), frame, nodeWidth: 1.5 });
    const ordered = [...layout.nodes].sort((left, right) => left.rank - right.rank);
    expect(ordered[0]!.x).toBeCloseTo(0, 6);
    expect(ordered.at(-1)!.x + ordered.at(-1)!.w).toBeCloseTo(12, 6);
  });

  it("keeps a diagram at its natural size when filling is off", () => {
    const layout = layoutGraph({ ...chain(3), frame, nodeWidth: 1.5, fill: false });
    const ordered = [...layout.nodes].sort((left, right) => left.rank - right.rank);
    expect(ordered[0]!.x).toBeGreaterThan(0);
    // Centred: the margin on the right matches the one on the left.
    expect(12 - (ordered.at(-1)!.x + ordered.at(-1)!.w)).toBeCloseTo(ordered[0]!.x, 6);
  });

  it("puts a fan-out one rank past what it fans from, side by side", () => {
    const layout = layoutGraph({
      nodes: [{ id: "root" }, { id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "root", to: "a" }, { from: "root", to: "b" }, { from: "root", to: "c" }],
      frame,
    });
    expect(layout.byId.get("root")!.rank).toBe(0);
    for (const id of ["a", "b", "c"]) expect(layout.byId.get(id)!.rank).toBe(1);
    const ys = ["a", "b", "c"].map((id) => layout.byId.get(id)!.y);
    expect(new Set(ys).size).toBe(3);
  });

  it("centres a rank across the frame's other axis", () => {
    const layout = layoutGraph({
      nodes: [{ id: "root" }, { id: "a" }, { id: "b" }],
      edges: [{ from: "root", to: "a" }, { from: "root", to: "b" }],
      frame,
      nodeHeight: 1,
      nodeGap: 0.5,
    });
    const root = layout.byId.get("root")!;
    expect(root.y + root.h / 2).toBeCloseTo(3, 6);
  });

  it("does not collapse a diagram that feeds back on itself", () => {
    // A review step pointing at an earlier stage is a cycle. Ranking has to
    // survive it, or the whole flow lands in one column.
    const layout = layoutGraph({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }],
      frame,
    });
    expect(layout.rankCount).toBeGreaterThan(1);
    // The closing edge is still returned, so the caller still draws it.
    expect(layout.edges).toHaveLength(3);
  });

  it("honours a pinned rank", () => {
    const layout = layoutGraph({
      nodes: [{ id: "a" }, { id: "b" }, { id: "aside", rank: 3 }],
      edges: [{ from: "a", to: "b" }],
      frame,
    });
    expect(layout.byId.get("aside")!.rank).toBe(3);
  });

  it("stacks ranks downward when the direction says so", () => {
    const layout = layoutGraph({ ...chain(4), frame, direction: "down" });
    const ordered = [...layout.nodes].sort((left, right) => left.rank - right.rank);
    const ys = ordered.map((node) => node.y);
    expect(ys).toEqual([...ys].sort((left, right) => left - right));
    expect(new Set(ordered.map((node) => node.x)).size).toBe(1);
  });

  it("orders a rank to reduce crossings rather than by declaration order", () => {
    // Declared so that the naive order crosses: top source points at the
    // second target, bottom source at the first.
    const layout = layoutGraph({
      nodes: [{ id: "s1" }, { id: "s2" }, { id: "t1" }, { id: "t2" }],
      edges: [{ from: "s1", to: "t2" }, { from: "s2", to: "t1" }],
      frame,
    });
    const s1 = layout.byId.get("s1")!;
    const s2 = layout.byId.get("s2")!;
    const t1 = layout.byId.get("t1")!;
    const t2 = layout.byId.get("t2")!;
    // Whatever order it picks, the edges must not cross: the source above
    // should connect to the target above.
    const sourceAboveIsS1 = s1.y < s2.y;
    const targetAboveIsT2 = t2.y < t1.y;
    expect(sourceAboveIsS1).toBe(targetAboveIsT2);
  });

  it("is deterministic across runs", () => {
    const spec = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }, { from: "c", to: "d" }],
      frame,
    };
    expect(layoutGraph(spec).nodes).toEqual(layoutGraph(spec).nodes);
  });
});

describe("a graph that will not fit", () => {
  it("refuses rather than placing nodes off the slide", () => {
    // Seven cards in one rank, in a frame with room for four. Overflowing here
    // would put shapes past the slide edge, which is the defect this replaces.
    expect(() => layoutGraph({
      nodes: [{ id: "hub" }, ...Array.from({ length: 7 }, (_, i) => ({ id: `h${i}`, h: 0.92 }))],
      edges: Array.from({ length: 7 }, (_, i) => ({ from: "hub", to: `h${i}` })),
      frame: { x: 0.66, y: 2.05, w: 12, h: 3.7 },
    })).toThrow(/needing 6\.44in across but was given 3\.70in/);
  });

  it("compresses the gap rather than overflowing when the nodes themselves fit", () => {
    const layout = layoutGraph({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
      frame: { x: 0, y: 0, w: 5.7, h: 4 },
      nodeWidth: 1.9,
      rankGap: 1.5,
    });
    const ordered = [...layout.nodes].sort((left, right) => left.rank - right.rank);
    expect(ordered.at(-1)!.x + ordered.at(-1)!.w).toBeLessThanOrEqual(5.7 + 1e-6);
  });
});
