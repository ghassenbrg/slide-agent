import { readFile } from "node:fs/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildScene, type BuiltScene } from "../../../src/v2/engine/scene-builder.js";
import { pathBoundsOf, parsePath, pathsToCustGeom } from "../../../src/v2/ooxml/custgeom.js";
import { subsetTrueType, toEot } from "../../../src/v2/ooxml/fonts.js";
import { writePackage } from "../../../src/v2/ooxml/writer.js";
import { GlyphMetrics, parseFaces } from "../../../src/v2/text/sfnt.js";
import { setBuildTimestamp } from "../../../src/utils/reproducible.js";
import { PackageValidator } from "../../../src/validation/package-validator.js";
import { SchemaValidator } from "../../../src/validation/schema-validator.js";
import { fixtureFonts, fixtureText, intent, language, root } from "./helpers.js";

let workspace: string;
let built: BuiltScene;

beforeAll(async () => {
  setBuildTimestamp(new Date("2026-01-01T00:00:00Z"));
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-writer-"));
  const result = await buildScene(intent([
    { id: "cover", message: "m", notes: "Open with the decision.", compose: { grid: "12x6", items: [
      { at: "c1-8 r2-4", column: { gap: "space.2", items: [{ text: "Zero trust, *one* wave at a time", role: "title" }, { text: "- first point\n- second [link](https://example.com)", role: "body" }] } },
      { at: "c9-12 r1-6", bleed: ["right", "top", "bottom"], image: { asset: "poppler-slide.png", alt: "A slide render", treatment: "grayscale" } },
    ] } },
    { id: "data", message: "m", compose: { grid: "12x6", items: [
      { at: "c1-6 r1-6", chart: { data: { categories: ["Q1", "Q2", "Q3"], series: [{ name: "A", values: [1, 2, 3] }, { name: "B", values: [2, 1, 4] }] }, chart: "line" } },
      { at: "c7-12 r1-3", table: { data: { columns: ["Name", "Value"], rows: [["x", 1], ["y", 2]] } } },
      { at: "c7-9 r4-6", chart: { data: { categories: ["a", "b", "c"], series: [{ name: "Share", values: [50, 30, 20] }] }, chart: "doughnut" } },
      { at: "c10-12 r4-6", chart: { data: { categories: ["Start", "Up", "Down"], series: [{ name: "Bridge", values: [10, 5, -3] }] }, chart: "waterfall" } },
    ] } },
    { id: "shapes", message: "m", hidden: true, compose: { row: { gap: "space.4", connect: "arrow", items: [
      { shape: "ellipse", fill: "accent/40", stroke: "text" },
      { icon: "shield-check", size: 48 },
      { shape: { path: "M0 0 L1 0 L0.5 1 Z" }, fill: "accentAlt" },
      { layer: { items: [{ texture: "gradient-wash" }, { texture: "corner-ticks" }, { text: "Layered", role: "h2" }] } },
    ] } } },
  ], { options: { chrome: { slideNumbers: true, footer: "Footer" } }, design: { language: language({ surfaces: { card: { fill: "surface", radius: 8, shadow: "soft" } } }) } }), { text: fixtureText(), baseDir: path.join(root, "tests", "fixtures") });
  if (!result.intent) throw new Error(JSON.stringify(result.findings));
  built = result;
});

afterAll(async () => {
  setBuildTimestamp(undefined);
  await rm(workspace, { recursive: true, force: true });
});

describe("native writer", () => {
  it("writes a package that validates against the ECMA-376 schemas", async () => {
    const written = await writePackage(built.scene, { theme: built.theme, embedFonts: true });
    const file = path.join(workspace, "deck.pptx");
    await writeFile(file, written.bytes);
    expect(await new SchemaValidator().validate(file)).toEqual([]);
    expect((await new PackageValidator().validate(file)).issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(written.embeddedFonts.map((font) => font.typeface)).toEqual(expect.arrayContaining(["Inter", "Source Serif 4"]));
    expect(written.colorReferences.theme / (written.colorReferences.theme + written.colorReferences.literal)).toBeGreaterThan(0.6);
  }, 120_000);

  it("uses placeholders, theme fonts and colours, notes, charts with workbooks, and hidden slides", async () => {
    const written = await writePackage(built.scene, { theme: built.theme, embedFonts: true });
    const zip = await JSZip.loadAsync(written.bytes);
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining(["ppt/charts/chart1.xml", "ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx", "ppt/notesSlides/notesSlide1.xml", "ppt/fonts/font1.fntdata"]));
    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide1).toContain('<p:ph type="title"/>');
    expect(slide1).toContain('typeface="+mj-lt"');
    expect(slide1).toContain("<a:schemeClr");
    expect(slide1).toContain("<a:buChar");
    expect(slide1).toContain("<a:grayscl/>");
    expect(await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string")).toContain('TargetMode="External"');
    expect(await zip.file("ppt/slides/slide3.xml")!.async("string")).toContain('show="0"');
    expect(await zip.file("ppt/slides/slide3.xml")!.async("string")).toContain("<a:custGeom>");
    const presentation = await zip.file("ppt/presentation.xml")!.async("string");
    expect(presentation).toContain("<p:embeddedFontLst>");
    const theme = await zip.file("ppt/theme/theme1.xml")!.async("string");
    expect(theme).toContain('<a:latin typeface="Source Serif 4"/>');
    expect(names[0]).toBe("[Content_Types].xml");
  });

  it("is deterministic for a pinned timestamp", async () => {
    const first = await writePackage(built.scene, { theme: built.theme, embedFonts: true });
    const second = await writePackage(built.scene, { theme: built.theme, embedFonts: true });
    expect(Buffer.compare(first.bytes, second.bytes)).toBe(0);
  });

  it("refuses links outside the scheme allowlist", async () => {
    const scene = structuredClone(built.scene);
    const text = scene.slides[0]!.elements.find((element) => element.kind === "text")!;
    if (text.kind === "text") text.paragraphs[0]!.runs[0]!.link = "file:///etc/passwd";
    const written = await writePackage(scene, { theme: built.theme, embedFonts: false });
    expect(written.rejectedLinks[0]).toContain("file:");
    expect(written.embeddedFonts).toEqual([]);
  });
});

describe("custom geometry", () => {
  it("parses every path command, including arcs and smooth curves", () => {
    const commands = parsePath("M10 10 h5 v5 H0 V0 L2 2 C1 1 2 2 3 3 S5 5 6 6 Q7 7 8 8 T9 9 A2 2 0 01 12 12 z m1 1 l1 1");
    expect(commands.map((command) => command.op)).toEqual(["M", "L", "L", "L", "L", "L", "C", "C", "Q", "Q", "C", "C", "Z", "M", "L"]);
    expect(pathBoundsOf("M0 0 L10 5").w).toBe(10);
    const xml = pathsToCustGeom([{ d: "M0 0L24 24", fill: false, stroke: true }], { w: 24, h: 24 });
    expect(xml).toContain('fill="none"');
    expect(xml).toContain("<a:lnTo>");
  });
});

describe("font embedding", () => {
  it("subsets TrueType keeping glyph ids, and wraps it as EOT", async () => {
    const bytes = new Uint8Array(await readFile(path.join(fixtureFonts, "Inter-400.ttf")));
    const subset = subsetTrueType(bytes, [..."Hello"].map((character) => character.codePointAt(0)!));
    expect(subset.length).toBeLessThan(bytes.length);
    const face = parseFaces(subset)[0]!;
    expect(face.family).toBe("Inter");
    expect(new GlyphMetrics(subset, face).advance(72)).toBeCloseTo(new GlyphMetrics(bytes, parseFaces(bytes)[0]!).advance(72), 6);
    const eot = toEot(subset);
    const view = new DataView(eot.buffer, eot.byteOffset, eot.byteLength);
    expect(view.getUint32(0, true)).toBe(eot.length);
    expect(view.getUint32(4, true)).toBe(subset.length);
    expect(view.getUint32(8, true)).toBe(0x00020001);
    expect(view.getUint16(34, true)).toBe(0x504c);
  });
});
