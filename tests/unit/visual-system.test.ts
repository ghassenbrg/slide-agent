import { describe, expect, it } from "vitest";

import { VisualSystem, applyVisualSystem } from "../../src/design/visual-system.js";
import type { CanvasElementSpec, DeckVisualSystem } from "../../src/types/index.js";

const system: DeckVisualSystem = {
  variables: {
    "map-ink": "1B2A41",
    "excavation-rule": 0.75,
    "field-note-size": 13,
    "strata": ["8C6A4A", "B79B78", "E4D5C0"],
    "alias-ink": { $var: "map-ink" },
  },
  styles: {
    "excavation-note": {
      style: { fontSize: { $var: "field-note-size" }, color: { $var: "map-ink" }, italic: true },
    },
    "excavation-note-emphatic": {
      basedOn: ["excavation-note"],
      style: { bold: true, italic: false },
    },
    "signal-fog": {
      style: { fill: "0B1020", transparency: 40, options: { shadow: { type: "outer" } } },
    },
    "signal-fog-hairline": {
      basedOn: ["signal-fog"],
      style: { lineWidth: { $var: "excavation-rule" }, options: { line: { dashType: "sysDot" } } },
    },
  },
};

function text(overrides: Record<string, unknown> = {}): CanvasElementSpec {
  return { id: "note", type: "text", x: 1, y: 1, w: 3, h: 1, text: "Trench 4", ...overrides } as CanvasElementSpec;
}

describe("deck visual system", () => {
  it("keeps arbitrary style and variable names exactly as authored", () => {
    const resolved = new VisualSystem(system);
    expect(resolved.styleNames).toEqual([
      "excavation-note", "excavation-note-emphatic", "signal-fog", "signal-fog-hairline",
    ]);
    expect(resolved.variableNames).toContain("excavation-rule");
  });

  it("applies referenced styles in order, then the element's own values last", () => {
    const element = applyVisualSystem(
      new VisualSystem(system),
      text({ styleRef: ["excavation-note", "excavation-note-emphatic"], style: { color: "FF0000" } }),
      1,
    ) as CanvasElementSpec & { style: Record<string, unknown> };
    expect(element.style).toMatchObject({ fontSize: 13, color: "FF0000", bold: true, italic: false });
    // The reference itself survives so the emitted scene round-trips it.
    expect(element.styleRef).toEqual(["excavation-note", "excavation-note-emphatic"]);
  });

  it("merges native options across an inheritance chain instead of replacing them", () => {
    const element = applyVisualSystem(
      new VisualSystem(system),
      { id: "fog", type: "shape", x: 0, y: 0, w: 2, h: 2, styleRef: "signal-fog-hairline" } as CanvasElementSpec,
      3,
    ) as CanvasElementSpec & { style: Record<string, unknown> };
    expect(element.style.options).toEqual({ shadow: { type: "outer" }, line: { dashType: "sysDot" } });
    expect(element.style.lineWidth).toBe(0.75);
  });

  it("resolves a variable that points at another variable", () => {
    expect(new VisualSystem(system).variable("alias-ink", "test")).toBe("1B2A41");
  });

  it("reports an unknown style with the names that do exist", () => {
    expect(() => applyVisualSystem(new VisualSystem(system), text({ styleRef: "excavation-notes" }), 2))
      .toThrow(/no style named "excavation-notes".*Declared: excavation-note,/s);
  });

  it("reports an unknown variable rather than rendering an empty value", () => {
    expect(() => applyVisualSystem(new VisualSystem(system), text({ style: { color: { $var: "map-inc" } } }), 2))
      .toThrow(/no variable named "map-inc"/);
  });

  it("refuses a style inheritance cycle by naming the loop", () => {
    const cyclic = new VisualSystem({
      styles: {
        a: { basedOn: ["b"], style: {} },
        b: { basedOn: ["a"], style: {} },
      },
    });
    expect(() => applyVisualSystem(cyclic, text({ styleRef: "a" }), 1)).toThrow(/inherits from itself through a → b → a/);
  });

  it("refuses a variable cycle by naming the loop", () => {
    const cyclic = new VisualSystem({ variables: { one: { $var: "two" }, two: { $var: "one" } } });
    expect(() => cyclic.variable("one", "test")).toThrow(/refers to itself through one → two → one/);
  });

  it("reports a precise incompatibility instead of coercing the wrong type", () => {
    expect(() => applyVisualSystem(new VisualSystem(system), text({ style: { color: { $var: "excavation-rule" } } }), 4))
      .toThrow(/variable "excavation-rule" is number, but "color" needs a hex color/);
    expect(() => applyVisualSystem(new VisualSystem(system), text({ style: { fontSize: { $var: "strata" } } }), 4))
      .toThrow(/is an array of 3, but "fontSize" needs a finite number/);
  });

  it("substitutes inside arrays, such as a chart's own colour ramp", () => {
    const chart = applyVisualSystem(new VisualSystem(system), {
      id: "strata-chart",
      type: "chart",
      x: 0, y: 0, w: 4, h: 3,
      chart: { kind: "bar", labels: ["a"], series: [{ name: "s", values: [1] }] },
      style: { colors: { $var: "strata" } },
    } as unknown as CanvasElementSpec, 5) as CanvasElementSpec & { style: { colors: string[] } };
    expect(chart.style.colors).toEqual(["8C6A4A", "B79B78", "E4D5C0"]);
  });

  it("leaves an element untouched when the deck declares no system", () => {
    const original = text();
    expect(applyVisualSystem(new VisualSystem(undefined), original, 1)).toBe(original);
  });

  it("round-trips ten arbitrary style names without renaming or loss", () => {
    const names = [
      "ink-bleed", "runway-crop", "signal-fog", "excavation-note", "tide-mark",
      "cold-open", "field-margin", "torn-edge", "quiet-number", "loud-number",
    ];
    const many: DeckVisualSystem = {
      styles: Object.fromEntries(names.map((name, index) => [name, { style: { fontSize: 10 + index } }])),
    };
    const resolved = new VisualSystem(many);
    expect(resolved.styleNames).toEqual(names);
    for (const [index, name] of names.entries()) {
      const element = applyVisualSystem(resolved, text({ styleRef: name }), 1) as { style: { fontSize: number } };
      expect(element.style.fontSize).toBe(10 + index);
    }
  });
});
