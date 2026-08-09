import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { silentLogger } from "../../src/logging/logger.js";
import { SlideAgent } from "../../src/pipeline.js";
import { PresentationRenderer } from "../../src/rendering/renderer.js";
import { slideToSvg } from "../../src/rendering/schematic.js";
import type { DeckManifest, PresentationOutline } from "../../src/types/index.js";

let workspace: string;
const previousSoffice = process.env.SLIDE_AGENT_SOFFICE;
const previousPdftoppm = process.env.SLIDE_AGENT_PDFTOPPM;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-schematic-"));
  // Point discovery at a path that cannot exist, so the test exercises the
  // fallback on machines that do have LibreOffice installed.
  process.env.SLIDE_AGENT_SOFFICE = path.join(workspace, "no-such-soffice");
  process.env.SLIDE_AGENT_PDFTOPPM = path.join(workspace, "no-such-pdftoppm");
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
  if (previousSoffice === undefined) delete process.env.SLIDE_AGENT_SOFFICE;
  else process.env.SLIDE_AGENT_SOFFICE = previousSoffice;
  if (previousPdftoppm === undefined) delete process.env.SLIDE_AGENT_PDFTOPPM;
  else process.env.SLIDE_AGENT_PDFTOPPM = previousPdftoppm;
});

const outline: PresentationOutline = {
  brief: {
    title: "Schematic deck",
    audience: "Reviewers",
    objective: "See the geometry",
    presentationType: "technical",
    tone: "plain",
    visualDirection: "diagnostic",
    slideCount: 2,
    language: "en",
    outputRequirements: [],
    keyTopics: ["geometry"],
    sourcePrompt: "schematic",
  },
  narrative: "Two slides.",
  slides: [
    { id: "one", kind: "title", title: "Schematic deck", subtitle: "Drawn from the manifest" },
    { id: "two", kind: "content", title: "What it shows", bullets: ["Position and size", "Colour and wrapping"] },
  ],
};

async function build(): Promise<string> {
  const output = path.join(workspace, "deck.pptx");
  const result = await new SlideAgent(silentLogger).create({ command: "create", outline, output, render: false, validate: false });
  expect(result.status).not.toBe("error");
  return output;
}

describe("schematic previews without LibreOffice", () => {
  it("draws one SVG per slide instead of failing", async () => {
    const deck = await build();
    const result = await new PresentationRenderer(silentLogger).render(deck, path.join(workspace, "previews"));

    expect(result.mode).toBe("schematic");
    expect(result.pdfPath).toBeUndefined();
    expect(result.previewFiles).toHaveLength(2);
    expect(result.previewFiles.every((file) => file.endsWith(".svg"))).toBe(true);

    const svg = await readFile(result.previewFiles[0]!, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("Schematic deck");
    // It must never claim to be a render.
    expect(svg).toContain("Schematic preview");
  }, 120_000);

  it("still fails outright when the caller demands a true render", async () => {
    const deck = await build();
    await expect(new PresentationRenderer(silentLogger).render(deck, path.join(workspace, "previews"), { fallback: "none" }))
      .rejects.toThrow(/requires LibreOffice/);
  }, 120_000);

  it("tells the caller in the result, not only in the log", async () => {
    const output = path.join(workspace, "rendered.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline,
      output,
      render: true,
      validate: false,
    });
    expect(result.warnings.join(" ")).toMatch(/schematic drawings/);
    expect(result.generatedFiles.some((file) => file.endsWith(".svg"))).toBe(true);
  }, 120_000);
});

describe("what a schematic slide draws", () => {
  const manifest = (): DeckManifest => ({
    schemaVersion: "1.0",
    presentationTitle: "Deck",
    width: 13.333333,
    height: 7.5,
    createdAt: "2026-01-01T00:00:00.000Z",
    slides: [{
      number: 1,
      id: "one",
      title: "One",
      kind: "custom",
      backgroundColor: "101018",
      elements: [
        { id: "t", name: "title", type: "text", role: "title", x: 1, y: 1, w: 6, h: 1, text: "A real title", fontSize: 32, fontFace: "Georgia", textColor: "FFFFFF" },
        { id: "s", name: "field", type: "shape", role: "decorative", x: 0, y: 6, w: 13.3, h: 1, fillColor: "8A1F2B" },
        { id: "i", name: "photo", type: "image", role: "image", x: 8, y: 1, w: 4, h: 3, altText: "A wind farm at dusk", imagePath: "/tmp/x.png" },
        { id: "c", name: "revenue", type: "chart", role: "chart", x: 1, y: 3, w: 6, h: 3, altText: "Revenue by quarter" },
      ],
      notes: [],
    }],
  });

  it("keeps the slide's own colours and text", () => {
    const svg = slideToSvg(manifest().slides[0]!, manifest());
    expect(svg).toContain('fill="#101018"');
    expect(svg).toContain("A real title");
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('font-family="Georgia"');
    expect(svg).toContain('fill="#8A1F2B"');
  });

  it("names what an image and a chart are meant to show", () => {
    const svg = slideToSvg(manifest().slides[0]!, manifest());
    expect(svg).toContain("A wind farm at dusk");
    expect(svg).toContain("Revenue by quarter");
  });

  it("uses the deck's real dimensions in points", () => {
    const svg = slideToSvg(manifest().slides[0]!, manifest());
    expect(svg).toContain('viewBox="0 0 960.0 540.0"');
  });

  it("marks a text block that does not fit its box", () => {
    const deck = manifest();
    deck.slides[0]!.elements = [{
      id: "over", name: "body", type: "text", role: "body",
      x: 1, y: 1, w: 2, h: 0.3, fontSize: 24, text: "Far more words than this small box could ever hold at this size",
    }];
    const svg = slideToSvg(deck.slides[0]!, deck);
    expect(svg).toContain("stroke-dasharray");
  });
});
