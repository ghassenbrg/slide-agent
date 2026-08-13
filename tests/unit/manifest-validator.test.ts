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

  describe("issues that describe something that actually happened", () => {
    /** A slide the author composed, which is where the type scale is advice. */
    function authored(elements: ElementRecord[]): DeckManifest {
      return manifest([{ ...slide(elements), compositionMode: "model-authored" }]);
    }

    /** Small text in a box large enough to hold it: autofit has nothing to do. */
    function comfortable(overrides: Partial<ElementRecord> & { id: string }): ElementRecord {
      return element({ type: "text", role: "body", text: "ok", fontSize: 11, w: 6, h: 1.2, ...overrides });
    }

    it("does not claim autofit shrank text it never shrank", async () => {
      const config = await loadConfig(path.join(root, "config"));
      const issues = new ManifestValidator(config).validate(authored([comfortable({ id: "note" })]));
      // The old condition was `effectiveFontSize < minimum`, which is what
      // `font-below-scale` already reports — so every element merely set below
      // the fallback scale was reported twice, the second time by a sentence
      // saying autofit "shrinks it from 11pt to 11pt".
      expect(issues.some((item) => item.code === "autofit-below-scale")).toBe(false);
    });

    it("still reports autofit when it genuinely shrinks the text", async () => {
      const config = await loadConfig(path.join(root, "config"));
      const cramped = element({
        id: "cramped", type: "text", role: "body", fontSize: 28, w: 1.6, h: 0.4, fit: "shrink",
        text: "A sentence with rather more words in it than this box was ever going to hold at the size it asked for.",
      });
      const issues = new ManifestValidator(config).validate(authored([cramped]));
      const autofit = issues.find((item) => item.code === "autofit-below-scale");
      const overflow = issues.find((item) => item.code === "text-overflow");
      // One of the two must fire: either it shrank below the scale and still
      // fits, or it could not fit even shrunk. Silence would mean the guard had
      // turned the check off rather than corrected it.
      expect(autofit ?? overflow).toBeDefined();
      if (autofit) {
        const { declaredFontSize, effectiveFontSize } = autofit.details as { declaredFontSize: number; effectiveFontSize: number };
        expect(effectiveFontSize).toBeLessThan(declaredFontSize);
      }
    });

    it("leaves a decorative slide number and a code block at the size the author chose", async () => {
      const config = await loadConfig(path.join(root, "config"));
      const issues = new ManifestValidator(config).validate(authored([
        comfortable({ id: "chrome-num", role: "decorative", text: "07" }),
        comfortable({ id: "yaml", role: "code", text: "kind: Service" }),
      ]));
      // Both are small on purpose: a slide number that obeyed the body scale
      // would be the defect, and a code block's size is chosen so a line of
      // YAML fits without wrapping.
      expect(issues.some((item) => item.code === "font-below-scale")).toBe(false);
    });

    it("keeps the hard legibility floor for those roles", async () => {
      const config = await loadConfig(path.join(root, "config"));
      const issues = new ManifestValidator(config).validate(authored([
        comfortable({ id: "chrome-num", role: "decorative", fontSize: 5 }),
      ]));
      // Taste is exempt; physics is not.
      expect(issues.some((item) => item.code === "font-too-small")).toBe(true);
    });

    it("still advises on body text set below the scale", async () => {
      const config = await loadConfig(path.join(root, "config"));
      const issues = new ManifestValidator(config).validate(authored([comfortable({ id: "para" })]));
      expect(issues.some((item) => item.code === "font-below-scale")).toBe(true);
    });
  });
});
