import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { previewImageContent, previewImagePaths } from "../../src/mcp-server.js";
import type { AgentResult } from "../../src/types/index.js";

let workspace: string | undefined;

afterEach(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

function result(files: { artifacts?: string[]; generatedFiles?: string[] }): AgentResult {
  return {
    status: "success",
    generatedFiles: files.generatedFiles ?? [],
    ...(files.artifacts ? { artifacts: files.artifacts } : {}),
    slideCount: 0,
    warnings: [],
    errors: [],
    metadata: { command: "render", requestId: "test", startedAt: "", completedAt: "", durationMs: 0, version: "test", retries: 0 },
  };
}

/** A one-pixel PNG: enough bytes to be read, small enough to keep a test fast. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function writePreviews(count: number): Promise<string[]> {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-previews-"));
  const files: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const file = path.join(workspace, `slide-${index}.png`);
    await writeFile(file, PNG);
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
    const { images, omitted } = await previewImageContent(result({ generatedFiles: files }));
    expect(omitted).toBe(0);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(Buffer.from(images[0]!.data, "base64")).toEqual(PNG);
  });

  it("caps how many previews a long deck returns and says how many it withheld", async () => {
    const files = await writePreviews(5);
    const { images, omitted } = await previewImageContent(
      result({ generatedFiles: files }),
      { maximumImages: 3, maximumTotalBytes: 1024 * 1024 },
    );
    expect(images).toHaveLength(3);
    expect(omitted).toBe(2);
  });

  it("stops before exceeding the byte budget instead of returning a huge payload", async () => {
    const files = await writePreviews(4);
    const { images, omitted } = await previewImageContent(
      result({ generatedFiles: files }),
      { maximumImages: 10, maximumTotalBytes: PNG.byteLength * 2 },
    );
    expect(images).toHaveLength(2);
    expect(omitted).toBe(2);
  });

  it("reports nothing rather than throwing when a preview has been deleted", async () => {
    const files = await writePreviews(1);
    await rm(files[0]!);
    const { images, omitted } = await previewImageContent(result({ generatedFiles: files }));
    expect(images).toHaveLength(0);
    expect(omitted).toBe(1);
  });
});
