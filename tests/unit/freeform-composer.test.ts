import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";
import { DeckBuilder } from "../../src/export/deck-builder.js";
import type {
  CanvasElementSpec,
  DeckManifest,
  ElementRecord,
  PresentationOutline,
  SlideAgentConfig,
} from "../../src/types/index.js";

/**
 * Groups, symbols, picture treatments, and paragraph typography, exercised
 * through a real build.
 *
 * These are the newest primitives and the ones with the most ways to be
 * quietly wrong: an expansion that loses a child, a scale that moves the box
 * and not the type, an override applied to the wrong instance. None of that
 * throws — it just produces a slide nobody asked for.
 */

const root = path.resolve(import.meta.dirname, "../..");
const assets = path.join(root, "examples", "showcase", "assets");
let config: SlideAgentConfig;

beforeAll(async () => { config = await loadConfig(path.join(root, "config")); });

function outline(canvas: CanvasElementSpec[], extra: Partial<PresentationOutline> = {}): PresentationOutline {
  return {
    brief: {
      title: "Composer",
      audience: "Reviewers",
      objective: "Exercise the canvas primitives",
      presentationType: "technical",
      tone: "precise",
      visualDirection: "Authored for this fixture",
      slideCount: 1,
      language: "English",
      outputRequirements: [],
      keyTopics: [],
      sourcePrompt: "test",
    },
    narrative: "Every primitive reaches the manifest.",
    ...extra,
    slides: [{ id: "one", kind: "custom", title: "One", canvas }],
  };
}

async function build(canvas: CanvasElementSpec[], extra: Partial<PresentationOutline> = {}): Promise<{
  manifest: DeckManifest;
  records: ElementRecord[];
  postProcess: Awaited<ReturnType<DeckBuilder["build"]>>["postProcess"];
}> {
  const built = await new DeckBuilder(config).build(outline(canvas, extra));
  return { manifest: built.manifest, records: built.manifest.slides[0]!.elements, postProcess: built.postProcess };
}

const byName = (records: ElementRecord[], name: string) => records.find((record) => record.name === name);

describe("groups", () => {
  const legend: CanvasElementSpec = {
    id: "legend",
    type: "group",
    x: 2,
    y: 5,
    w: 4,
    h: 0.6,
    layer: "annotation",
    children: [
      { id: "swatch", type: "shape", shape: "rect", x: 0, y: 0, w: 0.3, h: 0.3, style: { fill: "8C5A2B" } },
      { id: "label", type: "text", x: 0.5, y: 0, w: 3, h: 0.3, text: "Midden", style: { fontSize: 12 } },
    ],
  } as CanvasElementSpec;

  it("positions children relative to the group's own origin", async () => {
    const { records } = await build([legend]);
    expect(byName(records, "swatch")).toMatchObject({ x: 2, y: 5, w: 0.3, h: 0.3 });
    expect(byName(records, "label")).toMatchObject({ x: 2.5, y: 5, w: 3, h: 0.3 });
    // The group itself is not an element: it expanded into its children.
    expect(byName(records, "legend")).toBeUndefined();
  });

  it("scales offsets, sizes, and type together", async () => {
    const { records } = await build([{ ...legend, scale: 2 } as CanvasElementSpec]);
    expect(byName(records, "swatch")).toMatchObject({ x: 2, y: 5, w: 0.6, h: 0.6 });
    expect(byName(records, "label")).toMatchObject({ x: 3, y: 5, w: 6, h: 0.6 });
    // Type scales with the placement, or a half-size symbol reads as full-size
    // type in a small box.
    expect(byName(records, "label")!.fontSize).toBe(24);
  });

  it("records where each child came from, and what survives as editable", async () => {
    const { records } = await build([legend]);
    for (const name of ["swatch", "label"]) {
      expect(byName(records, name)!.groupId, name).toBe("legend");
      expect(byName(records, name)!.editability, name).toBe("grouped-native");
      expect(byName(records, name)!.layer, name).toBe("annotation");
    }
  });

  it("nests, composing the offsets of both groups", async () => {
    const { records } = await build([{
      id: "outer",
      type: "group",
      x: 1,
      y: 1,
      w: 6,
      h: 3,
      children: [legend],
    } as CanvasElementSpec]);
    expect(byName(records, "swatch")).toMatchObject({ x: 3, y: 6 });
    expect(byName(records, "swatch")!.groupId).toBe("outer/legend");
  });
});

describe("symbols", () => {
  const symbol = {
    id: "marker",
    w: 2,
    h: 1,
    elements: [
      { id: "pin", type: "shape", shape: "ellipse", x: 0, y: 0, w: 0.4, h: 0.4, style: { fill: "0B5FA5" } },
      { id: "caption", type: "text", x: 0.5, y: 0, w: 1.4, h: 0.4, text: "Site", style: { fontSize: 14, color: "17191C" } },
    ] as CanvasElementSpec[],
  };

  it("fits the symbol into the box the instance declares", async () => {
    // A 2×1 symbol placed in a 1×0.5 box is drawn at half size.
    const { records } = await build([
      { id: "first", type: "symbol-instance", symbol: "marker", x: 3, y: 2, w: 1, h: 0.5 } as CanvasElementSpec,
    ], { symbols: [symbol] });
    expect(byName(records, "first.pin")).toMatchObject({ x: 3, y: 2, w: 0.2, h: 0.2 });
    expect(byName(records, "first.caption")!.fontSize).toBe(7);
  });

  it("namespaces every child so two placements never collide", async () => {
    const { records } = await build([
      { id: "first", type: "symbol-instance", symbol: "marker", x: 1, y: 1, w: 2, h: 1 } as CanvasElementSpec,
      { id: "second", type: "symbol-instance", symbol: "marker", x: 6, y: 1, w: 2, h: 1 } as CanvasElementSpec,
    ], { symbols: [symbol] });
    expect(records.map((record) => record.name)).toEqual(
      expect.arrayContaining(["first.pin", "first.caption", "second.pin", "second.caption"]),
    );
    expect(byName(records, "second.pin")!.x).toBe(6);
  });

  it("applies per-instance text, colour, and style overrides", async () => {
    const { records } = await build([
      {
        id: "here",
        type: "symbol-instance",
        symbol: "marker",
        x: 0,
        y: 0,
        w: 2,
        h: 1,
        overrides: {
          text: { caption: "Trench 4" },
          color: { pin: "C43D31", caption: "8C5A2B" },
          style: { caption: { bold: true } },
        },
      } as CanvasElementSpec,
    ], { symbols: [symbol] });
    expect(byName(records, "here.caption")!.text).toBe("Trench 4");
    // A colour override means fill on a shape and ink on text.
    expect(byName(records, "here.pin")!.fillColor).toBe("C43D31");
    expect(byName(records, "here.caption")!.textColor).toBe("8C5A2B");
    expect(byName(records, "here.caption")!.bold).toBe(true);
  });

  it("refuses an undeclared symbol by naming the ones that exist", async () => {
    await expect(build([
      { id: "x", type: "symbol-instance", symbol: "mrker", x: 0, y: 0, w: 1, h: 1 } as CanvasElementSpec,
    ], { symbols: [symbol] })).rejects.toThrow(/places symbol "mrker".*Defined: marker/s);
  });
});

describe("paragraph typography", () => {
  it("insets the frame for an authored indent rather than faking it with spaces", async () => {
    const { records } = await build([
      { id: "step", type: "text", x: 1, y: 1, w: 6, h: 0.5, text: "Tighten to 40 N·m.", style: { indent: 0.25 } } as CanvasElementSpec,
    ]);
    // The paragraph starts further in and still ends where the author put it.
    expect(byName(records, "step")).toMatchObject({ x: 1.25, w: 5.75 });
  });

  it("records columns for the export pass, keyed to its own slide", async () => {
    const { postProcess } = await build([
      { id: "spec", type: "text", x: 1, y: 1, w: 6, h: 2, text: "Two columns of copy.", style: { columns: 2 } } as CanvasElementSpec,
    ]);
    expect(postProcess).toContainEqual({ slide: 1, name: "spec", columns: { count: 2 } });
  });

  it("keeps the readable text in the manifest even when the slide gets no-break spaces", async () => {
    const { records } = await build([
      { id: "torque", type: "text", x: 1, y: 1, w: 3, h: 0.4, text: "40 N·m", style: { noBreak: true } } as CanvasElementSpec,
    ]);
    // The manifest is what every text comparison reads; it stays readable.
    expect(byName(records, "torque")!.text).toBe("40 N·m");
    expect(byName(records, "torque")!.text).not.toContain(" ");
  });
});

describe("picture treatments", () => {
  const plate = path.join(assets, "estuary-horizon.png");

  it("draws a tint as a real editable shape rather than baking it into the pixels", async () => {
    const { records } = await build([
      {
        id: "plate",
        type: "image",
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        path: plate,
        alt: "A horizon",
        treatment: { tint: { color: "C2452D", amount: 0.4 } },
      } as CanvasElementSpec,
    ]);
    const tint = byName(records, "plate-tint");
    expect(tint).toMatchObject({ type: "shape", role: "decorative", fillColor: "C2452D" });
    expect(tint!.fillTransparency).toBe(60);
  });

  it("passes crop, mask, and colour effects to the export pass", async () => {
    const { postProcess } = await build([
      {
        id: "plate",
        type: "image",
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        path: plate,
        alt: "A horizon",
        fit: "contain",
        treatment: { crop: { left: 0.1 }, maskShape: "ellipse", grayscale: true },
      } as CanvasElementSpec,
    ]);
    expect(postProcess).toContainEqual({
      slide: 1,
      name: "plate",
      picture: { crop: { left: 0.1 }, maskShape: "ellipse", grayscale: true },
    });
  });

  it("derives a cover crop from the picture's own proportions", async () => {
    // A 1600×900 source in a 4×3 frame has to lose width, not be stretched.
    const { postProcess } = await build([
      { id: "plate", type: "image", x: 0, y: 0, w: 4, h: 3, path: plate, alt: "A horizon" } as CanvasElementSpec,
    ]);
    const crop = postProcess.find((entry) => entry.name === "plate")?.picture?.crop;
    expect(crop!.left).toBeCloseTo(0.125, 3);
    expect(crop!.right).toBeCloseTo(0.125, 3);
  });

  it("states editability honestly for pixels and for vector artwork", async () => {
    const { records } = await build([
      { id: "photo", type: "image", x: 0, y: 0, w: 3, h: 2, path: plate, alt: "A horizon" } as CanvasElementSpec,
      {
        id: "art",
        type: "image",
        x: 4,
        y: 0,
        w: 3,
        h: 2,
        path: plate,
        alt: "Artwork",
        vector: { path: plate, editable: false },
      } as CanvasElementSpec,
    ]);
    expect(byName(records, "photo")!.editability).toBe("embedded-raster");
    expect(byName(records, "art")!.editability).toBe("embedded-vector");
  });
});

describe("diagram grammars", () => {
  it("marks generated primitives as built rather than placed", async () => {
    const { records } = await build([
      {
        id: "stack",
        type: "diagram",
        x: 1,
        y: 1,
        w: 8,
        h: 4,
        grammar: "layered",
        spec: { layers: [{ label: "Edge", items: ["CDN"] }, { label: "Core", items: ["API"] }] },
      } as CanvasElementSpec,
    ]);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.editability === "generated-native")).toBe(true);
  });
});

describe("anchored connectors", () => {
  const box = (id: string, x: number, y: number, w = 2, h = 1): CanvasElementSpec => ({
    id, type: "shape", shape: "roundRect", x, y, w, h, style: { fill: "203040" },
  });

  it("lands on the edges of the elements it joins", async () => {
    const { records } = await build([
      box("a", 1, 3),
      box("b", 9, 3),
      { id: "edge", type: "connector", from: "a", to: "b", route: "elbow", zIndex: -1 },
    ]);
    const path = byName(records, "edge")!.metadata!.path as Array<{ x: number; y: number }>;
    expect(path[0]!.x).toBeCloseTo(3, 6);
    expect(path.at(-1)!.x).toBeCloseTo(9, 6);
  });

  it("routes around an element between the two it joins", async () => {
    const { records } = await build([
      box("a", 1, 3),
      box("b", 10, 3),
      box("mid", 5.5, 2.8, 2, 1.5),
      { id: "edge", type: "connector", from: "a", to: "b", route: "elbow", zIndex: -1 },
    ]);
    const path = byName(records, "edge")!.metadata!.path as Array<{ x: number; y: number }>;
    // A straight run would sit at the anchors' y; a detour does not.
    expect(path.some((point) => Math.abs(point.y - 3.5) > 0.2)).toBe(true);
  });

  it("keeps a route inside the slide", async () => {
    const { records } = await build([
      box("a", 0.5, 3),
      box("b", 11, 3),
      box("mid", 5.5, 0.2, 2, 7),
      { id: "edge", type: "connector", from: "a", to: "b", route: "elbow", zIndex: -1 },
    ]);
    const path = byName(records, "edge")!.metadata!.path as Array<{ x: number; y: number }>;
    for (const point of path) {
      expect(point.y).toBeGreaterThanOrEqual(-0.001);
      expect(point.y).toBeLessThanOrEqual(config.dimensions.height + 0.001);
    }
  });

  it("honours an explicitly requested side", async () => {
    const { records } = await build([
      box("a", 1, 3),
      box("b", 9, 3),
      { id: "edge", type: "connector", from: { id: "a", side: "top" }, to: { id: "b", side: "top" }, zIndex: -1 },
    ]);
    const path = byName(records, "edge")!.metadata!.path as Array<{ x: number; y: number }>;
    expect(path[0]!.y).toBeCloseTo(3, 6);
  });

  it("draws a curved route as a curve", async () => {
    const { records } = await build([
      box("a", 1, 3),
      box("b", 9, 3),
      { id: "edge", type: "connector", from: "a", to: "b", route: "curved", zIndex: -1 },
    ]);
    // A flattened cubic has far more points than an elbow's handful of bends.
    expect((byName(records, "edge")!.metadata!.path as unknown[]).length).toBeGreaterThan(8);
  });

  it("exempts the elements it joins from overlap reporting", async () => {
    const { records } = await build([
      box("a", 1, 3),
      box("b", 9, 3),
      { id: "edge", type: "connector", from: "a", to: "b", zIndex: -1 },
    ]);
    expect(byName(records, "edge")!.allowOverlapWith).toEqual(expect.arrayContaining(["a", "b"]));
    expect(byName(records, "edge")!.intentionalOverlap).toBe(false);
  });

  it("anchors to an element inside a group", async () => {
    const { records } = await build([
      {
        id: "cluster", type: "group", x: 1, y: 2, w: 5, h: 2, children: [
          box("inner", 0, 0, 2, 1),
        ],
      },
      box("far", 9, 2.2),
      { id: "edge", type: "connector", from: "cluster.inner", to: "far", zIndex: -1 },
    ]);
    expect(byName(records, "edge")).toBeDefined();
  });

  it("names the anchor it cannot find", async () => {
    await expect(build([
      box("a", 1, 3),
      { id: "edge", type: "connector", from: "a", to: "ghost", zIndex: -1 },
    ])).rejects.toThrow(/anchors to "ghost"/);
  });

  it("still draws a plain vector connector when no anchors are given", async () => {
    const { records } = await build([
      { id: "rule", type: "connector", x: 1, y: 6, w: 10, h: 0, style: { color: "35D0BA" } },
    ]);
    const record = byName(records, "rule")!;
    expect(record.x).toBeCloseTo(1, 6);
    expect(record.w).toBeCloseTo(10, 6);
  });
});
