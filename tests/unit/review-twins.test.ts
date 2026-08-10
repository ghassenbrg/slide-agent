import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import type { CanvasElementSpec, PresentationOutline } from "../../src/types/index.js";

/**
 * Slides that came out as the same drawing, reported by number.
 *
 * The deck-level variety score notices repetition in aggregate and cannot say
 * which slides caused it, which makes it advice nobody can act on. This is the
 * part an author can act on, so it is checked through a real build rather than
 * against a hand-written signature.
 */

let workspace: string;
const agent = new SlideAgent(silentLogger);

beforeAll(async () => { workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-twins-")); });
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

const hub = (suffix: string): CanvasElementSpec[] => [
  { id: `centre${suffix}`, type: "shape", shape: "ellipse", x: 5.4, y: 2.9, w: 2.5, h: 1.7, style: { fill: "1F3A5F" } },
  { id: `n1${suffix}`, type: "shape", shape: "rect", x: 0.8, y: 1.2, w: 2.4, h: 0.9, style: { fill: "1F3A5F" } },
  { id: `n2${suffix}`, type: "shape", shape: "rect", x: 10.1, y: 1.2, w: 2.4, h: 0.9, style: { fill: "1F3A5F" } },
  { id: `n3${suffix}`, type: "shape", shape: "rect", x: 0.8, y: 5.4, w: 2.4, h: 0.9, style: { fill: "1F3A5F" } },
  { id: `n4${suffix}`, type: "shape", shape: "rect", x: 10.1, y: 5.4, w: 2.4, h: 0.9, style: { fill: "1F3A5F" } },
];

function outline(): PresentationOutline {
  return {
    brief: {
      title: "Twins", audience: "Reviewers", objective: "Detect repetition",
      presentationType: "technical", tone: "plain", visualDirection: "fixture",
      slideCount: 3, language: "English", outputRequirements: [], keyTopics: [], sourcePrompt: "test",
    },
    narrative: "Two of these slides are the same drawing.",
    slides: [
      { id: "one", kind: "custom", title: "One", canvas: hub("a") },
      {
        id: "two", kind: "custom", title: "Two", canvas: [
          { id: "band", type: "shape", shape: "rect", x: 0.7, y: 0.7, w: 11.9, h: 2.2, style: { fill: "1F3A5F" } },
          { id: "line", type: "text", x: 0.7, y: 3.4, w: 8, h: 0.6, text: "A different composition entirely" },
        ],
      },
      { id: "three", kind: "custom", title: "Three", canvas: hub("b") },
    ],
  };
}

describe("the review packet names repeated slides", () => {
  it("reports the pair on both slides and asks about it", async () => {
    const output = path.join(workspace, "twins.pptx");
    const built = await agent.create({
      command: "create", outline: outline(), output, validate: true, render: false, roundTrip: false,
    });
    expect(built.status, JSON.stringify(built.errors)).not.toBe("error");

    // The geometric finding reaches validation as a named pair.
    const repeats = built.validation!.issues.filter((issue) => issue.code === "repeated-silhouette");
    expect(repeats).toHaveLength(1);
    expect(repeats[0]!.details!.slides).toEqual([1, 3]);

    const packet = await agent.review(output);
    const first = packet.slides.find((slide) => slide.number === 1)!;
    const third = packet.slides.find((slide) => slide.number === 3)!;
    const second = packet.slides.find((slide) => slide.number === 2)!;
    expect(first.twins?.[0]?.slide).toBe(3);
    expect(third.twins?.[0]?.slide).toBe(1);
    // The slide that is genuinely different is left alone.
    expect(second.twins).toBeUndefined();
    expect(packet.reviewQuestions.join(" ")).toMatch(/near-identical to slide 3/);
  });
});
