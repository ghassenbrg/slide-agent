import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  TokenAccount,
  estimateImageTokens,
  estimateTextTokens,
  priceOf,
  savingNote,
  IMAGE_LONG_EDGE_LIMIT,
} from "../../src/evaluation/token-budget.js";
import {
  canvasCapabilities,
  capabilitySummary,
  contractDescriptor,
  contractJsonSchema,
  guideAsMarkdown,
  guideAsRouter,
  guideSectionIndex,
} from "../../src/contract/index.js";
import { buildReviewPacket } from "../../src/review/packet.js";
import { SlideAgent } from "../../src/pipeline.js";
import { PREVIEW_TIERS } from "../../src/rendering/preview-delivery.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tokens = (value: string | unknown): number => estimateTextTokens(value);

describe("token estimation", () => {
  it("prices text by character count and images by pixel count", () => {
    expect(estimateTextTokens("a".repeat(400))).toBe(100);
    expect(estimateTextTokens({ a: 1 })).toBe(estimateTextTokens(JSON.stringify({ a: 1 })));
    // 1024 × 576 ÷ 750, the published vision cost.
    expect(estimateImageTokens(1024, 576)).toBe(787);
  });

  it("charges an oversized image at the size the API will downscale it to", () => {
    // 1600×900 and 1568×882 cost the same, which is the whole reason the
    // review tier had to go below 1,568 rather than merely to it.
    expect(estimateImageTokens(1600, 900)).toBe(estimateImageTokens(IMAGE_LONG_EDGE_LIMIT, 882));
    expect(estimateImageTokens(4000, 2250)).toBe(estimateImageTokens(1600, 900));
  });

  it("reports zero for a degenerate size rather than NaN", () => {
    expect(estimateImageTokens(0, 900)).toBe(0);
    expect(estimateImageTokens(-1, -1)).toBe(0);
  });

  it("accumulates a session total across calls", () => {
    const account = new TokenAccount();
    expect(account.total()).toBe(0);
    const first = account.accountFor({ text: "x".repeat(400) });
    const second = account.accountFor({ text: "x".repeat(400), images: [{ width: 1024, height: 576 }] });
    expect(first.total).toBe(100);
    expect(second.sessionTotal).toBe(first.total + second.total);
    expect(account.total()).toBe(second.sessionTotal);
    expect(second.imageCount).toBe(1);
    expect(second.basis).toBe("estimate");
  });

  it("keeps two sessions' totals apart", () => {
    // A module-level counter would merge these, which is exactly the bug that
    // is invisible until two servers share a host process.
    const one = new TokenAccount();
    const other = new TokenAccount();
    one.accountFor({ text: "x".repeat(4_000) });
    const second = other.accountFor({ text: "x".repeat(400) });
    expect(second.sessionTotal).toBe(100);
    expect(one.total()).toBe(1_000);
  });

  it("prices a payload without recording it anywhere", () => {
    expect(priceOf({ text: "x".repeat(400) })).toMatchObject({ total: 100, sessionTotal: 100 });
  });

  it("only offers an alternative that is actually more expensive", () => {
    expect(savingNote(100, 900, "images:\"all\"")).toContain("900");
    // An alternative that costs the same or less is not advice; saying so
    // anyway would put noise in a field the reader has been told to trust.
    expect(savingNote(900, 100, "images:\"all\"")).toBeUndefined();
    expect(savingNote(100, 100, "images:\"all\"")).toBeUndefined();
  });

});

/**
 * Ceilings, not measurements.
 *
 * Every number here was set from the delivered 0.13.0 size with about 10%
 * headroom. They exist because the 0.12 costs did not arrive in one bad commit
 * — they accumulated, one reasonable addition at a time, with nothing watching
 * the total. A failure here is not necessarily a bug; it is a bill, and it
 * should be looked at before it is raised.
 */
describe("token budget ceilings", () => {
  it("keeps the skill file to a router rather than a copy of the guide", async () => {
    const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
    expect(tokens(skill)).toBeLessThan(2_400);

    // The point of the router is that it is not the guide. If substantive
    // paragraphs reappear here, the duplication is back whatever the size says.
    const guideLines = new Set(
      guideAsMarkdown().split("\n").map((line) => line.trim()).filter((line) => line.length > 60),
    );
    const shared = skill.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 60 && guideLines.has(line));
    const substantive = skill.split("\n").filter((line) => line.trim().length > 60).length;
    expect(shared.length / substantive).toBeLessThan(0.35);
  });

  it("keeps the router smaller than any two guide sections it points at", () => {
    expect(tokens(guideAsRouter())).toBeLessThan(1_900);
    const index = guideSectionIndex();
    expect(index.every((section) => section.when.length > 0)).toBe(true);
    // A router that omitted a section would send a model looking for prose
    // that has no address.
    expect(index).toHaveLength(16);
  });

  it("costs less to reach the first slide than loading the guide used to", async () => {
    // 0.12 loaded 8,734 tokens of SKILL.md before a model knew whether the
    // deck had a chart in it, and a further 8,359 if it also read the guide.
    // What matters is the total a demanding deck now pays, router included:
    // the router is the two core sections, so they are never paid for twice.
    const index = new Map(guideSectionIndex().map((section) => [section.id, section.approximateTokens]));
    const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
    const demanding = tokens(skill)
      + index.get("creative-direction")!
      + index.get("build-script")!
      + index.get("review")!;

    expect(demanding).toBeLessThan(6_000);
    expect(demanding).toBeLessThan(tokens(guideAsMarkdown()));
  });

  it("keeps the default capability answer small and the canvas facet affordable", async () => {
    const report = await new SlideAgent().capabilityReport();
    const summary = capabilitySummary(report, { contractVersion: "test", version: "test" });
    expect(tokens(summary)).toBeLessThan(1_000);
    // The one question a summary must never defer: a model that plans a
    // photo-led deck and only then learns it cannot source a picture has
    // wasted the design.
    expect(summary.images).toEqual(report.images);
    expect(tokens(report.canvas)).toBeLessThan(2_000);
    expect(tokens(canvasCapabilities())).toBeLessThan(2_000);
  });

  it("keeps every published schema under a size a model can afford to read", () => {
    for (const name of contractDescriptor().schemas) {
      expect(tokens(contractJsonSchema(name)), name).toBeLessThan(14_000);
    }
  });

  it("keeps a twelve-slide review packet under the review budget", async () => {
    for (const name of ["quarterly-review", "product-launch", "cloud-migration"]) {
      const packet = await buildReviewPacket({ input: path.join(root, `examples/output/${name}/${name}.pptx`) });
      expect(tokens(packet), name).toBeLessThan(4_000);
    }
  });

  it("keeps a whole review cycle's images inside the release budget", () => {
    // Build, review, patch one slide, verify — the cycle the 0.12 defaults
    // charged 114,840 image tokens for.
    const slides = 12;
    const review = estimateImageTokens(PREVIEW_TIERS.review, Math.round(PREVIEW_TIERS.review * 9 / 16));
    const overview = estimateImageTokens(PREVIEW_TIERS.full, 742);
    const build = slides * review;
    const reviewCall = overview;
    const patch = review;
    const verify = overview;
    expect(build + reviewCall + patch + verify).toBeLessThan(20_000);
  });
});
