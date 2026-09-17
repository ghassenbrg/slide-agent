import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildScene, type BuiltScene } from "../../../src/v2/engine/scene-builder.js";
import type { Finding } from "../../../src/v2/ir/issues.js";
import type { SceneElement, TextElement } from "../../../src/v2/ir/scene.js";
import { fixtureText, intent, root } from "./helpers.js";

async function build(slides: unknown[], extra = {}): Promise<BuiltScene> {
  const built = await buildScene(intent(slides, extra), { text: fixtureText(), baseDir: path.join(root, "tests", "fixtures") });
  if (!built.intent) throw new Error(JSON.stringify(built.findings, null, 1));
  return built;
}

function element(built: BuiltScene, predicate: (element: SceneElement) => boolean): SceneElement {
  const found = built.scene.slides.flatMap((slide) => slide.elements).find(predicate);
  if (!found) throw new Error("element not found");
  return found;
}

function blocking(findings: Finding[]): Finding[] {
  return findings.filter((finding) => finding.severity === "blocking");
}

describe("solving compositions", () => {
  it("places grid children by cell range inside the margins and binds the title placeholder", async () => {
    const built = await build([{ id: "s1", message: "m", compose: { grid: "12x6", items: [
      { at: "c1-6 r1", text: "A title that states the claim", role: "title" },
      { at: "c7-12 r2-6", shape: "rect", fill: "accent" },
    ] } }]);
    expect(blocking(built.findings)).toEqual([]);
    const title = element(built, (candidate) => candidate.kind === "text") as TextElement;
    expect(title.placeholder).toEqual({ type: "title" });
    expect(title.frame.x).toBeCloseTo(40 / 72, 3);
    const shape = element(built, (candidate) => candidate.kind === "shape");
    expect(shape.frame.x + shape.frame.w).toBeCloseTo(13.333333 - 40 / 72, 2);
    expect(built.scene.slides[0]!.layout).toBe("title-only");
  });

  it("shares a row's width by grow", async () => {
    const built = await build([{ id: "s1", message: "m", compose: { row: { gap: 0, items: [
      { id: "a", shape: "rect", fill: "accent" }, { id: "b", shape: "rect", fill: "accent", grow: 2 }, { id: "c", shape: "rect", fill: "accent" },
    ] } } }]);
    const [a, b] = ["s1/a", "s1/b"].map((id) => element(built, (candidate) => candidate.id === id));
    expect(b!.frame.w / a!.frame.w).toBeCloseTo(2, 2);
  });

  it("sizes text down within minStep as a reported adjustment, then offers choices and a character budget", async () => {
    const long = "Churn fell sharply once onboarding moved in-product, and every cohort after the change retained better than any cohort before it";
    const fits = await build([{ id: "s1", message: "m", compose: { grid: "12x6", items: [{ at: "c1-6 r1-2", text: long, role: "h2" }] } }]);
    const scaled = element(fits, (candidate) => candidate.kind === "text") as TextElement;
    expect(scaled.adjustments?.[0]?.kind).toBe("type-step");
    expect(scaled.fit?.status).toBe("scaled");

    const choice = await build([{ id: "s1", message: "m", compose: { grid: "12x6", items: [{ at: "c1-3 r1", text: `${long} ${long}`, role: "h2" }] } }]);
    const overflow = element(choice, (candidate) => candidate.kind === "text") as TextElement;
    expect(overflow.fit?.status).toBe("choice-pending");
    const choose = choice.suggestedEdits.find((edit) => edit.kind === "choose")!;
    expect(choose.options!.map((option) => option.do)).toEqual(expect.arrayContaining(["span", "split"]));
    const shorten = choice.suggestedEdits.find((edit) => edit.kind === "shorten")!;
    expect(shorten.maxChars).toBeLessThan(shorten.currentChars!);
    expect(choice.findings.some((finding) => finding.code === "text-overflow")).toBe(true);
  });

  it("never sizes a pinned node, and applies draft fits automatically down to the floor", async () => {
    const long = "A very long headline that cannot possibly fit into such a narrow and short region of the slide at this size";
    const pinned = await build([{ id: "s1", message: "m", pins: ["/compose/items/0/size"], compose: { grid: "12x6", items: [{ at: "c1-4 r1", text: long, role: "title" }] } }]);
    const text = element(pinned, (candidate) => candidate.kind === "text") as TextElement;
    expect(text.adjustments ?? []).toEqual([]);
    const auto = await build([{ id: "s1", message: "m", compose: { grid: "12x6", items: [{ at: "c1-4 r1-2", text: long, role: "title" }] } }], { direction: { concept: "", fit: "auto" } });
    const scaled = element(auto, (candidate) => candidate.kind === "text") as TextElement;
    expect(scaled.style.size).toBeGreaterThanOrEqual(auto.theme.floors.title);
  });

  it("repairs text contrast on a surface, and chooses the readable role for untoned text", async () => {
    const built = await build([{ id: "s1", message: "m", compose: { column: { surface: "band", pad: "space.4", items: [
      { id: "auto", text: "On the ink band", role: "body" },
      { id: "weak", text: "Muted on ink", role: "body", tone: "muted" },
    ] } } }]);
    const readable = element(built, (candidate) => candidate.id === "s1/auto") as TextElement;
    expect(readable.style.color.hex).toBe("F7F5F0");
    const weak = element(built, (candidate) => candidate.id === "s1/weak") as TextElement;
    expect(weak.adjustments?.some((adjustment) => adjustment.kind === "contrast")).toBe(true);
  });

  it("reports unknown surfaces, colours, icons, textures, and out-of-bounds placement", async () => {
    const built = await build([{ id: "s1", message: "m", compose: { free: { items: [
      { box: [0, 0, 4, 2], surface: "glass", column: { items: [{ text: "x", role: "body" }] } },
      { box: [0, 3, 2, 1], text: "x", role: "body", tone: "sunset" },
      { box: [4, 0, 1, 1], icon: "shield-chek" },
      { box: [6, 0, 2, 2], texture: "sparkles" },
      { box: [11, 5, 4, 4], shape: "rect", fill: "accent" },
    ] } } }]);
    const codes = built.findings.map((finding) => finding.code);
    expect(codes).toEqual(expect.arrayContaining(["surface-unknown", "color-unknown", "icon-unknown", "texture-unknown", "out-of-bounds"]));
    expect(built.suggestedEdits.find((edit) => edit.kind === "icon")!.options![0]!.value).toBe("shield-check");
  });

  it("builds charts, tables, diagrams, icons, rules, textures, and images", async () => {
    const built = await build([{ id: "s1", message: "m", tags: ["evidence"], compose: { grid: "12x6", items: [
      { at: "c1-6 r1-3", chart: { data: "revenue", chart: "column", highlight: "Q4", annotate: ["change:Q1..Q4"] } },
      { at: "c7-12 r1-3", table: { data: { columns: ["Region", "Revenue"], rows: [["North", 42], ["South", 37]] }, highlight: { row: 1 } } },
      { at: "c1-6 r4-6", diagram: { grammar: "flow", nodes: [{ id: "a", label: "Ingest" }, { id: "b", label: "Solve", emphasis: true }, { id: "c", label: "Write" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }] } },
      { at: "c7-8 r4", icon: "?security" },
      { at: "c9-12 r4", rule: {} },
      { at: "c7-12 r5-6", layer: { items: [{ texture: "dot-grid", params: { spacing: 40 } }, { image: { asset: "poppler-slide.png", alt: "A rendered slide" } }] } },
    ] } }], {
      data: { revenue: { categories: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Revenue", values: [3, 4, 5, 7], unit: "$" }] } },
      design: { language: { ...(await import("./helpers.js")).language(), texture: [{ id: "edge", primitive: "margin-rule", apply: { roles: ["evidence"] } }] } },
    });
    expect(blocking(built.findings)).toEqual([]);
    const kinds = new Set(built.scene.slides[0]!.elements.map((candidate) => candidate.kind));
    expect([...kinds]).toEqual(expect.arrayContaining(["chart", "table", "shape", "text", "connector", "icon", "image"]));
    const chart = element(built, (candidate) => candidate.kind === "chart");
    expect(chart.kind === "chart" && chart.highlight).toEqual([3]);
    expect(chart.kind === "chart" && chart.facts?.[0]).toContain("+133.3%");
    expect(built.scene.slides[0]!.elements.some((candidate) => candidate.id.includes("margin-rule"))).toBe(true);
    expect(built.decisions.some((decision) => decision.kind === "icon-search")).toBe(true);
  });

  it("flags a chart form that misrepresents its data", async () => {
    const built = await build([{ id: "s1", message: "m", compose: { grid: "12x6", items: [{ at: "c1-12 r1-6", chart: { data: { categories: ["a", "b", "c", "d", "e", "f", "g", "h", "i"], series: [{ name: "x", values: [1, 2, 3, 4, 5, 6, 7, 8, 9] }] }, chart: "pie" } }] } }]);
    expect(built.findings.some((finding) => finding.code === "chart-type-mismatch")).toBe(true);
  });
});

describe("scene building", () => {
  it("rejects invalid intents with pointers to the slide", async () => {
    const built = await buildScene({ schema: "slide-agent.intent/1", brief: { title: "x" }, design: { preset: "draft/calm" }, slides: [{ id: "a", mesage: "typo", compose: {} }] }, { text: fixtureText(), baseDir: root });
    expect(built.intent).toBeUndefined();
    expect(built.findings[0]!.message).toMatch(/"mesage"/);
    const duplicate = await buildScene(intent([{ id: "a", message: "1", compose: { text: "x", role: "title" } }, { id: "a", message: "2", compose: { text: "y", role: "title" } }]), { text: fixtureText(), baseDir: root });
    expect(duplicate.findings.some((finding) => finding.code === "slide-id-duplicate")).toBe(true);
  });

  it("adds chrome, notes with sources, and rhythm notes", async () => {
    const same = { grid: "12x6", items: [{ at: "c1-8 r1", text: "Same silhouette", role: "title" }, { at: "c1-8 r2-6", text: "Body copy that fills the region", role: "body" }] };
    const built = await build([
      { id: "a", message: "1", compose: same, notes: "Say this.", sources: ["s1"] },
      { id: "b", message: "2", compose: same },
    ], { sources: [{ id: "s1", title: "Annual report" }], options: { chrome: { slideNumbers: true, footer: "Footer" } } });
    expect(built.scene.slides[0]!.notes).toContain("Annual report");
    expect(built.scene.slides[1]!.elements.filter((candidate) => candidate.role === "chrome")).toHaveLength(2);
    expect(built.scene.slides[0]!.elements.some((candidate) => candidate.role === "chrome")).toBe(false);
    expect(built.rhythm[0]?.note).toMatch(/silhouette/);
  });

  it("carries V1 canvas elements into the scene", async () => {
    const built = await build([{ id: "c", message: "m", canvas: [
      { type: "text", id: "t", x: 1, y: 1, w: 6, h: 1, text: "Legacy title", role: "title", style: { fontSize: 32, color: "112233" } },
      { type: "shape", id: "s", x: 1, y: 2.5, w: 3, h: 2, style: { fill: "C2410C" } },
      { type: "connector", id: "k", from: "t", to: "s" },
      { type: "chart", id: "ch", x: 6, y: 2.5, w: 5, h: 3, chart: { kind: "bar", labels: ["a", "b"], series: [{ name: "s", values: [1, 2] }] } },
      { type: "symbol-instance", id: "x", x: 0, y: 0, w: 1, h: 1 },
    ] }]);
    expect(built.scene.slides[0]!.mode).toBe("canvas");
    expect(built.scene.slides[0]!.elements.map((candidate) => candidate.kind)).toEqual(["text", "shape", "connector", "chart"]);
    expect(built.findings.some((finding) => finding.code === "canvas-unsupported")).toBe(true);
  });
});
