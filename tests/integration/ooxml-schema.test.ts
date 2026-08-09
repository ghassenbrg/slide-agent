import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import type { PresentationOutline } from "../../src/types/index.js";
import { SchemaValidator } from "../../src/validation/schema-validator.js";

const root = path.resolve(import.meta.dirname, "../..");
let workspace: string;

// Exercises every native chart family plus continued rich-text runs — the
// constructs whose PptxGenJS serialization historically violated the
// ECMA-376 schema (misordered chart children, bar-only invertIfNegative,
// missing line grouping, duplicated paragraph properties).
const outline: PresentationOutline = {
  brief: {
    title: "Schema conformance deck",
    audience: "Validators",
    objective: "Prove every emitted construct is schema-valid",
    presentationType: "technical",
    tone: "precise",
    visualDirection: "diagnostic",
    slideCount: 5,
    language: "English",
    outputRequirements: ["editable PowerPoint"],
    keyTopics: ["conformance"],
    sourcePrompt: "schema conformance",
  },
  narrative: "Every part validates against the official schemas.",
  slides: [
    {
      id: "runs",
      kind: "custom",
      title: "Continued runs share one paragraph",
      canvas: [
        {
          id: "mixed", type: "text", x: 0.7, y: 1.2, w: 10, h: 2, role: "body",
          runs: [
            { text: "+18%", options: { bold: true, color: "8F2349", breakLine: false } },
            { text: " ARR growth", options: { color: "444444" } },
            { text: "Second paragraph", options: { breakLine: true } },
          ],
        },
      ],
    },
    { id: "bar", kind: "chart", title: "Bar", chart: { kind: "bar", labels: ["A", "B", "C"], series: [{ name: "S1", values: [1, 2, 3] }, { name: "S2", values: [3, 2, 1] }], showValues: true } },
    { id: "line", kind: "chart", title: "Line", chart: { kind: "line", labels: ["Q1", "Q2", "Q3"], series: [{ name: "N", values: [4, 5, 6] }, { name: "M", values: [6, 5, 4] }] } },
    { id: "area", kind: "chart", title: "Area", chart: { kind: "area", labels: ["X", "Y", "Z"], series: [{ name: "A", values: [2, 4, 8] }, { name: "B", values: [1, 2, 3] }] } },
    { id: "pie", kind: "chart", title: "Pie", chart: { kind: "pie", labels: ["One", "Two", "Three"], series: [{ name: "Share", values: [50, 30, 20] }] } },
    { id: "doughnut", kind: "chart", title: "Doughnut", chart: { kind: "doughnut", labels: ["One", "Two", "Three"], series: [{ name: "Share", values: [50, 30, 20] }] } },
    { id: "stacked", kind: "chart", title: "Stacked bar", chart: { kind: "bar-stacked", labels: ["A", "B", "C"], series: [{ name: "S1", values: [1, 2, 3] }, { name: "S2", values: [3, 2, 1] }] } },
    { id: "horizontal", kind: "chart", title: "Horizontal bar", chart: { kind: "bar-horizontal", labels: ["A", "B", "C"], series: [{ name: "S1", values: [1, 2, 3] }] } },
    { id: "scatter", kind: "chart", title: "Scatter", chart: { kind: "scatter", labels: ["1", "2", "3", "4"], series: [{ name: "Latency", values: [12, 18, 9, 22] }] } },
    { id: "radar", kind: "chart", title: "Radar", chart: { kind: "radar", labels: ["Cost", "Speed", "Risk", "Reach"], series: [{ name: "Now", values: [3, 4, 2, 5] }, { name: "Target", values: [4, 5, 4, 4] }] } },
    { id: "waterfall", kind: "chart", title: "Waterfall", chart: { kind: "waterfall", labels: ["Open", "Won", "Churn", "Net"], series: [{ name: "ARR", values: [100, 30, -10, 120] }] } },
  ],
};

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-schema-"));
});
afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("ECMA-376 schema conformance", () => {
  it("creates a deck whose every XML part validates against the official schemas", async () => {
    const output = path.join(workspace, "schema-conformance.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline,
      output,
      configDir: path.join(root, "config"),
      validate: true,
      autoFix: true,
    });
    expect(result.status).not.toBe("error");

    const issues = await new SchemaValidator().validate(output);
    expect(issues.filter((issue) => issue.code === "schema-validation-unavailable")).toHaveLength(0);
    expect(issues).toEqual([]);
  }, 120_000);
});
