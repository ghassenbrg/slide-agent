import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  chartFromData,
  loadDataTable,
  parseDelimited,
  parseDelimitedLine,
  parseJsonRows,
  provenanceNote,
  tableFromData,
} from "../../src/data/connectors.js";
import { diffDecks, formatDiff } from "../../src/serialization/diff.js";
import { GRAMMAR_SCHEMAS, renderGrammar } from "../../src/diagrams/grammars.js";
import { Grid, slideFormat } from "../../src/design/grid.js";
import { resolveTokens } from "../../src/design/tokens.js";
import { loadConfig } from "../../src/config/load-config.js";
import { fallbackFontFor, isRightToLeft, withSecondaryLanguage } from "../../src/design/bilingual.js";
import { ElementWriter } from "../../src/components/element-writer.js";
import type { DeckManifest, ElementRecord, SlideAgentConfig } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
let workspace: string;
let config: SlideAgentConfig;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-phase3-"));
  config = await loadConfig(path.join(root, "config"));
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

const source = { label: "test" };

describe("data connectors", () => {
  it("parses quoted CSV fields, escaped quotes, and embedded delimiters", () => {
    expect(parseDelimitedLine('a,"b,c","say ""hi""",d', ",")).toEqual(["a", "b,c", 'say "hi"', "d"]);
  });

  it("coerces numerics while leaving genuine text alone", () => {
    const table = parseDelimited("region,revenue,note\nNorth,\"1,200\",strong\nSouth,980,weak", { source });
    expect(table.rows[0]).toEqual(["North", 1200, "strong"]);
    expect(table.rows[1]).toEqual(["South", 980, "weak"]);
  });

  it("refuses ragged rows rather than silently shifting columns", () => {
    expect(() => parseDelimited("a,b,c\n1,2", { source })).toThrow(/Row 2 has 2 fields but the header has 3/);
  });

  it("reads JSON rows with a union of keys", () => {
    const table = parseJsonRows('[{"a":1,"b":2},{"a":3,"c":4}]', source);
    expect(table.headers).toEqual(["a", "b", "c"]);
    expect(table.rows[1]).toEqual([3, "", 4]);
  });

  it("builds a chart from every numeric column by default", () => {
    const table = parseDelimited("quarter,revenue,cost\nQ1,10,4\nQ2,14,5", { source });
    const chart = chartFromData(table);
    expect(chart.labels).toEqual(["Q1", "Q2"]);
    expect(chart.series.map((series) => series.name)).toEqual(["revenue", "cost"]);
    expect(chart.series[0]!.values).toEqual([10, 14]);
  });

  it("refuses to plot a column that is not numeric", () => {
    const table = parseDelimited("quarter,note\nQ1,strong\nQ2,weak", { source });
    expect(() => chartFromData(table)).toThrow(/No numeric columns/);
    const mixed = parseDelimited("quarter,revenue,note\nQ1,10,strong", { source });
    expect(() => chartFromData(mixed, { valueColumns: ["note"] })).toThrow(/non-numeric/);
  });

  it("names the available columns when one is missing", () => {
    const table = parseDelimited("quarter,revenue\nQ1,10", { source });
    expect(() => chartFromData(table, { labelColumn: "period" })).toThrow(/Available: quarter, revenue/);
  });

  it("caps table rows and records provenance", () => {
    const rows = Array.from({ length: 30 }, (_, index) => `r${index},${index}`).join("\n");
    const table = parseDelimited(`name,value\n${rows}`, { source });
    expect(tableFromData(table).rows).toHaveLength(12);
    expect(tableFromData(table, { maximumRows: 3 }).rows).toHaveLength(3);
    expect(provenanceNote(table)).toContain("30 row(s)");
  });

  it("loads csv, tsv, and json from disk and rejects other formats", async () => {
    await writeFile(path.join(workspace, "a.csv"), "x,y\n1,2", "utf8");
    await writeFile(path.join(workspace, "a.tsv"), "x\ty\n1\t2", "utf8");
    await writeFile(path.join(workspace, "a.json"), '[{"x":1,"y":2}]', "utf8");
    await writeFile(path.join(workspace, "a.xml"), "<x/>", "utf8");

    for (const name of ["a.csv", "a.tsv", "a.json"]) {
      const table = await loadDataTable(path.join(workspace, name));
      expect(table.headers, name).toEqual(["x", "y"]);
      expect(table.rows[0], name).toEqual([1, 2]);
    }
    await expect(loadDataTable(path.join(workspace, "a.xml"))).rejects.toMatchObject({ code: "DATA_UNSUPPORTED" });
    await expect(loadDataTable(path.join(workspace, "nope.csv"))).rejects.toMatchObject({ code: "DATA_NOT_FOUND" });
  });
});

function element(overrides: Partial<ElementRecord> & { id: string; name: string }): ElementRecord {
  return { type: "text", role: "body", x: 1, y: 1, w: 4, h: 0.5, ...overrides };
}

function manifest(slides: Array<{ title: string; elements: ElementRecord[] }>): DeckManifest {
  return {
    schemaVersion: "1.0",
    presentationTitle: "Deck",
    width: 13.333333,
    height: 7.5,
    createdAt: "2026-01-01T00:00:00.000Z",
    slides: slides.map((slide, index) => ({
      number: index + 1,
      id: `s${index + 1}`,
      title: slide.title,
      kind: "text-image",
      elements: slide.elements,
      notes: [],
    })),
  };
}

describe("deck diff", () => {
  const base = manifest([
    { title: "One", elements: [element({ id: "001-a", name: "a", text: "Hello" })] },
    { title: "Two", elements: [element({ id: "001-b", name: "b", text: "World" })] },
  ]);

  it("reports an identical deck as identical", () => {
    const diff = diffDecks(base, structuredClone(base));
    expect(diff.identical).toBe(true);
    expect(formatDiff(diff)).toContain("semantically identical");
  });

  it("names which field changed", () => {
    const after = structuredClone(base);
    after.slides[0]!.elements[0]!.text = "Goodbye";
    const diff = diffDecks(base, after);
    expect(diff.identical).toBe(false);
    expect(diff.slides[0]!.elements[0]!.fields).toEqual(["text"]);
    expect(diff.slides[1]!.kind).toBe("unchanged");
  });

  it("distinguishes a move from a rewrite", () => {
    const after = structuredClone(base);
    after.slides[0]!.elements[0]!.x = 5;
    const diff = diffDecks(base, after);
    expect(diff.slides[0]!.elements[0]!.kind).toBe("moved");
  });

  it("matches elements by name so an insertion does not read as a rewrite", () => {
    const after = structuredClone(base);
    // A new element shifts every later id, but names are stable.
    after.slides[0]!.elements.unshift(element({ id: "001-new", name: "new", text: "Added" }));
    after.slides[0]!.elements[1]!.id = "002-a";
    const diff = diffDecks(base, after);
    const kinds = diff.slides[0]!.elements.map((change) => change.kind);
    expect(kinds).toEqual(["added"]);
  });

  it("reports added and removed slides", () => {
    const longer = manifest([
      { title: "One", elements: [element({ id: "001-a", name: "a", text: "Hello" })] },
      { title: "Two", elements: [element({ id: "001-b", name: "b", text: "World" })] },
      { title: "Three", elements: [element({ id: "001-c", name: "c", text: "New" })] },
    ]);
    expect(diffDecks(base, longer).summary.slidesAdded).toBe(1);
    expect(diffDecks(longer, base).summary.slidesRemoved).toBe(1);
  });
});

describe("diagram grammars", () => {
  const dimensions = slideFormat("16:9");
  const frame = { x: 1, y: 1.5, w: 11, h: 5 };

  function renderInto(id: string, spec: unknown): ElementRecord[] {
    const tokens = resolveTokens(config, { geometry: "sharp" });
    const records: ElementRecord[] = [];
    const slide = { addText() {}, addShape() {}, addImage() {}, addTable() {}, addChart() {}, addNotes() {}, background: {} };
    const writer = new ElementWriter(slide as never, records, { ...config, dimensions });
    renderGrammar(id, writer, spec, frame, { tokens, grid: new Grid(dimensions, tokens), config: { ...config, dimensions } });
    return records;
  }

  it("publishes a schema for every grammar", () => {
    expect(Object.keys(GRAMMAR_SCHEMAS)).toEqual(["layered", "swimlane", "sequence", "hierarchy", "quadrant"]);
  });

  it("rejects an unknown grammar by name", () => {
    expect(() => renderInto("spiral", {})).toThrow(/Unknown diagram grammar: spiral/);
  });

  it("reports the offending field when a spec is invalid", () => {
    expect(() => renderInto("quadrant", {
      xAxis: { label: "Effort" },
      yAxis: { label: "Impact" },
      items: [{ label: "X", x: 5, y: 0.5 }],
    })).toThrow(/items\.0\.x/);
  });

  it.for([
    ["layered", { layers: [{ label: "A", items: ["a1", "a2"] }, { label: "B", items: ["b1"] }], flow: true }],
    ["swimlane", { lanes: [{ label: "L1", steps: [{ label: "s1" }] }, { label: "L2", steps: [{ label: "s2", column: 1 }] }] }],
    ["sequence", { actors: ["A", "B"], messages: [{ from: "A", to: "B", label: "call" }] }],
    ["hierarchy", { root: "Root", children: [{ label: "C1", children: ["G1"] }, { label: "C2" }] }],
    ["quadrant", { xAxis: { label: "X" }, yAxis: { label: "Y" }, items: [{ label: "P", x: 0.5, y: 0.5 }] }],
  ] as Array<[string, unknown]>)("keeps every %s element inside its frame", ([id, spec]) => {
    const records = renderInto(id, spec);
    expect(records.length, id).toBeGreaterThan(1);
    for (const record of records) {
      // Connectors encode direction with a signed extent, so normalise first.
      const left = Math.min(record.x, record.x + record.w);
      const right = Math.max(record.x, record.x + record.w);
      const top = Math.min(record.y, record.y + record.h);
      const bottom = Math.max(record.y, record.y + record.h);
      expect(left, `${id}/${record.name} left`).toBeGreaterThanOrEqual(frame.x - 0.02);
      expect(right, `${id}/${record.name} right`).toBeLessThanOrEqual(frame.x + frame.w + 0.02);
      expect(top, `${id}/${record.name} top`).toBeGreaterThanOrEqual(frame.y - 0.02);
      expect(bottom, `${id}/${record.name} bottom`).toBeLessThanOrEqual(frame.y + frame.h + 0.02);
    }
  });

  it("draws connectors before the nodes they join", () => {
    const records = renderInto("hierarchy", { root: "Root", children: [{ label: "C1" }, { label: "C2" }] });
    const firstNode = records.findIndex((record) => record.role === "diagram-node");
    const firstConnector = records.findIndex((record) => record.role === "connector");
    expect(firstConnector).toBeGreaterThanOrEqual(0);
    expect(firstConnector).toBeLessThan(firstNode);
  });
});

describe("bilingual rendering", () => {
  const dimensions = slideFormat("16:9");

  function build(mode: "parallel" | "stacked" | "notes", secondary: Record<string, unknown>) {
    const tokens = resolveTokens(config);
    return withSecondaryLanguage(
      {
        id: "s",
        kind: "statement",
        title: "Fresh meals in every school",
        communication: { secondaryLanguage: secondary as never },
        canvas: [
          { id: "t", type: "text", x: 1, y: 1, w: 8, h: 1.2, role: "title", text: "Fresh meals in every school", style: { fontSize: 40 } },
          { id: "s1", type: "text", x: 1, y: 2.6, w: 8, h: 0.8, role: "subtitle", text: "Funded from March", style: { fontSize: 20 } },
        ],
      },
      mode,
      tokens,
      new Grid(dimensions, tokens),
    );
  }

  it("adds the translation as its own editable element, not a concatenated string", () => {
    const slide = build("parallel", { language: "French", title: "Des repas frais dans chaque école" });
    const added = slide.canvas!.find((element) => element.id === "t-secondary");
    expect(added).toBeDefined();
    expect((added as { text?: string }).text).toBe("Des repas frais dans chaque école");
    // The primary text is untouched, so either language can be corrected alone.
    expect((slide.canvas![0] as { text?: string }).text).toBe("Fresh meals in every school");
  });

  it("sets right-to-left paragraph direction and alignment for RTL scripts", () => {
    const slide = build("parallel", { language: "Arabic", title: "وجبات طازجة في كل مدرسة" });
    const added = slide.canvas!.find((element) => element.id === "t-secondary") as {
      style?: { align?: string; options?: Record<string, unknown>; fontFace?: string };
    };
    expect(added.style?.align).toBe("right");
    expect(added.style?.options?.rtlMode).toBe(true);
    expect(added.style?.fontFace).toBe("Arial");
  });

  it("picks a font that contains the script", () => {
    const tokens = resolveTokens(config);
    expect(fallbackFontFor("日本語のテキスト", tokens)).toBe("Yu Gothic");
    expect(fallbackFontFor("한국어", tokens)).toBe("Malgun Gothic");
    expect(fallbackFontFor("plain english", tokens)).toBe(tokens.fonts.body);
    expect(isRightToLeft("שלום")).toBe(true);
    expect(isRightToLeft("hello")).toBe(false);
  });

  it("keeps notes mode monolingual on the slide", () => {
    const slide = build("notes", { language: "French", title: "Des repas frais" });
    expect(slide.canvas).toHaveLength(2);
    expect(slide.speakerNotes!.join("\n")).toContain("Des repas frais");
    expect(slide.speakerNotes!.join("\n")).toContain("[French]");
  });

  it("falls back to notes rather than dropping a translation nothing anchors", () => {
    const tokens = resolveTokens(config);
    const slide = withSecondaryLanguage(
      {
        id: "s",
        kind: "statement",
        title: "T",
        communication: { secondaryLanguage: { language: "French", title: "Titre" } as never },
        canvas: [{ id: "x", type: "shape", shape: "rect", x: 1, y: 1, w: 2, h: 2 }],
      },
      "parallel",
      tokens,
      new Grid(dimensions, tokens),
    );
    expect(slide.speakerNotes!.join("\n")).toContain("Titre");
  });

  it("leaves a monolingual slide untouched", () => {
    const tokens = resolveTokens(config);
    const original = { id: "s", kind: "statement", title: "T", canvas: [] };
    expect(withSecondaryLanguage(original, "parallel", tokens, new Grid(dimensions, tokens))).toBe(original);
  });
});
