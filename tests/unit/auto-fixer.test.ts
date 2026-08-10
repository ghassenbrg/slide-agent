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
    packageStatus: "fail",
    presentationReadiness: "not-ready",
    readinessReasons: [],
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

  it("raises a canvas element to the legibility minimum when it has room", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Small",
      canvas: [{ id: "note", type: "text", x: 1, y: 1, w: 6, h: 2, role: "body", text: "Short note", style: { fontSize: 8 } }],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "font-too-small", severity: "warning", message: "small", slide: 1, elementIds: ["001-note"], fixable: true, details: { minimum: config.fonts.minimums.body } },
    ]));
    const element = fixed.outline.slides[0]!.canvas![0] as { style?: { fontSize?: number } };
    expect(element.style!.fontSize).toBe(config.fonts.minimums.body);
  });

  it("refuses to raise a font size that would then overflow", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Small",
      canvas: [{ id: "note", type: "text", x: 1, y: 1, w: 1, h: 0.25, role: "body", text: Array(30).fill("word").join(" "), style: { fontSize: 6 } }],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "font-too-small", severity: "warning", message: "small", slide: 1, elementIds: ["001-note"], fixable: true, details: { minimum: config.fonts.minimums.body } },
    ]));
    expect(fixed.unfixed[0]!.reason).toMatch(/without overflowing/);
  });

  it("clamps canvas and custom-region geometry back inside the slide", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Escapes",
      custom: [{ id: "region", type: "text", x: 40, y: 40, w: 6, h: 2, text: "off-canvas" }],
      canvas: [{ id: "far", type: "shape", shape: "rect", x: 30, y: 20, w: 8, h: 4 }],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "object-outside-slide", severity: "error", message: "outside", slide: 1, elementIds: ["001-far"], fixable: true },
    ]));
    const element = fixed.outline.slides[0]!.canvas![0]!;
    const region = fixed.outline.slides[0]!.custom![0]!;
    if (element.type === "connector") throw new Error("expected the clamped element to be a shape");
    expect(element.x + element.w).toBeLessThanOrEqual(config.dimensions.width + 0.001);
    expect(element.y + element.h).toBeLessThanOrEqual(config.dimensions.height + 0.001);
    expect(region.x + region.w).toBeLessThanOrEqual(config.dimensions.width + 0.001);
    expect(fixed.changes.join(" ")).toContain("back inside the slide");
  });

  it("gives an empty slide visible content", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{ id: "s1", kind: "section", title: "Just a title", subtitle: "The subtitle" }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "empty-slide", severity: "error", message: "empty", slide: 1, fixable: true },
    ]));
    expect(fixed.outline.slides[0]!.body).toBe("The subtitle");
  });

  it("flags an empty-slide report as a layout defect when the outline does have content", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{ id: "s1", kind: "text-image", title: "Has content", bullets: ["one"] }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "empty-slide", severity: "error", message: "empty", slide: 1, fixable: true },
    ]));
    expect(fixed.unfixed[0]!.reason).toMatch(/layout defect/);
  });

  it("declares chart data unfixable when nothing can be inferred", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "chart",
      title: "Chart",
      chart: { kind: "bar", labels: ["A"], series: [{ name: "One", values: [1] }] },
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "invalid-chart-data", severity: "error", message: "bad", slide: 1, fixable: true },
    ]));
    expect(fixed.unfixed[0]!.reason).toMatch(/Supply labels and matching series values/);
  });

  it("declares model-authored density unfixable rather than truncating it", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Dense canvas",
      canvas: [{ id: "prose", type: "text", x: 1, y: 1, w: 10, h: 5, role: "body", text: Array(200).fill("word").join(" ") }],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "excessive-text-density", severity: "warning", message: "dense", slide: 1, fixable: true },
    ]));
    expect(fixed.unfixed[0]!.reason).toMatch(/Split the slide/);
  });

  it("reports an unimplemented repair rather than claiming success", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{ id: "s1", kind: "title", title: "Anything" }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "some-future-check", severity: "warning", message: "new", slide: 1, fixable: true },
    ]));
    expect(fixed.unfixed[0]!.reason).toMatch(/No automatic repair is implemented for some-future-check/);
  });

  it("ignores issues the validator did not mark fixable", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{ id: "s1", kind: "title", title: "Anything" }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "schema-violation", severity: "error", message: "bad xml", slide: 1, fixable: false },
    ]));
    expect(fixed.outcomes).toHaveLength(0);
    expect(fixed.unfixed).toHaveLength(0);
  });

  it("explains that built-in layout contrast comes from the supplied palette", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{ id: "s1", kind: "kpi", title: "Metrics", kpis: [{ label: "A", value: "1" }] }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "poor-contrast", severity: "warning", message: "low", slide: 1, elementIds: ["004-kpi-label-1"], fixable: true },
    ]));
    expect(fixed.unfixed[0]!.reason).toMatch(/creativeDirection\.palette/);
  });

  it("leaves a canvas color alone when its hue is already at maximum legibility", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "custom",
      title: "Already best",
      background: "808080",
      canvas: [{ id: "label", type: "text", x: 1, y: 1, w: 4, h: 0.6, role: "body", text: "Grey on grey", style: { fontSize: 14, color: "000000" } }],
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "poor-contrast", severity: "warning", message: "low", slide: 1, elementIds: ["001-label"], fixable: true },
    ]));
    expect(fixed.unfixed[0]!.reason).toMatch(/most legible variant/);
  });

  it("shortens fallback body copy and bullets when the title is not the culprit", async () => {
    config ??= await loadConfig(configDir);
    const input = outline([{
      id: "s1",
      kind: "text-image",
      title: "Short",
      body: Array(60).fill("word").join(" "),
    }]);
    const fixed = new AutoFixer(config).fix(input, report([
      { code: "text-overflow", severity: "error", message: "overflow", slide: 1, elementIds: ["002-body-copy"], fixable: true },
    ]));
    expect(fixed.changes.join(" ")).toContain("Shortened the body copy");

    const bulletsOnly = outline([{
      id: "s1",
      kind: "text-image",
      title: "Short",
      bullets: ["a bullet with far too many words in it to fit the available space"],
    }]);
    const fixedBullets = new AutoFixer(config).fix(bulletsOnly, report([
      { code: "text-overflow", severity: "error", message: "overflow", slide: 1, elementIds: ["003-body-bullet-1"], fixable: true },
    ]));
    expect(fixedBullets.changes.join(" ")).toContain("Shortened the bullets");
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
