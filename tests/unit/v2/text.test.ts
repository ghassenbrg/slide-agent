import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { searchFamilies, classifyByName, isOfficeFamily, officeSubstitute } from "../../../src/v2/text/catalog.js";
import { TextEngine } from "../../../src/v2/text/measure.js";
import { applyCase, parseInline, parseRichText, plainText } from "../../../src/v2/text/rich.js";
import { embeddingAllowed, GlyphMetrics, parseFaces } from "../../../src/v2/text/sfnt.js";
import { fixtureFonts, fixtureRegistry, fixtureText } from "./helpers.js";

describe("font files", () => {
  it("reads names, weights, metrics, and the character map", async () => {
    const bytes = new Uint8Array(await readFile(path.join(fixtureFonts, "Inter-700.ttf")));
    const [face] = parseFaces(bytes);
    expect(face!.family).toBe("Inter");
    expect(face!.subfamily).toBe("Bold");
    expect(face!.weight).toBe(700);
    expect(face!.outlines).toBe("truetype");
    expect(embeddingAllowed(face!).allowed).toBe(true);
    const metrics = new GlyphMetrics(bytes, face!);
    expect(metrics.hasGlyph(65)).toBe(true);
    expect(metrics.advance(0x4e2d)).toBeGreaterThanOrEqual(0);
    expect(metrics.advance(87)).toBeGreaterThan(metrics.advance(105)); // W wider than i
    expect(() => parseFaces(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toThrow(/Not a TrueType/);
  });

  it("indexes a directory and resolves the closest weight, with substitutes for Office faces", async () => {
    const registry = fixtureRegistry();
    expect(await registry.families()).toEqual(expect.arrayContaining(["Inter", "Source Serif 4", "JetBrains Mono", "Carlito"]));
    expect((await registry.find("Inter", 600))!.weight).toBe(700);
    expect((await registry.find("inter", 300))!.weight).toBe(400);
    const calibri = await registry.resolve("Calibri", 400);
    expect(calibri?.substituteFor).toBe("Calibri");
    expect(await registry.resolve("Nonexistent Grotesk")).toBeUndefined();
    expect((await registry.closestAvailable("Intr"))[0]).toBe("Inter");
  });
});

describe("catalog", () => {
  it("searches families and knows Office faces", () => {
    expect(searchFamilies("mono").every((family) => family.classes.includes("mono") || /mono|code|courier|consolas/i.test(family.family))).toBe(true);
    expect(isOfficeFamily("calibri")).toBe(true);
    expect(officeSubstitute("Arial")).toBe("Arimo");
    expect(classifyByName("Fancy Slab")).toEqual(["slab"]);
  });
});

describe("rich text", () => {
  it("parses inline markup, lists, and case", () => {
    expect(parseInline("a **b** *c* `d` [e](https://x.dev)")).toEqual([
      { text: "a " }, { text: "b", bold: true }, { text: " " }, { text: "c", italic: true }, { text: " " }, { text: "d", mono: true }, { text: " " }, { text: "e", link: "https://x.dev" },
    ]);
    const paragraphs = parseRichText("- one\n  - two\n1. three\nplain");
    expect(paragraphs.map((paragraph) => [paragraph.bullet, paragraph.level])).toEqual([["bullet", 0], ["bullet", 1], ["number", 0], [undefined, 0]]);
    expect(plainText(paragraphs)).toBe("one\ntwo\nthree\nplain");
    expect(applyCase("hello world", "title")).toBe("Hello World");
    expect(applyCase("a", "upper")).toBe("A");
  });
});

describe("measurement and wrapping", () => {
  it("measures from font files and wraps greedily with balanced widths", async () => {
    const text = fixtureText();
    const face = await text.load({ family: "Inter", weight: 400, italic: false });
    expect(face.source).toBe("font-file");
    const width = text.width("Hello world", face, 18);
    expect(width).toBeGreaterThan(1.2);
    expect(width).toBeLessThan(1.6);
    const input = { paragraphs: parseRichText("Every wave clears the same six gates"), size: 36, leading: 1.1, width: 6, faceFor: () => face };
    const layout = text.layout(input);
    expect(layout.lineCount).toBe(2);
    expect(layout.height).toBeCloseTo((2 * 36 * 1.1) / 72, 5);
    const balanced = text.balancedWidth(input);
    expect(balanced).toBeLessThan(6);
    expect(text.layout({ ...input, width: balanced }).lineCount).toBe(2);
    expect(text.minContentWidth(input)).toBeGreaterThan(0.5);
  });

  it("breaks CJK between characters and never before closing punctuation", async () => {
    const text = fixtureText();
    const face = await text.load({ family: "Inter", weight: 400, italic: false });
    const layout = text.layout({ paragraphs: parseRichText("日本語のテキストは、単語の間にスペースがありません。"), size: 24, leading: 1.2, width: 2, faceFor: () => face });
    expect(layout.lineCount).toBeGreaterThan(2);
    expect(layout.lines.every((line) => !line.segments[0]?.text.startsWith("、"))).toBe(true);
  });

  it("falls back to class tables for faces with no file, and says so", async () => {
    const text = new TextEngine();
    const face = await text.load({ family: "Missing Serif", weight: 700, italic: false });
    expect(face.source).toBe("table");
    expect(face.bold).toBe(true);
    expect(text.width("abc", face, 12)).toBeGreaterThan(0);
    expect(text.face({ family: "Other", weight: 400, italic: false }).source).toBe("table");
  });
});
