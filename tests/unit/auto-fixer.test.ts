import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import type { PresentationOutline, ValidationReport } from "../../src/types/index.js";
import { AutoFixer } from "../../src/validation/auto-fixer.js";

describe("AutoFixer", () => {
  it("shortens dense content and normalizes invalid chart values", async () => {
    const config = await loadConfig(path.resolve(import.meta.dirname, "../../config"));
    const outline: PresentationOutline = {
      brief: {
        title: "Test",
        audience: "Leaders",
        objective: "Decide",
        presentationType: "report",
        tone: "concise",
        visualDirection: "editorial",
        slideCount: 2,
        language: "English",
        outputRequirements: [],
        keyTopics: [],
        sourcePrompt: "test",
      },
      narrative: "Test",
      slides: [
        { id: "a", kind: "title", title: "Same" },
        { id: "b", kind: "chart", title: "Same", body: Array(100).fill("word").join(" "), bullets: Array(9).fill("a very long bullet with many unnecessary words that should be shortened"), chart: { kind: "pie", labels: ["A", "B"], series: [{ name: "One", values: [1, Number.NaN] }, { name: "Two", values: [2, 3] }] } },
      ],
    };
    const report: ValidationReport = { schemaVersion: "1.0", status: "fail", presentation: "test.pptx", checkedAt: new Date().toISOString(), slideCount: 2, summary: { errors: 1, warnings: 0, info: 0 }, iterations: 1, issues: [{ code: "invalid-chart-data", severity: "error", message: "bad", slide: 2, fixable: true }] };
    const fixed = new AutoFixer(config).fix(outline, report).outline;
    expect(fixed.slides[1]!.title).not.toBe("Same");
    expect(fixed.slides[1]!.bullets!.length).toBeLessThanOrEqual(config.generation.maximumBulletsPerSlide);
    expect(fixed.slides[1]!.chart!.series).toHaveLength(1);
    expect(fixed.slides[1]!.chart!.series[0]!.values[1]).toBe(0);
  });
});
