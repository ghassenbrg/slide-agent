import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  columns,
  defineDeck,
  distribute,
  grid,
  inset,
  measureText,
  rows,
  split,
} from "../../src/authoring/index.js";
import { runBuildScript } from "../../src/authoring/run-script.js";
import { withSlideChrome } from "../../src/design/slide-chrome.js";
import { serializeSceneNdjson } from "../../src/serialization/scene-ndjson.js";
import { parseSceneNdjson } from "../../src/serialization/scene-ndjson.js";

const brief = {
  title: "Test",
  audience: "engineers",
  objective: "verify the authoring surface",
  presentationType: "technical" as const,
  tone: "plain",
  language: "English",
};

function deck() {
  return defineDeck({ brief, narrative: "A narrative." });
}

describe("layout helpers", () => {
  it("splits a frame into columns that fill it exactly", () => {
    const cells = columns({ x: 1, y: 2, w: 12, h: 3 }, 4, 0.3);
    expect(cells).toHaveLength(4);
    expect(cells[0]!.x).toBe(1);
    expect(cells[3]!.x + cells[3]!.w).toBeCloseTo(13, 6);
    // Even rhythm is the whole point: every gap identical, every width identical.
    const widths = new Set(cells.map((cell) => Number(cell.w.toFixed(6))));
    expect(widths.size).toBe(1);
  });

  it("splits a frame into rows that fill it exactly", () => {
    const cells = rows({ x: 0, y: 0, w: 10, h: 6 }, 3, 0.5);
    expect(cells[2]!.y + cells[2]!.h).toBeCloseTo(6, 6);
  });

  it("lays a grid out in row-major order", () => {
    const cells = grid({ x: 0, y: 0, w: 12, h: 6 }, { columns: 3, rows: 2, gap: 0 });
    expect(cells).toHaveLength(6);
    expect(cells[0]!.y).toBe(0);
    expect(cells[3]!.y).toBe(3);
    expect(cells[1]!.x).toBe(4);
  });

  it("insets evenly or per side", () => {
    expect(inset({ x: 0, y: 0, w: 10, h: 10 }, 1)).toEqual({ x: 1, y: 1, w: 8, h: 8 });
    expect(inset({ x: 0, y: 0, w: 10, h: 10 }, { left: 2 })).toEqual({ x: 2, y: 0, w: 8, h: 10 });
  });

  it("splits a frame along a ratio with a gutter", () => {
    const [left, right] = split({ x: 0, y: 0, w: 10, h: 4 }, 0.6, 1);
    expect(left.w).toBeCloseTo(5.4, 6);
    expect(right.x).toBeCloseTo(6.4, 6);
    expect(right.x + right.w).toBeCloseTo(10, 6);
  });

  it("distributes items of unequal size across a frame", () => {
    const laid = distribute({ x: 0, y: 0, w: 10, h: 1 }, [2, 4, 2]);
    expect(laid[0]!.x).toBe(0);
    expect(laid[2]!.x + laid[2]!.w).toBeCloseTo(10, 6);
  });
});

describe("measuring before placing", () => {
  it("reports the lines a string wraps to", () => {
    const measured = measureText({ text: "A reasonably long sentence that will not fit on one line", w: 2, fontSize: 18 });
    expect(measured.lines).toBeGreaterThan(1);
    expect(measured.height).toBeGreaterThan(0);
  });

  it("says when a block needs more height than the frame allows", () => {
    const text = "A reasonably long sentence that will certainly need several lines at this width";
    expect(measureText({ text, w: 2, h: 0.4, fontSize: 18 }).overflows).toBe(true);
    expect(measureText({ text, w: 2, h: 6, fontSize: 18 }).overflows).toBe(false);
  });

  it("grows an autoHeight text box to the height its own text needs", () => {
    const built = deck();
    const slide = built.slide({ id: "s", title: "T" });
    const handle = slide.text("body", "A sentence long enough that it has to wrap more than once at this width.", {
      x: 1, y: 1, w: 3, h: 0.2, autoHeight: true, style: { fontSize: 18 },
    });
    expect(handle.h).toBeGreaterThan(0.2);
  });
});

describe("the slide builder", () => {
  it("returns handles that describe where an element landed", () => {
    const slide = deck().slide({ id: "s", title: "T" });
    const box = slide.shape("box", "rect", { x: 2, y: 3, w: 4, h: 1 });
    expect(box.right).toBe(6);
    expect(box.bottom).toBe(4);
    expect(box.centerX).toBe(4);
  });

  it("refuses two elements with the same id on one slide", () => {
    const slide = deck().slide({ id: "s", title: "T" });
    slide.text("a", "first", {});
    // Ids are how a patch addresses an element, so a duplicate is a defect the
    // author has to see now rather than when a revision hits the wrong shape.
    expect(() => slide.text("a", "second", {})).toThrow(/already has an element called "a"/);
  });

  it("anchors a connector to element ids and paints it behind by default", () => {
    const slide = deck().slide({ id: "s", title: "T" });
    const a = slide.shape("a", "rect", { x: 1, y: 1, w: 2, h: 1 });
    const b = slide.shape("b", "rect", { x: 8, y: 1, w: 2, h: 1 });
    slide.connect("edge", a, b, { route: "elbow" });
    const spec = slide.toSpec();
    const connector = spec.canvas!.find((element) => element.id === "edge")!;
    expect(connector).toMatchObject({ type: "connector", from: "a", to: "b", route: "elbow", zIndex: -1 });
  });

  it("carries an explicit side onto the endpoint", () => {
    const slide = deck().slide({ id: "s", title: "T" });
    slide.shape("a", "rect", { x: 1, y: 1, w: 2, h: 1 });
    slide.shape("b", "rect", { x: 8, y: 1, w: 2, h: 1 });
    slide.connect("edge", "a", "b", { fromSide: "top", toSide: "bottom" });
    const connector = slide.toSpec().canvas!.find((element) => element.id === "edge")!;
    expect(connector).toMatchObject({ from: { id: "a", side: "top" }, to: { id: "b", side: "bottom" } });
  });

  it("refuses a symbol the deck never declared", () => {
    const built = deck();
    const slide = built.slide({ id: "s", title: "T" });
    expect(() => slide.symbol("one", "missing", {})).toThrow(/does not define/);
  });
});

describe("the outline a script produces", () => {
  it("round-trips through the scene format unchanged", () => {
    const built = deck();
    const slide = built.slide({ id: "flow", title: "Flow", background: "0B1020" });
    const cells = columns({ x: 0.7, y: 3, w: 12, h: 1 }, 3, 0.2);
    const ids = cells.map((cell, index) => slide.shape(`n${index}`, "roundRect", { ...cell, style: { fill: "141C2F" } }).id);
    ids.slice(1).forEach((id, index) => slide.connect(`e${index}`, ids[index]!, id));

    const outline = built.toOutline();
    const scene = serializeSceneNdjson(outline);
    const parsed = parseSceneNdjson(scene);
    expect(parsed.slides).toHaveLength(1);
    const connector = parsed.slides[0]!.canvas!.find((element) => element.id === "e0")!;
    // An anchored connector has no frame to write, and must survive a scene
    // round-trip without one being invented for it.
    expect(connector).toMatchObject({ type: "connector", from: "n0", to: "n1" });
    expect(scene).not.toContain("null");
  });

  it("refuses to produce a deck with no slides", () => {
    expect(() => deck().toOutline()).toThrow(/produced no slides/);
  });
});

describe("running a build script", () => {
  let directory: string;
  beforeAll(async () => { directory = await mkdtemp(path.join(tmpdir(), "slide-agent-script-")); });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

  const authoring = path.resolve(import.meta.dirname, "../../src/authoring/index.ts");

  async function script(name: string, body: string): Promise<string> {
    const file = path.join(directory, name);
    await writeFile(file, body, "utf8");
    return file;
  }

  it("takes the deck from a default export", async () => {
    const file = await script("default.mjs", `
      import { defineDeck } from ${JSON.stringify(authoring)};
      const deck = defineDeck({ brief: ${JSON.stringify(brief)}, narrative: "n" });
      deck.slide({ id: "a", title: "A" }).text("t", "hello", { x: 1, y: 1, w: 4, h: 1 });
      export default deck;
    `);
    const outline = await runBuildScript(file);
    expect(outline.slides).toHaveLength(1);
    expect(outline.slides[0]!.canvas![0]).toMatchObject({ id: "t", text: "hello" });
  });

  it("takes the deck from an async build function", async () => {
    const file = await script("build.mjs", `
      import { defineDeck } from ${JSON.stringify(authoring)};
      export async function build() {
        const deck = defineDeck({ brief: ${JSON.stringify(brief)}, narrative: "n" });
        deck.slide({ id: "a", title: "A" }).text("t", "hi", { x: 1, y: 1, w: 4, h: 1 });
        return deck;
      }
    `);
    expect((await runBuildScript(file)).slides).toHaveLength(1);
  });

  it("explains itself when a script exports nothing usable", async () => {
    const file = await script("empty.mjs", "export const unrelated = 1;");
    await expect(runBuildScript(file)).rejects.toThrow(/did not export a deck/);
  });

  it("reports the script's own error rather than a stack from inside the engine", async () => {
    const file = await script("throws.mjs", "throw new Error('the brief file is missing');");
    await expect(runBuildScript(file)).rejects.toThrow(/the brief file is missing/);
  });
});

describe("slide chrome", () => {
  function chromedDeck() {
    return defineDeck({
      brief,
      narrative: "n",
      slideChrome: {
        elements: [
          { id: "kicker", type: "text", x: 0.7, y: 0.4, w: 6, h: 0.3, text: "{{kicker}}", role: "eyebrow" },
          { id: "number", type: "text", x: 12, y: 0.4, w: 0.6, h: 0.3, text: "{{slideNumberPadded}}", role: "decorative" },
          { id: "brand", type: "text", x: 10, y: 7, w: 2.6, h: 0.3, text: "{{deckTitle}} · {{slideNumber}}/{{slideCount}}", role: "footer" },
        ],
        skipSlides: ["cover"],
      },
    });
  }

  it("repeats the deck's own furniture on every slide with per-slide values", () => {
    const built = chromedDeck();
    built.slide({ id: "cover", title: "Cover" }).text("t", "Cover", { x: 1, y: 3, w: 8, h: 1 });
    built.slide({ id: "one", title: "One", chrome: { kicker: "Architecture" } }).text("t", "One", { x: 1, y: 3, w: 8, h: 1 });
    built.slide({ id: "two", title: "Two", chrome: { kicker: "Rollout" } }).text("t", "Two", { x: 1, y: 3, w: 8, h: 1 });

    const outline = built.toOutline();
    const chromed = withSlideChrome(outline.slides[1]!, outline.slideChrome, {
      slideNumber: 2, slideCount: 3, deckTitle: "Test",
    });
    const text = (id: string) => chromed.canvas!.find((element) => element.id === id) as { text?: string } | undefined;
    expect(text("chrome.kicker")?.text).toBe("Architecture");
    expect(text("chrome.number")?.text).toBe("02");
    expect(text("chrome.brand")?.text).toBe("Test · 2/3");
  });

  it("leaves a skipped slide alone", () => {
    const built = chromedDeck();
    built.slide({ id: "cover", title: "Cover" }).text("t", "Cover", { x: 1, y: 3, w: 8, h: 1 });
    const outline = built.toOutline();
    const chromed = withSlideChrome(outline.slides[0]!, outline.slideChrome, { slideNumber: 1, slideCount: 1, deckTitle: "Test" });
    expect(chromed.canvas!.map((element) => element.id)).toEqual(["t"]);
  });

  it("drops a chrome element whose token resolved to nothing", () => {
    const built = chromedDeck();
    // This slide never supplies a kicker, so an empty band is the honest
    // rendering — not a literal "{{kicker}}" left showing on the slide.
    built.slide({ id: "one", title: "One" }).text("t", "One", { x: 1, y: 3, w: 8, h: 1 });
    const outline = built.toOutline();
    const chromed = withSlideChrome(outline.slides[0]!, outline.slideChrome, { slideNumber: 1, slideCount: 1, deckTitle: "Test" });
    expect(chromed.canvas!.map((element) => element.id)).not.toContain("chrome.kicker");
    expect(JSON.stringify(chromed.canvas)).not.toContain("{{");
  });

  it("honours a slide that suppresses chrome outright", () => {
    const built = chromedDeck();
    built.slide({ id: "one", title: "One", chrome: false }).text("t", "One", { x: 1, y: 3, w: 8, h: 1 });
    const outline = built.toOutline();
    const chromed = withSlideChrome(outline.slides[0]!, outline.slideChrome, { slideNumber: 1, slideCount: 1, deckTitle: "Test" });
    expect(chromed.canvas!).toHaveLength(1);
  });

  it("splices chrome in by where it sits, so reading order survives", () => {
    const built = chromedDeck();
    built.slide({ id: "one", title: "One", chrome: { kicker: "K" } }).text("t", "One", { x: 1, y: 3, w: 8, h: 1 });
    const outline = built.toOutline();
    const chromed = withSlideChrome(outline.slides[0]!, outline.slideChrome, { slideNumber: 1, slideCount: 1, deckTitle: "Test" });
    // Paint order is reading order: the kicker and number sit above the
    // content and are announced first; the footer sits below it and is
    // announced last, rather than being read out before the slide's own title.
    expect(chromed.canvas!.map((element) => element.id)).toEqual([
      "chrome.kicker", "chrome.number", "t", "chrome.brand",
    ]);
  });

  it("re-colours chrome per variant without restating it", () => {
    const built = defineDeck({
      brief, narrative: "n",
      slideChrome: {
        elements: [{ id: "kicker", type: "text", x: 0.7, y: 0.4, w: 6, h: 0.3, text: "{{kicker}}", style: { color: "35D0BA" } }],
        variants: { paper: { kicker: { color: "0F6F62" } } },
      },
    });
    built.slide({ id: "dark", title: "D", chrome: { kicker: "K" } }).text("t", "x", { x: 1, y: 3, w: 4, h: 1 });
    built.slide({ id: "light", title: "L", chrome: { kicker: "K", variant: "paper" } }).text("t", "x", { x: 1, y: 3, w: 4, h: 1 });
    const outline = built.toOutline();
    const colorOf = (index: number) => {
      const chromed = withSlideChrome(outline.slides[index]!, outline.slideChrome, { slideNumber: index + 1, slideCount: 2, deckTitle: "Test" });
      return (chromed.canvas!.find((element) => element.id === "chrome.kicker") as { style?: { color?: string } }).style?.color;
    };
    expect(colorOf(0)).toBe("35D0BA");
    expect(colorOf(1)).toBe("0F6F62");
  });
});
