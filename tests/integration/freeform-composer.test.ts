import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import { DeckBuilder } from "../../src/export/deck-builder.js";
import type { PresentationOutline } from "../../src/types/index.js";
import { ManifestValidator } from "../../src/validation/manifest-validator.js";

const configDir = path.resolve(import.meta.dirname, "../../config");

describe("model-authored freeform composition", () => {
  it("bypasses the layout registry and keeps the scene editable", async () => {
    const config = await loadConfig(configDir);
    const outline: PresentationOutline = {
      brief: {
        title: "Freeform scene",
        audience: "Design reviewers",
        objective: "Prove unrestricted composition",
        presentationType: "general",
        tone: "expressive",
        visualDirection: "electric papercut",
        slideCount: 1,
        language: "English",
        outputRequirements: ["editable PowerPoint"],
        keyTopics: [],
        sourcePrompt: "freeform",
      },
      narrative: "One visual proof.",
      creativeDirection: {
        concept: "Electric papercut",
        palette: { background: "101014", surface: "191922", ink: "F8F5E8", muted: "B9B4A8", accent: "FF4FD8", accentAlt: "B8FF32", accentSoft: "432044", rule: "44444E", positive: "55C982", negative: "FF615B", warning: "FFC857" },
        typography: { heading: "Georgia", body: "Helvetica Neue", mono: "Menlo" },
      },
      slides: [{
        id: "freeform",
        kind: "visual-essay",
        layout: "this-layout-does-not-exist",
        title: "The canvas is the layout",
        background: "101014",
        designIntent: "Use collision, scale contrast, and an oblique connector as the argument.",
        canvas: [
          { id: "accent-disc", type: "shape", shape: "ellipse", x: 9.6, y: 0.4, w: 2.7, h: 2.7, role: "decorative", intentionalOverlap: true, style: { fill: "FF4FD8", lineWidth: 0 } },
          { id: "deck-title", type: "text", x: 0.7, y: 1.0, w: 8.4, h: 1.5, role: "title", text: "The canvas is the layout", style: { fontFace: "Georgia", fontSize: 48, color: "F8F5E8", bold: true } },
          { id: "rule", type: "connector", x: 0.8, y: 4.8, w: 6.4, h: -1.1, role: "decorative", style: { color: "B8FF32", width: 3, arrow: false } },
          { id: "native-data", type: "chart", x: 7.5, y: 3.2, w: 4.8, h: 3.1, role: "chart", chart: { kind: "bar", labels: ["A", "B", "C"], series: [{ name: "Signal", values: [3, 7, 11] }] }, style: { colors: ["B8FF32"] } },
        ],
      }],
    };

    const built = await new DeckBuilder(config).build(outline);
    const slide = built.manifest.slides[0]!;
    expect(slide.compositionMode).toBe("model-authored");
    expect(slide.kind).toBe("visual-essay");
    expect(slide.elements.map((element) => element.type)).toEqual(["shape", "text", "connector", "chart"]);
    expect(slide.elements.find((element) => element.name === "deck-title")?.fontFace).toBe("Georgia");
    expect(new ManifestValidator(built.config).validate(built.manifest).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
