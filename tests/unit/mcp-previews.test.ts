import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { previewImagePaths } from "../../src/mcp-server.js";
import {
  deliverPreviews,
  previewNote,
  resolveSelection,
  selectPreviews,
  PREVIEW_TIERS,
} from "../../src/rendering/preview-delivery.js";
import { encodePng } from "../../src/rendering/png.js";
import { previewFilesIn } from "../../src/rendering/text-extraction.js";
import { estimateImageTokens } from "../../src/evaluation/token-budget.js";
import type { AgentResult } from "../../src/types/index.js";

let workspace: string | undefined;

afterEach(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

function result(files: { artifacts?: string[]; generatedFiles?: string[]; changedSlides?: number[] }): AgentResult {
  return {
    status: "success",
    generatedFiles: files.generatedFiles ?? [],
    ...(files.artifacts ? { artifacts: files.artifacts } : {}),
    ...(files.changedSlides ? { changedSlides: files.changedSlides } : {}),
    slideCount: 0,
    warnings: [],
    errors: [],
    metadata: { command: "render", requestId: "test", startedAt: "", completedAt: "", durationMs: 0, version: "test", retries: 0 },
  };
}

/** A slide-shaped render, so resizing and tiling have something real to do. */
function slidePng(width = 1600, height = 900): Buffer {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 240; pixels[index + 1] = 240; pixels[index + 2] = 245; pixels[index + 3] = 255;
  }
  return Buffer.from(encodePng({ width, height, pixels }));
}

async function writePreviews(count: number, bytes = slidePng(160, 90)): Promise<string[]> {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-previews-"));
  const files: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const file = path.join(workspace, `slide-${index}.png`);
    await writeFile(file, bytes);
    files.push(file);
  }
  return files;
}

describe("MCP slide previews", () => {
  it("orders previews by slide number rather than by string", async () => {
    const files = await writePreviews(11);
    const ordered = previewImagePaths(result({ generatedFiles: [...files].reverse() }));
    expect(ordered.map((file) => path.basename(file))).toEqual([
      "slide-1.png", "slide-2.png", "slide-3.png", "slide-4.png", "slide-5.png", "slide-6.png",
      "slide-7.png", "slide-8.png", "slide-9.png", "slide-10.png", "slide-11.png",
    ]);
  });

  it("reads previews from artifacts and generatedFiles, ignoring other files", async () => {
    const files = await writePreviews(2);
    const paths = previewImagePaths(result({
      artifacts: [files[0]!, path.join(workspace!, "report.json")],
      generatedFiles: [files[1]!, path.join(workspace!, "deck.pptx")],
    }));
    expect(paths).toHaveLength(2);
  });

  it("returns base64 PNG image content a host can display", async () => {
    const files = await writePreviews(2);
    const delivered = await deliverPreviews(files);
    expect(delivered.omitted).toBe(0);
    expect(delivered.images).toHaveLength(2);
    expect(delivered.images[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(Buffer.from(delivered.images[0]!.data, "base64").subarray(1, 4).toString()).toBe("PNG");
  });

  it("caps how many previews a long deck returns and says how many it withheld", async () => {
    const files = await writePreviews(25);
    const delivered = await deliverPreviews(files);
    expect(delivered.images).toHaveLength(20);
    expect(delivered.omitted).toBe(5);
  });

  it("reports nothing rather than throwing when a preview has been deleted", async () => {
    const files = await writePreviews(1);
    await rm(files[0]!);
    const delivered = await deliverPreviews(files);
    expect(delivered.images).toHaveLength(0);
    expect(delivered.omitted).toBe(1);
  });
});

describe("preview selection", () => {
  it("returns only the slides a command reports as changed", async () => {
    const files = await writePreviews(6);
    const chosen = selectPreviews({ previews: files, selection: "changed", changed: [2, 5] });
    expect(chosen.files.map((file) => path.basename(file))).toEqual(["slide-2.png", "slide-5.png"]);
    expect(chosen.degradedFrom).toBeUndefined();
  });

  it("returns everything and says so when a command cannot know what changed", async () => {
    const files = await writePreviews(4);
    const chosen = selectPreviews({ previews: files, selection: "changed" });
    // Silently returning nothing would read as "nothing to see", which is a
    // different claim from "this command cannot tell you".
    expect(chosen.files).toHaveLength(4);
    expect(chosen.degradedFrom).toBe("changed");
  });

  it("honours an explicit slide list", async () => {
    const files = await writePreviews(6);
    const chosen = selectPreviews({ previews: files, selection: [4, 1] });
    expect(chosen.files.map((file) => path.basename(file))).toEqual(["slide-1.png", "slide-4.png"]);
  });

  it("returns nothing for none, and everything for all", async () => {
    const files = await writePreviews(3);
    expect(selectPreviews({ previews: files, selection: "none" }).files).toHaveLength(0);
    expect(selectPreviews({ previews: files, selection: "all" }).files).toHaveLength(3);
  });

  it("keeps includeImages working with its old meaning", () => {
    expect(resolveSelection(undefined, true, "changed")).toBe("all");
    expect(resolveSelection(undefined, false, "all")).toBe("none");
    expect(resolveSelection(undefined, undefined, "changed")).toBe("changed");
    // An explicit `images` wins: a caller that names both meant the new one.
    expect(resolveSelection("none", true, "all")).toBe("none");
  });
});

describe("preview resolution tiers", () => {
  it("delivers the review tier at half the token cost of full detail", async () => {
    const files = await writePreviews(1, slidePng(1600, 900));
    const review = await deliverPreviews(files, { detail: "review" });
    const full = await deliverPreviews(files, { detail: "full" });

    expect(review.sizes[0]!.width).toBe(PREVIEW_TIERS.review);
    expect(full.sizes[0]!.width).toBe(PREVIEW_TIERS.full);
    const reviewTokens = estimateImageTokens(review.sizes[0]!.width, review.sizes[0]!.height);
    const fullTokens = estimateImageTokens(full.sizes[0]!.width, full.sizes[0]!.height);
    expect(reviewTokens).toBeLessThan(fullTokens * 0.55);
  });

  it("never enlarges a preview that is already smaller than the tier", async () => {
    const files = await writePreviews(1, slidePng(640, 360));
    const delivered = await deliverPreviews(files, { detail: "full" });
    expect(delivered.sizes[0]).toEqual({ width: 640, height: 360 });
  });

  it("composes one contact sheet instead of one image per slide", async () => {
    const files = await writePreviews(8, slidePng(1600, 900));
    const sheet = await deliverPreviews(files, { overview: true });
    expect(sheet.overview).toBe(true);
    expect(sheet.images).toHaveLength(1);
    expect(sheet.slides).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // The whole point of the sheet is that it does not scale with slide count
    // the way separate images do, so the assertion is on the ratio.
    const separate = await deliverPreviews(files, { detail: "review" });
    const sheetTokens = estimateImageTokens(sheet.sizes[0]!.width, sheet.sizes[0]!.height);
    const separateTokens = separate.sizes.reduce((sum, size) => sum + estimateImageTokens(size.width, size.height), 0);
    expect(sheetTokens).toBeLessThan(separateTokens / 3);
  });

  it("returns a single slide as an image rather than a one-cell sheet", async () => {
    const files = await writePreviews(1, slidePng(1600, 900));
    const delivered = await deliverPreviews(files, { overview: true });
    expect(delivered.overview).toBe(false);
    expect(delivered.sizes[0]!.width).toBe(PREVIEW_TIERS.review);
  });

  it("passes schematic SVG previews through untouched", async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-previews-"));
    const file = path.join(workspace, "slide-1.svg");
    await writeFile(file, "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const delivered = await deliverPreviews([file]);
    expect(delivered.images[0]!.mimeType).toBe("image/svg+xml");
  });
});

describe("preview notes", () => {
  it("names the cheaper and richer options with real numbers", async () => {
    const files = await writePreviews(12, slidePng(1600, 900));
    const chosen = selectPreviews({ previews: files, selection: "changed", changed: [3] });
    const delivered = await deliverPreviews(chosen.files);
    const note = previewNote(delivered, { totalPreviews: 12, detail: "review", selection: "changed" });

    expect(note).toContain("1 of 12");
    expect(note).toContain('images:"all"');
    expect(note).toMatch(/[\d,]+ tokens/);
  });

  it("says when it fell back to returning everything", async () => {
    const files = await writePreviews(3);
    const delivered = await deliverPreviews(files);
    const note = previewNote(delivered, {
      totalPreviews: 3,
      detail: "review",
      selection: "changed",
      degradedFrom: "changed",
    });
    expect(note).toContain("could not determine which slides changed");
  });
});

describe("preview discovery", () => {
  it("finds the schematic SVGs drawn when LibreOffice is absent", async () => {
    // This matched `.png` only for as long as its sole caller was OCR, which
    // cannot read an SVG anyway. The review packet then started using the same
    // list to decide what to show, and on a machine without LibreOffice every
    // slide reported no preview at all — a reviewer handed nothing to look at
    // rather than the schematic the deck did have.
    workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-previews-"));
    for (const name of ["slide-1.svg", "slide-2.svg", "notes.txt"]) {
      await writeFile(path.join(workspace, name), "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    }
    const found = await previewFilesIn(workspace);
    expect(found.map((file) => path.basename(file))).toEqual(["slide-1.svg", "slide-2.svg"]);
  });

  it("orders a mixed directory by slide number, not by extension", async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-previews-"));
    await writeFile(path.join(workspace, "slide-10.png"), slidePng(16, 9));
    await writeFile(path.join(workspace, "slide-2.svg"), "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const found = await previewFilesIn(workspace);
    expect(found.map((file) => path.basename(file))).toEqual(["slide-2.svg", "slide-10.png"]);
  });
});
