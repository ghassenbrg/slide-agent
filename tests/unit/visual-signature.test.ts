import { describe, expect, it } from "vitest";

import {
  NEAR_DUPLICATE_THRESHOLD,
  compareSignatures,
  signDeck,
  unionArea,
} from "../../src/evaluation/visual-signature.js";
import type { DeckManifest, ElementRecord } from "../../src/types/index.js";

function element(overrides: Partial<ElementRecord> & Pick<ElementRecord, "id" | "x" | "y" | "w" | "h">): ElementRecord {
  return {
    name: overrides.id,
    type: "text",
    role: "body",
    ...overrides,
  } as ElementRecord;
}

function deck(title: string, slides: Array<ElementRecord[]>): DeckManifest {
  return {
    schemaVersion: "1.0",
    presentationTitle: title,
    width: 13.333,
    height: 7.5,
    createdAt: "2026-01-01T00:00:00.000Z",
    slides: slides.map((elements, index) => ({
      number: index + 1,
      id: `s${index + 1}`,
      title: `Slide ${index + 1}`,
      kind: "custom",
      compositionMode: "model-authored" as const,
      elements,
      notes: [],
    })),
  };
}

/** The same geometry, twelve times: one template wearing twelve hats. */
const templated = deck("Templated", Array.from({ length: 6 }, () => [
  element({ id: "title", x: 0.8, y: 0.6, w: 11.7, h: 1.0, role: "title" }),
  element({ id: "body", x: 0.8, y: 2.0, w: 5.6, h: 4.4 }),
  element({ id: "aside", x: 6.9, y: 2.0, w: 5.6, h: 4.4 }),
]));

/** The same geometry again, with every fill changed. */
const restyled = deck("Restyled", Array.from({ length: 6 }, () => [
  element({ id: "title", x: 0.8, y: 0.6, w: 11.7, h: 1.0, role: "title", fillColor: "C2452D" }),
  element({ id: "body", x: 0.8, y: 2.0, w: 5.6, h: 4.4, fillColor: "0BA7A5" }),
  element({ id: "aside", x: 6.9, y: 2.0, w: 5.6, h: 4.4, fillColor: "F2A03D" }),
]));

/** Genuinely different composition: full-bleed masses, off-centre, varying. */
const composed = deck("Composed", [
  [element({ id: "plate", x: 0, y: 0, w: 13.333, h: 6.1, type: "image", role: "plate" }), element({ id: "band", x: 0, y: 6.1, w: 13.333, h: 1.4, type: "shape" })],
  [element({ id: "numeral", x: 0.6, y: 0.6, w: 6.0, h: 3.9, role: "statistic" }), element({ id: "line", x: 0.6, y: 5.0, w: 8.4, h: 1.5 })],
  [element({ id: "rail", x: 0.5, y: 0.8, w: 0.7, h: 0.4 }), element({ id: "row-1", x: 1.4, y: 1.8, w: 11.0, h: 0.9 }), element({ id: "row-2", x: 1.4, y: 3.0, w: 11.0, h: 0.9 }), element({ id: "row-3", x: 1.4, y: 4.2, w: 11.0, h: 0.9 })],
  [element({ id: "chart", x: 0.8, y: 1.4, w: 11.8, h: 3.7, type: "chart" })],
  [element({ id: "left", x: 0, y: 0, w: 6.5, h: 7.5, type: "image", role: "plate" }), element({ id: "right", x: 7.1, y: 1.3, w: 5.5, h: 3.0 })],
  [element({ id: "closing", x: 0.9, y: 4.1, w: 7.4, h: 1.4, role: "title" })],
]);

describe("rectangle union", () => {
  it("counts an overlap once", () => {
    // Two 2×2 squares overlapping by 1×1: 4 + 4 − 1 = 7, not 8.
    expect(unionArea([{ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 }])).toBeCloseTo(7, 6);
  });

  it("counts a caption over a full-bleed image as the image alone", () => {
    expect(unionArea([{ x: 0, y: 0, w: 10, h: 6 }, { x: 1, y: 4, w: 4, h: 1 }])).toBeCloseTo(60, 6);
  });
});

describe("geometry signature", () => {
  it("classifies a palette-only restyle as the same deck", () => {
    const result = compareSignatures(signDeck(templated), signDeck(restyled));
    expect(result.similarity).toBeGreaterThanOrEqual(NEAR_DUPLICATE_THRESHOLD);
    expect(result.verdict).toBe("near-duplicate");
    expect(result.explanation).toMatch(/is not composition/);
  });

  it("tells a genuinely different composition apart from a template", () => {
    const result = compareSignatures(signDeck(templated), signDeck(composed));
    expect(result.similarity).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
    expect(result.verdict).not.toBe("near-duplicate");
  });

  it("reports no silhouette variety and no rhythm for a repeated template", () => {
    const signature = signDeck(templated);
    expect(signature.silhouetteVariety).toBeCloseTo(1 / 6, 5);
    expect(signature.rhythm).toBe(0);
  });

  it("reports variety and rhythm for a deck that changes shape", () => {
    const signature = signDeck(composed);
    expect(signature.silhouetteVariety).toBe(1);
    expect(signature.rhythm).toBeGreaterThan(0.1);
  });

  it("matches slides by shape rather than by position, so reordering does not disguise a deck", () => {
    const reordered = deck("Reordered", [...composed.slides].reverse().map((slide) => slide.elements));
    const result = compareSignatures(signDeck(composed), signDeck(reordered));
    expect(result.verdict).toBe("near-duplicate");
  });
});
