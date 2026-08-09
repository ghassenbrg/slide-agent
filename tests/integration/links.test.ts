import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import type { CanvasElementSpec, PresentationOutline } from "../../src/types/index.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-links-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function outlineWith(canvas: CanvasElementSpec[]): PresentationOutline {
  return {
    brief: {
      title: "Linked deck",
      audience: "Security review",
      objective: "Show the links",
      presentationType: "technical",
      tone: "direct",
      visualDirection: "clean",
      slideCount: 1,
      language: "en",
      outputRequirements: [],
      keyTopics: ["links"],
      sourcePrompt: "links",
    },
    narrative: "One slide, several links.",
    slides: [{ id: "one", kind: "content", title: "Linked deck", canvas }],
  };
}

async function build(canvas: CanvasElementSpec[]): Promise<{ warnings: string[]; rels: string }> {
  const output = path.join(workspace, "deck.pptx");
  const result = await new SlideAgent().create({
    command: "create",
    outline: outlineWith(canvas),
    output,
    render: false,
    validate: false,
  });
  expect(result.status).not.toBe("error");
  const zip = await JSZip.loadAsync(await readFile(output));
  const rels = await zip.file("ppt/slides/_rels/slide1.xml.rels")?.async("string") ?? "";
  return { warnings: result.warnings, rels };
}

describe("hyperlinks in a model-authored canvas", () => {
  it("writes an allowed link into the package", async () => {
    const { rels, warnings } = await build([
      {
        id: "cta", type: "text", x: 1, y: 2, w: 6, h: 0.6,
        text: "Read the full report",
        link: { url: "https://example.com/report", tooltip: "The full report" },
      },
    ]);
    expect(rels).toContain("https://example.com/report");
    expect(rels).toContain('TargetMode="External"');
    expect(warnings.join(" ")).not.toMatch(/Refused/);
  }, 120_000);

  it("refuses a file link and says so instead of shipping it", async () => {
    const { rels, warnings } = await build([
      {
        id: "cta", type: "text", x: 1, y: 2, w: 6, h: 0.6,
        text: "Open the archive",
        link: "file:///Users/someone/.ssh/id_rsa",
      },
    ]);
    expect(rels).not.toContain("id_rsa");
    expect(warnings.join(" ")).toMatch(/Refused a file: link/);
  }, 120_000);

  it("holds a link smuggled through the options passthrough to the same rule", async () => {
    // SECURITY.md promises every URL in a request is checked. `options` is a
    // passthrough to PptxGenJS, not a way around that promise.
    const { rels, warnings } = await build([
      {
        id: "cta", type: "shape", shape: "rect", x: 1, y: 2, w: 3, h: 1,
        style: { fill: "224466", options: { hyperlink: { url: "smb://fileserver/payroll" } } },
      },
    ]);
    expect(rels).not.toContain("smb://");
    expect(warnings.join(" ")).toMatch(/Refused a smb: link/);
  }, 120_000);

  it("reports a link with nothing for a screen reader to announce", async () => {
    const output = path.join(workspace, "unlabelled.pptx");
    const result = await new SlideAgent().create({
      command: "create",
      outline: outlineWith([
        {
          id: "hotspot", type: "shape", shape: "rect", x: 1, y: 2, w: 3, h: 1,
          style: { fill: "224466" },
          link: "https://example.com",
        },
      ]),
      output,
      render: false,
      validate: true,
      autoFix: false,
    });
    expect(result.validation?.issues.map((issue) => issue.code)).toContain("unlabelled-link");
  }, 120_000);
});
