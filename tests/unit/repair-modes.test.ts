import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import { defaultRepairMode, describeRepairs, detectRenderRegression, planRepairs } from "../../src/validation/repair.js";
import type { PresentationOutline, SlideAgentConfig, ValidationIssue, ValidationReport } from "../../src/types/index.js";

const configDir = path.resolve(import.meta.dirname, "../../config");
let config: SlideAgentConfig;

beforeAll(async () => { config = await loadConfig(configDir); });

function outline(canvas: boolean): PresentationOutline {
  return {
    brief: {
      title: "Repair modes",
      audience: "Reviewers",
      objective: "Verify repair behaviour",
      presentationType: "technical",
      tone: "precise",
      visualDirection: "plain",
      slideCount: 1,
      language: "English",
      outputRequirements: [],
      keyTopics: [],
      sourcePrompt: "test",
    },
    narrative: "Authored values are preserved.",
    creativeDirection: { palette: { background: "0B1020", ink: "F5F2E9" } },
    slides: [
      canvas
        ? {
          id: "one",
          kind: "statement",
          title: "One",
          background: "0B1020",
          canvas: [
            { id: "body", type: "text", x: 0.8, y: 2.4, w: 8, h: 1.4, role: "body", text: "The evidence is thin but it points one way.", style: { fontSize: 18, fontFace: "Georgia", color: "1B2430" } },
          ],
        }
        : { id: "one", kind: "statement", title: "One", body: "The evidence is thin but it points one way, and here is a great deal more copy than the box can hold at any legible size whatsoever." },
    ],
  };
}

function report(issues: ValidationIssue[]): ValidationReport {
  return {
    schemaVersion: "1.0",
    status: "warning",
    packageStatus: "pass",
    presentationReadiness: "review",
    readinessReasons: [],
    presentation: "test.pptx",
    checkedAt: new Date().toISOString(),
    slideCount: 1,
    summary: { errors: 0, warnings: issues.length, info: 0 },
    iterations: 1,
    issues,
  };
}

const CONTRAST: ValidationIssue = {
  code: "poor-contrast",
  severity: "warning",
  message: "body has insufficient text contrast.",
  slide: 1,
  elementIds: ["001-body"],
  fixable: true,
};

describe("repair modes", () => {
  it("defaults to suggest for a canvas and safe for a scaffolded draft", () => {
    expect(defaultRepairMode(outline(true))).toBe("suggest");
    expect(defaultRepairMode(outline(false))).toBe("safe");
  });

  it("changes nothing in suggest mode, and says exactly what it would change", () => {
    const authored = outline(true);
    const plan = planRepairs(authored, report([CONTRAST]), config, "suggest");

    expect(plan.applied).toBe(false);
    expect(plan.appliedRepairs).toHaveLength(0);
    expect(plan.outline.slides[0]).toEqual(authored.slides[0]);

    const suggestion = plan.suggestions.find((entry) => entry.property === "style.color");
    expect(suggestion).toBeDefined();
    expect(suggestion!.before).toBe("1B2430");
    expect(suggestion!.after).not.toBe("1B2430");
    // Replacing a value somebody set is different in kind from filling one in.
    expect(suggestion!.changesAuthorIntent).toBe(true);
    expect(describeRepairs(plan)[0]).toMatch(/Would change .*this replaces a value you set/);
  });

  it("applies the same repair in safe mode, with rollback data", () => {
    const plan = planRepairs(outline(true), report([CONTRAST]), config, "safe");
    expect(plan.applied).toBe(true);
    const applied = plan.appliedRepairs.find((entry) => entry.property === "style.color");
    expect(applied).toBeDefined();
    expect(applied!.rollback).toEqual({ property: "style.color", value: "1B2430" });
    expect(applied!.renderRegression).toBe("not-checked");
    expect(describeRepairs(plan)[0]).toMatch(/^Changed /);
  });

  it("does nothing at all in off mode", () => {
    const authored = outline(true);
    const plan = planRepairs(authored, report([CONTRAST]), config, "off");
    expect(plan.suggestions).toHaveLength(0);
    expect(plan.outline).toBe(authored);
  });

  it("still repairs a scaffolded slide under suggest, because nobody designed it", () => {
    const draft = outline(false);
    const overflow: ValidationIssue = {
      code: "text-overflow",
      severity: "error",
      message: "body does not fit",
      slide: 1,
      elementIds: ["002-body"],
      fixable: true,
      details: { box: { w: 4, h: 0.5 }, minimum: 18 },
    };
    const plan = planRepairs(draft, report([overflow]), config, "suggest");
    expect(plan.applied).toBe(true);
    expect(plan.outline.slides[0]!.body).not.toBe(draft.slides[0]!.body);
  });

  it("detects a repair that made the rendered text worse", () => {
    const clean = { status: "pass" as const, method: "pdf-text" as const, confidence: "high" as const, slides: [] };
    const worse = {
      status: "fail" as const,
      method: "pdf-text" as const,
      confidence: "high" as const,
      slides: [{ slide: 1, missing: ["the last word"], unexpected: [], truncated: [], repeated: [], splitWords: [] }],
    };
    expect(detectRenderRegression(clean, worse)).toBe(true);
    expect(detectRenderRegression(worse, clean)).toBe(false);
    expect(detectRenderRegression(clean, clean)).toBe(false);
    // Nothing to compare is not evidence of a regression.
    expect(detectRenderRegression(undefined, worse)).toBe(false);
  });
});
