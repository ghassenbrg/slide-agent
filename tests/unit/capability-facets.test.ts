import { describe, expect, it } from "vitest";

import {
  capabilityFacets,
  capabilitySummary,
  isCapabilityFacet,
  CAPABILITY_FACETS,
} from "../../src/contract/capability-facets.js";
import { SlideAgent } from "../../src/pipeline.js";
import type { CapabilityReport } from "../../src/extensions.js";

const meta = { contractVersion: "0.11", version: "0.13.0" };
let cached: CapabilityReport | undefined;

async function report(): Promise<CapabilityReport> {
  cached ??= await new SlideAgent().capabilityReport();
  return cached;
}

describe("capability facets", () => {
  it("recognises the facets it publishes, and nothing else", () => {
    for (const facet of CAPABILITY_FACETS) expect(isCapabilityFacet(facet)).toBe(true);
    expect(isCapabilityFacet("canvas")).toBe(true);
    expect(isCapabilityFacet("all")).toBe(false);
    expect(isCapabilityFacet("nonsense")).toBe(false);
  });

  it("returns only the facets asked for", async () => {
    const selected = await report().then((full) => capabilityFacets(full, ["canvas", "images"], meta));
    expect(Object.keys(selected).sort()).toEqual(["canvas", "contractVersion", "images", "version"]);
    expect(selected.fonts).toBeUndefined();
  });

  it("returns the whole report for `all`", async () => {
    const full = await report();
    const everything = capabilityFacets(full, ["all"], meta);
    for (const facet of CAPABILITY_FACETS) expect(everything[facet], facet).toBeDefined();
    expect(everything.contractVersion).toBe("0.11");
  });

  it("names a facet it did not recognise rather than silently dropping it", async () => {
    const selected = await report().then((full) => capabilityFacets(full, ["canvas", "sparkles"], meta));
    expect(selected.canvas).toBeDefined();
    // A caller who misspells a facet and gets a smaller answer with no
    // explanation would reasonably conclude the facet is empty.
    expect(selected.ignored).toMatchObject({ facets: ["sparkles"], available: CAPABILITY_FACETS });
  });

  it("summarises without deferring the one question that changes a plan", async () => {
    const full = await report();
    const summary = capabilitySummary(full, meta);

    // Whether this installation can source a picture at all is never
    // summarised away: a model that learns it after composing eight slides
    // around photography has wasted the design.
    expect(summary.images).toEqual(full.images);
    expect(summary.rendering.mode).toBe(full.rendering.mode);
    expect(summary.rendering.limitations).toEqual(full.rendering.limitations);

    expect(summary.canvas.elementTypes).toEqual(full.canvas.elements.map((element) => element.type));
    expect(summary.counts.diagramGrammars).toBe(full.diagrams.length);
    expect(summary.counts.fallbackLayouts).toBe(full.layouts.length);
    expect(summary.fonts.missing).toEqual(full.fonts.missing);
    expect(summary.facets).toEqual(CAPABILITY_FACETS);
  });

  it("costs a fraction of the full report and says how to get the rest", async () => {
    const full = await report();
    const summary = capabilitySummary(full, meta);
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(full).length / 4);
    expect(summary.canvas.note).toContain('include: ["canvas"]');
    expect(summary.note).toContain("all");
  });
});
