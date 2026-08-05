import { readdir } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";

const root = path.resolve(import.meta.dirname, "../..");
const scenesDir = path.join(root, "examples", "scenes");
let workspace: string;
let scenes: string[];

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-examples-"));
  scenes = (await readdir(scenesDir)).filter((name) => name.endsWith(".ndjson"));
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

describe("example scenes", () => {
  it("ships at least one", () => {
    expect(scenes.length).toBeGreaterThan(0);
  });

  it("builds every example cleanly and to a presentable standard", async () => {
    for (const scene of scenes) {
      const result = await new SlideAgent(silentLogger).create({
        command: "create",
        scene: path.join(scenesDir, scene),
        output: path.join(workspace, scene.replace(/\.ndjson$/, ".pptx")),
        configDir: path.join(root, "config"),
        validate: true,
      });

      // An example that only just validates is not an example worth shipping:
      // these are what a model reads to learn what good output looks like.
      expect(result.status, `${scene}: ${JSON.stringify(result.errors)}`).not.toBe("error");
      expect(result.validation?.issues.filter((issue) => issue.severity === "error"), scene).toEqual([]);
      expect(result.metadata.provenance, scene).toBe("model-authored");

      const quality = result.validation?.quality;
      expect(quality, scene).toBeDefined();
      expect(quality!.band, `${scene} scored ${quality!.overall}`).not.toBe("weak");
      expect(quality!.overall, scene).toBeGreaterThanOrEqual(70);

      // No example may ship with unresolved placeholders in it.
      const evidence = quality!.dimensions.find((dimension) => dimension.id === "evidence")!;
      expect(evidence.summary, scene).not.toContain("placeholder");
    }
  });

  it("round-trips every example through its own blueprint", async () => {
    for (const scene of scenes) {
      const first = path.join(workspace, `rt-${scene.replace(/\.ndjson$/, "")}.pptx`);
      const built = await new SlideAgent(silentLogger).create({
        command: "create",
        scene: path.join(scenesDir, scene),
        output: first,
        configDir: path.join(root, "config"),
        validate: false,
      });
      expect(built.status, scene).not.toBe("error");

      const { outputLayout } = await import("../../src/output/output-layout.js");
      const rebuilt = await new SlideAgent(silentLogger).create({
        command: "create",
        scene: outputLayout(first).inspect,
        output: path.join(workspace, `rt2-${scene.replace(/\.ndjson$/, "")}.pptx`),
        configDir: path.join(root, "config"),
        validate: false,
      });
      expect(rebuilt.status, scene).not.toBe("error");
      expect(rebuilt.slideCount, scene).toBe(built.slideCount);
    }
  });
});
