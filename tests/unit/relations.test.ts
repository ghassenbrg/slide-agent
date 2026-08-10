import { describe, expect, it } from "vitest";

import { resolveSlideRelations } from "../../src/design/resolve-relations.js";
import type { CanvasElementSpec, SlideSpec } from "../../src/types/index.js";

function slide(canvas: CanvasElementSpec[]): SlideSpec {
  return { id: "s", kind: "custom", title: "T", canvas };
}

const title: CanvasElementSpec = { id: "title", type: "text", x: 0.72, y: 0.8, w: 8, h: 0.6, text: "Title" };

function frames(spec: SlideSpec): Record<string, { x: number; y: number; w: number; h: number }> {
  return Object.fromEntries((spec.canvas ?? []).map((element) => [
    element.id,
    { x: element.x!, y: element.y!, w: element.w!, h: element.h! },
  ]));
}

describe("relational placement", () => {
  it("aligns an edge to another element's edge", () => {
    const solved = frames(resolveSlideRelations(slide([
      title,
      { id: "caption", type: "text", x: 0, y: 5, w: 4, h: 0.4, text: "c", place: { x: { alignLeft: "title" } } },
    ])));
    expect(solved.caption!.x).toBe(0.72);
    // An axis with no relation keeps the literal it was given.
    expect(solved.caption!.y).toBe(5);
  });

  it("stacks one element below another with a gap", () => {
    const solved = frames(resolveSlideRelations(slide([
      title,
      { id: "body", type: "text", x: 0, y: 0, w: 4, h: 0.4, text: "b", place: { y: { below: "title", gap: 0.2 } } },
    ])));
    expect(solved.body!.y).toBeCloseTo(1.6, 6);
  });

  it("right-aligns by measuring the element's own width first", () => {
    const solved = frames(resolveSlideRelations(slide([
      title,
      { id: "badge", type: "shape", shape: "ellipse", x: 0, y: 0, w: 0.5, h: 0.5, place: { x: { alignRight: "title" } } },
    ])));
    expect(solved.badge!.x).toBeCloseTo(8.22, 6);
  });

  it("centres on another element's centre", () => {
    const solved = frames(resolveSlideRelations(slide([
      title,
      { id: "dot", type: "shape", shape: "ellipse", x: 0, y: 0, w: 0.4, h: 0.4, place: { y: { centerY: "title" } } },
    ])));
    expect(solved.dot!.y).toBeCloseTo(0.9, 6);
  });

  it("takes another element's size", () => {
    const solved = frames(resolveSlideRelations(slide([
      title,
      { id: "rule", type: "shape", shape: "rect", x: 0, y: 2, w: 0, h: 0.04, place: { w: { sameAs: "title" } } },
    ])));
    expect(solved.rule!.w).toBe(8);
  });

  it("spans from one element to another", () => {
    const solved = frames(resolveSlideRelations(slide([
      { id: "left", type: "shape", shape: "rect", x: 1, y: 1, w: 2, h: 1 },
      { id: "right", type: "shape", shape: "rect", x: 9, y: 1, w: 2, h: 1 },
      { id: "band", type: "shape", shape: "rect", x: 0, y: 3, w: 0, h: 0.3, place: { x: { spanFrom: "left" }, w: { spanFrom: "left", spanTo: "right" } } },
    ])));
    expect(solved.band!.x).toBe(1);
    expect(solved.band!.w).toBe(10);
  });

  it("solves relations against relations, in declaration order", () => {
    const solved = frames(resolveSlideRelations(slide([
      title,
      { id: "rule", type: "shape", shape: "rect", x: 0, y: 0, w: 0, h: 0.04, place: { x: { alignLeft: "title" }, y: { below: "title", gap: 0.2 }, w: { sameAs: "title" } } },
      { id: "caption", type: "text", x: 0, y: 0, w: 4, h: 0.4, text: "c", place: { y: { below: "rule", gap: 0.15 } } },
    ])));
    expect(solved.caption!.y).toBeCloseTo(1.79, 6);
  });

  it("writes solved inches and drops the relation", () => {
    const spec = resolveSlideRelations(slide([
      title,
      { id: "body", type: "text", x: 0, y: 0, w: 4, h: 0.4, text: "b", place: { y: { below: "title" } } },
    ]));
    // Nothing downstream — manifest, scene, patch — should ever see a relation.
    expect(JSON.stringify(spec)).not.toContain("place");
    expect(spec.canvas![1]!.y).toBeCloseTo(1.4, 6);
  });

  it("refuses a relation to an element that comes later", () => {
    // Forward references would let two elements depend on each other. A single
    // forward pass rules that out by construction rather than detecting it.
    expect(() => resolveSlideRelations(slide([
      { id: "body", type: "text", x: 0, y: 0, w: 4, h: 0.4, text: "b", place: { y: { below: "title" } } },
      title,
    ]))).toThrow(/not an element earlier on this slide/);
  });

  it("names the element and the unknown target when a relation cannot resolve", () => {
    expect(() => resolveSlideRelations(slide([
      { id: "body", type: "text", x: 0, y: 0, w: 4, h: 0.4, text: "b", place: { y: { below: "ghost" } } },
    ]))).toThrow(/element "body".*"ghost"/s);
  });

  it("leaves a canvas with no relations exactly as it was", () => {
    const plain = slide([title]);
    expect(resolveSlideRelations(plain)).toBe(plain);
  });

  it("resolves a group's children against their own siblings", () => {
    const solved = resolveSlideRelations(slide([
      {
        id: "legend", type: "group", x: 1, y: 5, w: 4, h: 0.6, children: [
          { id: "swatch", type: "shape", shape: "rect", x: 0, y: 0, w: 0.3, h: 0.3 },
          { id: "label", type: "text", x: 0, y: 0, w: 3, h: 0.3, text: "Midden", place: { x: { rightOf: "swatch", gap: 0.1 } } },
        ],
      },
    ]));
    const group = solved.canvas![0] as CanvasElementSpec & { children: CanvasElementSpec[] };
    expect(group.children[1]!.x).toBeCloseTo(0.4, 6);
  });
});
