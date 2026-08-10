import { describe, expect, it } from "vitest";

import {
  NEAR_DUPLICATE_THRESHOLD,
  compareSignatures,
  repeatedSilhouettes,
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

describe("repeated silhouettes within one deck", () => {
  function slideOf(number: number, elements: Array<{ x: number; y: number; w: number; h: number; id: string }>, kind = "custom") {
    return {
      number,
      id: `s${number}`,
      title: `Slide ${number}`,
      kind,
      backgroundColor: "FFFFFF",
      notes: [],
      elements: elements.map((element) => ({
        ...element,
        name: element.id,
        type: "shape" as const,
        role: "shape",
        fillColor: "203040",
      })),
    };
  }

  function deckOf(slides: ReturnType<typeof slideOf>[]) {
    return {
      schemaVersion: "1.0" as const,
      presentationTitle: "Deck",
      width: 13.333333,
      height: 7.5,
      createdAt: new Date().toISOString(),
      slides,
    };
  }

  const hub = [
    { id: "a", x: 5.5, y: 3, w: 2.4, h: 1.4 },
    { id: "b", x: 1, y: 1, w: 2, h: 0.8 },
    { id: "c", x: 10, y: 1, w: 2, h: 0.8 },
    { id: "d", x: 1, y: 5.5, w: 2, h: 0.8 },
    { id: "e", x: 10, y: 5.5, w: 2, h: 0.8 },
  ];

  it("names the two slides that came out as the same drawing", () => {
    const pairs = repeatedSilhouettes(deckOf([
      slideOf(1, [{ id: "band", x: 0.7, y: 0.7, w: 11.9, h: 2 }]),
      slideOf(2, hub),
      slideOf(3, [{ id: "one", x: 0.7, y: 4, w: 5, h: 2 }]),
      slideOf(4, hub.map((element) => ({ ...element, id: `${element.id}2` }))),
    ]));
    expect(pairs.some((pair) => pair.left === 2 && pair.right === 4)).toBe(true);
  });

  it("leaves a deck of genuinely different compositions alone", () => {
    const pairs = repeatedSilhouettes(deckOf([
      slideOf(1, [{ id: "full", x: 0, y: 0, w: 13.3, h: 7.5 }]),
      slideOf(2, [{ id: "left", x: 0.7, y: 0.7, w: 5, h: 6 }]),
      slideOf(3, [{ id: "strip", x: 0.7, y: 6, w: 11.9, h: 0.8 }]),
    ]));
    expect(pairs).toEqual([]);
  });

  it("holds slides of the same declared kind to a stricter threshold", () => {
    // Two section dividers are meant to rhyme; that is rhythm, not repetition.
    const dividers = deckOf([
      slideOf(1, [{ id: "a", x: 0.7, y: 3, w: 6, h: 1 }], "section"),
      slideOf(2, [{ id: "b", x: 0.72, y: 3.02, w: 6, h: 1 }], "section"),
      slideOf(3, [{ id: "c", x: 0.7, y: 0.7, w: 11.9, h: 5 }]),
    ]);
    const mixed = deckOf([
      slideOf(1, [{ id: "a", x: 0.7, y: 3, w: 6, h: 1 }], "custom"),
      slideOf(2, [{ id: "b", x: 0.72, y: 3.02, w: 6, h: 1 }], "text-image"),
      slideOf(3, [{ id: "c", x: 0.7, y: 0.7, w: 11.9, h: 5 }]),
    ]);
    expect(repeatedSilhouettes(mixed).length).toBeGreaterThanOrEqual(
      repeatedSilhouettes(dividers).length,
    );
  });
});
