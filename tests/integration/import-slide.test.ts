import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import type { PresentationOutline, SlideSpec } from "../../src/types/index.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-import-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function outline(title: string, slides: SlideSpec[]): PresentationOutline {
  return {
    brief: {
      title,
      audience: "Leadership",
      objective: "Decide",
      presentationType: "business",
      tone: "direct",
      visualDirection: "clean",
      slideCount: slides.length,
      language: "en",
      outputRequirements: [],
      keyTopics: [title],
      sourcePrompt: title,
    },
    narrative: title,
    slides,
  };
}

async function build(name: string, deck: PresentationOutline): Promise<string> {
  const output = path.join(workspace, `${name}.pptx`);
  const result = await new SlideAgent().create({ command: "create", outline: deck, output, render: false, validate: false });
  expect(result.status).not.toBe("error");
  return output;
}

async function slideTexts(deck: string): Promise<string[][]> {
  const zip = await JSZip.loadAsync(await readFile(deck));
  const names = Object.keys(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/.test(file));
  const presentation = await zip.file("ppt/presentation.xml")!.async("string");
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string");
  const order = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((match) => {
    const target = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${match[1]}"[^>]*Target="([^"]+)"`))?.[1];
    return `ppt/${target?.replace(/^\.\//, "")}`;
  });
  expect(order.every((file) => names.includes(file))).toBe(true);
  return Promise.all(order.map(async (file) => {
    const xml = await zip.file(file)!.async("string");
    return [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]!);
  }));
}

describe("cross-deck slide import", () => {
  it("copies a slide from another deck into a chosen position", async () => {
    const source = await build("source", outline("Source deck", [
      { id: "s1", kind: "title", title: "Source deck" },
      { id: "s2", kind: "content", title: "Borrowed slide", bullets: ["A point worth reusing", "And a second one"] },
    ]));
    const destination = await build("destination", outline("Destination deck", [
      { id: "d1", kind: "title", title: "Destination deck" },
      { id: "d2", kind: "closing", title: "Decide" },
    ]));

    const output = path.join(workspace, "merged.pptx");
    const result = await new SlideAgent().execute({
      command: "edit",
      input: destination,
      output,
      operations: [{ type: "import-slide", source, slide: 2, insertAt: 2 }],
      render: false,
      validate: true,
    });

    expect(result.status).not.toBe("error");
    expect(result.slideCount).toBe(3);
    const texts = await slideTexts(output);
    expect(texts).toHaveLength(3);
    expect(texts[1]!.join(" ")).toContain("Borrowed slide");
    expect(texts[1]!.join(" ")).toContain("A point worth reusing");
    expect(texts[0]!.join(" ")).toContain("Destination deck");
  }, 180_000);

  it("applies replacements to the imported copy only", async () => {
    const source = await build("source", outline("Source deck", [
      { id: "s1", kind: "content", title: "Atlas rollout", bullets: ["Atlas ships in March"] },
    ]));
    const destination = await build("destination", outline("Destination deck", [
      { id: "d1", kind: "title", title: "Destination deck" },
    ]));

    const output = path.join(workspace, "renamed.pptx");
    const result = await new SlideAgent().execute({
      command: "edit",
      input: destination,
      output,
      operations: [{ type: "import-slide", source, slide: 1, replacements: [{ find: "Atlas", replace: "Atlas Pro" }] }],
      render: false,
      validate: false,
    });
    expect(result.status).not.toBe("error");
    const texts = await slideTexts(output);
    expect(texts[1]!.join(" ")).toContain("Atlas Pro");
    expect(texts[1]!.join(" ")).not.toMatch(/Atlas(?! Pro)/);
  }, 180_000);

  it("carries a chart and its embedded workbook across", async () => {
    const source = await build("charted", outline("Charted", [{
      id: "c1",
      kind: "chart",
      title: "Revenue",
      chart: { kind: "bar", labels: ["Q1", "Q2", "Q3"], series: [{ name: "Revenue", values: [10, 14, 19] }] },
    }]));
    const destination = await build("plain", outline("Plain", [{ id: "p1", kind: "title", title: "Plain" }]));

    const output = path.join(workspace, "with-chart.pptx");
    const result = await new SlideAgent().execute({
      command: "edit",
      input: destination,
      output,
      operations: [{ type: "import-slide", source, slide: 1 }],
      render: false,
      validate: true,
    });
    expect(result.status).not.toBe("error");

    const zip = await JSZip.loadAsync(await readFile(output));
    const charts = Object.keys(zip.files).filter((file) => /^ppt\/charts\/chart\d+\.xml$/.test(file));
    expect(charts).toHaveLength(1);
    const embedded = Object.keys(zip.files).filter((file) => /^ppt\/embeddings\/.+\.xlsx$/.test(file));
    expect(embedded.length).toBeGreaterThan(0);
    // The chart's own relationship must point at the copied workbook.
    const chartRels = await zip.file(`ppt/charts/_rels/${path.basename(charts[0]!)}.rels`)!.async("string");
    expect(chartRels).toContain(path.basename(embedded[0]!));
  }, 180_000);

  it("refuses to import a slide that does not exist", async () => {
    const source = await build("source", outline("Source", [{ id: "s1", kind: "title", title: "Source" }]));
    const destination = await build("destination", outline("Destination", [{ id: "d1", kind: "title", title: "Destination" }]));

    const result = await new SlideAgent().execute({
      command: "edit",
      input: destination,
      output: path.join(workspace, "nope.pptx"),
      operations: [{ type: "import-slide", source, slide: 7 }],
      render: false,
      validate: false,
    });
    expect(result.status).toBe("error");
    expect(result.errors[0]?.message).toMatch(/has 1 slides/);
  }, 180_000);
});
