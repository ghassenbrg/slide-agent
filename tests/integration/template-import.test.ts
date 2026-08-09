import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { brandKitFromTemplate } from "../../src/design/template.js";
import { SlideAgent } from "../../src/pipeline.js";
import type { PresentationOutline } from "../../src/types/index.js";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-template-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const CORPORATE: PresentationOutline = {
  brief: {
    title: "House style",
    audience: "Everyone",
    objective: "Establish the theme",
    presentationType: "business",
    tone: "formal",
    visualDirection: "restrained",
    slideCount: 1,
    language: "en",
    outputRequirements: [],
    keyTopics: ["house style"],
    sourcePrompt: "house style",
  },
  narrative: "The house style.",
  creativeDirection: {
    name: "House",
    palette: { background: "F4F1EA", ink: "12121C", accent: "8A1F2B", accentAlt: "1B4B8F" },
    typography: { display: "Georgia", heading: "Georgia", body: "Verdana" },
  },
  slides: [{ id: "one", kind: "title", title: "House style" }],
};

async function buildTemplate(): Promise<string> {
  const output = path.join(workspace, "corporate.pptx");
  const result = await new SlideAgent().create({ command: "create", outline: CORPORATE, output, render: false, validate: false });
  expect(result.status).not.toBe("error");
  return output;
}

describe("importing an organisation's template", () => {
  it("derives a locked brand kit from a real package's theme", async () => {
    const kit = await brandKitFromTemplate(await buildTemplate());

    expect(kit.palette?.background?.toUpperCase()).toBe("F4F1EA");
    expect(kit.palette?.ink?.toUpperCase()).toBe("12121C");
    expect(kit.palette?.accent?.toUpperCase()).toBe("8A1F2B");
    expect(kit.typography?.heading).toBe("Georgia");
    expect(kit.typography?.body).toBe("Verdana");
    // A mandated template is a constraint, so both aspects lock by default.
    expect(kit.locked).toEqual(["palette", "typography"]);
  }, 120_000);

  it("builds a deck through the template so the theme actually reaches the slides", async () => {
    const template = await buildTemplate();
    const output = path.join(workspace, "on-brand.pptx");
    const result = await new SlideAgent().create({
      command: "create",
      // The model asks for something else entirely; the locked kit overrules it.
      outline: {
        ...CORPORATE,
        creativeDirection: { name: "Loud", palette: { background: "120014", ink: "FFFFFF", accent: "00FFAA" } },
        slides: [{ id: "one", kind: "title", title: "On brand" }],
      },
      brand: template,
      output,
      render: false,
      validate: false,
    });
    expect(result.status).not.toBe("error");

    // Reading the built deck back as a template is the round trip that proves
    // the kit reached the package rather than only the request object.
    const applied = await brandKitFromTemplate(output);
    expect(applied.palette?.background?.toUpperCase()).toBe("F4F1EA");
    expect(applied.palette?.accent?.toUpperCase()).toBe("8A1F2B");
    expect(applied.palette?.accent?.toUpperCase()).not.toBe("00FFAA");
  }, 120_000);

  it("names the file when it is not a PowerPoint package", async () => {
    await expect(brandKitFromTemplate(path.join(workspace, "missing.potx")))
      .rejects.toThrow(/Template not found/);
  }, 120_000);

  it("lets a caller unlock what the organisation does not actually mandate", async () => {
    const kit = await brandKitFromTemplate(await buildTemplate(), { locked: ["palette"], name: "Just the colours" });
    expect(kit.name).toBe("Just the colours");
    expect(kit.locked).toEqual(["palette"]);
  }, 120_000);
});
