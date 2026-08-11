import { describe, expect, it } from "vitest";
import { cornerOverhang, effectiveCornerRadius, isRectangular } from "../../src/validation/geometry.js";
import type { ElementRecord } from "../../src/types/index.js";

function element(overrides: Partial<ElementRecord> & { id: string }): ElementRecord {
  return { name: overrides.id, type: "shape", role: "shape", x: 0, y: 0, w: 1, h: 1, ...overrides };
}

/** A 3 × 1.2in card. Stated radius where the test needs a known one. */
function card(overrides: Partial<ElementRecord> = {}): ElementRecord {
  return element({ id: "card", shape: "roundRect", x: 1, y: 1, w: 3, h: 1.2, ...overrides });
}

describe("effectiveCornerRadius", () => {
  it("uses the OOXML preset default when the author stated no radius", () => {
    // An empty avLst is not a square corner: PowerPoint rounds by 16.667% of
    // the shorter side, which is 0.2in on a 1.2in-tall card.
    expect(effectiveCornerRadius(card())).toBeCloseTo(0.2, 4);
  });

  it("prefers a stated radius", () => {
    expect(effectiveCornerRadius(card({ radius: 0.1 }))).toBeCloseTo(0.1, 6);
  });

  it("pins an over-large radius to half the shorter side, as OOXML does", () => {
    expect(effectiveCornerRadius(card({ radius: 5 }))).toBeCloseTo(0.6, 6);
  });

  it("is zero for anything that is not a rounded rectangle", () => {
    expect(effectiveCornerRadius(element({ id: "plain" }))).toBe(0);
    expect(effectiveCornerRadius(element({ id: "dot", shape: "ellipse", radius: 0.2 }))).toBe(0);
  });
});

describe("isRectangular", () => {
  it("treats a default shape, a rect, and a roundRect as filling their box", () => {
    expect(isRectangular(element({ id: "default" }))).toBe(true);
    expect(isRectangular(element({ id: "rect", shape: "rect" }))).toBe(true);
    expect(isRectangular(element({ id: "round", shape: "roundRect" }))).toBe(true);
  });

  it("rejects shapes whose silhouette leaves their corners empty", () => {
    expect(isRectangular(element({ id: "dot", shape: "ellipse" }))).toBe(false);
    expect(isRectangular(element({ id: "arrow", shape: "chevron" }))).toBe(false);
  });

  it("accepts a plain picture but not a masked one", () => {
    expect(isRectangular(element({ id: "photo", type: "image" }))).toBe(true);
    expect(isRectangular(element({ id: "avatar", type: "image", maskShape: "ellipse" }))).toBe(false);
  });
});

describe("cornerOverhang", () => {
  it("flags a bar flush against a card whose radius was never stated", () => {
    // The defect as originally reported: no explicit radius anywhere.
    const bar = element({ id: "bar", x: 1, y: 1, w: 0.07, h: 1.2 });
    expect(cornerOverhang(card(), bar)).toBe(true);
  });

  it("flags a bar flush against a card with a stated radius", () => {
    const bar = element({ id: "bar", x: 1, y: 1, w: 0.07, h: 1.2 });
    expect(cornerOverhang(card({ radius: 0.1 }), bar)).toBe(true);
  });

  it("flags a full-width bar along the top edge", () => {
    const bar = element({ id: "bar", x: 1, y: 1, w: 3, h: 0.06 });
    expect(cornerOverhang(card({ radius: 0.1 }), bar)).toBe(true);
  });

  it("flags an inset that falls short of the radius", () => {
    const bar = element({ id: "bar", x: 1, y: 1.05, w: 0.07, h: 1.1 });
    expect(cornerOverhang(card({ radius: 0.1 }), bar)).toBe(true);
  });

  it("clears a bar inset by the full radius", () => {
    const bar = element({ id: "bar", x: 1, y: 1.1, w: 0.07, h: 1.0 });
    expect(cornerOverhang(card({ radius: 0.1 }), bar)).toBe(false);
  });

  it("clears a bar that reaches no corner at all", () => {
    const bar = element({ id: "bar", x: 2, y: 1.5, w: 0.5, h: 0.2 });
    expect(cornerOverhang(card({ radius: 0.1 }), bar)).toBe(false);
  });

  it("clears a bar rounded to match the card", () => {
    const bar = element({ id: "bar", shape: "roundRect", radius: 0.1, x: 1, y: 1, w: 0.4, h: 1.2 });
    expect(cornerOverhang(card({ radius: 0.1 }), bar)).toBe(false);
  });

  it("flags a bar too narrow to carry the radius it asked for", () => {
    // OOXML pins the radius to half the shorter side, so a 0.07in bar rounds
    // by 0.035in however much its author asked for — and still pokes out.
    const bar = element({ id: "bar", shape: "roundRect", radius: 0.1, x: 1, y: 1, w: 0.07, h: 1.2 });
    expect(cornerOverhang(card({ radius: 0.1 }), bar)).toBe(true);
  });

  it("clears a round badge, whose bounding box corner is never drawn", () => {
    const badge = element({ id: "badge", shape: "ellipse", x: 1, y: 1, w: 0.4, h: 0.4 });
    expect(cornerOverhang(card({ radius: 0.1 }), badge)).toBe(false);
  });

  it("clears a neighbour that only touches the card from outside", () => {
    const neighbour = element({ id: "above", x: 1, y: 0.4, w: 3, h: 0.6 });
    expect(cornerOverhang(card({ radius: 0.1 }), neighbour)).toBe(false);
  });

  it("is a no-op when the card is not rounded", () => {
    const bar = element({ id: "bar", x: 1, y: 1, w: 0.07, h: 1.2 });
    expect(cornerOverhang(element({ id: "square", x: 1, y: 1, w: 3, h: 1.2 }), bar)).toBe(false);
  });

  it("flags a picture docked into a rounded card's corner", () => {
    const photo = element({ id: "photo", type: "image", x: 1, y: 1, w: 1.2, h: 1.2 });
    expect(cornerOverhang(card({ radius: 0.1 }), photo)).toBe(true);
  });

  it("clears a picture masked into a circle", () => {
    const avatar = element({ id: "avatar", type: "image", maskShape: "ellipse", x: 1, y: 1, w: 1.2, h: 1.2 });
    expect(cornerOverhang(card({ radius: 0.1 }), avatar)).toBe(false);
  });
});
