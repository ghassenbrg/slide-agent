import path from "node:path";

import type { DesignLanguage } from "../../../src/v2/ir/design.js";
import type { DeckIntentInput } from "../../../src/v2/ir/intent.js";
import { TextEngine } from "../../../src/v2/text/measure.js";
import { FontRegistry } from "../../../src/v2/text/registry.js";

export const root = path.resolve(import.meta.dirname, "../../..");
export const fixtureFonts = path.join(root, "tests", "fixtures", "fonts");

/** Fonts from fixtures only, so every machine measures the same. */
export function fixtureRegistry(): FontRegistry {
  return new FontRegistry({ directories: [fixtureFonts], includeSystem: false });
}

export function fixtureText(): TextEngine {
  return new TextEngine(fixtureRegistry());
}

export function language(overrides: Partial<DesignLanguage> = {}): DesignLanguage {
  return {
    color: {
      palette: { paper: "#F7F5F0", panel: "#EAE6DD", ink: "#1C2127", stone: "#5C636B", signal: "#C2410C", steel: "#2F5D8A", hair: "#D4CFC4" },
      roles: { background: "paper", surface: "panel", text: "ink", muted: "stone", accent: "signal", accentAlt: "steel", rule: "hair" },
      data: ["steel", "signal", "stone"],
    },
    type: { display: { family: "Source Serif 4", weight: 700 }, body: { family: "Inter" }, mono: { family: "JetBrains Mono" }, scale: { base: 18, ratio: 1.25 } },
    space: { unit: 8, margin: 40, gutter: 20 },
    grid: { columns: 12, rows: 6 },
    shape: { radius: 4, stroke: 0 },
    surfaces: { card: { fill: "surface", radius: 4, pad: "space.2" }, band: { fill: "ink" } },
    ...overrides,
  };
}

export function intent(slides: unknown[], extra: Partial<DeckIntentInput> = {}): DeckIntentInput {
  return {
    schema: "slide-agent.intent/1",
    brief: { title: "Test deck", audience: "Engineers", goal: "Verify the engine" },
    direction: { concept: "Quiet paper and one signal colour.", fit: "ask" },
    design: { language: language() },
    slides: slides as DeckIntentInput["slides"],
    ...extra,
  };
}
