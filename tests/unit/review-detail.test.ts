import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import { censusOf, defectiveElementIds } from "../../src/review/packet.js";
import type { CanvasElementSpec, PresentationOutline, ReviewPacket, ValidationIssue } from "../../src/types/index.js";

/**
 * What the defect-first packet leaves out, and what it must never leave out.
 *
 * The saving is real only if it comes from the part the model already knew. A
 * packet that also dropped a finding would be cheaper and useless, so every
 * test here is about the second half of that sentence: the elements a check
 * names survive, the counts stay honest, and `detail: "full"` gets everything
 * back.
 */

let workspace: string;
const agent = new SlideAgent(silentLogger);

beforeAll(async () => { workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-detail-")); });
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

/** A slide with a great many unremarkable elements and one that overflows it. */
function crowded(): CanvasElementSpec[] {
  const elements: CanvasElementSpec[] = [];
  for (let index = 0; index < 14; index += 1) {
    elements.push({
      id: `tile-${index}`,
      type: "shape",
      shape: "rect",
      x: 0.6 + (index % 7) * 1.75,
      y: 1.4 + Math.floor(index / 7) * 1.4,
      w: 1.5,
      h: 1.1,
      style: { fill: "203A55" },
    });
  }
  // Deliberately off the slide: something a geometry check will name.
  elements.push({
    id: "runaway",
    type: "text",
    x: 12.9,
    y: 6.9,
    w: 4,
    h: 1,
    text: "This element hangs off the right edge of the slide entirely",
    style: { fontSize: 14 },
  });
  return elements;
}

function outline(): PresentationOutline {
  return {
    brief: {
      title: "Detail", audience: "Reviewers", objective: "Check packet detail levels",
      presentationType: "technical", tone: "plain", visualDirection: "fixture",
      slideCount: 2, language: "English", outputRequirements: [], keyTopics: [], sourcePrompt: "test",
    },
    narrative: "One slide is crowded and one element is off the canvas.",
    slides: [
      { id: "quiet", kind: "custom", title: "Nothing wrong here", canvas: [
        { id: "title", type: "text", x: 0.7, y: 0.6, w: 10, h: 0.9, text: "A slide with nothing wrong with it", role: "title", style: { fontSize: 34 } },
        { id: "body", type: "text", x: 0.7, y: 2, w: 8, h: 1.2, text: "Two elements, both inside the slide, both legible.", role: "body", style: { fontSize: 16 } },
      ] },
      { id: "crowded", kind: "custom", title: "Fifteen elements, one of them adrift", canvas: crowded() },
    ],
  };
}

let defects: ReviewPacket;
let full: ReviewPacket;

beforeAll(async () => {
  const output = path.join(workspace, "detail.pptx");
  // The fixture is deliberately defective — that is what gives the packet
  // something to report — so the build is expected to name the defect rather
  // than to come back clean. What matters is that it wrote the deck.
  const built = await agent.create({
    command: "create", outline: outline(), output, validate: true, render: false, roundTrip: false,
  });
  expect(built.errors.map((error) => error.code)).toContain("object-outside-slide");
  expect(built.primaryOutput).toBeDefined();
  defects = await agent.review(output);
  full = await agent.review(output, { detail: "full" });
});

describe("review packet detail levels", () => {
  it("defaults to defects and says so once, for the packet", () => {
    expect(defects.detail.level).toBe("defects");
    expect(defects.detail.note).toContain('detail:"full"');
    expect(full.detail.level).toBe("full");
  });

  it("costs materially less than full detail, in the part detail governs", () => {
    // Measured on `slides`, not the whole packet: a two-slide fixture is
    // dominated by the artifact hashes and the deck questions, which the
    // detail level has no opinion about. The whole-packet saving on real decks
    // is asserted in the budget ceilings.
    const listed = (packet: ReviewPacket) => JSON.stringify(packet.slides).length;
    expect(listed(defects)).toBeLessThan(listed(full) * 0.6);
  });

  it("lists every element a check named", () => {
    // An issue carries the OOXML shape name, which prefixes the paint order
    // (`015-runaway`); the manifest carries the authored id (`runaway`).
    // Comparing them without accounting for that would hide every defect the
    // defect-first packet exists to surface, which is the one failure mode
    // that would make the saving worthless.
    const bare = (id: string) => id.replace(/^\d{3,}-/, "");
    const flagged = new Set(
      defects.slides.flatMap((slide) => slide.issues.flatMap((issue) => (issue.elementIds ?? []).map(bare))),
    );
    expect(flagged.size).toBeGreaterThan(0);
    const listed = new Set(defects.slides.flatMap((slide) => slide.elements.map((element) => bare(element.id))));
    for (const id of flagged) expect(listed, `element ${id} was summarised away`).toContain(id);
  });

  it("counts the elements it did not list, without pretending they are absent", () => {
    const crowdedSlide = defects.slides.find((slide) => slide.id === "crowded")!;
    expect(crowdedSlide.elementCensus).toBeDefined();
    expect(crowdedSlide.elementCensus!.total).toBe(15);
    expect(crowdedSlide.elementCensus!.byType.shape).toBe(14);
    expect(crowdedSlide.elementCensus!.total).toBeGreaterThan(crowdedSlide.elements.length);
  });

  it("surfaces every issue class the full packet surfaces", () => {
    const codes = (packet: ReviewPacket) => new Set([
      ...packet.slides.flatMap((slide) => slide.issues.map((issue) => issue.code)),
      ...packet.observations.issues.map((issue) => issue.code),
    ]);
    expect([...codes(defects)].sort()).toEqual([...codes(full)].sort());
  });

  it("reports the same issue count at both detail levels, counting each issue once", () => {
    const perSlide = defects.slides.reduce((sum, slide) => sum + slide.issues.length, 0);
    // A slide-scoped issue lives on its slide and is not repeated at the top,
    // so the totals have to be reconstructed the same way at both levels.
    expect(defects.observations.issueCount).toBe(full.observations.issueCount);
    expect(perSlide + defects.observations.issues.length).toBe(defects.observations.issueCount);
    expect(defects.observations.issues.every((issue) => issue.slide === undefined)).toBe(true);
  });

  it("returns every element when asked for one slide by number", async () => {
    const output = path.join(workspace, "detail.pptx");
    const one = await agent.review(output, { slide: 2 });
    expect(one.detail.level).toBe("full");
    expect(one.slides).toHaveLength(1);
    expect(one.slides[0]!.elements).toHaveLength(15);
    expect(one.slides[0]!.elementCensus).toBeUndefined();
  });

  it("states how the words were read back once, not once per slide", () => {
    expect(defects.textExtraction.method).toBeDefined();
    expect(defects.textExtraction.confidence).toBeDefined();
    for (const slide of defects.slides) {
      expect(slide.text).not.toHaveProperty("method");
      expect(slide.text).not.toHaveProperty("confidence");
    }
  });

  it("says how much text was read even when it does not list it", () => {
    for (const slide of defects.slides) {
      // An absent `observed` must not read as "the render showed nothing".
      expect(typeof slide.text.observedLineCount).toBe("number");
    }
  });

  it("asks the deck-wide questions once rather than once per slide", () => {
    const counts = new Map<string, number>();
    for (const question of defects.reviewQuestions) counts.set(question, (counts.get(question) ?? 0) + 1);
    for (const [question, count] of counts) {
      expect(count, `asked ${count} times: ${question}`).toBe(1);
    }
  });

  it("keeps every slide-specific question that names a measured fact", () => {
    const named = defects.slides.filter((slide) => slide.designIntent || slide.plan || slide.twins?.length);
    for (const slide of named) {
      expect(defects.reviewQuestions.some((question) => question.includes(String(slide.number))
        || (slide.designIntent ? question.includes(slide.designIntent) : false))).toBe(true);
    }
  });
});

/**
 * The selection itself, without a build around it.
 *
 * These paths only run when a check has something to say, and the checks that
 * say the most — text that did not survive to the render — need LibreOffice and
 * Poppler, which the portable suite deliberately does without. Tested directly
 * so the least-equipped runner still exercises them.
 */
describe("choosing which elements to name", () => {
  const issue = (elementIds: string[]): ValidationIssue => ({
    code: "object-outside-slide", severity: "error", message: "off the edge", fixable: false, slide: 1, elementIds,
  });
  // Both identities, exactly as the manifest records them: `id` is the OOXML
  // shape name the writer derives, `name` is the authored id.
  const elements = [
    { id: "003-title", name: "title", type: "text", role: "title", text: "The quarter finished ahead of plan" },
    { id: "007-body", name: "body", type: "text", role: "body", text: "Revenue grew by eighteen per cent" },
    { id: "009-rule", name: "rule", type: "shape", role: "decorative" },
    { id: "004-photo", name: "photo", type: "image", role: "figure" },
  ];

  it("matches an issue's element id against the record that holds both", () => {
    // Validation issues cite the OOXML name; a patch and the packet use the
    // authored one. The join is on the manifest record, so neither has to be
    // guessed from the shape of the other.
    expect([...defectiveElementIds({ elements }, [issue(["003-title"])], [], [], [])]).toEqual(["title"]);
    expect([...defectiveElementIds({ elements }, [issue(["title"])], [], [], [])]).toEqual(["title"]);
    expect([...defectiveElementIds({ elements }, [issue(["nothing-here"])], [], [], [])]).toEqual([]);
    // An authored id that merely looks like a prefixed one is not mangled.
    const numeric = [{ id: "011-2024-review", name: "2024-review", type: "text", role: "body" }];
    expect([...defectiveElementIds({ elements: numeric }, [issue(["011-2024-review"])], [], [], [])])
      .toEqual(["2024-review"]);
  });

  it("names an element a reviewer flagged", () => {
    const finding = {
      id: "f1", reviewer: "human", severity: "major" as const, slide: 1,
      elementIds: ["004-photo"], observation: "crop cuts the subject",
      rationale: "the subject is the point",
      suggestedTarget: "the subject centred in the frame",
    };
    expect([...defectiveElementIds({ elements }, [], [finding], [], [])]).toEqual(["photo"]);
  });

  it("finds the element behind text that did not survive the render", () => {
    // Missing text rarely carries an element id, so the element is found by
    // the string it was supposed to draw. Without this the one element the
    // author most needs to see would be the one summarised away.
    const byMissing = defectiveElementIds({ elements }, [], [], ["Revenue grew by eighteen per cent"], []);
    expect([...byMissing]).toEqual(["body"]);

    const byTruncation = defectiveElementIds({ elements }, [], [], [], [{ intended: "The quarter finished ahead of plan" }]);
    expect([...byTruncation]).toEqual(["title"]);

    // A partial read of the render still points at the right element.
    const partial = defectiveElementIds({ elements }, [], [], ["The quarter finished"], []);
    expect([...partial]).toEqual(["title"]);
  });

  it("counts what it did not name", () => {
    const census = censusOf(elements);
    expect(census).toMatchObject({
      total: 4,
      byType: { text: 2, shape: 1, image: 1 },
      byRole: { title: 1, body: 1, decorative: 1, figure: 1 },
    });
    // Six words in the title, six in the body; the shape and image have none.
    expect(census.words).toBe(12);
  });
});
