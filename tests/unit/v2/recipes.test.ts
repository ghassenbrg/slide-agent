import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EXAMPLE_COMPONENTS, EXAMPLE_ROUTE, EXAMPLE_TURN, GRAMMAR } from "../../../src/v2/commands/catalog.js";
import { RECIPES } from "../../../src/v2/compose/recipes.js";
import { contentFor, selectRecipe } from "../../../src/v2/compose/selector.js";
import { buildScene, type BuiltScene } from "../../../src/v2/engine/scene-builder.js";
import { fixtureText, intent, root } from "./helpers.js";
import { SAMPLE } from "./recipe-sample.js";

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
