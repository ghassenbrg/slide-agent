import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { outputLayout } from "../../src/output/output-layout.js";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ImageResolver } from "../../src/images/image-manager.js";
import { silentLogger } from "../../src/logging/logger.js";
import { SlideAgent } from "../../src/pipeline.js";
import type { CanvasElementSpec, PresentationOutline } from "../../src/types/index.js";

let workspace: string;
let picture: string;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-provenance-"));
  picture = path.join(workspace, "photo.png");
  await writeFile(picture, PNG);
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** Stands in for a host that can fetch or generate, so URLs resolve locally. */
const provider: ImageResolver = {
  id: "test-provider",
  async resolve() {
    return picture;
  },
};

function outline(canvas: CanvasElementSpec[]): PresentationOutline {
  return {
    brief: {
      title: "Credited deck",
      audience: "Reviewers",
      objective: "Attribute the imagery",
      presentationType: "business",
      tone: "plain",
      visualDirection: "plain",
      slideCount: 1,
      language: "en",
      outputRequirements: [],
      keyTopics: ["imagery"],
      sourcePrompt: "imagery",
    },
    narrative: "One slide.",
    slides: [{ id: "one", kind: "custom", title: "Credited deck", canvas }],
  };
}

async function build(canvas: CanvasElementSpec[], validate = false) {
  const output = path.join(workspace, `${Math.random().toString(36).slice(2)}.pptx`);
  const result = await new SlideAgent(silentLogger, { assets: provider }).create({
    command: "create",
    outline: outline(canvas),
    output,
    render: false,
    validate,
  });
  return { result, output };
}

async function notes(deck: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(deck));
  const part = Object.keys(zip.files).find((file) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(file));
  const xml = part ? await zip.file(part)!.async("string") : "";
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => match[1]!).join("\n");
}

describe("image provenance", () => {
  it("writes the required attribution into the deck, not just the request", async () => {
    // A licence that requires a credit is not satisfied by a credit sitting in
    // a JSON file on the author's laptop.
    const { output, result } = await build([{
      id: "site", type: "image", x: 1, y: 1, w: 4, h: 3,
      path: "https://images.example.com/turbines.jpg",
      alt: "Six turbines on a ridge at first light",
      provenance: { credit: "Photo by A. Name on Unsplash", license: "Unsplash License" },
    }]);
    expect(result.status).not.toBe("error");

    const speaker = await notes(output);
    expect(speaker).toContain("[Credits]");
    expect(speaker).toContain("Photo by A. Name on Unsplash");
    expect(speaker).toContain("Unsplash License");
    expect(speaker).toContain("https://images.example.com/turbines.jpg");
  }, 120_000);

  it("keeps the origin in the manifest rather than only a cache path", async () => {
    const { output } = await build([{
      id: "site", type: "image", x: 1, y: 1, w: 4, h: 3,
      path: "https://images.example.com/turbines.jpg",
      alt: "Turbines",
      provenance: { credit: "A. Name" },
    }]);
    const manifest = JSON.parse(await readFile(
      outputLayout(output).manifest,
      "utf8",
    )) as { slides: Array<{ elements: Array<{ imageSource?: string; provenance?: { credit?: string } }> }> };
    const image = manifest.slides[0]!.elements.find((element) => element.imageSource);
    expect(image?.imageSource).toBe("https://images.example.com/turbines.jpg");
    expect(image?.provenance?.credit).toBe("A. Name");
  }, 120_000);

  it("reports a web image with no credit and no licence", async () => {
    const { result } = await build([{
      id: "site", type: "image", x: 1, y: 1, w: 4, h: 3,
      path: "https://images.example.com/turbines.jpg",
      alt: "Turbines",
    }], true);
    const issue = result.validation?.issues.find((entry) => entry.code === "image-missing-credit");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("warning");
  }, 120_000);

  it("does not ask for a credit on the author's own local file", async () => {
    const { result } = await build([{
      id: "shot", type: "image", x: 1, y: 1, w: 4, h: 3, path: picture, alt: "A screenshot of the console",
    }], true);
    expect(result.validation?.issues.map((entry) => entry.code)).not.toContain("image-missing-credit");
  }, 120_000);

  it("discloses a generated image in the deck and flags it for review", async () => {
    const { output, result } = await build([{
      id: "concept", type: "image", x: 1, y: 1, w: 4, h: 3,
      path: picture,
      alt: "An abstract rendering of three streams merging",
      provenance: { generated: true, generator: "an image model", source: "three streams merging, editorial illustration" },
    }], true);

    expect(await notes(output)).toContain("generated image (an image model)");
    const issue = result.validation?.issues.find((entry) => entry.code === "generated-image");
    expect(issue?.severity).toBe("info");
    expect(issue?.message).toContain("photograph of something real");
  }, 120_000);

  it("round-trips provenance through the deck's own scene", async () => {
    const { output } = await build([{
      id: "site", type: "image", x: 1, y: 1, w: 4, h: 3,
      path: "https://images.example.com/turbines.jpg",
      alt: "Turbines",
      provenance: { credit: "A. Name", license: "CC BY 4.0" },
    }]);
    const scene = await readFile(
      outputLayout(output).inspect,
      "utf8",
    );
    expect(scene).toContain("CC BY 4.0");
  }, 120_000);
});
