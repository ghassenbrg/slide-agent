import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import type { DeckManifest, ElementRecord, SlideManifest } from "../../src/types/index.js";
import { ManifestValidator } from "../../src/validation/manifest-validator.js";

const root = path.resolve(import.meta.dirname, "../..");

function element(overrides: Partial<ElementRecord> & { id: string }): ElementRecord {
  return {
    name: overrides.id,
    type: "shape",
    role: "shape",
    x: 1,
    y: 1,
    w: 4,
    h: 1,
    ...overrides,
  };
}

function slide(elements: ElementRecord[]): SlideManifest {
  return { number: 1, id: "s1", title: "Slide 1", kind: "text-image", backgroundColor: "FFFFFF", elements, notes: [] };
}

function manifest(slides: SlideManifest[]): DeckManifest {
  return { schemaVersion: "1.0", presentationTitle: "Test", width: 13.333333, height: 7.5, createdAt: new Date().toISOString(), slides };
}

describe("ManifestValidator", () => {
  it("detects intentional fixture problems", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "tests/fixtures/invalid-layout.pptx.manifest.json"), "utf8")) as DeckManifest;
    const issues = new ManifestValidator(await loadConfig(path.join(root, "config"))).validate(manifest);
    const codes = new Set(issues.map((item) => item.code));
    expect(codes).toContain("object-outside-slide");
    expect(codes).toContain("overlapping-elements");
    expect(codes).toContain("text-overflow");
    // Below the fallback type scale but above the hard legibility floor. On a
    // fallback-layout deck that is still a defect; on a model-authored canvas
    // it would be advice, because the scale is Slide Agent's opinion.
    expect(codes).toContain("font-below-scale");
    expect(codes).toContain("poor-contrast");
    expect(codes).toContain("missing-image");
    expect(codes).toContain("unsupported-font");
    expect(codes).toContain("misaligned-elements");
  });

  it("flags an accent bar whose square corner pokes past a rounded card", async () => {
    const config = await loadConfig(path.join(root, "config"));
    const card = element({ id: "card", shape: "roundRect", radius: 0.1, x: 1, y: 1, w: 3, h: 1.2 });
    // Flush against the card's own corner, full height, square corners: the classic overhang.
    const bar = element({ id: "bar", role: "decorative", x: 1, y: 1, w: 0.07, h: 1.2 });
    const issues = new ManifestValidator(config).validate(manifest([slide([card, bar])]));
    const overhang = issues.find((item) => item.code === "rounded-corner-overhang");
    expect(overhang).toBeDefined();
    expect(overhang?.elementIds).toEqual(["card", "bar"]);
  });

  it("flags the overhang on a card that never stated a radius", async () => {
    // The defect as reported: nothing in the deck mentions a radius, and the
    // card is rounded anyway because that is what PowerPoint draws.
    const config = await loadConfig(path.join(root, "config"));
    const card = element({ id: "card", shape: "roundRect", x: 1, y: 1, w: 3, h: 1.2 });
    const bar = element({ id: "bar", role: "decorative", x: 1, y: 1, w: 0.07, h: 1.2 });
    const issues = new ManifestValidator(config).validate(manifest([slide([card, bar])]));
    const overhang = issues.find((item) => item.code === "rounded-corner-overhang");
    expect(overhang).toBeDefined();
    expect(overhang?.details).toMatchObject({ radius: 0.2, radiusStated: false });
  });

  it("does not flag a bar inset by the card's own radius", async () => {
    const config = await loadConfig(path.join(root, "config"));
    const card = element({ id: "card", shape: "roundRect", radius: 0.1, x: 1, y: 1, w: 3, h: 1.2 });
    const bar = element({ id: "bar", role: "decorative", x: 1, y: 1.1, w: 0.07, h: 1.0 });
    const issues = new ManifestValidator(config).validate(manifest([slide([card, bar])]));
    expect(issues.some((item) => item.code === "rounded-corner-overhang")).toBe(false);
  });

  it("respects an author who declared the overlap deliberate", async () => {
    const config = await loadConfig(path.join(root, "config"));
    const card = element({ id: "card", shape: "roundRect", radius: 0.1, x: 1, y: 1, w: 3, h: 1.2 });
    const bar = element({ id: "bar", role: "decorative", x: 1, y: 1, w: 0.07, h: 1.2, intentionalOverlap: true });
    const issues = new ManifestValidator(config).validate(manifest([slide([card, bar])]));
    expect(issues.some((item) => item.code === "rounded-corner-overhang")).toBe(false);
  });
});
