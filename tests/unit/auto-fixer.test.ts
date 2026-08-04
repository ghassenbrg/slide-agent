import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import type { PresentationOutline, SlideAgentConfig, ValidationIssue, ValidationReport } from "../../src/types/index.js";
import { AutoFixer } from "../../src/validation/auto-fixer.js";
import { colorContrast } from "../../src/utils/color.js";

const configDir = path.resolve(import.meta.dirname, "../../config");

function outline(slides: PresentationOutline["slides"], creativeDirection?: PresentationOutline["creativeDirection"]): PresentationOutline {
  return {
    brief: {
      title: "Test",
      audience: "Leaders",
      objective: "Decide",
      presentationType: "report",
      tone: "concise",
      visualDirection: "editorial",
      slideCount: slides.length,
      language: "English",
      outputRequirements: [],
      keyTopics: [],
      sourcePrompt: "test",
    },
    narrative: "Test",
    ...(creativeDirection ? { creativeDirection } : {}),
    slides,
  };
}

function report(issues: ValidationIssue[]): ValidationReport {
  return {
    schemaVersion: "1.0",
    status: "fail",
    presentation: "test.pptx",
    checkedAt: new Date().toISOString(),
    slideCount: 2,
    summary: { errors: issues.filter((item) => item.severity === "error").length, warnings: 0, info: 0 },
    iterations: 1,
    issues,
  };
}

let config: SlideAgentConfig;

describe("AutoFixer", () => {
  it("normalizes invalid chart values and reduces reported density", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([
      { id: "a", kind: "title", title: "Same" },
      {
        id: "b",
        kind: "chart",
        title: "Same",
        body: Array(100).fill("word").join(" "),
        bullets: Array(9).fill("a very long bullet with many unnecessary words that should be shortened"),
        chart: { kind: "pie", labels: ["A", "B"], series: [{ name: "One", values: [1, Number.NaN] }, { name: "Two", values: [2, 3] }] },
      },
    ]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "invalid-chart-data", severity: "error", message: "bad", slide: 2, fixable: true },
      { code: "excessive-text-density", severity: "warning", message: "dense", slide: 2, fixable: true },
    ]));

    expect(fixed.outline.slides[1]!.title).not.toBe("Same");
    expect(fixed.outline.slides[1]!.bullets!.length).toBeLessThanOrEqual(config.generation.maximumBulletsPerSlide);
    expect(fixed.outline.slides[1]!.chart!.series).toHaveLength(1);
    expect(fixed.outline.slides[1]!.chart!.series[0]!.values[1]).toBe(0);
    expect(fixed.outcomes.map((outcome) => outcome.code)).toContain("invalid-chart-data");
  });

  it("leaves content alone when validation did not report a defect for it", async () => {
    config ??= await loadConfig(configDir);
    const bullets = Array(9).fill("a very long bullet with many unnecessary words");
    const input = outline([
      { id: "a", kind: "title", title: "Opening" },
      { id: "b", kind: "text-image", title: "Untouched", bullets: [...bullets] },
    ]);
    const fixed = new AutoFixer(config).fix(input, report([]));
    expect(fixed.outline.slides[1]!.bullets).toEqual(bullets);
    expect(fixed.outcomes).toHaveLength(0);
  });

  it("shrinks an overflowing canvas element until its text fits", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Dense",
      canvas: [{
        id: "lead",
        type: "text",
        x: 1,
        y: 1,
        w: 4,
        h: 1,
        role: "body",
        text: Array(40).fill("word").join(" "),
        style: { fontSize: 40 },
      }],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "text-overflow", severity: "error", message: "overflow", slide: 1, elementIds: ["001-lead"], fixable: true, details: { minimum: config.fonts.minimums.body } },
    ]));
    const element = fixed.outline.slides[0]!.canvas![0] as { style?: { fontSize?: number } };
    expect(element.style!.fontSize!).toBeLessThan(40);
    expect(fixed.unfixed).toHaveLength(0);
  });

  it("shortens a fallback-layout title that cannot be resized", async () => {
    config ??= await loadConfig(configDir);
    const longTitle = "This particular slide title is far too long to fit inside the fixed header box that the built-in layout provides";
    const input = outline([{ id: "s1", kind: "text-image", title: longTitle }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "text-overflow", severity: "error", message: "overflow", slide: 1, elementIds: ["001-slide-title"], fixable: true, details: { box: { w: 12.2, h: 0.72 }, minimum: config.fonts.minimums.slideTitle } },
    ]));
    expect(fixed.outline.slides[0]!.title.length).toBeLessThan(longTitle.length);
    expect(fixed.changes.join(" ")).toContain("Shortened the slide 1 title");
  });

  it("corrects canvas text contrast against the shape it sits on", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Contrast",
      background: "101014",
      canvas: [
        { id: "panel", type: "shape", shape: "rect", x: 0.5, y: 0.5, w: 6, h: 3, zIndex: 0, style: { fill: "F5F5F5" } },
        { id: "label", type: "text", x: 1, y: 1, w: 4, h: 0.6, zIndex: 1, role: "body", text: "Low contrast", style: { fontSize: 14, color: "EEEEEE" } },
      ],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "poor-contrast", severity: "warning", message: "low", slide: 1, elementIds: ["002-label"], fixable: true },
    ]));
    const label = fixed.outline.slides[0]!.canvas![1] as { style?: { color?: string } };
    expect(colorContrast(label.style!.color!, "F5F5F5")).toBeGreaterThanOrEqual(4.5);
  });

  it("reports an unfixable defect with an actionable reason instead of silently retrying", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Impossible",
      canvas: [{
        id: "tiny",
        type: "text",
        x: 1,
        y: 1,
        w: 0.4,
        h: 0.2,
        role: "body",
        text: Array(80).fill("word").join(" "),
        style: { fontSize: 18 },
      }],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "text-overflow", severity: "error", message: "overflow", slide: 1, elementIds: ["001-tiny"], fixable: true, details: { minimum: config.fonts.minimums.body } },
    ]));
    expect(fixed.outcomes).toHaveLength(0);
    expect(fixed.unfixed[0]!.reason).toMatch(/Enlarge the element or shorten the copy/);
  });
});
