import path from "node:path";
import { describe, expect, it } from "vitest";

import { defineDeck } from "../../src/authoring/index.js";
import { loadConfig } from "../../src/config/load-config.js";
import { ManifestValidator } from "../../src/validation/manifest-validator.js";
import type { CanvasElementSpec, DeckManifest, ElementRecord } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");

function deck() {
  return defineDeck({
    brief: {
      title: "Primitives", audience: "Authors", objective: "Compose without arithmetic",
      presentationType: "technical", tone: "plain", language: "English",
    },
    narrative: "The mechanics the toolkit owns.",
  });
}

function find(canvas: CanvasElementSpec[], id: string) {
  return canvas.find((element) => element.id === id);
}

describe("flow", () => {
  it("stacks each block at the height its own text needs", () => {
    const slide = deck().slide({ id: "s", title: "Flow" });
    slide.flow({ x: 1, y: 2, w: 6, h: 4 }, [
      { id: "a", text: "One short line." },
      { id: "b", text: "A considerably longer paragraph that will certainly wrap onto more than a single line at this width, and should therefore be taller than the line above it." },
    ]);
    const [first, second] = [find(slide.canvas, "a")!, find(slide.canvas, "b")!];
    expect(second.y!).toBeGreaterThan(first.y! + first.h!  - 0.001);
    expect(second.h!).toBeGreaterThan(first.h!);
  });

  it("returns the baseline it reached, so slides compose downward", () => {
    const slide = deck().slide({ id: "s", title: "Flow" });
    const bottom = slide.flow({ x: 1, y: 2, w: 6, h: 4 }, [{ id: "a", text: "One line." }]);
    const placed = find(slide.canvas, "a")!;
    expect(bottom).toBeCloseTo(placed.y! + placed.h!, 5);
  });

  it("adds no spacing that the author did not ask for", () => {
    const slide = deck().slide({ id: "s", title: "Flow" });
    slide.flow({ x: 1, y: 2, w: 6, h: 4 }, [{ id: "a", text: "One." }, { id: "b", text: "Two." }]);
    const [first, second] = [find(slide.canvas, "a")!, find(slide.canvas, "b")!];
    // A default gap would be a proportion, and proportions are the author's.
    expect(second.y!).toBeCloseTo(first.y! + first.h!, 5);
  });

  it("honours a per-block gap over the flow's own", () => {
    const slide = deck().slide({ id: "s", title: "Flow" });
    slide.flow({ x: 1, y: 2, w: 6, h: 4 }, [
      { id: "a", text: "One.", gap: 0.5 },
      { id: "b", text: "Two." },
    ], { gap: 0.1 });
    const [first, second] = [find(slide.canvas, "a")!, find(slide.canvas, "b")!];
    expect(second.y!).toBeCloseTo(first.y! + first.h! + 0.5, 5);
  });

  it("skips a block a caller conditionally left out", () => {
    const slide = deck().slide({ id: "s", title: "Flow" });
    const kicker: false = false;
    slide.flow({ x: 1, y: 2, w: 6, h: 4 }, [
      kicker && { id: "k", text: "Kicker" },
      { id: "a", text: "Body." },
    ]);
    expect(find(slide.canvas, "k")).toBeUndefined();
    expect(find(slide.canvas, "a")!.y).toBeCloseTo(2, 5);
  });
});

describe("card", () => {
  it("insets the accent bar by the radius, on both corner-adjacent edges", () => {
    const slide = deck().slide({ id: "s", title: "Card" });
    slide.card("panel", { x: 1, y: 1, w: 4, h: 2 }, { radius: 0.1, accent: { color: "BF0000", width: 0.07 } });
    const bar = find(slide.canvas, "panel-accent")!;
    expect(bar.y).toBeCloseTo(1.1, 5);
    expect(bar.h).toBeCloseTo(1.8, 5);
    expect(bar.x).toBeCloseTo(1, 5);
    expect(bar.w).toBeCloseTo(0.07, 5);
  });

  it("makes the defect 0.14 needed a whole check for unrepresentable", async () => {
    const slide = deck().slide({ id: "s", title: "Card" });
    slide.card("panel", { x: 1, y: 1, w: 4, h: 2 }, { radius: 0.1, accent: { color: "BF0000" } });

    // Run the real check over the real geometry rather than trusting the
    // arithmetic above: this is the claim that matters, and it is only worth
    // making against the thing that would have reported the defect.
    const records: ElementRecord[] = slide.canvas.map((element) => ({
      id: element.id,
      name: element.id,
      type: element.type === "text" ? "text" : "shape",
      role: (element as { role?: string }).role ?? "shape",
      x: element.x ?? 0, y: element.y ?? 0, w: element.w ?? 0, h: element.h ?? 0,
      ...(element.type === "shape" ? { shape: (element as { shape?: string }).shape } : {}),
      ...((element as { style?: { radius?: number } }).style?.radius !== undefined
        ? { radius: (element as { style?: { radius?: number } }).style!.radius }
        : {}),
    }));
    const manifest: DeckManifest = {
      schemaVersion: "1.0", presentationTitle: "Card", width: 13.333333, height: 7.5,
      createdAt: new Date().toISOString(),
      slides: [{ number: 1, id: "s", title: "Card", kind: "custom", backgroundColor: "FFFFFF", elements: records, notes: [] }],
    };
    const issues = new ManifestValidator(await loadConfig(path.join(root, "config"))).validate(manifest);
    expect(issues.some((item) => item.code === "rounded-corner-overhang")).toBe(false);
  });

  it("runs a top or bottom accent along the other axis", () => {
    const slide = deck().slide({ id: "s", title: "Card" });
    slide.card("panel", { x: 1, y: 1, w: 4, h: 2 }, { radius: 0.1, accent: { color: "BF0000", side: "bottom", width: 0.08 } });
    const bar = find(slide.canvas, "panel-accent")!;
    expect(bar.x).toBeCloseTo(1.1, 5);
    expect(bar.w).toBeCloseTo(3.8, 5);
    expect(bar.y).toBeCloseTo(2.92, 5);
    expect(bar.h).toBeCloseTo(0.08, 5);
  });

  it("draws no bar when the author did not ask for one", () => {
    const slide = deck().slide({ id: "s", title: "Card" });
    slide.card("panel", { x: 1, y: 1, w: 4, h: 2 }, { radius: 0.1 });
    expect(find(slide.canvas, "panel-accent")).toBeUndefined();
  });

  it("supplies no fill, stroke, or radius of its own", () => {
    const slide = deck().slide({ id: "s", title: "Card" });
    slide.card("panel", { x: 1, y: 1, w: 4, h: 2 });
    const panel = find(slide.canvas, "panel")! as { style?: Record<string, unknown> };
    // The toolkit ships mechanics, not taste. An unstyled card is an unstyled
    // shape, not a house-style card.
    expect(panel.style ?? {}).toEqual({});
  });
});
