import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";

import { loadConfig } from "../../src/config/load-config.js";
import { Grid, slideFormat } from "../../src/design/grid.js";
import { densityBudget, resolveTokens } from "../../src/design/tokens.js";
import type { SlideAgentConfig } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
let config: SlideAgentConfig;

beforeAll(async () => { config = await loadConfig(path.join(root, "config")); });

describe("design tokens", () => {
  it("infers density from the model's own words", () => {
    expect(resolveTokens(config, { mood: ["quiet", "spacious"] }).density).toBe("sparse");
    expect(resolveTokens(config, { concept: "A dense technical reference" }).density).toBe("dense");
    expect(resolveTokens(config, { concept: "A launch deck" }).density).toBe("balanced");
  });

  it("lets an explicit declaration win over inference", () => {
    expect(resolveTokens(config, { mood: ["quiet", "airy"], density: "dense" }).density).toBe("dense");
    expect(resolveTokens(config, { shapeLanguage: "hard angular blocks", geometry: "organic" }).geometry).toBe("organic");
  });

  it("honours `avoid` literally", () => {
    const soft = resolveTokens(config, { geometry: "soft" });
    expect(soft.radius.soft).toBeGreaterThan(0);
    const squared = resolveTokens(config, { geometry: "soft", avoid: ["rounded corners"] });
    expect(squared.radius.soft).toBe(0);
    expect(squared.radius.round).toBe(0);
  });

  it("gives denser decks tighter spacing and thinner rules", () => {
    const dense = resolveTokens(config, { density: "dense" });
    const sparse = resolveTokens(config, { density: "sparse" });
    expect(dense.space.unit).toBeLessThan(sparse.space.unit);
    expect(dense.stroke.regular).toBeLessThan(sparse.stroke.regular);
    expect(densityBudget(dense).bullets).toBeGreaterThan(densityBudget(sparse).bullets);
  });

  it("keeps every step of the type scale above the configured legibility floor", () => {
    for (const direction of [{ density: "dense" as const }, { density: "sparse" as const }, {}]) {
      const tokens = resolveTokens(config, direction);
      expect(tokens.type.body).toBeGreaterThanOrEqual(config.fonts.minimums.body);
      expect(tokens.type.title).toBeGreaterThanOrEqual(config.fonts.minimums.slideTitle);
      expect(tokens.type.display).toBeGreaterThanOrEqual(config.fonts.minimums.deckTitle);
      // The scale must stay monotonic or hierarchy stops reading.
      expect(tokens.type.display).toBeGreaterThan(tokens.type.title);
      expect(tokens.type.title).toBeGreaterThan(tokens.type.subheading);
      expect(tokens.type.subheading).toBeGreaterThan(tokens.type.body);
      expect(tokens.type.body).toBeGreaterThan(tokens.type.caption);
      expect(tokens.type.caption).toBeGreaterThanOrEqual(tokens.type.micro);
    }
  });

  it("produces different systems for different directions", () => {
    const quiet = resolveTokens(config, { mood: ["quiet", "restrained"], geometry: "soft" });
    const technical = resolveTokens(config, { mood: ["technical", "detailed"], geometry: "sharp" });
    expect(quiet.space.unit).not.toBe(technical.space.unit);
    expect(quiet.radius.soft).not.toBe(technical.radius.soft);
  });
});

describe("grid", () => {
  it("keeps every span inside the safe area", () => {
    for (const format of ["16:9", "4:3", "9:16", "a4-portrait"] as const) {
      const dimensions = slideFormat(format);
      const grid = new Grid(dimensions, resolveTokens({ ...config, dimensions }));
      const last = grid.span(grid.columns - 1, 1);
      expect(last.x + last.w, format).toBeLessThanOrEqual(dimensions.width - grid.margin + 0.001);
      expect(grid.span(0, 99).w, format).toBeLessThanOrEqual(grid.safe.w + 0.001);
    }
  });

  it("stacks instead of splitting on narrow stages", () => {
    const wideDimensions = slideFormat("16:9");
    const wide = new Grid(wideDimensions, resolveTokens({ ...config, dimensions: wideDimensions }));
    const tallDimensions = slideFormat("9:16");
    const tall = new Grid(tallDimensions, resolveTokens({ ...config, dimensions: tallDimensions }));

    expect(wide.isNarrow).toBe(false);
    expect(tall.isNarrow).toBe(true);

    const wideSplit = wide.split(wide.safe, 0.5);
    expect(wideSplit.primary.y).toBe(wideSplit.secondary.y);
    expect(wideSplit.primary.x).not.toBe(wideSplit.secondary.x);

    const tallSplit = tall.split(tall.safe, 0.5);
    expect(tallSplit.primary.x).toBe(tallSplit.secondary.x);
    expect(tallSplit.primary.y).not.toBe(tallSplit.secondary.y);
  });

  it("packs rows to their content and falls back to even division on overflow", () => {
    const dimensions = slideFormat("16:9");
    const grid = new Grid(dimensions, resolveTokens({ ...config, dimensions }));
    const region = { x: 1, y: 1, w: 8, h: 5 };

    const packed = grid.packRows(region, [0.5, 0.5, 0.5], 0.1);
    expect(packed[0]!.h).toBe(0.5);
    expect(packed[1]!.y).toBeCloseTo(1.6, 5);
    // Packed rows start at the top rather than spreading to the bottom.
    expect(packed[2]!.y + packed[2]!.h).toBeLessThan(region.y + region.h);

    const overflowing = grid.packRows(region, [4, 4, 4], 0.1);
    expect(overflowing[2]!.y + overflowing[2]!.h).toBeLessThanOrEqual(region.y + region.h + 0.001);
  });

  it("clamps any rect back onto the slide", () => {
    const dimensions = slideFormat("4:3");
    const grid = new Grid(dimensions, resolveTokens({ ...config, dimensions }));
    const clamped = grid.clamp({ x: 40, y: 40, w: 20, h: 20 });
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(dimensions.width + 0.001);
    expect(clamped.y + clamped.h).toBeLessThanOrEqual(dimensions.height + 0.001);
  });
});
