import { describe, expect, it } from "vitest";

import { HEURISTIC_FLOORS, computeVerdict, isPackageIssue } from "../../src/validation/readiness.js";
import type { QualityScore, ValidationIssue, VisualReviewFinding } from "../../src/types/index.js";

function issue(code: string, severity: ValidationIssue["severity"] = "error"): ValidationIssue {
  return { code, severity, message: code, fixable: false };
}

const cleanRender = { status: "pass" as const, previewFiles: ["slide-1.png"], mode: "render" as const };

const strongHeuristics: QualityScore = {
  overall: 82,
  band: "strong",
  dimensions: [
    { id: "hierarchy", score: 80, summary: "" },
    { id: "contrast", score: 90, summary: "" },
    { id: "density", score: 75, summary: "" },
    { id: "variety", score: 70, summary: "" },
    { id: "evidence", score: 65, summary: "" },
    { id: "accessibility", score: 95, summary: "" },
  ],
};

describe("the split verdict", () => {
  it("separates a broken file from an unfinished deck", () => {
    const broken = computeVerdict({ issues: [issue("broken-relationship-target")], render: cleanRender });
    expect(broken.packageStatus).toBe("fail");
    expect(broken.presentationReadiness).toBe("not-ready");

    const unfinished = computeVerdict({ issues: [issue("text-overflow")], render: cleanRender });
    // The file is fine. The deck is not.
    expect(unfinished.packageStatus).toBe("pass");
    expect(unfinished.presentationReadiness).toBe("not-ready");
  });

  it("knows which codes are about the package and which are about the deck", () => {
    expect(isPackageIssue(issue("corrupt-pptx"))).toBe(true);
    expect(isPackageIssue(issue("missing-image"))).toBe(true);
    expect(isPackageIssue(issue("poor-contrast"))).toBe(false);
    expect(isPackageIssue(issue("render-text-missing"))).toBe(false);
  });

  it("reports ready only when there is real evidence of the render", () => {
    const rendered = computeVerdict({ issues: [], heuristics: strongHeuristics, render: cleanRender });
    expect(rendered.presentationReadiness).toBe("ready");

    const schematic = computeVerdict({
      issues: [],
      heuristics: strongHeuristics,
      render: { status: "pass", previewFiles: ["slide-1.svg"], mode: "schematic" },
    });
    expect(schematic.presentationReadiness).toBe("review");
    expect(schematic.readinessReasons.join(" ")).toMatch(/schematic/);

    const unrendered = computeVerdict({ issues: [], heuristics: strongHeuristics });
    expect(unrendered.presentationReadiness).toBe("review");
  });

  it("blocks readiness when text did not survive the render", () => {
    const verdict = computeVerdict({
      issues: [],
      heuristics: strongHeuristics,
      render: cleanRender,
      fidelity: {
        status: "fail",
        method: "pdf-text",
        confidence: "high",
        slides: [{ slide: 1, missing: ["the last word"], unexpected: [], truncated: [], repeated: [], splitWords: [] }],
      },
    });
    expect(verdict.presentationReadiness).toBe("not-ready");
    expect(verdict.readinessReasons.join(" ")).toMatch(/1 missing string/);
  });

  it("turns OCR uncertainty into review rather than a verdict either way", () => {
    const verdict = computeVerdict({
      issues: [],
      heuristics: strongHeuristics,
      render: cleanRender,
      fidelity: { status: "review", method: "ocr", confidence: "medium", slides: [] },
    });
    expect(verdict.presentationReadiness).toBe("review");
    expect(verdict.readinessReasons.join(" ")).toMatch(/could not be verified with confidence/);
  });

  it("lets one critical dimension block readiness however good the average is", () => {
    const verdict = computeVerdict({
      issues: [],
      render: cleanRender,
      heuristics: {
        ...strongHeuristics,
        overall: 88,
        dimensions: strongHeuristics.dimensions.map((dimension) =>
          dimension.id === "contrast" ? { ...dimension, score: HEURISTIC_FLOORS.contrast! - 5 } : dimension,
        ),
      },
    });
    expect(verdict.presentationReadiness).toBe("review");
    expect(verdict.readinessReasons.join(" ")).toMatch(/Heuristic floor: contrast/);
  });

  it("fails the package when the round-trip rebuild does not reproduce the deck", () => {
    const verdict = computeVerdict({
      issues: [],
      render: cleanRender,
      roundTrip: { status: "fail", reason: "3 property difference(s)" },
    });
    expect(verdict.packageStatus).toBe("fail");
    expect(verdict.readinessReasons.join(" ")).toMatch(/does not rebuild/);
  });

  it("blocks on an unresolved blocking finding and reviews on a major one", () => {
    const finding = (severity: VisualReviewFinding["severity"]): VisualReviewFinding => ({
      id: "f1",
      reviewer: "panel",
      severity,
      slide: 2,
      observation: "The title collides with the plate",
      rationale: "The claim is unreadable",
      suggestedTarget: "Move the title into the band",
    });
    expect(computeVerdict({ issues: [], render: cleanRender, visualFindings: [finding("blocking")] }).presentationReadiness).toBe("not-ready");
    expect(computeVerdict({ issues: [], render: cleanRender, heuristics: strongHeuristics, visualFindings: [finding("major")] }).presentationReadiness).toBe("review");
    // A waived finding is a decision somebody recorded, not an open defect.
    expect(computeVerdict({
      issues: [],
      render: cleanRender,
      heuristics: strongHeuristics,
      visualFindings: [{ ...finding("blocking"), waived: { by: "art director", reason: "deliberate", at: "2026-04-01" } }],
    }).presentationReadiness).toBe("ready");
  });

  it("holds a deck at review while a claim is still unverified", () => {
    const verdict = computeVerdict({
      issues: [],
      heuristics: strongHeuristics,
      render: cleanRender,
      unresolvedClaims: ["c-oneoff"],
    });
    expect(verdict.presentationReadiness).toBe("review");
    expect(verdict.readinessReasons.join(" ")).toMatch(/c-oneoff/);
  });

  it("refuses to call a deck full of placeholders ready", () => {
    const verdict = computeVerdict({ issues: [], heuristics: strongHeuristics, render: cleanRender, placeholderSlides: 3 });
    expect(verdict.presentationReadiness).toBe("not-ready");
  });
});
