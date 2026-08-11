import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import { outputLayout } from "../../src/output/output-layout.js";
import type { CanvasElementSpec, PresentationOutline } from "../../src/types/index.js";

/**
 * Fixtures for the defects this release exists to stop shipping.
 *
 * Each one is a deck that used to report success while being wrong in a way an
 * audience would notice — broken wrapping, a stale footnote, an auto-fix that
 * repainted the design, a preview left over from the revision before last. The
 * assertions are about what the report *refuses to say*, which is the part that
 * previously went missing.
 */

let workspace: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-golden-"));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function outline(slides: PresentationOutline["slides"], direction?: PresentationOutline["creativeDirection"]): PresentationOutline {
  return {
    brief: {
      title: "Golden fixture",
      audience: "Reviewers",
      objective: "Catch a known defect",
      presentationType: "technical",
      tone: "precise",
      visualDirection: "Authored for this fixture",
      slideCount: slides.length,
      language: "English",
      outputRequirements: [],
      keyTopics: [],
      sourcePrompt: "golden",
    },
    narrative: "A known defect must not report success.",
    ...(direction ? { creativeDirection: direction } : {}),
    slides,
  };
}

const AUTHORED_DIRECTION = {
  name: "Signal through fog",
  palette: { background: "0B1020", ink: "F5F2E9", accent: "66E3FF" },
  typography: { display: "Georgia", heading: "Georgia", body: "Georgia" },
};

describe("golden defect fixtures", () => {
  it("does not silently restyle a model-authored canvas under the default repair mode", async () => {
    // The modern-overview regression: the repair loop used to repaint an
    // authored colour and re-letter an authored typeface to satisfy a contrast
    // metric, and report one line of prose about it.
    const lowContrast: CanvasElementSpec[] = [
      { id: "title", type: "text", x: 0.8, y: 0.8, w: 10, h: 1.2, role: "title", text: "Signal through fog", style: { fontSize: 44, fontFace: "Georgia", color: "1B2430" } },
      { id: "body", type: "text", x: 0.8, y: 2.4, w: 8, h: 1.4, role: "body", text: "The evidence is thin but it points one way.", style: { fontSize: 18, fontFace: "Georgia", color: "23304A" } },
    ];
    const output = path.join(workspace, "preserve", "deck.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline: outline([{ id: "one", kind: "statement", title: "Signal through fog", background: "0B1020", canvas: lowContrast }], AUTHORED_DIRECTION),
      output,
    });

    // The contrast defect is found and explained…
    expect(result.validation?.issues.some((issue) => issue.code === "poor-contrast")).toBe(true);
    expect(result.validation?.suggestedRepairs?.length).toBeGreaterThan(0);
    const repair = result.validation!.suggestedRepairs!.find((entry) => entry.property === "style.color");
    expect(repair).toBeDefined();
    expect(repair!.before).toBe("1B2430");
    expect(repair!.changesAuthorIntent).toBe(true);
    // …and nothing was changed.
    expect(result.validation?.appliedRepairs ?? []).toHaveLength(0);
    const emitted = await readFile(outputLayout(output).inspect, "utf8");
    expect(emitted).toContain('"color":"1B2430"');
    expect(emitted).toContain('"color":"23304A"');
    expect(emitted).toContain('"fontFace":"Georgia"');
    // A deck with an unreadable claim on it is not ready, whatever else is true.
    expect(result.presentationReadiness).not.toBe("ready");
  });

  it("applies the same repair, reversibly, when safe mode is asked for", async () => {
    const output = path.join(workspace, "safe", "deck.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      repair: "safe",
      outline: outline([{
        id: "one",
        kind: "statement",
        title: "Signal through fog",
        background: "0B1020",
        canvas: [
          { id: "body", type: "text", x: 0.8, y: 2.4, w: 8, h: 1.4, role: "body", text: "The evidence is thin but it points one way.", style: { fontSize: 18, fontFace: "Georgia", color: "23304A" } },
        ],
      }], AUTHORED_DIRECTION),
      output,
    });
    const applied = result.validation?.appliedRepairs ?? [];
    expect(applied.length).toBeGreaterThan(0);
    for (const repair of applied) {
      // Every applied repair carries what it would take to undo it.
      expect(repair.rollback.value).toBe(repair.before);
      expect(repair.appliedAt).toMatch(/^\d{4}-/);
    }
  });

  it("refuses to call a deck with a stale footnote finished", async () => {
    // The sentence the footnote refers to has been deleted; the footnote has
    // not. Nothing in the package is invalid, and the deck is still wrong.
    const output = path.join(workspace, "stale", "deck.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      render: true,
      outline: outline([{
        id: "one",
        kind: "evidence",
        title: "Throughput",
        canvas: [
          { id: "claim", type: "text", x: 0.8, y: 1.0, w: 10, h: 1.0, role: "title", text: "Throughput held through the migration.", style: { fontSize: 32, color: "111111" } },
          { id: "footnote", type: "text", x: 0.8, y: 6.4, w: 10, h: 0.5, role: "footer", text: "See the queue-depth figure above for the two-week dip.", style: { fontSize: 11, color: "444444" } },
        ],
      }]),
      output,
    });
    // The engine cannot read the sentence, but it can prove the figure is not
    // there: the deck has no chart, table, or image to be "above".
    const heuristics = result.validation?.heuristics;
    expect(heuristics?.dimensions.find((dimension) => dimension.id === "evidence")?.score).toBeLessThan(25);
    expect(result.presentationReadiness).not.toBe("ready");
    expect(result.validation?.readinessReasons.join(" ")).toMatch(/evidence/);
  });

  it("fails the package when a preview no longer matches the deck it describes", async () => {
    const output = path.join(workspace, "preview", "deck.pptx");
    const agent = new SlideAgent(silentLogger);
    const result = await agent.create({
      command: "create",
      render: true,
      outline: outline([{
        id: "one",
        kind: "statement",
        title: "One",
        canvas: [{ id: "title", type: "text", x: 0.8, y: 1, w: 9, h: 1.2, role: "title", text: "One", style: { fontSize: 40, color: "111111" } }],
      }]),
      output,
    });
    const graph = result.validation?.artifacts;
    expect(graph?.previews.length).toBeGreaterThan(0);

    // Overwrite a preview with something else and re-verify the graph.
    const { verifyArtifactGraph } = await import("../../src/artifacts/package.js");
    const layout = outputLayout(output);
    const preview = path.resolve(layout.artifacts, graph!.previews[0]!.path);
    await writeFile(preview, "not the render anyone reviewed");
    const problems = await verifyArtifactGraph(layout.artifacts, graph!);
    expect(problems).toContainEqual({ path: graph!.previews[0]!.path, problem: "changed" });

    // And a later validate run refuses to treat it as evidence of anything.
    const revalidated = await agent.validate({ command: "validate", input: output });
    expect(revalidated.validation?.packageStatus).toBe("fail");
    expect(revalidated.validation?.presentationReadiness).toBe("not-ready");
    expect(revalidated.validation?.issues.some((issue) => issue.code === "stale-preview")).toBe(true);
  });

  it("refuses a missing packaged asset rather than reporting a portable package", async () => {
    const output = path.join(workspace, "missing-asset", "deck.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline: outline([{
        id: "one",
        kind: "statement",
        title: "One",
        canvas: [
          { id: "plate", type: "image", x: 0.8, y: 1, w: 4, h: 3, path: path.join(workspace, "does-not-exist.png"), alt: "A picture that is not there" },
        ],
      }]),
      output,
    });
    // The build fails at the resolver, which is the earliest honest point.
    expect(result.status).toBe("error");
    expect(result.errors[0]?.code).toBe("IMAGE_NOT_FOUND");
  });

  it("keeps two decks in one directory from overwriting each other's blueprint", async () => {
    const agent = new SlideAgent(silentLogger);
    const directory = path.join(workspace, "shared");
    const first = path.join(directory, "first.pptx");
    const second = path.join(directory, "second.pptx");
    const spec = (id: string, text: string) => outline([{
      id,
      kind: "statement",
      title: text,
      canvas: [{ id: "title", type: "text", x: 0.8, y: 1, w: 9, h: 1.2, role: "title", text, style: { fontSize: 40, color: "111111" } }],
    }]);
    await agent.create({ command: "create", outline: spec("a", "First deck"), output: first, validate: false });
    await agent.create({ command: "create", outline: spec("b", "Second deck"), output: second, validate: false });

    expect(await readFile(outputLayout(first).inspect, "utf8")).toContain("First deck");
    expect(await readFile(outputLayout(second).inspect, "utf8")).toContain("Second deck");
  });

  it("reports an accent bar poking past a rounded card, radius stated or not", async () => {
    // The card idiom every deck reinvents: a rounded panel with a coloured bar
    // laid flush along one edge. The bar is a plain rectangle, so its corner
    // sits outside the panel's curve — and every route by which the pair could
    // have been reported already exempts it, the bar being decorative and the
    // panel containing it. A deck shipped this way for as long as it went
    // unchecked, because a `roundRect` that states no radius is rounded anyway.
    const output = path.join(workspace, "corners", "deck.pptx");
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline: outline([{
        id: "one",
        kind: "statement",
        title: "Cards",
        canvas: [
          { id: "stated-box", type: "shape", shape: "roundRect", x: 1, y: 1, w: 3, h: 1.2, style: { fill: "141C2F", radius: 0.1 } },
          { id: "stated-bar", type: "shape", x: 1, y: 1, w: 0.07, h: 1.2, role: "decorative", style: { fill: "35D0BA" } },
          { id: "default-box", type: "shape", shape: "roundRect", x: 5, y: 1, w: 3, h: 1.2, style: { fill: "141C2F" } },
          { id: "default-bar", type: "shape", x: 5, y: 1, w: 3, h: 0.06, role: "decorative", style: { fill: "35D0BA" } },
          // Inset by the radius it is drawn with: the same idiom, done right.
          { id: "clean-box", type: "shape", shape: "roundRect", x: 9, y: 1, w: 3, h: 1.2, style: { fill: "141C2F", radius: 0.1 } },
          { id: "clean-bar", type: "shape", x: 9, y: 1.1, w: 0.07, h: 1.0, role: "decorative", style: { fill: "35D0BA" } },
        ] as CanvasElementSpec[],
      }]),
      output,
    });

    const overhangs = (result.validation?.issues ?? []).filter((issue) => issue.code === "rounded-corner-overhang");
    const flagged = overhangs.map((issue) => issue.elementIds?.[1]?.replace(/^\d+-/, "")).sort();
    expect(flagged).toEqual(["default-bar", "stated-bar"]);
    // The advice has to carry the radius the card is *drawn* with, which for an
    // unstated one is PowerPoint's own default rather than nothing at all.
    const unstated = overhangs.find((issue) => issue.elementIds?.[1]?.endsWith("default-bar"));
    expect(unstated?.details).toMatchObject({ radius: 0.2, radiusStated: false });
    expect(unstated?.message).toContain("0.2in");
  });
});
