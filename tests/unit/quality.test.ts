import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import { AccessibilityValidator } from "../../src/validation/accessibility.js";
import { scoreDeck } from "../../src/validation/quality.js";
import type { DeckManifest, ElementRecord, SlideAgentConfig, SlideManifest } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
let config: SlideAgentConfig;

beforeAll(async () => { config = await loadConfig(path.join(root, "config")); });

function element(overrides: Partial<ElementRecord> & { id: string }): ElementRecord {
  return {
    name: overrides.id,
    type: "text",
    role: "body",
    x: 1,
    y: 1,
    w: 4,
    h: 0.5,
    ...overrides,
  };
}

function slide(number: number, elements: ElementRecord[], overrides: Partial<SlideManifest> = {}): SlideManifest {
  return {
    number,
    id: `s${number}`,
    title: `Slide ${number}`,
    kind: "text-image",
    backgroundColor: "FFFFFF",
    elements,
    notes: [],
    ...overrides,
  };
}

function manifest(slides: SlideManifest[]): DeckManifest {
  return {
    schemaVersion: "1.0",
    presentationTitle: "Test",
    width: 13.333333,
    height: 7.5,
    createdAt: new Date().toISOString(),
    slides,
  };
}

describe("accessibility validation", () => {
  it("requires alt text on images and charts", () => {
    const issues = new AccessibilityValidator(config).validate(manifest([
      slide(1, [element({ id: "a", type: "image", role: "image", imagePath: "/tmp/a.png" })]),
    ]));
    expect(issues.map((entry) => entry.code)).toContain("missing-alt-text");
    expect(issues[0]!.severity).toBe("error");
  });

  it("exempts elements the author marked decorative", () => {
    const issues = new AccessibilityValidator(config).validate(manifest([
      slide(1, [
        element({ id: "a", type: "image", role: "decorative", imagePath: "/tmp/a.png" }),
        element({ id: "t", text: "Readable" }),
      ]),
    ]));
    expect(issues.map((entry) => entry.code)).not.toContain("missing-alt-text");
  });

  it("flags alt text that names the medium instead of the content", () => {
    const issues = new AccessibilityValidator(config).validate(manifest([
      slide(1, [element({ id: "a", type: "chart", role: "chart", altText: "Chart showing things" })]),
    ]));
    expect(issues.map((entry) => entry.code)).toContain("uninformative-alt-text");
  });

  it("accepts a multi-column layout announced column by column", () => {
    // Column-major order is correct for a two-column comparison; an earlier
    // version flagged every one of them.
    const issues = new AccessibilityValidator(config).validate(manifest([
      slide(1, [
        element({ id: "c1-head", text: "Option A", x: 1, y: 1, w: 4, h: 0.5 }),
        element({ id: "c1-point", text: "Cheap", x: 1, y: 2, w: 4, h: 0.5 }),
        element({ id: "c2-head", text: "Option B", x: 7, y: 1, w: 4, h: 0.5 }),
        element({ id: "c2-point", text: "Fast", x: 7, y: 2, w: 4, h: 0.5 }),
      ]),
    ]));
    expect(issues.map((entry) => entry.code)).not.toContain("reading-order");
  });

  it("flags a genuine inversion inside one column", () => {
    const issues = new AccessibilityValidator(config).validate(manifest([
      slide(1, [
        element({ id: "lower", text: "Announced first but sits lower", x: 1, y: 4, w: 4, h: 0.5 }),
        element({ id: "upper", text: "Sits above it", x: 1, y: 1, w: 4, h: 0.5 }),
      ]),
    ]));
    const reading = issues.find((entry) => entry.code === "reading-order");
    expect(reading).toBeDefined();
    expect(reading!.elementIds).toEqual(expect.arrayContaining(["lower", "upper"]));
  });

  it("flags a slide with no readable text", () => {
    const issues = new AccessibilityValidator(config).validate(manifest([
      slide(1, [element({ id: "a", type: "image", role: "image", altText: "A photograph of a bridge" })]),
    ]));
    expect(issues.map((entry) => entry.code)).toContain("image-only-slide");
  });

  it("only reports AAA shortfalls when asked for AAA", () => {
    const deck = manifest([
      slide(1, [element({ id: "t", text: "Mid contrast", textColor: "767676", fontSize: 16 })]),
    ]);
    expect(new AccessibilityValidator(config).validate(deck).map((entry) => entry.code)).not.toContain("contrast-below-aaa");
    expect(new AccessibilityValidator(config, { level: "AAA" }).validate(deck).map((entry) => entry.code)).toContain("contrast-below-aaa");
  });
});

describe("quality scoring", () => {
  it("scores a deck full of placeholders as weak however clean it looks", () => {
    const deck = manifest([1, 2, 3, 4].map((number) => slide(number, [
      element({ id: `t${number}`, text: "[Evidence: something you can show]", textColor: "000000", fontSize: 18 }),
      element({ id: `b${number}`, text: "[Implication: what it means]", textColor: "000000", fontSize: 14, y: 2 }),
    ])));
    const score = scoreDeck(deck, config, []);
    expect(score.band).toBe("weak");
    const evidence = score.dimensions.find((dimension) => dimension.id === "evidence")!;
    expect(evidence.advice).toContain("placeholders");
  });

  it("rewards a deck that varies its composition and shows artifacts", () => {
    const deck = manifest([
      slide(1, [element({ id: "a", text: "Claim", fontSize: 40, textColor: "111111" }), element({ id: "a2", text: "Support", fontSize: 18, textColor: "333333", y: 3 })], { kind: "title" }),
      slide(2, [
        element({ id: "b", text: "A different claim", fontSize: 32, textColor: "111111" }),
        element({ id: "b2", type: "chart", role: "chart", altText: "Revenue rising across four quarters", x: 1, y: 2, w: 8, h: 4 }),
        element({ id: "b3", text: "Detail", fontSize: 14, textColor: "444444", y: 6.5 }),
      ], { kind: "chart" }),
      slide(3, [
        element({ id: "c", text: "Third claim", fontSize: 32, textColor: "111111" }),
        element({ id: "c2", type: "table", role: "table", x: 1, y: 2, w: 10, h: 4 }),
        element({ id: "c3", text: "Note", fontSize: 14, textColor: "444444", y: 6.5 }),
      ], { kind: "table" }),
    ]);
    const score = scoreDeck(deck, config, []);
    expect(score.overall).toBeGreaterThan(60);
    const variety = score.dimensions.find((dimension) => dimension.id === "variety")!;
    expect(variety.score).toBeGreaterThan(50);
  });

  it("explains every dimension it scores", () => {
    const score = scoreDeck(manifest([slide(1, [element({ id: "a", text: "Hello", textColor: "000000" })])]), config, []);
    expect(score.dimensions).toHaveLength(6);
    for (const dimension of score.dimensions) {
      expect(dimension.summary, dimension.id).toBeTruthy();
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(100);
    }
  });

  it("lets accessibility errors pull the score down", () => {
    const deck = manifest([slide(1, [element({ id: "a", text: "Hello", textColor: "000000" })])]);
    const clean = scoreDeck(deck, config, []);
    const broken = scoreDeck(deck, config, [
      { code: "missing-alt-text", severity: "error", message: "no alt", fixable: false },
      { code: "poor-contrast", severity: "warning", message: "low", fixable: true },
    ]);
    expect(broken.overall).toBeLessThan(clean.overall);
  });
});
