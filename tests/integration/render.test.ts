import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { PresentationRenderer } from "../../src/rendering/renderer.js";
import { silentLogger } from "../../src/logging/logger.js";
import { findExecutable } from "../../src/utils/process.js";
import { outputLayout } from "../../src/output/output-layout.js";
import type { PresentationOutline } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
const configDir = path.join(root, "config");

const rendererAvailable = Boolean(
  await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE)
  && await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM),
);

let workspace: string;
const deck = () => path.join(workspace, "render-fixture.pptx");

const outline: PresentationOutline = {
  brief: {
    title: "Render fixture",
    audience: "Reviewers",
    objective: "Exercise the preview pipeline",
    presentationType: "technical",
    tone: "precise",
    visualDirection: "editorial",
    slideCount: 3,
    language: "English",
    outputRequirements: ["editable PowerPoint"],
    keyTopics: ["rendering"],
    sourcePrompt: "render test",
  },
  narrative: "Build, render, inspect.",
  slides: [
    { id: "title", kind: "title", title: "Render fixture", subtitle: "Preview pipeline", sectionLabel: "TEST" },
    {
      id: "chart",
      kind: "chart",
      title: "Charts survive the round trip to PDF",
      body: "A native chart must rasterize.",
      chart: { kind: "bar", labels: ["A", "B", "C"], series: [{ name: "Value", values: [2, 5, 8] }], showValues: true },
    },
    { id: "closing", kind: "closing", title: "The preview pipeline works", subtitle: "Every slide rasterized.", bullets: ["Convert", "Rasterize", "Verify"] },
  ],
};

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-render-"));
  await new SlideAgent(silentLogger).create({
    command: "create",
    outline,
    output: deck(),
    configDir,
    validate: false,
  });
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

describe.runIf(rendererAvailable)("preview rendering", () => {
  it("renders one non-empty PNG per slide plus a PDF", async () => {
    const previews = path.join(workspace, "previews");
    const result = await new PresentationRenderer(silentLogger).render(deck(), previews, { width: 800, height: 450 });
    expect(result.previewFiles).toHaveLength(outline.slides.length);
    for (const preview of result.previewFiles) {
      expect((await stat(preview)).size).toBeGreaterThan(1_000);
    }
    expect((await stat(result.pdfPath)).size).toBeGreaterThan(1_000);
  });

  it("orders previews by slide number rather than lexically", async () => {
    const previews = path.join(workspace, "ordered");
    const result = await new PresentationRenderer(silentLogger).render(deck(), previews, { width: 400, height: 225 });
    const numbers = result.previewFiles.map((file) => Number(path.basename(file).match(/-(\d+)\.png$/)?.[1]));
    expect(numbers).toEqual([...numbers].sort((left, right) => left! - right!));
  });

  it("reports a render failure as a structured error, not an exception", async () => {
    const missing = path.join(workspace, "does-not-exist.pptx");
    const result = await new SlideAgent(silentLogger).render({
      command: "render",
      input: missing,
      output: path.join(workspace, "nothing"),
    });
    expect(result.status).toBe("error");
    expect(result.errors[0]!.code).toBe("INPUT_NOT_FOUND");
  });

  it("validates with rendering enabled and records the preview files", async () => {
    const result = await new SlideAgent(silentLogger).validate({
      command: "validate",
      input: deck(),
      configDir,
      render: true,
      previewsDir: path.join(workspace, "validated"),
    });
    expect(result.validation?.render?.status).toBe("pass");
    expect(result.validation?.render?.previewFiles).toHaveLength(outline.slides.length);
  });

  it("creates and renders in one pass, leaving the PDF at the output root", async () => {
    const output = path.join(workspace, "rendered", "deck.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline,
      output,
      configDir,
      render: true,
      validate: true,
    });
    expect(result.status).not.toBe("error");
    expect(result.deliverables).toContain(outputLayout(output).pdf);
    expect((await stat(outputLayout(output).pdf)).size).toBeGreaterThan(1_000);
  });
});

describe.runIf(!rendererAvailable)("preview rendering without the optional tools", () => {
  it("fails with an actionable dependency error instead of crashing", async () => {
    const result = await new SlideAgent(silentLogger).render({
      command: "render",
      input: deck(),
      output: path.join(workspace, "previews"),
    });
    expect(result.status).toBe("error");
    expect(result.errors[0]!.code).toBe("RENDER_DEPENDENCY_MISSING");
  });

  it("still creates and validates a deck", async () => {
    await writeFile(path.join(workspace, "marker"), "ok", "utf8");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline,
      output: path.join(workspace, "no-render", "deck.pptx"),
      configDir,
      validate: true,
    });
    expect(result.status).not.toBe("error");
    expect(result.validation?.render?.status).toBe("skipped");
  });
});
