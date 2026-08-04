import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import { outputLayout } from "../../src/output/output-layout.js";
import { reviseScene } from "../../src/serialization/revise-scene.js";
import type { DeckManifest, PresentationOutline } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
const configDir = path.join(root, "config");
let workspace: string;
const source = () => path.join(workspace, "deck.pptx");

const outline: PresentationOutline = {
  brief: {
    title: "Revision fixture",
    audience: "Reviewers",
    objective: "Verify slide-level revision",
    presentationType: "technical",
    tone: "precise",
    visualDirection: "editorial",
    slideCount: 3,
    language: "English",
    outputRequirements: ["editable PowerPoint"],
    keyTopics: ["revision"],
    sourcePrompt: "revise test",
  },
  narrative: "Build, revise one slide, keep the rest.",
  creativeDirection: {
    name: "Fixture direction",
    palette: { background: "101014", ink: "F5F2E9", accent: "66E3FF" },
    typography: { heading: "Georgia", body: "Aptos" },
  },
  slides: [
    {
      id: "opening",
      kind: "statement",
      title: "Opening",
      background: "101014",
      canvas: [{ id: "opening-title", type: "text", x: 0.8, y: 1.2, w: 9, h: 1.4, role: "title", text: "Opening", style: { fontSize: 44, color: "F5F2E9", bold: true } }],
    },
    {
      id: "middle",
      kind: "statement",
      title: "Middle",
      background: "101014",
      canvas: [{ id: "middle-title", type: "text", x: 0.8, y: 1.2, w: 9, h: 1.4, role: "title", text: "Middle", style: { fontSize: 44, color: "F5F2E9", bold: true } }],
    },
    {
      id: "closing",
      kind: "statement",
      title: "Closing",
      background: "101014",
      canvas: [{ id: "closing-title", type: "text", x: 0.8, y: 1.2, w: 9, h: 1.4, role: "title", text: "Closing", style: { fontSize: 44, color: "F5F2E9", bold: true } }],
    },
  ],
};

const replacement = [
  JSON.stringify({ kind: "slide", slide: 2, freeform: true, id: "middle", semanticKind: "statement", title: "Revised middle", background: "101014" }),
  JSON.stringify({ kind: "textbox", slide: 2, id: "middle-title", bbox: [0.8, 1.2, 9, 1.4], role: "title", text: "Revised middle", style: { fontSize: 44, color: "F5F2E9", bold: true } }),
  JSON.stringify({ kind: "shape", slide: 2, id: "middle-mark", bbox: [10, 1.2, 2, 2], style: { fill: "66E3FF" } }),
].join("\n");

async function manifestFor(deck: string): Promise<DeckManifest> {
  return JSON.parse(await readFile(outputLayout(deck).manifest, "utf8")) as DeckManifest;
}

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-revise-"));
  const result = await new SlideAgent(silentLogger).create({
    command: "create",
    outline,
    output: source(),
    configDir,
    validate: true,
  });
  expect(result.status).not.toBe("error");
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

describe("reviseScene", () => {
  const base = [
    JSON.stringify({ kind: "deck", schema: "slide-agent.scene/1", brief: outline.brief, narrative: "n" }),
    JSON.stringify({ kind: "slide", slide: 1, freeform: true, id: "a", semanticKind: "s", title: "A" }),
    JSON.stringify({ kind: "textbox", slide: 1, id: "a1", bbox: [0, 0, 1, 1], text: "A" }),
    JSON.stringify({ kind: "slide", slide: 2, freeform: true, id: "b", semanticKind: "s", title: "B" }),
    JSON.stringify({ kind: "textbox", slide: 2, id: "b1", bbox: [0, 0, 1, 1], text: "B" }),
  ].join("\n");

  it("replaces only the target slide's records", () => {
    const result = reviseScene(base, 2, replacement.replaceAll('"slide":2', '"slide":2'));
    expect(result.scene).toContain('"id":"a1"');
    expect(result.scene).not.toContain('"text":"B"');
    expect(result.replaced).toBe(2);
  });

  it("forces mislabelled replacement records onto the target slide", () => {
    const mislabelled = [
      JSON.stringify({ kind: "slide", slide: 9, freeform: true, id: "b", semanticKind: "s", title: "B2" }),
      JSON.stringify({ kind: "textbox", slide: 9, id: "b1", bbox: [0, 0, 1, 1], text: "B2" }),
    ].join("\n");
    const result = reviseScene(base, 2, mislabelled);
    expect(result.scene).not.toContain('"slide":9');
  });

  it("refuses a slide number the scene does not contain", () => {
    expect(() => reviseScene(base, 7, replacement)).toThrow(/has no slide 7/);
  });

  it("refuses a replacement with no slide record", () => {
    const elementsOnly = JSON.stringify({ kind: "textbox", slide: 2, id: "b1", bbox: [0, 0, 1, 1], text: "B" });
    expect(() => reviseScene(base, 2, elementsOnly)).toThrow(/must include the slide record/);
  });

  it("refuses a replacement that would leave the slide empty", () => {
    const slideOnly = JSON.stringify({ kind: "slide", slide: 2, freeform: true, id: "b", semanticKind: "s", title: "B" });
    expect(() => reviseScene(base, 2, slideOnly)).toThrow(/would render empty/);
  });

  it("rejects malformed NDJSON with the offending line number", () => {
    expect(() => reviseScene(base, 2, "{not json}")).toThrow(/line 1/);
  });
});

describe("slide-level revision", () => {
  it("changes the target slide and leaves the others identical", async () => {
    const before = await manifestFor(source());
    const output = path.join(workspace, "revised.pptx");

    const result = await new SlideAgent(silentLogger).revise({
      command: "revise",
      input: source(),
      output,
      slide: 2,
      sceneNdjson: replacement,
      configDir,
      validate: true,
    });

    expect(result.status, JSON.stringify(result.errors)).not.toBe("error");
    expect(result.metadata.command).toBe("revise");
    expect(result.metadata.provenance).toBe("model-authored");

    const after = await manifestFor(output);
    expect(after.slides).toHaveLength(before.slides.length);

    // The revised slide changed...
    expect(after.slides[1]!.title).toBe("Revised middle");
    expect(after.slides[1]!.elements).toHaveLength(2);

    // ...and every other slide is byte-identical in the manifest.
    const strip = (manifest: DeckManifest, index: number) => JSON.stringify(manifest.slides[index]);
    expect(strip(after, 0)).toBe(strip(before, 0));
    expect(strip(after, 2)).toBe(strip(before, 2));
  });

  it("preserves the deck's creative direction through the revision", async () => {
    const after = await manifestFor(path.join(workspace, "revised.pptx"));
    expect(after.creativeDirection?.name).toBe("Fixture direction");
    expect(after.creativeDirection?.palette?.accent).toBe("66E3FF");
  });

  it("refuses to overwrite the input", async () => {
    const result = await new SlideAgent(silentLogger).revise({
      command: "revise",
      input: source(),
      output: source(),
      slide: 2,
      sceneNdjson: replacement,
      configDir,
    });
    expect(result.errors[0]!.code).toBe("OUTPUT_MATCHES_INPUT");
  });

  it("explains what to do when no scene blueprint exists", async () => {
    const orphan = path.join(workspace, "orphan", "deck.pptx");
    const result = await new SlideAgent(silentLogger).revise({
      command: "revise",
      input: orphan,
      output: path.join(workspace, "orphan", "out.pptx"),
      slide: 1,
      sceneNdjson: replacement,
      configDir,
    });
    expect(result.errors[0]!.code).toBe("SCENE_NOT_FOUND");
    expect(result.errors[0]!.message).toMatch(/artifacts\//);
  });
});
