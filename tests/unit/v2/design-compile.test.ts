import { describe, expect, it } from "vitest";

import { compileDesign, languageFromDtcg, resolveColor, schemeName, themeToDtcg } from "../../../src/v2/tokens/compile.js";
import { contrastRatio } from "../../../src/v2/tokens/color.js";
import { presetLanguage, presetNames } from "../../../src/v2/tokens/presets.js";
import { fixtureText, language } from "./helpers.js";

describe("design compile", () => {
  it("maps roles onto theme slots for a light deck and resolves type sizes and space", async () => {
    const theme = await compileDesign({ language: language() }, { format: "16:9", text: fixtureText() });
    expect(theme.findings.filter((finding) => finding.severity === "blocking")).toEqual([]);
    expect(theme.slots.lt1).toBe("F7F5F0");
    expect(theme.slots.dk1).toBe("1C2127");
    expect(theme.slotOfName.signal).toBe("accent1");
    expect(theme.slotOfName.steel).toBe("accent2");
    expect(theme.clrMap.bg1).toBe("lt1");
    expect(schemeName("dk1", theme)).toBe("tx1");
    expect(theme.sizes.body).toBe(18);
    expect(theme.sizes.title).toBeCloseTo(35, 0);
    expect(theme.space.margin).toBeCloseTo(40 / 72, 5);
    expect(theme.fonts.body.regular.source).toBe("font-file");
    expect(theme.fonts.display.regular.typeface).toBe("Source Serif 4");
    expect(resolveColor("signal/30", theme)!.slot).toBeUndefined();
    expect(resolveColor("accent", theme)!.slot).toBe("accent1");
    expect(resolveColor("#123456", theme)!.hex).toBe("123456");
    expect(resolveColor("nope", theme)).toBeUndefined();
  });

  it("maps a dark deck through the colour map so it stays a native dark theme", async () => {
    const dark = language({ color: { palette: { night: "#0E1116", deep: "#1A1F27", chalk: "#F2F0EA", fog: "#A5ACB5", lime: "#C6F432" }, roles: { background: "night", surface: "deep", text: "chalk", muted: "fog", accent: "lime" } } });
    const theme = await compileDesign({ language: dark }, { format: "16:9", text: fixtureText() });
    expect(theme.slots.dk1).toBe("0E1116");
    expect(theme.clrMap).toEqual({ bg1: "dk1", tx1: "lt1", bg2: "dk2", tx2: "lt2" });
  });

  it("repairs failing contrast as a reported adjustment, and refuses silently nothing when pinned", async () => {
    const weak = language({ color: { palette: { paper: "#FFFFFF", panel: "#F0F0F0", ink: "#999999", stone: "#AAAAAA", signal: "#F5B800" }, roles: { background: "paper", surface: "panel", text: "ink", muted: "stone", accent: "signal" } } });
    const theme = await compileDesign({ language: weak }, { format: "16:9", text: fixtureText() });
    expect(theme.adjustments.length).toBeGreaterThanOrEqual(2);
    expect(contrastRatio(theme.palette.ink!, "FFFFFF")).toBeGreaterThanOrEqual(4.5);
    const pinned = await compileDesign({ language: weak }, { format: "16:9", text: fixtureText(), pins: [{ path: "/design/language/color/palette/ink", refuse: "contrast" }] });
    expect(pinned.findings.some((finding) => finding.code === "contrast-pinned" && finding.severity === "blocking")).toBe(true);
    expect(pinned.palette.ink).toBe("999999");
  });

  it("reports unknown role names, unavailable fonts, and invalid languages without crashing", async () => {
    const broken = language({ color: { palette: { a: "#FFFFFF", b: "#000000" }, roles: { background: "a", surface: "a", text: "b", muted: "bb", accent: "b" } }, type: { display: { family: "Canela Deck" }, body: { family: "Inter" }, scale: { base: 18, ratio: 1.25 } } });
    const theme = await compileDesign({ language: broken }, { format: "16:9", text: fixtureText() });
    const codes = theme.findings.map((finding) => finding.code);
    expect(codes).toContain("color-role-unknown");
    expect(codes).toContain("font-unavailable");
    const invalid = await compileDesign({ language: { color: {} } as never }, { format: "4:3", text: fixtureText() });
    expect(invalid.findings.some((finding) => finding.code === "design-invalid")).toBe(true);
  });

  it("compiles presets deterministically and labels them", async () => {
    expect(presetNames()).toContain("draft/editorial");
    expect(presetLanguage("draft/bold")).toEqual(presetLanguage("draft/bold"));
    expect(presetLanguage("nope")).toBeUndefined();
    const theme = await compileDesign({ preset: "draft/technical" }, { format: "16:9", text: fixtureText() });
    expect(theme.source).toBe("preset");
    expect(theme.clrMap.bg1).toBe("dk1");
    const unknown = await compileDesign({ preset: "draft/bolt" }, { format: "16:9", text: fixtureText() });
    expect(unknown.findings[0]!.message).toContain("draft/bold");
  });

  it("exports and re-imports DTCG tokens", async () => {
    const theme = await compileDesign({ language: language() }, { format: "16:9", text: fixtureText() });
    const document = themeToDtcg(theme);
    expect(languageFromDtcg(document).language).toEqual(theme.language);
    const plain = languageFromDtcg({ color: { palette: { white: { $value: "#FFFFFF" }, black: { $value: { hex: "#000000" } } }, role: { background: { $value: "{color.palette.white}" }, text: { $value: "{color.palette.black}" } } }, font: { family: { body: { $value: ["Inter"] } } } });
    expect(plain.language!.color.roles.text).toBe("black");
    expect(languageFromDtcg({}).error).toBeDefined();
    const fromTokens = await compileDesign({ tokens: document }, { format: "16:9", text: fixtureText() });
    expect(fromTokens.source).toBe("tokens");
  });

  it("does not report a data-colour clash it introduced itself", async () => {
    // accentAlt falls back to accent, so an undeclared data series derives to
    // [accent, accent]. Reporting that as a clash blames the author for the
    // engine's own default, at a pointer their intent does not contain.
    const base = language();
    const derived = await compileDesign({
      language: { ...base, color: { palette: base.color.palette, roles: { ...base.color.roles, accentAlt: undefined } } as never },
    }, { format: "16:9", text: fixtureText() });
    expect(derived.findings.filter((finding) => finding.code === "data-colors-close")).toEqual([]);

    // A series the author did write is still checked.
    const declared = await compileDesign({
      language: language({ color: { ...base.color, data: ["signal", "signal"] } }),
    }, { format: "16:9", text: fixtureText() });
    expect(declared.findings.some((finding) => finding.code === "data-colors-close")).toBe(true);
  });

  it("merges a brand with the model's partial language and refuses locked paths", async () => {
    const theme = await compileDesign({ brand: "acme", language: { color: { palette: { ink: "#FF0000" } }, concept: "Our own concept" } }, {
      format: "16:9",
      text: fixtureText(),
      brand: async () => ({ name: "acme", language: language(), locks: ["/color/palette"] }),
    });
    expect(theme.source).toBe("brand");
    expect(theme.concept).toBe("Our own concept");
    expect(theme.palette.ink).toBe("1C2127");
    expect(theme.findings.some((finding) => finding.code === "brand-locked")).toBe(true);
  });
});
