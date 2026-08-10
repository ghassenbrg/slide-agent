import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { outputLayout } from "../../src/output/output-layout.js";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import type { PresentationOutline } from "../../src/types/index.js";

let workspace: string;
const previousEpoch = process.env.SOURCE_DATE_EPOCH;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-reproducible-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
  if (previousEpoch === undefined) delete process.env.SOURCE_DATE_EPOCH;
  else process.env.SOURCE_DATE_EPOCH = previousEpoch;
});

const outline: PresentationOutline = {
  brief: {
    title: "Zero-trust migration",
    audience: "Engineering leadership",
    objective: "Approve the ninety-day rollout",
    tone: "direct",
    presentationType: "business",
    visualDirection: "clean",
    slideCount: 3,
    language: "en",
    outputRequirements: [],
    keyTopics: ["standing access", "break-glass"],
    sourcePrompt: "zero-trust migration board deck",
  },
  narrative: "Standing access is the risk; ninety days removes it.",
  slides: [
    { id: "opening", kind: "title", title: "Zero-trust migration", subtitle: "Ninety days to standing-access zero" },
    { id: "state", kind: "content", title: "Where we are", bullets: ["Standing access on twelve systems", "No break-glass audit trail"] },
    { id: "close", kind: "closing", title: "Approve the rollout", bullets: ["Fund two engineers", "Start on the first of the month"] },
  ],
};

async function build(name: string): Promise<string> {
  const output = path.join(workspace, `${name}.pptx`);
  const result = await new SlideAgent().create({
    command: "create",
    outline,
    output,
    render: false,
    validate: false,
  });
  expect(result.status).not.toBe("error");
  return output;
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

describe("reproducible builds", () => {
  it("produces byte-identical packages for the same input under SOURCE_DATE_EPOCH", async () => {
    process.env.SOURCE_DATE_EPOCH = "1700000000";
    const first = await build("first");
    const second = await build("second");
    expect(await sha256(first)).toBe(await sha256(second));
  }, 120_000);

  it("stamps every entry and the core properties with the pinned time", async () => {
    process.env.SOURCE_DATE_EPOCH = "1700000000";
    const deck = await build("stamped");
    const zip = await JSZip.loadAsync(await readFile(deck));

    const expected = new Date(1_700_000_000 * 1000);
    for (const entry of Object.values(zip.files)) {
      // Zip stores DOS time at two-second resolution.
      expect(Math.abs(entry.date.getTime() - expected.getTime())).toBeLessThanOrEqual(2000);
    }

    const core = await zip.file("docProps/core.xml")?.async("string");
    expect(core).toContain("2023-11-14T22:13:20Z");
  }, 120_000);

  it("records the pinned time in the manifest rather than the wall clock", async () => {
    process.env.SOURCE_DATE_EPOCH = "1700000000";
    await build("manifest");
    const manifest = JSON.parse(await readFile(
      outputLayout(path.join(workspace, "manifest.pptx")).manifest,
      "utf8",
    ).catch(async () => {
      // The manifest is named after the deck; find it rather than guess.
      const { readdir } = await import("node:fs/promises");
      const directory = outputLayout(path.join(workspace, "manifest.pptx")).artifacts;
      const found = (await readdir(directory)).find((file) => file.endsWith(".manifest.json"))!;
      return readFile(path.join(directory, found), "utf8");
    })) as { createdAt: string };
    expect(manifest.createdAt).toBe("2023-11-14T22:13:20.000Z");
  }, 120_000);

  it("stamps the real time when the build is not pinned", async () => {
    delete process.env.SOURCE_DATE_EPOCH;
    const before = Date.now();
    const deck = await build("unpinned");
    const zip = await JSZip.loadAsync(await readFile(deck));
    const entry = Object.values(zip.files)[0]!;
    expect(entry.date.getTime()).toBeGreaterThanOrEqual(before - 4000);
  }, 120_000);
});
