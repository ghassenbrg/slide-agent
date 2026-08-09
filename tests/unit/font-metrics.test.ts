import { describe, expect, it } from "vitest";

import {
  isWideScript,
  measureTextWidth,
  resolveFont,
  textBlockHeight,
  wrapLineCount,
  wrappedTextHeight,
} from "../../src/design/font-metrics.js";
import { estimatedLineCount, estimatedTextHeight, measureTextFit } from "../../src/validation/manifest-validator.js";
import type { ElementRecord } from "../../src/types/index.js";

const arial = resolveFont("Arial");
const arialBold = resolveFont("Arial", true);
const times = resolveFont("Times New Roman");
const courier = resolveFont("Courier New");

function element(overrides: Partial<ElementRecord>): ElementRecord {
  return {
    id: "e1", name: "body", type: "text", role: "body",
    x: 1, y: 1, w: 4, h: 1, ...overrides,
  };
}

describe("font resolution", () => {
  it("classifies the families a model is most likely to ask for", () => {
    expect(resolveFont("Georgia").class).toBe("serif");
    expect(resolveFont("Consolas").class).toBe("mono");
    expect(resolveFont("Montserrat").class).toBe("sans");
    expect(resolveFont("JetBrains Mono").class).toBe("mono");
  });

  it("matches a family regardless of how its name is punctuated", () => {
    expect(resolveFont("Times New Roman").fallback).toBe(false);
    expect(resolveFont("times-new-roman").fallback).toBe(false);
    expect(resolveFont("TimesNewRoman").fallback).toBe(false);
  });

  it("strips style words to reach the family", () => {
    expect(resolveFont("Lato Black Italic").fallback).toBe(false);
    expect(resolveFont("Roboto Medium").scale).toBeCloseTo(resolveFont("Roboto").scale, 5);
  });

  it("reads weight from the name when the caller did not pass one", () => {
    expect(resolveFont("Helvetica Bold").bold).toBe(true);
    expect(resolveFont("Montserrat SemiBold").bold).toBe(true);
    expect(resolveFont("Montserrat").bold).toBe(false);
  });

  it("measures an unknown family against its class instead of refusing", () => {
    const invented = resolveFont("Vanta Grotesk Display");
    expect(invented.fallback).toBe(true);
    expect(invented.class).toBe("sans");
    expect(measureTextWidth("Hamburgefonstiv", 18, invented)).toBeGreaterThan(0);
  });

  it("prices condensed and extended cuts differently from the upright", () => {
    expect(resolveFont("Futura Condensed").scale).toBeLessThan(resolveFont("Futura").scale);
    expect(resolveFont("Avenir Extended").scale).toBeGreaterThan(resolveFont("Avenir").scale);
  });

  it("does not charge Arial Black for its weight twice", () => {
    expect(resolveFont("Arial Black").scale).toBeCloseTo(1.1, 5);
  });
});

describe("width measurement", () => {
  it("distinguishes narrow letters from wide ones, which a constant cannot", () => {
    const narrow = measureTextWidth("illliiil", 24, arial);
    const wide = measureTextWidth("MMMWWWW@", 24, arial);
    expect(wide / narrow).toBeGreaterThan(3);
  });

  it("gives every character the same width in a monospaced face", () => {
    expect(measureTextWidth("iiii", 20, courier)).toBeCloseTo(measureTextWidth("MMMM", 20, courier), 10);
  });

  it("measures bold wider than regular", () => {
    expect(measureTextWidth("Quarterly revenue", 20, arialBold))
      .toBeGreaterThan(measureTextWidth("Quarterly revenue", 20, arial));
  });

  it("scales linearly with point size", () => {
    expect(measureTextWidth("Slide Agent", 24, arial)).toBeCloseTo(measureTextWidth("Slide Agent", 12, arial) * 2, 10);
  });

  it("measures serif and sans differently at the same size", () => {
    expect(measureTextWidth("Recommendation", 18, times))
      .not.toBeCloseTo(measureTextWidth("Recommendation", 18, arial), 3);
  });

  it("gives a CJK ideograph a full em and a combining mark none", () => {
    const em = 20 / 72;
    expect(measureTextWidth("経", 20, arial)).toBeCloseTo(em, 6);
    expect(measureTextWidth("é", 20, arial)).toBeCloseTo(measureTextWidth("e", 20, arial), 10);
  });

  it("recognises the wide scripts by code point", () => {
    expect(isWideScript("あ".codePointAt(0)!)).toBe(true);
    expect(isWideScript("한".codePointAt(0)!)).toBe(true);
    expect(isWideScript("字".codePointAt(0)!)).toBe(true);
    expect(isWideScript("a".codePointAt(0)!)).toBe(false);
  });

  it("prices Cyrillic, Greek, Arabic and Hebrew by script rather than as Latin", () => {
    for (const sample of ["Привет мир", "Καλημέρα", "مرحبا بالعالم", "שלום עולם"]) {
      expect(measureTextWidth(sample, 18, arial)).toBeGreaterThan(0);
    }
    expect(measureTextWidth("Привет", 18, arialBold)).toBeGreaterThan(measureTextWidth("Привет", 18, arial));
  });
});

describe("line wrapping", () => {
  it("wraps Latin text at word boundaries", () => {
    const text = "The zero-trust migration removes standing access from every production system";
    expect(wrapLineCount(text, 12, 14, arial)).toBe(1);
    expect(wrapLineCount(text, 2, 14, arial)).toBeGreaterThan(3);
  });

  it("honours explicit newlines", () => {
    expect(wrapLineCount("one\ntwo\nthree", 20, 12, arial)).toBe(3);
  });

  it("counts a blank line as a line", () => {
    expect(wrapLineCount("a\n\nb", 20, 12, arial)).toBe(3);
  });

  it("breaks CJK between characters instead of treating a paragraph as one word", () => {
    // The old estimator split on whitespace, so this returned 1 line however
    // narrow the box was, and Japanese body copy never reported an overflow.
    const japanese = "ゼロトラスト移行はすべての本番システムから常時アクセスを取り除きます";
    expect(wrapLineCount(japanese, 3, 14, arial)).toBeGreaterThan(1);
    // 33 full-em characters at 14pt is 0.194in each, so a 1in box holds five.
    expect(wrapLineCount(japanese, 1, 14, arial)).toBe(7);
  });

  it("does not start a line with CJK closing punctuation", () => {
    const width = measureTextWidth("字字字", 14, arial);
    expect(wrapLineCount("字字字。", width * 1.01, 14, arial)).toBe(1);
  });

  it("breaks after a hyphen", () => {
    const text = "zero-trust";
    const width = measureTextWidth("zero-", 14, arial) * 1.05;
    expect(wrapLineCount(text, width, 14, arial)).toBe(2);
  });

  it("breaks a single run that is wider than its box, as PowerPoint does", () => {
    const long = "A".repeat(60);
    expect(wrapLineCount(long, 1, 14, arial)).toBeGreaterThan(3);
  });

  it("treats a non-positive width as unwrappable rather than looping", () => {
    expect(wrapLineCount("one\ntwo", 0, 12, arial)).toBe(2);
  });

  it("wraps a spaceless script such as Thai", () => {
    expect(wrapLineCount("การย้ายระบบความปลอดภัยแบบไม่ไว้วางใจ", 0.5, 14, arial)).toBeGreaterThan(1);
  });
});

describe("block height", () => {
  it("includes line spacing rather than assuming a 1.0 line height", () => {
    const height = wrappedTextHeight("One line", 20, 36, arial);
    expect(height).toBeGreaterThan(36 / 72);
    expect(height).toBeCloseTo(36 * arial.lineHeight / 72, 6);
  });

  it("uses the face's own line spacing", () => {
    expect(resolveFont("Segoe UI").lineHeight).toBeGreaterThan(resolveFont("Arial").lineHeight);
  });

  it("caps the line count a layout will allocate for", () => {
    const text = "word ".repeat(80);
    const capped = textBlockHeight(text, 2, 14, arial, 3);
    expect(capped).toBeCloseTo(3 * 14 * arial.lineHeight / 72, 6);
  });

  it("never allocates less than one line", () => {
    expect(textBlockHeight("", 4, 14, arial)).toBeCloseTo(14 * arial.lineHeight / 72, 6);
  });
});

describe("validator integration", () => {
  it("measures a title in the face it is set in", () => {
    const title = "Zero-trust migration: the ninety-day gate";
    const black = estimatedLineCount(title, 4, 32, { fontFace: "Arial Black", bold: true });
    const narrow = estimatedLineCount(title, 4, 32, { fontFace: "Arial Narrow" });
    expect(black).toBeGreaterThan(narrow);
    expect(estimatedTextHeight(title, 4, 32, { fontFace: "Arial Black", bold: true }))
      .toBeGreaterThan(estimatedTextHeight(title, 4, 32, { fontFace: "Arial Narrow" }));
  });

  it("accepts a resolved font as well as a face description", () => {
    expect(estimatedLineCount("hello world", 4, 14, arial))
      .toBe(estimatedLineCount("hello world", 4, 14, { fontFace: "Arial" }));
  });

  it("reports an overflow that the constant-width estimator missed", () => {
    // Eight words of 28pt Verdana in a 3×0.5in box is two lines of type in a
    // box that holds one. At 0.33em average width this measured as fitting.
    const fit = measureTextFit(element({
      text: "Consolidated platform reliability programme",
      fontSize: 28,
      fontFace: "Verdana",
      w: 3,
      h: 0.5,
      fit: "none",
    }), 18);
    expect(fit?.clipped).toBe(true);
  });

  it("passes text that genuinely fits", () => {
    const fit = measureTextFit(element({ text: "Q3 revenue", fontSize: 18, fontFace: "Arial", w: 4, h: 1 }), 12);
    expect(fit).toEqual({ effectiveFontSize: 18, clipped: false });
  });

  it("shrinks autofit text down to the point where it fits", () => {
    const fit = measureTextFit(element({
      text: "Consolidated platform reliability programme for the coming year",
      fontSize: 40,
      fontFace: "Arial",
      w: 4,
      h: 1,
      fit: "shrink",
    }), 10);
    expect(fit!.effectiveFontSize).toBeLessThan(40);
    expect(fit!.clipped).toBe(false);
  });

  it("ignores elements with nothing to measure", () => {
    expect(measureTextFit(element({ text: undefined, fontSize: 18 }), 12)).toBeUndefined();
    expect(measureTextFit(element({ text: "x", fontSize: 18, w: 0 }), 12)).toBeUndefined();
  });
});
