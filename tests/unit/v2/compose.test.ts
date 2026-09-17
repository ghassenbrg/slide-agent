import { describe, expect, it } from "vitest";

import { applyAdjustments, expandNode, substitute } from "../../../src/v2/compose/expand.js";
import { formatCellRange, normalizeNode, parseCellRange, type ContainerNode, type TextNode } from "../../../src/v2/ir/compose.js";
import type { Finding } from "../../../src/v2/ir/issues.js";
import { closest, parsePointer, pointer } from "../../../src/v2/ir/issues.js";

function normalize(raw: unknown) {
  const findings: Finding[] = [];
  const node = normalizeNode(raw, "/slides/0/compose", { provenance: "composed", findings, slide: "s" });
  return { node, findings };
}

describe("composition language", () => {
  it("normalises containers, leaves, and modifiers from either side of the kind key", () => {
    const { node, findings } = normalize({ grid: "12x6", items: [
      { at: "c1-7 r2-6", column: { gap: "space.2", surface: "card", items: [{ text: "Hello", role: "title" }] } },
      { at: "c8-12 r1-6", bleed: ["right"], image: { asset: "a.png", alt: "A picture" } },
    ] });
    expect(findings).toEqual([]);
    const grid = node as ContainerNode;
    expect(grid.kind).toBe("grid");
    expect(grid.grid).toEqual({ columns: 12, rows: 6 });
    const column = grid.items[0] as ContainerNode;
    expect(column.at).toBe("c1-7 r2-6");
    expect(column.surface).toBe("card");
    expect((column.items[0] as TextNode).role).toBe("title");
    expect(column.items[0]!.ptr).toBe("/slides/0/compose/items/0/column/items/0");
  });

  it("reports problems with JSON pointers and did-you-mean suggestions", () => {
    const { findings } = normalize({ column: { items: [{ text: "x", roel: "title" }, { txt: "y" }, { text: "a", image: "b" }, { image: { asset: "c.png" } }] } });
    const messages = findings.map((finding) => `${finding.path} ${finding.message}`);
    expect(messages.some((message) => message.includes("/items/0/roel") && message.includes('"role"'))).toBe(true);
    expect(messages.some((message) => message.includes("No kind key") && message.includes('"text"'))).toBe(true);
    expect(messages.some((message) => message.includes("One node, one kind"))).toBe(true);
    expect(findings.some((finding) => finding.code === "alt-missing")).toBe(true);
  });

  it("records literals without refusing them", () => {
    const { node, findings } = normalize({ text: "−41%", role: "display", size: 180, color: "#FF0000" });
    expect(findings).toEqual([]);
    expect(node!.literals).toEqual(expect.arrayContaining(["size", "color"]));
  });

  it("parses and formats cell ranges, rejecting ranges outside the grid", () => {
    expect(parseCellRange("c1-7 r2-6", { columns: 12, rows: 6 }).range).toEqual({ column: [1, 7], row: [2, 6] });
    expect(parseCellRange("c3", { columns: 12, rows: 6 }).range).toEqual({ column: [3, 3], row: [1, 6] });
    expect(parseCellRange("c1-14", { columns: 12, rows: 6 }).error).toMatch(/column 14 outside a 12-column grid/);
    expect(parseCellRange("x1", { columns: 12, rows: 6 }).error).toMatch(/not a cell range/);
    expect(formatCellRange({ column: [1, 12], row: [3, 3] })).toBe("c1-12 r3");
  });

  it("handles JSON pointers and closest-name matching", () => {
    expect(pointer("slides", 2, "a/b")).toBe("/slides/2/a~1b");
    expect(parsePointer("/slides/2/a~1b")).toEqual(["slides", "2", "a/b"]);
    expect(closest("colum", ["column", "row", "grid"])[0]).toBe("column");
  });
});

describe("expansion", () => {
  const components = {
    gate: { params: ["n", "label", "detail"], root: { column: { surface: "card", items: [{ text: "{n}", role: "label" }, { text: "{label}", role: "h3" }, { text: "{detail}", role: "small", optional: true }] } } },
    loop: { params: [], root: { use: "loop" } },
  };

  it("expands components with params and root overrides, pointing findings at the instance", () => {
    const findings: Finding[] = [];
    const expanded = expandNode({ row: { items: [{ use: "gate", n: "01", label: "Pilot", grow: 2, tone: "accent" }, { use: "gate", n: "02", label: "Scale", detail: "wave by wave" }] } }, "/slides/0/compose", {}, { components, findings, slide: "s", provenance: "composed" });
    expect(findings).toEqual([]);
    const node = normalizeNode(expanded, "/slides/0/compose", { provenance: "composed", findings, slide: "s" }) as ContainerNode;
    const first = node.items[0] as ContainerNode;
    expect(first.grow).toBe(2);
    expect(first.tone).toBe("accent");
    expect(first.provenance).toBe("component");
    expect(first.component).toBe("gate");
    expect(first.items).toHaveLength(2); // the optional empty detail is dropped
    expect((node.items[1] as ContainerNode).items).toHaveLength(3);
    expect(first.ptr).toBe("/slides/0/compose/row/items/0");
  });

  it("reports unknown components, unknown params, and cycles", () => {
    const findings: Finding[] = [];
    expandNode({ column: { items: [{ use: "gat" }, { use: "gate", lable: "x" }, { use: "loop" }] } }, "/p", {}, { components, findings, slide: "s", provenance: "composed" });
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["component-unknown", "component-param-unknown", "component-cycle"]));
    expect(findings.find((finding) => finding.code === "component-unknown")!.message).toContain('"gate"');
  });

  it("repeats items over lists and substitutes whole values", () => {
    expect(substitute("{list}", { list: [1, 2] })).toEqual([1, 2]);
    expect(substitute("n = {count}", { count: 3 })).toBe("n = 3");
    const findings: Finding[] = [];
    const expanded = expandNode({ row: { each: "metrics", item: { column: { items: [{ text: "{value}", role: "display" }, { text: "{label} #{index}", role: "body" }] } } } }, "/p", { metrics: [{ value: "41%", label: "Churn" }, { value: "$4.2M", label: "ARR" }] }, { components: {}, findings, slide: "s", provenance: "recipe", recipe: "metrics/row" }) as Record<string, { items: unknown[] }>;
    expect(findings).toEqual([]);
    expect(expanded.row!.items).toHaveLength(2);
    expect(JSON.stringify(expanded)).toContain("ARR #2");
    applyAdjustments(expanded as never, [{ node: "metrics[1]", set: { grow: 2 } }, { node: "nope", set: {} }], findings, "s", "/slides/0");
    expect(JSON.stringify(expanded)).toContain('"grow":2');
    expect(findings.map((finding) => finding.code)).toEqual(["adjust-no-match"]);
  });

  it("reports a repeat over something that is not a list", () => {
    const findings: Finding[] = [];
    expandNode({ row: { each: "metrics", item: { text: "{value}" } } }, "/p", { metrics: "nope" }, { components: {}, findings, slide: "s", provenance: "recipe" });
    expect(findings[0]!.code).toBe("repeat-not-a-list");
  });
});
