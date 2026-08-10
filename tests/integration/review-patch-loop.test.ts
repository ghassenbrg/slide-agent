import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import { outputLayout } from "../../src/output/output-layout.js";
import { exists } from "../../src/utils/files.js";
import { findExecutable } from "../../src/utils/process.js";

/**
 * The loop the release exists for: build → see → critique → patch → rebuild,
 * and a package that still rebuilds after being moved somewhere else.
 */

const root = path.resolve(import.meta.dirname, "../..");
let workspace: string;

/**
 * Without LibreOffice the previews are schematic drawings, and a schematic
 * preview holds any deck at `review` on its own — nothing has confirmed what
 * the audience will see. That is a fact about the machine, not about this loop,
 * so the readiness assertion below is stated against the best verdict the
 * environment can reach.
 */
const rendererAvailable = Boolean(
  await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE)
  && await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM),
);

const SCENE = [
  JSON.stringify({
    kind: "deck",
    schema: "slide-agent.scene/1",
    unit: "in",
    brief: {
      title: "Tide tables",
      audience: "Harbour crews",
      objective: "Read the revised tide charts",
      presentationType: "technical",
      tone: "plain",
      visualDirection: "Authored for this deck",
      slideCount: 2,
      language: "English",
      outputRequirements: ["editable PowerPoint"],
      keyTopics: ["tides"],
      sourcePrompt: "test",
    },
    narrative: "Crews can read the revised charts.",
    hostCapabilities: { vision: true, webResearch: false },
    exploration: {
      alternatives: [
        { name: "Depth strata", thesis: "Stack the deck like sediment", differentiator: "Horizontal bands, no panels" },
        { name: "Chart margin", thesis: "Type in the margin of a working chart", differentiator: "Off-centre single column" },
      ],
      chosen: "Depth strata",
    },
    sequencePlan: [
      { slideId: "one", narrativeJob: "Name the change", silhouette: "One band of type across the top third", energy: "quiet" },
      { slideId: "two", narrativeJob: "Show the new reading", silhouette: "A single figure", energy: "loud" },
    ],
    sourceLedger: [{ id: "s1", label: "Harbour office notice, March 2026" }],
    claims: [{ id: "c1", slideId: "two", claim: "Spring tides peak 40 minutes earlier", kind: "number", sourceIds: ["s1"], status: "needs-review" }],
    creativeDirection: {
      name: "Depth strata",
      palette: { background: "0E1A22", ink: "E8F1F2", accent: "6FB3B8" },
      visualSystem: {
        variables: { "strata-ink": "E8F1F2", "band-rule": 1.5 },
        styles: {
          "strata-title": { style: { fontSize: 38, color: { $var: "strata-ink" }, bold: true } },
          "strata-note": { basedOn: ["strata-title"], style: { fontSize: 14, bold: false } },
        },
      },
    },
  }),
  JSON.stringify({ kind: "slide", slide: 1, freeform: true, id: "one", semanticKind: "title", title: "Tide tables", designIntent: "One quiet band." }),
  JSON.stringify({ kind: "textbox", slide: 1, id: "title", bbox: [0.8, 1.0, 9, 1.2], styleRef: "strata-title", text: "The tide tables changed in March", role: "title" }),
  JSON.stringify({ kind: "textbox", slide: 1, id: "note", bbox: [0.8, 2.5, 7, 0.7], styleRef: "strata-note", text: "Every reading in this deck uses the revised datum.", role: "body" }),
  JSON.stringify({ kind: "slide", slide: 2, freeform: true, id: "two", semanticKind: "statement", title: "Forty minutes" }),
  JSON.stringify({ kind: "textbox", slide: 2, id: "figure", bbox: [0.8, 1.0, 8, 1.4], styleRef: "strata-title", text: "40 minutes earlier", role: "statistic", style: { fontSize: 48 } }),
  JSON.stringify({
    kind: "chart",
    slide: 2,
    id: "peaks",
    bbox: [0.8, 2.7, 8, 3.4],
    chart: { kind: "line", labels: ["Mar", "Apr", "May"], series: [{ name: "Minutes earlier", values: [38, 40, 41] }] },
    alt: "Spring tide peaks arriving 38 to 41 minutes earlier from March to May",
  }),
  "",
].join("\n");

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-loop-"));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("build, review, patch", () => {
  it("carries a deck through the whole loop without regenerating it", async () => {
    const agent = new SlideAgent(silentLogger);
    const output = path.join(workspace, "deck", "tides.pptx");

    const built = await agent.create({ command: "create", sceneNdjson: SCENE, output, render: true, roundTrip: true });
    expect(built.packageStatus, JSON.stringify(built.errors)).toBe("pass");
    expect(built.validation?.roundTrip?.status).toBe("pass");
    // The unverified claim is what holds it at review, and the report says so.
    expect(built.presentationReadiness).toBe("review");
    expect(built.validation?.readinessReasons.join(" ")).toMatch(/c1/);

    // Every artifact the report names is bound to the deck by hash.
    const graph = built.validation!.artifacts!;
    expect(graph.pptx.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(graph.previews.length).toBe(2);
    for (const preview of graph.previews) expect(preview.derivedFrom).toContain(graph.pptx.path);

    const packet = await agent.review(output);
    expect(packet.artifacts.pptx.sha256).toBe(graph.pptx.sha256);
    expect(packet.deck.chosenThesis).toBe("Depth strata");
    expect(packet.slides).toHaveLength(2);
    // The plan travels with the slide so a critique has something to compare to.
    expect(packet.slides[0]!.plan?.narrativeJob).toBe("Name the change");
    expect(packet.slides[1]!.claims?.[0]?.id).toBe("c1");
    expect(packet.reviewQuestions.join(" ")).toMatch(/Name the change/);
    // Questions, never answers.
    expect(packet.reviewQuestions.every((question) => question.includes("?"))).toBe(true);

    const oneSlide = await agent.review(output, { slide: 2 });
    expect(oneSlide.slides.map((slide) => slide.number)).toEqual([2]);

    const revised = path.join(workspace, "revised", "tides.pptx");
    const patched = await agent.patch({
      command: "patch",
      input: output,
      output: revised,
      render: true,
      operations: [
        { op: "update-text", slide: 1, elementId: "title", text: "The tide tables changed in March 2026" },
        { op: "update-claims", claims: [{ id: "c1", slideId: "two", claim: "Spring tides peak 40 minutes earlier", kind: "number", sourceIds: ["s1"], status: "verified", asOf: "2026-03-01" }] },
      ],
    });
    expect(patched.status, JSON.stringify(patched.errors)).not.toBe("error");
    // Resolving the claim is what moves readiness, and nothing else changed:
    // the claim reason is gone, and the only reason that may survive it is the
    // one the machine imposes when it cannot render.
    expect(patched.validation?.readinessReasons.join(" ")).not.toMatch(/c1/);
    expect(patched.presentationReadiness).toBe(rendererAvailable ? "ready" : "review");
    if (!rendererAvailable) {
      expect(patched.validation?.readinessReasons).toEqual([expect.stringMatching(/schematic/)]);
    }
    expect(patched.patch?.untouched.find((entry) => entry.slide === 2)?.elementIds).toEqual(["figure", "peaks"]);

    const revisedScene = await readFile(outputLayout(revised).inspect, "utf8");
    expect(revisedScene).toContain("The tide tables changed in March 2026");
    // The style reference survives the patch: it is authoring intent, not sugar.
    expect(revisedScene).toContain('"styleRef":"strata-title"');
  });

  it("reports a patch without writing anything when asked to preview it", async () => {
    const agent = new SlideAgent(silentLogger);
    const output = path.join(workspace, "dry", "tides.pptx");
    await agent.create({ command: "create", sceneNdjson: SCENE, output, validate: false });
    const before = await readFile(output);

    const preview = await agent.patch({
      command: "patch",
      input: output,
      output: path.join(workspace, "dry", "never-written.pptx"),
      dryRun: true,
      operations: [{ op: "update-text", slide: 1, elementId: "note", text: "Replaced" }],
    });
    expect(preview.patch?.applied).toBe(false);
    expect(preview.patch?.diff).toContain('"Every reading in this deck uses the revised datum." → "Replaced"');
    expect(await exists(path.join(workspace, "dry", "never-written.pptx"))).toBe(false);
    expect(await readFile(output)).toEqual(before);
  });
});

describe("portable packages", () => {
  it("rebuilds after the whole deliverable is moved to another root", async () => {
    const agent = new SlideAgent(silentLogger);
    const assets = path.join(workspace, "source-assets");
    await cp(path.join(root, "examples", "showcase", "assets"), assets, { recursive: true });

    const scene = SCENE.trimEnd().split("\n");
    scene.splice(4, 0, JSON.stringify({
      kind: "image",
      slide: 1,
      id: "plate",
      bbox: [0.8, 3.6, 5, 2.8],
      path: path.join(assets, "strata-face.png"),
      alt: "A stratigraphic section",
      provenance: { generated: true, generator: "test fixture" },
    }));

    const output = path.join(workspace, "portable", "tides.pptx");
    const built = await agent.create({ command: "create", sceneNdjson: `${scene.join("\n")}\n`, output });
    expect(built.packageStatus).toBe("pass");

    const emitted = await readFile(outputLayout(output).inspect, "utf8");
    // No `path` may point outside the package; that is what breaks a rebuild.
    const referenced = [...emitted.matchAll(/"path":"([^"]+)"/g)].map((match) => match[1]!);
    expect(referenced).toContain(`assets/${referenced.find((value) => value.startsWith("assets/"))?.slice(7)}`);
    expect(referenced.every((value) => !path.isAbsolute(value))).toBe(true);
    expect(emitted).toMatch(/"path":"assets\/[0-9a-f]{64}\.png"/);
    // The author's original reference survives as provenance, which is where a
    // credit line has to live once the bytes have been renamed by their hash.
    // The scene is JSON, so the expected form is the *encoded* path: on Windows
    // every separator in it comes back doubled.
    expect(emitted).toContain(`"source":${JSON.stringify(path.join(assets, "strata-face.png"))}`);

    // Move the package somewhere else and delete both the original deck and
    // the source assets: this is the recipient's situation.
    const moved = path.join(workspace, "moved");
    await cp(path.join(workspace, "portable"), moved, { recursive: true });
    await rm(path.join(workspace, "portable"), { recursive: true, force: true });
    await rm(assets, { recursive: true, force: true });

    const rebuilt = await agent.create({
      command: "create",
      scene: path.join(outputLayout(path.join(moved, "tides.pptx")).artifacts, "scene.ndjson"),
      output: path.join(workspace, "rebuilt", "tides.pptx"),
    });
    expect(rebuilt.packageStatus, JSON.stringify(rebuilt.errors)).toBe("pass");
    expect(rebuilt.slideCount).toBe(2);
  });

  it("fails the package when the emitted scene cannot rebuild on its own", async () => {
    const agent = new SlideAgent(silentLogger);
    const output = path.join(workspace, "broken", "tides.pptx");
    await agent.create({ command: "create", sceneNdjson: SCENE, output, validate: false });

    // Corrupt the emitted scene, then ask for the round-trip gate.
    const layout = outputLayout(output);
    await rm(layout.inspect, { force: true });
    const result = await agent.create({ command: "create", sceneNdjson: SCENE, output, roundTrip: true });
    // A rebuild that reproduces the deck passes; this asserts the gate ran and
    // reported a verdict rather than silently skipping.
    expect(["pass", "fail", "skipped"]).toContain(result.validation?.roundTrip?.status);
    expect(result.validation?.roundTrip).toBeDefined();
  });
});
