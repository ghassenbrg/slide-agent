import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SLIDE_FORMATS, slideFormat, type SlideFormat } from "../../src/design/grid.js";
import { loadConfig } from "../../src/config/load-config.js";
import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import type { PresentationOutline, SlideAgentConfig } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
const baseConfigDir = path.join(root, "config");
let workspace: string;
let base: SlideAgentConfig;

/** A deck that exercises every built-in layout at once. */
const outline: PresentationOutline = {
  brief: {
    title: "Format coverage",
    audience: "Reviewers",
    objective: "Prove every layout fits every supported slide size",
    presentationType: "technical",
    tone: "precise",
    visualDirection: "editorial",
    slideCount: 13,
    language: "English",
    outputRequirements: ["editable PowerPoint"],
    keyTopics: ["formats"],
    sourcePrompt: "format matrix",
  },
  narrative: "Every layout, every format, inside the slide.",
  slides: [
    { id: "title", kind: "title", title: "Format coverage", subtitle: "Every built-in layout at every supported size", sectionLabel: "TEST" },
    { id: "section", kind: "section", title: "A section break with a reasonably long heading", subtitle: "Supporting line" },
    { id: "summary", kind: "executive-summary", title: "Three ideas carry the argument", body: "The lead paragraph.", bullets: ["First claim", "Second claim", "Third claim"] },
    { id: "textimage", kind: "text-image", title: "Text beside a generated visual", body: "Body copy.", bullets: ["One", "Two", "Three"], visual: { alt: "Abstract", position: "right" } },
    { id: "comparison", kind: "comparison", title: "Two options compared", comparison: [{ heading: "Option A", points: ["Cheap", "Slow"] }, { heading: "Option B", points: ["Costly", "Fast"], emphasis: true }] },
    { id: "timeline", kind: "timeline", title: "Milestones across the year", timeline: [{ label: "Q1", title: "Align", detail: "Confirm scope" }, { label: "Q2", title: "Build", detail: "Ship the pilot" }, { label: "Q3", title: "Scale", detail: "Roll out" }] },
    { id: "process", kind: "process", title: "The four-step process", body: "How the work flows.", process: [{ title: "Frame", detail: "Define" }, { title: "Build", detail: "Create" }, { title: "Check", detail: "Inspect" }] },
    { id: "architecture", kind: "architecture", title: "How the system fits together", architecture: { direction: "horizontal", nodes: [{ id: "in", label: "Inputs" }, { id: "core", label: "Core", emphasis: true }, { id: "out", label: "Outputs" }], edges: [{ from: "in", to: "core" }, { from: "core", to: "out" }] } },
    { id: "table", kind: "table", title: "The numbers in full", body: "Lookup table.", table: { headers: ["Metric", "Value"], rows: [["ARR", "$12M"], ["NRR", "112%"]] } },
    { id: "chart", kind: "chart", title: "Growth over four quarters", body: "The trend is the argument.", bullets: ["Up and to the right"], chart: { kind: "bar", labels: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Revenue", values: [10, 14, 19, 26] }] } },
    { id: "kpi", kind: "kpi", title: "Headline measures", kpis: [{ label: "Uptime", value: "99.9%", detail: "Rolling 90 days" }, { label: "Latency", value: "42ms", detail: "p95" }] },
    { id: "quote", kind: "quote", title: "A principle", quote: { text: "Prefer the smallest credible move that advances the objective.", attribution: "Decision principle" } },
    { id: "roadmap", kind: "roadmap", title: "Workstreams across phases", roadmap: [{ label: "Phase 1", items: ["Align", "Baseline"] }, { label: "Phase 2", items: ["Pilot", "Measure"] }] },
    { id: "closing", kind: "closing", title: "Approve the plan", subtitle: "And name the owner", bullets: ["Decide", "Assign", "Schedule"] },
  ],
};

async function configDirFor(format: SlideFormat): Promise<string> {
  const directory = path.join(workspace, `config-${format.replace(/[:]/g, "-")}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "dimensions.json"), JSON.stringify(slideFormat(format), null, 2), "utf8");
  await writeFile(path.join(directory, "colors.json"), JSON.stringify(base.colors, null, 2), "utf8");
  await writeFile(path.join(directory, "fonts.json"), JSON.stringify(base.fonts, null, 2), "utf8");
  await writeFile(path.join(directory, "generation.json"), JSON.stringify(base.generation, null, 2), "utf8");
  return directory;
}

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-formats-"));
  base = await loadConfig(baseConfigDir);
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

describe("slide formats", () => {
  it("exposes named presets", () => {
    expect(Object.keys(SLIDE_FORMATS)).toEqual(expect.arrayContaining(["16:9", "4:3", "9:16", "a4-landscape", "a4-portrait"]));
    expect(() => slideFormat("nope")).toThrow(/Unknown slide format/);
  });

  it.for(Object.keys(SLIDE_FORMATS) as SlideFormat[])("keeps every built-in layout inside a %s slide", async (format) => {
    const configDir = await configDirFor(format);
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline,
      output: path.join(workspace, `${format.replace(/[:]/g, "-")}.pptx`),
      configDir,
      validate: true,
      autoFix: true,
    });

    const issues = result.validation?.issues ?? [];
    const outOfBounds = issues.filter((issue) => issue.code === "object-outside-slide");
    expect(outOfBounds.map((issue) => `${issue.message}`), format).toEqual([]);
    expect(result.slideCount).toBe(outline.slides.length);
    expect(result.status, JSON.stringify(result.errors)).not.toBe("error");
  });

  it("scales type with the slide rather than keeping 16:9 sizes", async () => {
    const { resolveTokens } = await import("../../src/design/tokens.js");
    const wide = resolveTokens({ ...base, dimensions: slideFormat("16:9") });
    const portrait = resolveTokens({ ...base, dimensions: slideFormat("a4-portrait") });
    // The portrait page is physically larger on its short edge, so body type
    // grows with it instead of looking undersized.
    expect(portrait.type.body).toBeGreaterThan(wide.type.body);
  });

  it("gives narrow formats fewer columns so they stay usable", async () => {
    const { Grid } = await import("../../src/design/grid.js");
    const { resolveTokens } = await import("../../src/design/tokens.js");
    const tokens = resolveTokens(base);
    expect(new Grid(slideFormat("16:9"), tokens).columns).toBe(12);
    expect(new Grid(slideFormat("4:3"), tokens).columns).toBe(8);
    expect(new Grid(slideFormat("9:16"), tokens).columns).toBe(6);
  });
});
