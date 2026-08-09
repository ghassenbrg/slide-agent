import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExtensionRegistry, type DiagramGrammar, type QualityCheck } from "../../src/extensions.js";
import type { ImageResolver } from "../../src/images/image-manager.js";
import { silentLogger } from "../../src/logging/logger.js";
import { SlideAgent } from "../../src/pipeline.js";
import type { CanvasElementSpec, PresentationOutline } from "../../src/types/index.js";

let workspace: string;

/** A one-pixel PNG, enough to be a real embeddable image. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-extensions-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function outline(canvas: CanvasElementSpec[]): PresentationOutline {
  return {
    brief: {
      title: "Extended deck",
      audience: "Hosts",
      objective: "Prove extensions take effect",
      presentationType: "technical",
      tone: "plain",
      visualDirection: "plain",
      slideCount: 1,
      language: "en",
      outputRequirements: [],
      keyTopics: ["extensions"],
      sourcePrompt: "extensions",
    },
    narrative: "One slide.",
    slides: [{ id: "one", kind: "custom", title: "Extended deck", canvas }],
  };
}

async function build(agent: SlideAgent, canvas: CanvasElementSpec[], validate = false) {
  const output = path.join(workspace, `${Math.random().toString(36).slice(2)}.pptx`);
  const result = await agent.create({ command: "create", outline: outline(canvas), output, render: false, validate });
  return { result, output };
}

describe("host extensions actually take effect", () => {
  it("uses a host diagram grammar in place of the built-in dispatch", async () => {
    // The registry was published and documented but never read, so a host
    // could follow docs/api.md exactly and have nothing happen.
    const houseGrammar: DiagramGrammar<{ nodes: string[] }> = {
      id: "house-flow",
      description: "Our standard process notation",
      render(writer, spec, frame) {
        spec.nodes.forEach((node, index) => {
          writer.addText(`house-${index}`, node, { ...frame, h: 0.4, y: frame.y + index * 0.5 }, { fontSize: 14 });
        });
      },
    };

    const agent = new SlideAgent(silentLogger, { diagrams: [houseGrammar] });
    const { output } = await build(agent, [
      { id: "flow", type: "diagram", x: 1, y: 1, w: 6, h: 3, grammar: "house-flow", spec: { nodes: ["Intake", "Triage", "Ship"] } },
    ]);

    const zip = await JSZip.loadAsync(await readFile(output));
    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain("Intake");
    expect(slide).toContain("Triage");
  }, 120_000);

  it("still rejects a grammar nobody registered, naming what is available", async () => {
    const agent = new SlideAgent(silentLogger);
    const { result } = await build(agent, [
      { id: "flow", type: "diagram", x: 1, y: 1, w: 6, h: 3, grammar: "no-such-grammar", spec: {} },
    ]);
    expect(result.status).toBe("error");
    expect(result.errors[0]?.message).toMatch(/swimlane/);
  }, 120_000);

  it("runs a host quality check as part of validation", async () => {
    const legalFooter: QualityCheck = {
      id: "legal-footer",
      description: "Every slide carries the confidentiality line",
      run(manifest) {
        return manifest.slides.map((slide) => ({
          code: "missing-legal-footer",
          severity: "error" as const,
          message: `Slide ${slide.number} has no legal footer.`,
          slide: slide.number,
          fixable: false,
        }));
      },
    };

    const agent = new SlideAgent(silentLogger, { checks: [legalFooter] });
    const { result } = await build(agent, [
      { id: "t", type: "text", x: 1, y: 1, w: 6, h: 1, text: "Extended deck" },
    ], true);
    expect(result.validation?.issues.map((issue) => issue.code)).toContain("missing-legal-footer");
  }, 120_000);

  it("routes image resolution through a host provider", async () => {
    // This is the seam a stock-photo service or an image generator plugs into.
    const generated = path.join(workspace, "generated.png");
    await writeFile(generated, PNG);
    const resolved: string[] = [];
    const provider: ImageResolver = {
      id: "test-image-service",
      async resolve(source) {
        resolved.push(source);
        return generated;
      },
    };

    const agent = new SlideAgent(silentLogger, { assets: provider });
    expect(agent.capabilities().images.provider).toBe("test-image-service");

    const { result } = await build(agent, [
      { id: "photo", type: "image", x: 1, y: 1, w: 4, h: 3, path: "generate: a wind farm at dusk", alt: "A wind farm at dusk" },
    ]);
    expect(result.status).not.toBe("error");
    // The built-in resolver would have refused this as an unsupported scheme.
    expect(resolved).toEqual(["generate: a wind farm at dusk"]);
  }, 120_000);
});

describe("capabilities", () => {
  it("reports built-ins, not only host contributions", () => {
    const capabilities = new ExtensionRegistry().capabilities();
    expect(capabilities.diagrams.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["layered", "swimlane", "sequence", "hierarchy", "quadrant"]),
    );
    expect(capabilities.layouts).toEqual(expect.arrayContaining(["title", "chart", "quote"]));
    expect(capabilities.charts[0]?.kinds).toEqual(expect.arrayContaining(["bar", "scatter", "waterfall"]));
  });

  it("says plainly how a picture can reach a slide", () => {
    const { images } = new ExtensionRegistry().capabilities();
    expect(images.localPaths).toBe(true);
    // Nothing installed and remote assets off: this installation cannot obtain
    // an image at all, which a model needs to know before designing for one.
    expect(images.remoteUrls).toBe(false);
    expect(images.provider).toBeNull();
    expect(images.formats).toContain(".png");
  });
});
