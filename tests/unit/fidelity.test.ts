import { describe, expect, it } from "vitest";

import { compareRenderedText, intendedText, normalizeForComparison } from "../../src/validation/fidelity.js";
import type { ExtractedText } from "../../src/rendering/text-extraction.js";
import type { DeckManifest, ElementRecord } from "../../src/types/index.js";

/**
 * The check that reads the words back off the render.
 *
 * Its hard part is not finding mismatches — it is *not* reporting the ones that
 * are artefacts of how the text was extracted. A checker that cries wolf on
 * every large heading gets ignored, and then the one real clipped title goes
 * out with it.
 */

function text(id: string, value: string): ElementRecord {
  return { id, name: id, type: "text", role: "body", x: 1, y: 1, w: 6, h: 1, text: value };
}

function manifest(elements: ElementRecord[]): DeckManifest {
  return {
    schemaVersion: "1.0",
    presentationTitle: "Fidelity",
    width: 13.333,
    height: 7.5,
    createdAt: "2026-01-01T00:00:00.000Z",
    slides: [{ number: 1, id: "one", title: "One", kind: "custom", elements, notes: [] }],
  };
}

function extracted(lines: string[], method: ExtractedText["method"] = "pdf-text"): ExtractedText {
  return {
    method,
    confidence: method === "pdf-text" ? "high" : "medium",
    pages: [{ page: 1, lines }],
  };
}

describe("render text fidelity", () => {
  it("normalizes the differences that are not differences", () => {
    expect(normalizeForComparison("The board’s  “view” — 2026")).toBe("the board's \"view\" - 2026");
  });

  it("reads the intended strings off the manifest in order", () => {
    expect(intendedText(manifest([text("a", "First"), text("b", "  Second  ")]), 1)).toEqual(["First", "Second"]);
    expect(intendedText(manifest([]), 2)).toEqual([]);
  });

  it("passes when every authored string survives", () => {
    const result = compareRenderedText(
      manifest([text("a", "The tide tables changed in March")]),
      extracted(["The tide tables changed in March"]),
    );
    expect(result.report.status).toBe("pass");
    expect(result.issues).toEqual([]);
  });

  it("accepts a wrap: the same string across two lines is not a defect", () => {
    const result = compareRenderedText(
      manifest([text("a", "Every reading in this deck uses the revised datum.")]),
      extracted(["Every reading in this deck", "uses the revised datum."]),
    );
    expect(result.report.status).toBe("pass");
  });

  it("accepts interleaved columns, which is how side-by-side boxes extract", () => {
    const result = compareRenderedText(
      manifest([text("left", "Sustained capacity is ninety-six thousand"), text("right", "Break-even is one hundred eighteen thousand")]),
      extracted([
        "Sustained capacity is        Break-even is one",
        "ninety-six thousand          hundred eighteen thousand",
      ]),
    );
    expect(result.report.status).toBe("pass");
  });

  it("ignores the spacing a PDF extractor invents inside large display type", () => {
    // Real output from `pdftotext -layout` on a 54pt title.
    const result = compareRenderedText(
      manifest([text("title", "Reading the harbour wall")]),
      extracted(["Re a ding the", "ha rbour wa ll"]),
    );
    expect(result.report.slides[0]!.splitWords).toEqual([]);
    expect(result.report.status).toBe("pass");
  });

  it("reports a word the render genuinely broke across a line", () => {
    const result = compareRenderedText(
      manifest([text("note", "Site archive, contexts 101-128")]),
      extracted(["Site archive, contexts 101", "-128"]),
    );
    expect(result.report.slides[0]!.splitWords.length).toBeGreaterThan(0);
    expect(result.report.status).toBe("review");
    expect(result.issues.some((issue) => issue.code === "render-word-split")).toBe(true);
  });

  it("fails when an authored string does not reach the render at all", () => {
    const result = compareRenderedText(
      manifest([text("a", "Align on a low-risk migration architecture"), text("b", "Present")]),
      extracted(["Present"]),
    );
    expect(result.report.status).toBe("fail");
    expect(result.report.slides[0]!.missing).toEqual(["Align on a low-risk migration architecture"]);
    const issue = result.issues.find((entry) => entry.code === "render-text-missing");
    // A defect in the deck, not in the package: it blocks readiness, not the file.
    expect(issue?.severity).toBe("warning");
  });

  it("recognises clipping by the suffix that went missing", () => {
    const result = compareRenderedText(
      manifest([text("a", "The decision or action you are asking for today")]),
      extracted(["The decision or action you are"]),
    );
    expect(result.report.slides[0]!.truncated).toHaveLength(1);
    expect(result.report.slides[0]!.truncated[0]!.observed).toContain("the decision or action you are");
    expect(result.report.status).toBe("fail");
  });

  it("treats an OCR mismatch as something to look at, never as proof", () => {
    const result = compareRenderedText(
      manifest([text("a", "Align on a low-risk migration architecture"), text("b", "Present")]),
      extracted(["Present"], "ocr"),
    );
    expect(result.report.status).toBe("review");
    expect(result.report.confidence).toBe("medium");
    // A clean OCR read is still positive evidence, though.
    expect(compareRenderedText(manifest([text("a", "Present")]), extracted(["Present"], "ocr")).report.status).toBe("pass");
  });

  it("says plainly when nothing could read the render back", () => {
    const result = compareRenderedText(manifest([text("a", "Anything")]), {
      method: "none",
      confidence: "low",
      pages: [],
      note: "Neither tool is installed.",
    });
    expect(result.report.status).toBe("skipped");
    expect(result.issues).toEqual([]);
    expect(result.report.note).toContain("Neither tool is installed");
  });

  it("notices copy on the render that the deck does not account for", () => {
    const result = compareRenderedText(
      manifest([text("a", "The claim")]),
      extracted(["The claim", "A leftover footnote nobody removed"]),
    );
    const issue = result.issues.find((entry) => entry.code === "render-text-unexpected");
    expect(issue?.severity).toBe("info");
    expect(result.report.slides[0]!.unexpected).toContain("A leftover footnote nobody removed");
  });

  it("notices a string the render shows more often than the deck authored it", () => {
    const result = compareRenderedText(
      manifest([text("a", "Confidential draft")]),
      extracted(["Confidential draft", "Confidential draft"]),
    );
    expect(result.report.slides[0]!.repeated).toContain("confidential draft");
    expect(result.issues.some((entry) => entry.code === "render-text-repeated")).toBe(true);
  });
});
