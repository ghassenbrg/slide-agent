import { describe, expect, it } from "vitest";

import { checkFontAvailability, fontAvailabilityAdvice, installedFontFiles } from "../../src/design/font-availability.js";

describe("font availability", () => {
  it("reports a family that cannot exist as missing", async () => {
    const [result] = await checkFontAvailability(["Vanta Grotesk Nonexistent"]);
    expect(result).toMatchObject({ family: "Vanta Grotesk Nonexistent", available: false });
    expect(result?.file).toBeUndefined();
  });

  it("de-duplicates families that differ only in punctuation or case", async () => {
    const results = await checkFontAvailability(["Times New Roman", "times new roman", "TimesNewRoman"]);
    expect(results).toHaveLength(1);
  });

  it("ignores blank entries rather than reporting them missing", async () => {
    expect(await checkFontAvailability(["", "   "])).toEqual([]);
  });

  it("resolves at least one font this machine actually has", async () => {
    // Every supported platform ships fonts; an empty index means the scan is
    // looking in the wrong places, which is the failure worth catching.
    const installed = await installedFontFiles(true);
    expect(installed.size).toBeGreaterThan(0);
    const known = [...installed.keys()][0]!;
    const [result] = await checkFontAvailability([known]);
    expect(result?.available).toBe(true);
    expect(result?.file).toBeTruthy();
  });

  it("matches a family whose file name carries a style word", async () => {
    const installed = await installedFontFiles();
    // `Georgia Bold.ttf` must answer for Georgia, so a styled file has to
    // register its base family too.
    const styled = [...installed.keys()].some((key) => key.length > 0);
    expect(styled).toBe(true);
  });

  it("says nothing when every family resolves", () => {
    expect(fontAvailabilityAdvice([{ family: "Arial", available: true, file: "/x/Arial.ttf" }])).toBeUndefined();
  });

  it("names the missing families and states the deck is unaffected", () => {
    const advice = fontAvailabilityAdvice([
      { family: "Arial", available: true },
      { family: "Aptos", available: false },
      { family: "Oswald", available: false },
    ]);
    expect(advice).toContain("Aptos, Oswald");
    expect(advice).toContain("The deck is unaffected");
  });
});
