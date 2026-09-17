import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXAMPLE_COMPONENTS, EXAMPLE_ROUTE, EXAMPLE_TURN, GRAMMAR } from "../../../src/v2/commands/catalog.js";
import { RECIPES } from "../../../src/v2/compose/recipes.js";
import { contentFor, selectRecipe } from "../../../src/v2/compose/selector.js";
import { buildScene, type BuiltScene } from "../../../src/v2/engine/scene-builder.js";
import { fixtureText, intent, root } from "./helpers.js";

/** Nominal content for every slot shape, so each recipe is exercised. */
const SAMPLE: Record<string, unknown> = {
  title: "Pilot first cuts rollout risk in half",
  subtitle: "A six-gate plan for the steering committee",
  kicker: "Board decision",
  date: "September 2026",
  number: "02",
  lead: "What changes for each business unit",
  statement: "Pilot first, in Finance, starting October",
  support: "One unit absorbs the learning before everyone else",
  points: ["Fails small, in one unit", "Six weeks longer than big-bang", "Keeps legacy paths until wave two"],
  items: [{ label: "Why now", detail: "Audit findings" }, { label: "The plan", detail: "Six gates" }, { label: "The ask", detail: "Budget" }],
  groups: [{ name: "Big-bang", points: ["Fastest on paper", "One failure stops everyone"], verdict: "Rejected" }, { name: "Pilot first", points: ["Fails small", "Six weeks longer"], verdict: "Recommended" }],
  metrics: [{ value: "−41%", label: "Churn", note: "two quarters" }, { value: "$4.2M", label: "ARR" }, { value: "18k", label: "Users" }],
  hero: { value: "−71%", label: "Lateral movement in pilot units" },
  chart: { categories: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "Incidents", values: [42, 37, 21, 12] }] },
  takeaways: ["Incidents fell every quarter", "The drop began with the pilot"],
  takeaway: "The pilot paid for itself in two quarters",
  source: "Security operations, 2026",
  table: { columns: ["Risk", "Likelihood", "Mitigation"], rows: [["Legacy auth", "High", "Wave two"], ["Staff time", "Medium", "Backfill"]] },
  events: [{ date: "Oct", label: "Pilot", detail: "Finance" }, { date: "Jan", label: "Wave one" }, { date: "Apr", label: "Wave two" }],
  steps: [{ label: "Inventory", detail: "What talks to what" }, { label: "Identity" }, { label: "Policy" }, { label: "Pilot" }],
  nodes: [{ id: "a", label: "Users" }, { id: "b", label: "Gateway" }, { id: "c", label: "Services" }],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
  quadrants: [{ name: "Quick wins" }, { name: "Big bets" }, { name: "Fill-ins" }, { name: "Money pits" }],
  image: { asset: "poppler-slide.png", alt: "A rendered slide" },
  quote: "We found out in one unit instead of in all of them.",
  attribution: "CISO",
  people: [{ name: "Ada", role: "Lead" }, { name: "Grace", role: "Engineering" }],
  challenge: "Flat network", solution: "Pilot-first zero trust", result: "Incidents down 71%",
  before: "Every unit exposed at once", after: "One unit learns first",
  pairs: [{ q: "Why not big-bang?", a: "One failure stops everyone." }],
  sources: ["Security operations report, 2026", "Vendor benchmark"],
  actions: ["Approve the pilot", "Name the Finance sponsor"],
  contact: "security@example.com",
  ask: "Approve €1.4M",
  body: "One business unit learns first.",
};

describe("recipe library", () => {
  it("has the size the documentation claims", async () => {
    // README, ADR 0007, the changelog, and the status page all quote this pair.
    // A recipe added without updating them leaves the prose overstating the
    // library, which is the kind of small dishonesty nobody catches by reading.
    const families = new Set(RECIPES.map((recipe) => recipe.id.split("/")[0]));
    expect({ recipes: RECIPES.length, families: families.size }).toEqual({ recipes: 38, families: 24 });
    for (const file of ["README.md", "CHANGELOG.md", "docs/adr/0007-opt-in-vocabulary.md", "docs/v2/04-implementation-status.md"]) {
      const text = await readFile(path.join(root, file), "utf8");
      expect(text, `${file} does not mention 38 recipes`).toMatch(/38 (saved compositions|recipes|across|variants)|38 across|24 families \/ 38/);
    }
  });

  it.each(RECIPES.map((recipe) => [recipe.id]))("%s builds with nominal content and no blocking findings", async (id) => {
    const recipe = RECIPES.find((candidate) => candidate.id === id)!;
    const content = Object.fromEntries(Object.keys(recipe.slots).filter((slot) => SAMPLE[slot] !== undefined).map((slot) => [slot, SAMPLE[slot]]));
    for (const format of ["16:9", "4:3"] as const) {
      const built = await buildScene(intent([{ id: "r", message: "m", recipe: id, content }], { brief: { title: "Recipes", audience: "", goal: "", format } }), { text: fixtureText(), baseDir: path.join(root, "tests", "fixtures") });
      expect(built.intent, JSON.stringify(built.findings)).toBeDefined();
      const blocking = built.findings.filter((finding) => finding.severity === "blocking");
      expect(blocking, `${id} ${format}: ${JSON.stringify(blocking)}`).toEqual([]);
      expect((built as BuiltScene).scene.slides[0]!.elements.length).toBeGreaterThan(0);
    }
  });

  it("selects recipes for draft slides from content shape, with a scored trail", () => {
    expect(selectRecipe({ metrics: [{ value: "1", label: "a" }, { value: "2", label: "b" }] }, { index: 2, count: 5 }).recipe).toBe("metrics/row");
    expect(selectRecipe({ title: "Hello" }, { index: 0, count: 5 }).recipe).toBe("title/left-anchored");
    expect(selectRecipe({ events: [{ date: "1", label: "a" }, { date: "2", label: "b" }] }, { index: 1, count: 5 }).recipe).toBe("timeline/horizontal");
    const chart = selectRecipe({ title: "t", chart: { categories: ["2023", "2024", "2025"], series: [{ name: "x", values: [1, 2, 3] }] } }, { index: 1, count: 5 });
    expect(chart.recipe).toBe("chart/full");
    expect((chart.content.chart as { kind: string }).kind).toBe("line");
    expect(selectRecipe({ points: ["a"] }, { index: 1, count: 5, previous: "bullets/one-column" }).trail[0]!.reason).toContain("previous");
    expect(contentFor("metrics/hero", { metrics: [{ value: "1", label: "a" }, { value: "2", label: "b" }] }).hero).toEqual({ value: "1", label: "a" });
  });

  it("builds a whole draft deck from typed content", async () => {
    const built = await buildScene(intent([
      { id: "t", message: "m", auto: { title: "Zero trust rollout", subtitle: "Steering committee" } },
      { id: "k", message: "m", auto: { title: "Results", metrics: [{ value: "−71%", label: "Incidents" }, { value: "6", label: "Gates" }] } },
      { id: "c", message: "m", auto: { title: "Close", actions: ["Approve"] } },
    ], { design: { preset: "draft/calm" } }), { text: fixtureText(), baseDir: root });
    expect(built.intent).toBeDefined();
    expect((built as BuiltScene).decisions.filter((decision) => decision.kind === "draft-selection")).toHaveLength(3);
    expect(built.findings.filter((finding) => finding.severity === "blocking" && finding.code !== "font-unavailable")).toEqual([]);
  });

  it("the grammar page's worked examples build", async () => {
    const examples = [EXAMPLE_ROUTE, EXAMPLE_TURN].map((text) => JSON.parse(text.replace(/\n/g, "")) as Record<string, unknown>);
    for (const text of [EXAMPLE_COMPONENTS, EXAMPLE_ROUTE, EXAMPLE_TURN]) expect(GRAMMAR).toContain(text);
    const components = JSON.parse(`{${EXAMPLE_COMPONENTS}}`) as { components: Record<string, unknown> };
    const built = await buildScene(intent(examples, { components: components.components as never, data: { churn: { categories: ["Jan", "Feb", "Mar"], series: [{ name: "Churn", values: [9, 7, 5] }] } } }), { text: fixtureText(), baseDir: root });
    expect(built.intent, JSON.stringify(built.findings)).toBeDefined();
    expect(built.findings.filter((finding) => finding.severity === "blocking" && finding.tier === "T0")).toEqual([]);
  });
});
