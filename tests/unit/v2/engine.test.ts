import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COMMANDS, withinBudget } from "../../../src/v2/commands/registry.js";
import { migrateOutline } from "../../../src/v2/compat-v1/migrate.js";
import { Engine } from "../../../src/v2/engine/engine.js";
import { applyEdits, expandRecipeSlide, getAt, insertAt, removeAt, setAt, stripMetadata } from "../../../src/v2/engine/edits.js";
import { fillDecks, fillTemplate } from "../../../src/v2/engine/fill.js";
import { importTemplate, resolveBrand } from "../../../src/v2/engine/brand.js";
import { inspectFile } from "../../../src/v2/engine/inspect.js";
import { deckIntent } from "../../../src/v2/ir/intent.js";
import { setWorkspaceRoots } from "../../../src/security/policy.js";
import { fixtureRegistry, intent, root } from "./helpers.js";

let workspace: string;
const engine = new Engine({ registry: fixtureRegistry(), previewWidth: 480 });

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-engine-"));
  await cp(path.join(root, "tests", "fixtures", "poppler-slide.png"), path.join(workspace, "photo.png"));
  setWorkspaceRoots([workspace, tmpdir()]);
});

afterAll(async () => {
  setWorkspaceRoots(undefined);
  await rm(workspace, { recursive: true, force: true });
});

const deckIntentJson = () => intent([
  { id: "cover", message: "Decide today", compose: { grid: "12x6", items: [{ at: "c1-9 r3-4", text: "Approve the pilot-first rollout", role: "title" }, { at: "c10-12 r1-6", image: { asset: path.join(workspace, "photo.png"), alt: "Team at work" } }] } },
  { id: "numbers", message: "It works", recipe: "metrics/row", content: { title: "The pilot cut incidents by 71%", metrics: [{ value: "−71%", label: "Incidents" }, { value: "6", label: "Gates" }] } },
  { id: "tight", message: "Overflow", compose: { grid: "12x6", items: [{ at: "c1-2 r1", text: "A headline that is far too long for a region that is two columns wide and one row tall", role: "h2" }] } },
]);

describe("engine", () => {
  it("builds a deck directory with intent, scene, tokens, package, previews, and a run record", async () => {
    const deck = path.join(workspace, "deck");
    const result = await engine.build({ deck, intent: deckIntentJson() });
    for (const file of ["intent.json", "scene.json", "theme.tokens.json", "deck.pptx", "run.json", "previews/sheet.png"]) {
      expect((await stat(path.join(deck, file))).size, file).toBeGreaterThan(0);
    }
    expect(result.verdict.slides).toBe(3);
    expect(result.verdict.authoring).toEqual({ composed: 2, recipe: 1, draft: 0, canvas: 0, design: "authored" });
    expect(result.verdict.state).toBe("needs-attention");
    expect(result.verdict.suggestedEdits.some((edit) => edit.kind === "choose")).toBe(true);
    const stored = JSON.parse(await readFile(path.join(deck, "intent.json"), "utf8"));
    expect(JSON.stringify(stored)).toMatch(/"asset":\s*"assets\/[0-9a-f]{16}\.png"/);
  });

  it("rebuilds incrementally and answers a pending choice", async () => {
    const deck = path.join(workspace, "deck");
    const again = await engine.build({ deck });
    expect(again.verdict.changed).toEqual([]);
    const choice = again.verdict.suggestedEdits.find((edit) => edit.kind === "choose")!;
    const span = choice.options!.findIndex((option) => option.do === "span");
    expect(span).toBeGreaterThanOrEqual(0);
    const answered = await engine.edit({ deck, ops: [{ level: "intent", op: "choose", edit: choice.id, option: span }] });
    expect(answered.verdict.changed).toEqual(["tight"]);
    expect(answered.verdict.suggestedEdits.filter((edit) => edit.slide === "tight" && edit.kind === "choose")).toEqual([]);
  });

  it("expands a recipe into an editable composition, pins elements, and edits the design", async () => {
    const deck = path.join(workspace, "deck");
    const expanded = await engine.edit({ deck, ops: [{ level: "intent", op: "expand", path: "/slides/1" }] });
    expect(expanded.notes[0]).toContain("composition");
    const intentAfter = JSON.parse(await readFile(path.join(deck, "intent.json"), "utf8"));
    expect(intentAfter.slides[1].compose).toBeDefined();
    expect(JSON.stringify(intentAfter.slides[1].compose)).not.toContain("$ptr");

    const pinned = await engine.edit({ deck, ops: [{ level: "element", slide: "cover", element: "cover/text1", set: { hidden: true } }] });
    expect(pinned.scene!.slides[0]!.elements.some((element) => element.id === "cover/text1")).toBe(false);

    const design = await engine.edit({ deck, ops: [{ level: "design", op: "set", path: "/color/palette/signal", value: "#1F7A4D" }] });
    expect(design.verdict.changed).toHaveLength(3);
  });

  it("views, explains, and explores", async () => {
    const deck = path.join(workspace, "deck");
    const rhythm = await engine.view({ deck, what: "rhythm" });
    expect((rhythm.slides as unknown[]).length).toBe(3);
    const slides = await engine.view({ deck, what: "slides", slides: ["cover"] });
    expect((slides.slides as Array<{ preview?: string }>)[0]!.preview).toMatch(/\.png$/);
    const report = await engine.view({ deck, what: "report" });
    expect(report.total).toBeGreaterThan(0);
    const crop = await engine.view({ deck, what: "crop", element: "tight/text1" });
    expect(crop.crop).toMatch(/crop-tight/);
    const explained = await engine.explain({ deck, element: "tight/text1" });
    expect((explained.element as { provenance: { source: string } }).provenance.source).toBe("composed");
    const overview = await engine.explain({ deck });
    expect(overview.versions).toBeDefined();
    const explored = await engine.explore({ deck, designs: [{ preset: "draft/calm" }, { preset: "draft/bold" }], slides: ["cover"] });
    expect(explored.designs).toHaveLength(2);
    expect(explored.sheet).toMatch(/explore/);
    await expect(engine.explore({ deck, designs: [], slides: ["cover"] })).rejects.toThrow(/one to three/);
  });

  it("checks without writing, and reports invalid intents", async () => {
    const deck = path.join(workspace, "check-only");
    const checked = await engine.build({ deck, intent: deckIntentJson(), mode: "check" });
    expect(checked.verdict.slides).toBe(3);
    await expect(stat(path.join(deck, "deck.pptx"))).rejects.toThrow();
    const invalid = await engine.build({ deck: path.join(workspace, "invalid"), intent: { schema: "slide-agent.intent/1", slides: [] } });
    expect(invalid.verdict.state).toBe("needs-attention");
    expect(invalid.verdict.issues[0]!.code).toBe("intent-invalid");
  });

  it("says what is wrong with a design block instead of `Invalid input`", async () => {
    const incomplete = await engine.build({
      deck: path.join(workspace, "no-design"),
      intent: {
        ...intent([{ id: "a", message: "m", compose: { grid: "12x6", items: [] } }]),
        design: { language: { color: { palette: { ink: "#111111" }, roles: { background: "ink", text: "ink", muted: "ink", accent: "ink" } } } },
      } as never,
      mode: "check",
    });
    const finding = incomplete.verdict.issues.find((issue) => issue.code === "intent-invalid");
    expect(finding!.where).toContain("/design");
    // The truncated hint has to carry the actionable half, not the general rule.
    expect(finding!.hint).toContain("/language/color/roles/surface");

    const wrongShape = await engine.build({
      deck: path.join(workspace, "bad-design"),
      intent: { ...intent([{ id: "a", message: "m", compose: { grid: "12x6", items: [] } }]), design: { presets: "draft/technical" } } as never,
      mode: "check",
    });
    expect(wrongShape.verdict.issues.find((issue) => issue.code === "intent-invalid")!.hint).toContain("preset");
  });

  it("finalizes with a round-trip check", async () => {
    const deck = path.join(workspace, "final");
    await engine.build({ deck, intent: intent([{ id: "only", message: "m", compose: { grid: "12x6", items: [{ at: "c1-10 r2-3", text: "Everything fits here", role: "title" }] } }]) });
    const finalized = await engine.finalize({ deck });
    expect(finalized.verdict.issues.some((issue) => issue.code === "round-trip-mismatch")).toBe(false);
    expect(["ready", "ready-unrendered"]).toContain(finalized.verdict.state);
  }, 240_000);
});

describe("edit operations", () => {
  it("sets, inserts, removes, and moves by JSON pointer", () => {
    const document = { a: { list: [1, 2, 3] } };
    setAt(document, "/a/list/1", 9);
    insertAt(document, "/a/list/-", 4);
    expect(removeAt(document, "/a/list/0")).toBe(1);
    expect(getAt(document, "/a/list")).toEqual([9, 3, 4]);
    setAt(document, "/a/new/deep", true);
    expect(getAt(document, "/a/new/deep")).toBe(true);
    expect(() => removeAt(document, "/a/missing")).toThrow(/Nothing at/);
    expect(stripMetadata({ $ptr: "x", a: [{ $prov: "y", b: 1 }] })).toEqual({ a: [{ b: 1 }] });
  });

  it("splits recipe slides by their longest list and refuses unknown choices", () => {
    const base = deckIntent.parse(intent([{ id: "list", message: "m", recipe: "bullets/one-column", content: { title: "t", points: ["a", "b", "c", "d"] } }]));
    const result = applyEdits(base, [{ level: "intent", op: "choose", edit: "e1", option: 0 }], { suggestedEdits: [{ id: "e1", kind: "choose", slide: "list", why: "", options: [{ do: "split", effect: "" }] }] });
    expect(result.intent.slides).toHaveLength(2);
    expect(result.intent.slides[1]!.id).toBe("list-cont");
    expect(() => applyEdits(base, [{ level: "intent", op: "choose", edit: "nope" }])).toThrow(/No pending choice/);
    expect(() => expandRecipeSlide(base, 5)).toThrow();
    const moved = applyEdits(deckIntent.parse(intent([{ id: "a", message: "1", compose: { text: "a", role: "title" } }, { id: "b", message: "2", compose: { text: "b", role: "title" } }])), [{ level: "intent", op: "move", path: "/slides/1", to: "/slides/0" }]);
    expect(moved.intent.slides.map((slide) => slide.id)).toEqual(["b", "a"]);
    expect(moved.changed).toBeUndefined();
  });
});

describe("template fill", () => {
  it("binds values, repeats slides, and reports missing data", () => {
    const template = { $requires: ["account.name"], schema: "slide-agent.intent/1", brief: { title: "QBR {{account.name}}" }, slides: [
      { id: "cover", message: "m", compose: { text: "{{account.name}}", role: "title" } },
      { id: "region", $each: "regions", message: "{{name}}", compose: { text: "{{name}}: {{revenue}}", role: "title" } },
      { id: "optional", $if: "risks", message: "m", compose: { text: "Risks", role: "title" } },
    ] };
    const filled = fillTemplate(template, { account: { name: "Acme" }, regions: [{ name: "North", revenue: "$1M" }, { name: "South", revenue: "$2M" }] });
    expect(filled.missing).toEqual([]);
    expect((filled.intent.brief as { title: string }).title).toBe("QBR Acme");
    expect((filled.intent.slides as Array<{ id: string }>).map((slide) => slide.id)).toEqual(["cover", "region-1", "region-2"]);
    expect(fillTemplate(template, {}).missing).toEqual(expect.arrayContaining(["account.name", "regions"]));
  });

  it("fills one deck per data row", async () => {
    const template = { ...intent([{ id: "cover", message: "m", compose: { grid: "12x6", items: [{ at: "c1-10 r2-3", text: "Quarterly review: {{name}}", role: "title" }] } }]) };
    await writeFile(path.join(workspace, "template.json"), JSON.stringify(template));
    await writeFile(path.join(workspace, "rows.csv"), "name,revenue\nAcme,1\nGlobex,2\n");
    const results = await fillDecks(engine, { template: path.join(workspace, "template.json"), data: path.join(workspace, "rows.csv"), out: path.join(workspace, "filled") });
    expect(results.map((entry) => entry.name)).toEqual(["acme", "globex"]);
    expect(results.every((entry) => entry.result?.files.pptx)).toBe(true);
  });
});

describe("migration, brands, and inspection", () => {
  it("migrates a V1 outline into a valid intent with a report", () => {
    const { intent: migrated, report } = migrateOutline({
      brief: { title: "Old deck", audience: "Board", objective: "Decide", presentationType: "board", tone: "", visualDirection: "" } as never,
      narrative: "",
      creativeDirection: { concept: "Calm", palette: { background: "#FFFFFF", ink: "#111111", accent: "#C2410C" } as never },
      slides: [
        { id: "t", kind: "title", title: "Hello" },
        { id: "k", kind: "kpi", title: "Numbers", kpis: [{ label: "A", value: "1" }, { label: "B", value: "2" }] },
        { id: "c", kind: "custom", title: "Canvas", canvas: [{ type: "text", x: 1, y: 1, w: 4, h: 1, text: "x" }] },
        { id: "a", kind: "architecture", title: "Unmapped" },
      ] as never,
    });
    expect(deckIntent.safeParse(migrated).success).toBe(true);
    expect(report.slides.map((entry) => entry.to)).toEqual(["recipe title/left-anchored", "recipe metrics/row", "canvas", "statement/big-claim"]);
    expect(report.unmapped).toHaveLength(1);
  });

  it("imports a template as a brand pack and inspects it", async () => {
    const deck = path.join(workspace, "deck", "deck.pptx");
    const pack = await importTemplate(deck);
    expect(pack.locks).toContain("/color/palette");
    expect(pack.layouts.map((layout) => layout.type)).toEqual(expect.arrayContaining(["titleOnly", "blank"]));
    const json = path.join(workspace, "brand.json");
    await writeFile(json, JSON.stringify(pack));
    expect((await resolveBrand("brand.json", workspace)).name).toBe(pack.name);
    await expect(resolveBrand("missing.json", workspace)).rejects.toThrow(/not found/);
    const inspected = await inspectFile(deck);
    expect(inspected.slides).toBe(3);
    expect((inspected.brand as { locks: string[] }).locks.length).toBeGreaterThan(0);
  });
});

describe("registry", () => {
  it("defines seven MCP tools with budgets, and trims verdicts to fit", async () => {
    expect(COMMANDS.map((command) => command.tool)).toEqual(["slides_catalog", "slides_build", "slides_edit", "slides_view", "slides_finalize", "slides_inspect", "slides_generate"]);
    const deck = path.join(workspace, "deck");
    await mkdir(deck, { recursive: true });
    const build = COMMANDS.find((command) => command.name === "build")!;
    const result = await (build.run as (input: unknown, context: { engine: Engine }) => Promise<{ payload: { verdict: never } }>)(build.input.parse({ deck }), { engine });
    const verdict = result.payload.verdict;
    expect(JSON.stringify(verdict).length / 4).toBeLessThanOrEqual(800);
    const huge = { ...(verdict as object), issues: Array.from({ length: 12 }, (_, index) => ({ code: `c${index}`, severity: "minor", count: 1, where: Array(8).fill("somewhere/long/element/id"), hint: "x".repeat(140) })) };
    const trimmed = withinBudget(huge as never, 400);
    expect(JSON.stringify(trimmed).length / 4).toBeLessThanOrEqual(1400);
    expect(trimmed.more).toContain("budget");
  });
});
