import { describe, expect, it } from "vitest";

import { composite, contrastRatio, deltaE, hexToOklch, nearestPassing, oklchToHex, parseColor, requiredContrast, simulateCvd, tint } from "../../../src/v2/tokens/color.js";

describe("colour", () => {
  it("parses hex and OKLCH", () => {
    expect(parseColor("#abc")).toBe("AABBCC");
    expect(parseColor("1D2228")).toBe("1D2228");
    expect(parseColor("oklch(0.62 0.2 30)")).toMatch(/^[0-9A-F]{6}$/);
    expect(parseColor("oklch(62% 0.2 30)")).toBe(parseColor("oklch(0.62 0.2 30)"));
    expect(parseColor("red")).toBeUndefined();
  });

  it("round-trips through OKLCH within 8-bit rounding", () => {
    for (const hex of ["C2410C", "2F5D8A", "F5F3EE", "000000", "FFFFFF"]) {
      expect(deltaE(oklchToHex(hexToOklch(hex)), hex)).toBeLessThan(0.01);
    }
  });

  it("computes WCAG contrast and thresholds", () => {
    expect(contrastRatio("000000", "FFFFFF")).toBeCloseTo(21, 5);
    expect(requiredContrast(14, false)).toBe(4.5);
    expect(requiredContrast(18, false)).toBe(3);
    expect(requiredContrast(14, true)).toBe(3);
  });

  it("moves only lightness to the nearest passing value, and reports no change when it passes", () => {
    const passing = nearestPassing("1D2228", "F5F3EE", 4.5);
    expect(passing.changed).toBe(false);
    const repaired = nearestPassing("C2410C", "E9E5DC", 4.5);
    expect(repaired.changed).toBe(true);
    expect(contrastRatio(repaired.hex, "E9E5DC")).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(hexToOklch(repaired.hex).h - hexToOklch("C2410C").h)).toBeLessThan(6);
    expect(repaired.deltaL).toBeLessThan(0.1);
  });

  it("tints, composites, and simulates colour-vision deficiency deterministically", () => {
    expect(hexToOklch(tint("C2410C", 50)).l).toBeGreaterThan(hexToOklch("C2410C").l);
    expect(hexToOklch(tint("C2410C", -50)).l).toBeLessThan(hexToOklch("C2410C").l);
    expect(composite("000000", "FFFFFF", 0.5)).toBe("808080");
    expect(simulateCvd("FF0000", "deuteranopia")).toMatch(/^[0-9A-F]{6}$/);
  });
});
