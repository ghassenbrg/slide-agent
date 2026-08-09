import { describe, expect, it } from "vitest";

import { footerTextIn, paletteFromTheme, parseColorMap, parseTheme } from "../../src/design/template.js";

const THEME = (options: {
  name?: string;
  dk1?: string;
  lt1?: string;
  dk2?: string;
  lt2?: string;
  major?: string;
  minor?: string;
} = {}): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${options.name ?? "Corporate 2026"}">
<a:themeElements><a:clrScheme name="Corporate">
<a:dk1>${options.dk1 ?? '<a:sysClr val="windowText" lastClr="1A1A24"/>'}</a:dk1>
<a:lt1>${options.lt1 ?? '<a:sysClr val="window" lastClr="FFFFFF"/>'}</a:lt1>
<a:dk2><a:srgbClr val="${options.dk2 ?? "2B2B3A"}"/></a:dk2>
<a:lt2><a:srgbClr val="${options.lt2 ?? "F3F1EC"}"/></a:lt2>
<a:accent1><a:srgbClr val="B52B25"/></a:accent1>
<a:accent2><a:srgbClr val="2457FF"/></a:accent2>
<a:accent3><a:srgbClr val="158A60"/></a:accent3>
<a:accent4><a:srgbClr val="D58900"/></a:accent4>
<a:accent5><a:srgbClr val="7A3FBF"/></a:accent5>
<a:accent6><a:srgbClr val="0F7B8A"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink>
<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Corporate">
<a:majorFont><a:latin typeface="${options.major ?? "Aptos Display"}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
<a:minorFont><a:latin typeface="${options.minor ?? "Aptos"}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
</a:fontScheme>
</a:themeElements></a:theme>`;

describe("reading a PowerPoint theme", () => {
  it("resolves both the explicit and the system-colour forms", () => {
    const theme = parseTheme(THEME());
    // dk1/lt1 in a PowerPoint-authored template are sysClr, not srgbClr.
    expect(theme.colors.dk1).toBe("1A1A24");
    expect(theme.colors.lt1).toBe("FFFFFF");
    expect(theme.colors.accent1).toBe("B52B25");
    expect(theme.colors.folHlink).toBe("954F72");
  });

  it("reads the major and minor typefaces and the theme name", () => {
    const theme = parseTheme(THEME());
    expect(theme.name).toBe("Corporate 2026");
    expect(theme.majorFont).toBe("Aptos Display");
    expect(theme.minorFont).toBe("Aptos");
  });

  it("treats an empty or inherited typeface as no typeface", () => {
    const theme = parseTheme(THEME({ major: "", minor: "+mn-lt" }));
    expect(theme.majorFont).toBeUndefined();
    expect(theme.minorFont).toBeUndefined();
  });

  it("returns an empty scheme rather than throwing on a theme with no colours", () => {
    const theme = parseTheme("<a:theme xmlns:a=\"x\" name=\"Bare\"/>");
    expect(theme.colors).toEqual({});
    expect(theme.name).toBe("Bare");
  });
});

describe("deriving a palette from a theme", () => {
  it("maps a light template onto background and ink the right way round", () => {
    const palette = paletteFromTheme(parseTheme(THEME()));
    expect(palette.background).toBe("FFFFFF");
    expect(palette.ink).toBe("1A1A24");
    expect(palette.surface).toBe("F3F1EC");
    expect(palette.accent).toBe("B52B25");
    expect(palette.accentAlt).toBe("2457FF");
  });

  it("follows the master's colour map instead of the role names", () => {
    // A dark template swaps the map rather than putting a dark colour in lt1.
    // Reading the names literally would produce a white deck from a black one.
    const swapped = parseColorMap('<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"/>');
    const palette = paletteFromTheme(parseTheme(THEME()), swapped);
    expect(palette.background).toBe("1A1A24");
    expect(palette.ink).toBe("FFFFFF");
    expect(palette.surface).toBe("2B2B3A");
  });

  it("falls back to the standard map when a master declares none or a bad one", () => {
    expect(parseColorMap("<p:sldMaster/>")).toEqual({ bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" });
    expect(parseColorMap('<p:clrMap bg1="nonsense" tx1="dk1" bg2="lt2" tx2="dk2"/>').bg1).toBe("lt1");
  });

  it("keeps the remaining accents by name without giving them a meaning", () => {
    const palette = paletteFromTheme(parseTheme(THEME()));
    expect(palette.custom).toMatchObject({ accent3: "158A60", accent6: "0F7B8A", hyperlink: "0563C1" });
    // accent3 here is green, but a theme's green is not a "positive" colour.
    expect(palette.positive).toBeUndefined();
    expect(palette.negative).toBeUndefined();
    expect(palette.warning).toBeUndefined();
  });

  it("derives a surface and a rule when the theme names no second pair", () => {
    const bare = parseTheme(`<a:theme xmlns:a="x" name="Bare"><a:clrScheme>
      <a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:accent1><a:srgbClr val="336699"/></a:accent1></a:clrScheme></a:theme>`);
    const palette = paletteFromTheme(bare);
    expect(palette.surface).toBeDefined();
    expect(palette.surface).not.toBe(palette.background);
    expect(palette.rule).toBeDefined();
    expect(palette.muted).toBeDefined();
  });
});

describe("reading the master's footer", () => {
  const master = (text: string): string => `<p:sldMaster xmlns:p="x" xmlns:a="y"><p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="10"/></p:nvPr></p:nvSpPr>
    <p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld></p:sldMaster>`;

  it("picks up a real footer line", () => {
    expect(footerTextIn(master("Confidential — internal use only"))).toBe("Confidential — internal use only");
  });

  it("ignores an empty placeholder and its prompt text", () => {
    expect(footerTextIn(master(""))).toBeUndefined();
    expect(footerTextIn(master("Footer"))).toBeUndefined();
  });

  it("returns nothing when the master has no footer placeholder", () => {
    expect(footerTextIn("<p:sldMaster><p:cSld><p:spTree/></p:cSld></p:sldMaster>")).toBeUndefined();
  });
});
