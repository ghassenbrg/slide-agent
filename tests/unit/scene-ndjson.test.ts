import { describe, expect, it } from "vitest";

import { parseSceneNdjson, serializeSceneNdjson } from "../../src/serialization/scene-ndjson.js";
import type { PresentationOutline } from "../../src/types/index.js";

const outline: PresentationOutline = {
  brief: {
    title: "Line-oriented design",
    audience: "Model hosts",
    objective: "Round-trip a complete scene",
    presentationType: "technical",
    tone: "clear",
    visualDirection: "model-authored",
    slideCount: 2,
    language: "English",
    outputRequirements: ["editable PowerPoint"],
    keyTopics: [],
    sourcePrompt: "NDJSON test",
  },
  narrative: "Plan, compose, rebuild.",
  completeness: {
    audienceQuestions: ["How can a model inspect and rebuild the scene?"],
    closingContract: ["Leave the audience with a repeatable workflow."],
  },
  creativeDirection: { concept: "Visible construction", palette: { background: "101014", ink: "F8F5E8" } },
  slides: [
    {
      id: "canvas",
      kind: "visual-argument",
      title: "Every line is inspectable",
      communication: {
        audienceQuestion: "What makes the scene inspectable?",
        claim: "Every design decision is stored as a readable record.",
        artifact: "Annotated NDJSON scene",
      },
      designIntent: "Expose the scene as simple records.",
      canvas: [
        { id: "deck-title", type: "text", x: 0.7, y: 1, w: 8, h: 1.2, role: "title", text: "Every line is inspectable", style: { fontSize: 50, color: "F8F5E8" } },
        { id: "route", type: "connector", x: 1, y: 5, w: 8, h: -2, style: { color: "B8FF32" } },
      ],
      speakerNotes: ["Explain why a line-oriented IR is model-friendly."],
      sources: [{ label: "Internal design record" }],
    },
    { id: "fallback", kind: "closing", title: "Fallback specs also round-trip", bullets: ["Done"] },
  ],
};

describe("scene NDJSON", () => {
  it("serializes one readable record per deck, slide, element, and notes block", () => {
    const serialized = serializeSceneNdjson(outline);
    const records = serialized.trim().split("\n").map((line) => JSON.parse(line) as { kind: string });
    expect(records.map((record) => record.kind)).toEqual(["deck", "slide", "textbox", "connector", "notes", "slide"]);
    expect(serialized).toContain('"schema":"slide-agent.scene/1"');
  });

  it("round-trips model-authored canvases and fallback slides", () => {
    const parsed = parseSceneNdjson(serializeSceneNdjson(outline));
    expect(parsed.creativeDirection?.concept).toBe("Visible construction");
    expect(parsed.completeness?.audienceQuestions).toEqual(outline.completeness?.audienceQuestions);
    expect(parsed.slides[0]!.communication?.artifact).toBe("Annotated NDJSON scene");
    expect(parsed.slides[0]!.canvas?.[0]).toMatchObject({ type: "text", id: "deck-title", x: 0.7, w: 8 });
    expect(parsed.slides[0]!.speakerNotes).toEqual(outline.slides[0]!.speakerNotes);
    expect(parsed.slides[1]).toMatchObject({ kind: "closing", bullets: ["Done"] });
  });
});
