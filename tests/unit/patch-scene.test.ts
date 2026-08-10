import { describe, expect, it } from "vitest";

import { formatPatchDiff, patchOutline, type PatchOperation } from "../../src/editing/patch-scene.js";
import type { CanvasElementSpec, PresentationOutline } from "../../src/types/index.js";

function outline(): PresentationOutline {
  return {
    brief: {
      title: "Patch test",
      audience: "Reviewers",
      objective: "Verify targeted patching",
      presentationType: "technical",
      tone: "precise",
      visualDirection: "plain",
      slideCount: 2,
      language: "English",
      outputRequirements: [],
      keyTopics: [],
      sourcePrompt: "test",
    },
    narrative: "Patches change one thing.",
    claims: [{ id: "c1", claim: "An unchecked number", status: "needs-review" }],
    slides: [
      {
        id: "one",
        kind: "statement",
        title: "One",
        canvas: [
          { id: "title", type: "text", x: 1, y: 1, w: 6, h: 1, role: "title", text: "Original title", style: { fontSize: 40, color: "111111" } },
          { id: "note", type: "text", x: 1, y: 3, w: 4, h: 0.6, role: "body", text: "A note" },
          {
            id: "legend",
            type: "group",
            x: 1,
            y: 5,
            w: 4,
            h: 0.6,
            children: [
              { id: "swatch", type: "shape", shape: "rect", x: 0, y: 0, w: 0.3, h: 0.3, style: { fill: "8C5A2B" } },
              { id: "label", type: "text", x: 0.4, y: 0, w: 3, h: 0.3, text: "Midden" },
            ],
          } as CanvasElementSpec,
        ],
      },
      {
        id: "two",
        kind: "chart",
        title: "Two",
        canvas: [
          { id: "chart", type: "chart", x: 1, y: 1, w: 8, h: 4, chart: { kind: "bar", labels: ["a"], series: [{ name: "s", values: [1] }] } } as CanvasElementSpec,
        ],
      },
    ],
  };
}

describe("targeted scene patching", () => {
  it("changes only what it names and proves what it left alone", () => {
    const original = outline();
    const result = patchOutline(original, [{ op: "update-text", slide: 1, elementId: "title", text: "Revised title" }]);

    const patched = result.outline.slides[0]!.canvas![0] as CanvasElementSpec & { text: string };
    expect(patched.text).toBe("Revised title");
    // Everything else is byte-identical, including the other slide.
    expect(result.outline.slides[1]).toEqual(original.slides[1]);
    expect(result.untouched.find((entry) => entry.slide === 1)?.elementIds).toEqual(["note", "legend", "swatch", "label"]);
    expect(result.untouched.find((entry) => entry.slide === 2)?.elementIds).toEqual(["chart"]);
  });

  it("never mutates the outline it was given, so a dry run is a real preview", () => {
    const original = outline();
    const snapshot = structuredClone(original);
    patchOutline(original, [
      { op: "update-bbox", slide: 1, elementId: "note", bbox: [2, 4, 5, 1] },
      { op: "remove-element", slide: 1, elementId: "title" },
    ]);
    expect(original).toEqual(snapshot);
  });

  it("reaches elements nested inside a group", () => {
    const result = patchOutline(outline(), [{ op: "update-text", slide: 1, elementId: "label", text: "Storm deposit" }]);
    const group = result.outline.slides[0]!.canvas![2] as CanvasElementSpec & { children: Array<{ id: string; text?: string }> };
    expect(group.children[1]!.text).toBe("Storm deposit");
    expect(group.children[0]).toEqual({ id: "swatch", type: "shape", shape: "rect", x: 0, y: 0, w: 0.3, h: 0.3, style: { fill: "8C5A2B" } });
  });

  it("merges a style by default and replaces it only when asked", () => {
    const merged = patchOutline(outline(), [{ op: "update-style", slide: 1, elementId: "title", style: { color: "A32020" } }]);
    expect((merged.outline.slides[0]!.canvas![0] as { style: Record<string, unknown> }).style).toEqual({ fontSize: 40, color: "A32020" });

    const replaced = patchOutline(outline(), [{ op: "update-style", slide: 1, elementId: "title", style: { color: "A32020" }, replace: true }]);
    expect((replaced.outline.slides[0]!.canvas![0] as { style: Record<string, unknown> }).style).toEqual({ color: "A32020" });
  });

  it("applies a style-system change across a selection", () => {
    const result = patchOutline(outline(), [
      { op: "apply-style-system", selector: { role: "body" }, styleRef: "field-note" },
    ]);
    expect((result.outline.slides[0]!.canvas![1] as { styleRef?: string }).styleRef).toBe("field-note");
    expect((result.outline.slides[0]!.canvas![0] as { styleRef?: string }).styleRef).toBeUndefined();
  });

  it("keeps the claim ledger addressable after a patch", () => {
    const result = patchOutline(outline(), [
      { op: "update-claims", claims: [{ id: "c1", claim: "An unchecked number", status: "verified", sourceIds: ["s1"], asOf: "2026-04-01" }] },
    ]);
    expect(result.outline.claims).toEqual([
      { id: "c1", claim: "An unchecked number", status: "verified", sourceIds: ["s1"], asOf: "2026-04-01" },
    ]);
  });

  it("refuses an unknown element by naming the ones that exist", () => {
    expect(() => patchOutline(outline(), [{ op: "update-text", slide: 1, elementId: "titel", text: "x" }]))
      .toThrow(/no element "titel".*Its elements are: title, note, legend/s);
  });

  it("refuses a slide the deck does not have", () => {
    expect(() => patchOutline(outline(), [{ op: "remove-element", slide: 9, elementId: "title" }]))
      .toThrow(/has 2 slide\(s\); this patch targets slide 9/);
  });

  it("refuses to update text on an element that has none", () => {
    expect(() => patchOutline(outline(), [{ op: "update-text", slide: 2, elementId: "chart", text: "x" }]))
      .toThrow(/is a chart element, so it has no text to update/);
  });

  it("refuses a duplicate element id rather than creating an unaddressable element", () => {
    const add: PatchOperation = {
      op: "add-element",
      slide: 1,
      element: { id: "note", type: "text", x: 0, y: 0, w: 1, h: 1, text: "clash" } as CanvasElementSpec,
    };
    expect(() => patchOutline(outline(), [add])).toThrow(/already has an element called "note"/);
  });

  it("reports a diff a person can read", () => {
    const result = patchOutline(outline(), [
      { op: "update-text", slide: 1, elementId: "title", text: "Revised title" },
      { op: "update-bbox", slide: 1, elementId: "note", bbox: [2, 4, 5, 1] },
    ]);
    const diff = formatPatchDiff(result);
    expect(diff).toContain('"Original title" → "Revised title"');
    expect(diff).toContain("[1,3,4,0.6] → [2,4,5,1]");
    expect(diff).toMatch(/element\(s\) left exactly as they were/);
  });
});
