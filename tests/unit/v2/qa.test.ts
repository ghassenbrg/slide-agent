import { describe, expect, it } from "vitest";

import { interDeckSimilarity, rhythmNotes, similarity } from "../../../src/v2/compose/rhythm.js";
import { getIcon, iconSetInfo, resolveIcon, searchIcons } from "../../../src/v2/icons/index.js";
import type { SceneGraph, SceneSlide, TextElement } from "../../../src/v2/ir/scene.js";
import { contentChecks, geometryChecks } from "../../../src/v2/qa/checks.js";
import { dedupeFindings, readiness } from "../../../src/v2/qa/verdict.js";

function text(id: string, frame: TextElement["frame"], value: string, extra: Partial<TextElement> = {}): TextElement {
  return {
    kind: "text", id, role: "body", typeRole: "body", frame, z: 0, paragraphs: [{ runs: [{ text: value }] }],
    style: { font: "Inter", size: 18, bold: false, italic: false, color: { hex: "000000" }, align: "left", valign: "top", leading: 1.2, inset: [0, 0, 0, 0] },
    provenance: { source: "composed", path: `/slides/0/compose/${id}` },
    ...extra,
  };
}

function slide(id: string, elements: SceneSlide["elements"], signature = Array(84).fill(0)): SceneSlide {
  return { id, index: 0, message: "m", mode: "compose", layout: "blank", background: { hex: "FFFFFF" }, elements, signature, density: 0.3, findings: [], hash: id };
}

describe("checks", () => {
  it("reports undeclared overlaps and ignores declared ones", () => {
    const overlapping = slide("s", [text("a", { x: 1, y: 1, w: 4, h: 1 }, "A"), text("b", { x: 2, y: 1.2, w: 4, h: 1 }, "B")]);
    expect(geometryChecks(overlapping)[0]!.code).toBe("collision");
    const declared = slide("s", [text("a", { x: 1, y: 1, w: 4, h: 1 }, "A", { overlapAllowed: true }), text("b", { x: 2, y: 1.2, w: 4, h: 1 }, "B")]);
    expect(geometryChecks(declared)).toEqual([]);
  });

  it("finds placeholders, inconsistent figures, empty slides, duplicates, and topic headlines", () => {
    const scene = {
      slides: [
        slide("a", [text("t", { x: 0, y: 0, w: 5, h: 1 }, "Overview", { placeholder: { type: "title" } }), text("x", { x: 0, y: 2, w: 5, h: 1 }, "ARR $4.2M this year. TODO confirm")]),
        slide("b", [text("t", { x: 0, y: 0, w: 5, h: 1 }, "Overview", { placeholder: { type: "title" } }), text("x", { x: 0, y: 2, w: 5, h: 1 }, "ARR $4.1M, {name}")]),
        slide("c", []),
      ],
    } as unknown as SceneGraph;
    const codes = contentChecks(scene).map((finding) => finding.code);
    expect(codes).toEqual(expect.arrayContaining(["placeholder-text", "number-inconsistent", "slide-empty", "headline-is-topic"]));
  });

  it("derives readiness from findings, choices, package state, and fidelity", () => {
    expect(readiness([], { rendered: "none", pendingChoices: 0 })).toBe("ready-unrendered");
    expect(readiness([], { rendered: "fidelity", fidelityPassed: true, pendingChoices: 0 })).toBe("ready");
    expect(readiness([], { rendered: "none", pendingChoices: 1 })).toBe("needs-attention");
    expect(readiness([{ code: "x", severity: "blocking", tier: "T2", message: "" }], { rendered: "none", pendingChoices: 0 })).toBe("broken");
    expect(dedupeFindings([{ code: "a", severity: "minor", tier: "T4", message: "m" }, { code: "a", severity: "minor", tier: "T4", message: "m" }])).toHaveLength(1);
  });
});

describe("rhythm", () => {
  it("compares centred signatures and notes near-repeats and flat density", () => {
    const left = Array.from({ length: 84 }, (_, index) => (index < 12 ? 1 : 0));
    const right = Array.from({ length: 84 }, (_, index) => (index >= 72 ? 1 : 0));
    expect(similarity(left, left)).toBe(1);
    expect(similarity(left, right)).toBeLessThan(0.1);
    const slides = ["a", "b", "c", "d"].map((id) => ({ id, signature: left, density: 0.3 }));
    const notes = rhythmNotes(slides);
    expect(notes.map((note) => note.note)).toEqual(expect.arrayContaining(["adjacent slides share a silhouette", "4 slides in a row at the same density"]));
    expect(interDeckSimilarity([[left], [left], [right]])).toBeGreaterThan(-1);
  });
});

describe("icons", () => {
  it("resolves names, searches concepts, and suggests close names", () => {
    expect(iconSetInfo().count).toBeGreaterThan(1000);
    expect(getIcon("shield-check")!.paths.length).toBeGreaterThan(0);
    expect(searchIcons("?security").slice(0, 3).map((match) => match.name)).toEqual(expect.arrayContaining(["shield"]));
    const query = resolveIcon("?growth");
    expect(query.query).toBe(true);
    expect(query.icon).toBeDefined();
    expect(resolveIcon("shield-chek").alternatives[0]).toBe("shield-check");
  });
});
