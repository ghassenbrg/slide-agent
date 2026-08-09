/**
 * Text measurement for layout and overflow validation.
 *
 * The previous estimator priced every glyph in every font at a single constant
 * (`fontSize * 0.33`), which is wrong in both directions at once: it
 * over-measures `Iil.` and under-measures `MWm@`, it cannot tell Arial Black
 * from Arial Narrow, and it counts a space-free CJK paragraph as one
 * unbreakable word — so a slide of Japanese body copy reported a single line
 * and never overflowed. This module measures per character, per family, and
 * per script instead.
 *
 * The tables are embedded rather than read from the host's installed fonts on
 * purpose. Validation has to reach the same verdict on a laptop and in CI; a
 * measurement that depended on which fonts happen to be installed would make
 * the same deck pass in one place and fail in another. Whether the host can
 * actually display a font is a separate, advisory question — see
 * `font-availability.ts`.
 *
 * Widths are advance widths in 1/1000 em, the same units as an AFM file.
 */

export type FontClass = "sans" | "serif" | "mono";

/** Adobe Helvetica advance widths, U+0020 to U+007E. */
const HELVETICA: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Adobe Helvetica-Bold advance widths, U+0020 to U+007E. */
const HELVETICA_BOLD: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Adobe Times-Roman advance widths, U+0020 to U+007E. */
const TIMES: readonly number[] = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
  921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
  556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
  333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
  500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541,
];

/** Adobe Times-Bold advance widths, U+0020 to U+007E. */
const TIMES_BOLD: readonly number[] = [
  250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
  930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778,
  611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500,
  333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500,
  556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520,
];

const MONO_WIDTH = 600;
const FIRST_ASCII = 0x20;
const LAST_ASCII = 0x7e;

interface FamilyMetrics {
  class: FontClass;
  /** Multiplier applied to the base class widths. */
  scale: number;
  /** Single line spacing as a multiple of the point size. */
  lineHeight: number;
}

const CLASS_DEFAULTS: Record<FontClass, FamilyMetrics> = {
  sans: { class: "sans", scale: 1, lineHeight: 1.17 },
  serif: { class: "serif", scale: 1, lineHeight: 1.15 },
  mono: { class: "mono", scale: 1, lineHeight: 1.2 },
};

/**
 * Families measured relative to the base class. A scale is the family's
 * average advance width divided by the base family's, which tracks real
 * wrapping far more closely than treating every sans face as Arial: Calibri
 * sets roughly ten per cent more text per line than Arial does, and Bebas Neue
 * nearly twice as much.
 */
const FAMILIES: Record<string, FamilyMetrics> = {
  // Sans, Helvetica-relative
  helvetica: { class: "sans", scale: 1, lineHeight: 1.17 },
  helveticaneue: { class: "sans", scale: 0.98, lineHeight: 1.17 },
  arial: { class: "sans", scale: 1, lineHeight: 1.15 },
  arialnarrow: { class: "sans", scale: 0.82, lineHeight: 1.15 },
  arialblack: { class: "sans", scale: 1.1, lineHeight: 1.15 },
  liberationsans: { class: "sans", scale: 1, lineHeight: 1.15 },
  nimbussans: { class: "sans", scale: 1, lineHeight: 1.17 },
  aptos: { class: "sans", scale: 0.92, lineHeight: 1.2 },
  aptosdisplay: { class: "sans", scale: 0.92, lineHeight: 1.2 },
  calibri: { class: "sans", scale: 0.9, lineHeight: 1.22 },
  candara: { class: "sans", scale: 0.93, lineHeight: 1.2 },
  corbel: { class: "sans", scale: 0.93, lineHeight: 1.2 },
  segoeui: { class: "sans", scale: 0.96, lineHeight: 1.33 },
  tahoma: { class: "sans", scale: 0.98, lineHeight: 1.21 },
  verdana: { class: "sans", scale: 1.1, lineHeight: 1.21 },
  trebuchetms: { class: "sans", scale: 0.96, lineHeight: 1.16 },
  geneva: { class: "sans", scale: 1.02, lineHeight: 1.17 },
  roboto: { class: "sans", scale: 0.98, lineHeight: 1.17 },
  robotocondensed: { class: "sans", scale: 0.82, lineHeight: 1.17 },
  opensans: { class: "sans", scale: 1, lineHeight: 1.36 },
  notosans: { class: "sans", scale: 1, lineHeight: 1.36 },
  lato: { class: "sans", scale: 0.97, lineHeight: 1.2 },
  inter: { class: "sans", scale: 0.99, lineHeight: 1.21 },
  worksans: { class: "sans", scale: 0.98, lineHeight: 1.18 },
  sourcesanspro: { class: "sans", scale: 0.95, lineHeight: 1.26 },
  sourcesans3: { class: "sans", scale: 0.95, lineHeight: 1.26 },
  ibmplexsans: { class: "sans", scale: 0.98, lineHeight: 1.3 },
  poppins: { class: "sans", scale: 1.04, lineHeight: 1.5 },
  montserrat: { class: "sans", scale: 1.06, lineHeight: 1.22 },
  raleway: { class: "sans", scale: 0.96, lineHeight: 1.17 },
  nunito: { class: "sans", scale: 0.97, lineHeight: 1.36 },
  futura: { class: "sans", scale: 1.02, lineHeight: 1.17 },
  avenir: { class: "sans", scale: 0.98, lineHeight: 1.17 },
  avenirnext: { class: "sans", scale: 0.98, lineHeight: 1.17 },
  gillsans: { class: "sans", scale: 0.92, lineHeight: 1.15 },
  franklingothic: { class: "sans", scale: 0.94, lineHeight: 1.16 },
  franklingothicbook: { class: "sans", scale: 0.94, lineHeight: 1.16 },
  impact: { class: "sans", scale: 0.8, lineHeight: 1.21 },
  haettenschweiler: { class: "sans", scale: 0.7, lineHeight: 1.2 },
  oswald: { class: "sans", scale: 0.72, lineHeight: 1.48 },
  bebasneue: { class: "sans", scale: 0.62, lineHeight: 1.2 },
  barlowcondensed: { class: "sans", scale: 0.78, lineHeight: 1.2 },
  dejavusans: { class: "sans", scale: 1.06, lineHeight: 1.17 },

  // Serif, Times-relative
  times: { class: "serif", scale: 1, lineHeight: 1.15 },
  timesnewroman: { class: "serif", scale: 1, lineHeight: 1.15 },
  liberationserif: { class: "serif", scale: 1, lineHeight: 1.15 },
  nimbusroman: { class: "serif", scale: 1, lineHeight: 1.15 },
  georgia: { class: "serif", scale: 1.08, lineHeight: 1.14 },
  cambria: { class: "serif", scale: 1.02, lineHeight: 1.17 },
  constantia: { class: "serif", scale: 1, lineHeight: 1.22 },
  garamond: { class: "serif", scale: 0.9, lineHeight: 1.15 },
  ebgaramond: { class: "serif", scale: 0.9, lineHeight: 1.15 },
  palatino: { class: "serif", scale: 1.05, lineHeight: 1.18 },
  bookantiqua: { class: "serif", scale: 1.05, lineHeight: 1.18 },
  merriweather: { class: "serif", scale: 1.12, lineHeight: 1.4 },
  playfairdisplay: { class: "serif", scale: 1.02, lineHeight: 1.33 },
  librebaskerville: { class: "serif", scale: 1.12, lineHeight: 1.33 },
  notoserif: { class: "serif", scale: 1.05, lineHeight: 1.36 },
  ptserif: { class: "serif", scale: 1.03, lineHeight: 1.29 },
  sourceserifpro: { class: "serif", scale: 1, lineHeight: 1.26 },
  ibmplexserif: { class: "serif", scale: 1.02, lineHeight: 1.3 },
  charter: { class: "serif", scale: 1.02, lineHeight: 1.15 },
  didot: { class: "serif", scale: 0.95, lineHeight: 1.15 },
  bodonimt: { class: "serif", scale: 0.92, lineHeight: 1.15 },
  rockwell: { class: "serif", scale: 1.05, lineHeight: 1.16 },

  // Monospace
  courier: { class: "mono", scale: 1, lineHeight: 1.2 },
  couriernew: { class: "mono", scale: 1, lineHeight: 1.13 },
  consolas: { class: "mono", scale: 0.917, lineHeight: 1.17 },
  menlo: { class: "mono", scale: 1.003, lineHeight: 1.21 },
  monaco: { class: "mono", scale: 1, lineHeight: 1.19 },
  sfmono: { class: "mono", scale: 1, lineHeight: 1.2 },
  aptosmono: { class: "mono", scale: 1, lineHeight: 1.2 },
  cascadiacode: { class: "mono", scale: 1, lineHeight: 1.3 },
  cascadiamono: { class: "mono", scale: 1, lineHeight: 1.3 },
  jetbrainsmono: { class: "mono", scale: 1, lineHeight: 1.3 },
  firacode: { class: "mono", scale: 1, lineHeight: 1.3 },
  firamono: { class: "mono", scale: 1, lineHeight: 1.3 },
  sourcecodepro: { class: "mono", scale: 1, lineHeight: 1.26 },
  ibmplexmono: { class: "mono", scale: 1, lineHeight: 1.3 },
  robotomono: { class: "mono", scale: 1, lineHeight: 1.32 },
  ubuntumono: { class: "mono", scale: 0.833, lineHeight: 1.15 },
  liberationmono: { class: "mono", scale: 1, lineHeight: 1.13 },
  dejavusansmono: { class: "mono", scale: 1.003, lineHeight: 1.17 },
};

/** Style words that name a weight or slant rather than a different family. */
const STYLE_WORDS = [
  "regular", "roman", "book", "text", "normal", "upright",
  "thin", "hairline", "extralight", "ultralight", "light", "medium",
  "semibold", "demibold", "demi", "bold", "extrabold", "ultrabold", "heavy", "black",
  "italic", "oblique", "it",
  "mt", "ms", "std", "pro", "lt",
];

function normalizeFamily(fontFace: string): string {
  return fontFace.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strip one trailing style word at a time: `latoblackitalic` → `lato`. */
function withoutStyleWords(normalized: string): string[] {
  const candidates: string[] = [];
  let current = normalized;
  for (let round = 0; round < 4; round += 1) {
    const word = STYLE_WORDS.find((style) => current.length > style.length && current.endsWith(style));
    if (!word) break;
    current = current.slice(0, -word.length);
    candidates.push(current);
  }
  return candidates;
}

function classify(normalized: string): FontClass {
  if (/mono|code|courier|consol|typewriter|terminal/.test(normalized)) return "mono";
  if (/sansserif|sans/.test(normalized)) return "sans";
  if (/serif|times|georgia|garamond|roman|slab|book|didot|bodoni|caslon|baskerville|minion|palatino/.test(normalized)) return "serif";
  return "sans";
}

export interface ResolvedFont {
  family: string;
  class: FontClass;
  bold: boolean;
  /** Multiplier on the base class widths, including weight and width styling. */
  scale: number;
  lineHeight: number;
  /** True when no table matched and the class default was used. */
  fallback: boolean;
}

const resolveCache = new Map<string, ResolvedFont>();

/**
 * Map a model-chosen font name onto measurable metrics. Any name resolves:
 * an unknown family is classified by its name and measured against its class,
 * because the project asks models to choose fonts freely and refusing to
 * measure one would silently disable overflow detection for that slide.
 */
export function resolveFont(fontFace: string | undefined, bold = false): ResolvedFont {
  const key = `${fontFace ?? ""} ${bold ? 1 : 0}`;
  const cached = resolveCache.get(key);
  if (cached) return cached;

  const normalized = normalizeFamily(fontFace ?? "");
  // Names arrive normalized, so "Helvetica Bold" is "helveticabold": a word
  // boundary cannot be relied on here.
  const boldByName = /bold|black|heavy/.test(normalized);
  let entry = FAMILIES[normalized];
  let fallback = false;

  if (!entry) {
    for (const candidate of withoutStyleWords(normalized)) {
      if (FAMILIES[candidate]) {
        entry = FAMILIES[candidate];
        break;
      }
    }
  }
  if (!entry) {
    entry = CLASS_DEFAULTS[classify(normalized)];
    fallback = normalized.length > 0;
  }

  let scale = entry.scale;
  // Condensed and extended cuts change measurement far more than weight does,
  // and a model that asks for one has asked for more words per line.
  if (/condensed|narrow|compressed/.test(normalized) && !/^(arialnarrow|robotocondensed|barlowcondensed)$/.test(normalized)) scale *= 0.82;
  if (/extended|expanded|wide/.test(normalized)) scale *= 1.15;
  if (/thin|hairline|extralight|ultralight/.test(normalized)) scale *= 0.96;
  // `Arial Black` already carries its own scale; do not charge it twice.
  if (/black|heavy/.test(normalized) && !FAMILIES[normalized]) scale *= 1.06;

  const resolved: ResolvedFont = {
    family: fontFace ?? "",
    class: entry.class,
    bold: bold || boldByName,
    scale,
    lineHeight: entry.lineHeight,
    fallback,
  };
  resolveCache.set(key, resolved);
  return resolved;
}

/** Combining marks advance the pen by nothing; counting them inflates every accented line. */
function isCombining(code: number): boolean {
  return (code >= 0x0300 && code <= 0x036f)
    || (code >= 0x0483 && code <= 0x0489)
    || (code >= 0x0591 && code <= 0x05bd)
    || (code >= 0x0610 && code <= 0x061a)
    || (code >= 0x064b && code <= 0x065f)
    || code === 0x0670
    || (code >= 0x06d6 && code <= 0x06dc)
    || (code >= 0x0730 && code <= 0x074a)
    || (code >= 0x07a6 && code <= 0x07b0)
    || (code >= 0x0900 && code <= 0x0902)
    || code === 0x093c || code === 0x094d
    || (code >= 0x0941 && code <= 0x0948)
    || (code >= 0x0951 && code <= 0x0957)
    || (code >= 0x20d0 && code <= 0x20f0)
    || (code >= 0xfe00 && code <= 0xfe0f);
}

/** Characters that occupy a full em and may be broken between, not within. */
export function isWideScript(code: number): boolean {
  return (code >= 0x1100 && code <= 0x115f) // Hangul Jamo
    || (code >= 0x2e80 && code <= 0x303e) // CJK radicals and punctuation
    || (code >= 0x3041 && code <= 0x33ff) // Kana, Hangul compatibility, CJK compatibility
    || (code >= 0x3400 && code <= 0x4dbf) // CJK extension A
    || (code >= 0x4e00 && code <= 0x9fff) // CJK unified ideographs
    || (code >= 0xa000 && code <= 0xa4cf) // Yi
    || (code >= 0xac00 && code <= 0xd7a3) // Hangul syllables
    || (code >= 0xf900 && code <= 0xfaff) // CJK compatibility ideographs
    || (code >= 0xfe30 && code <= 0xfe6f) // CJK compatibility forms
    || (code >= 0xff00 && code <= 0xff60) // Fullwidth forms
    || (code >= 0xffe0 && code <= 0xffe6)
    || (code >= 0x1f300 && code <= 0x1faff); // Emoji, which set on an em too
}

/** Scripts written without spaces, where a line may break almost anywhere. */
function isSpacelessScript(code: number): boolean {
  return (code >= 0x0e00 && code <= 0x0e7f) // Thai
    || (code >= 0x0e80 && code <= 0x0eff) // Lao
    || (code >= 0x1000 && code <= 0x109f) // Myanmar
    || (code >= 0x1780 && code <= 0x17ff); // Khmer
}

/** Advance width of one code point, in 1/1000 em, before family scaling. */
function baseAdvance(code: number, font: ResolvedFont): number {
  if (isCombining(code)) return 0;
  if (isWideScript(code)) return 1000;
  if (font.class === "mono") return MONO_WIDTH;

  const table = font.class === "serif"
    ? (font.bold ? TIMES_BOLD : TIMES)
    : (font.bold ? HELVETICA_BOLD : HELVETICA);

  if (code >= FIRST_ASCII && code <= LAST_ASCII) return table[code - FIRST_ASCII]!;

  // Latin-1 accented letters advance like their unaccented base; everything
  // else is priced per script, because a Cyrillic or Arabic line measured
  // against a Latin table is the same mistake as the constant it replaces.
  if (code >= 0x00c0 && code <= 0x00ff) return table[(code >= 0x00e0 ? 0x61 : 0x41) - FIRST_ASCII]!;
  if (code >= 0x0100 && code <= 0x024f) return table[0x61 - FIRST_ASCII]!;
  if (code >= 0x0370 && code <= 0x03ff) return font.bold ? 600 : 560; // Greek
  if (code >= 0x0400 && code <= 0x04ff) return font.bold ? 620 : 580; // Cyrillic
  if (code >= 0x0590 && code <= 0x05ff) return 520; // Hebrew
  if (code >= 0x0600 && code <= 0x06ff) return 500; // Arabic, joined
  if (code >= 0x0900 && code <= 0x0dff) return 580; // Indic
  if (isSpacelessScript(code)) return 520;
  if (code === 0x2013 || code === 0x2014) return font.class === "serif" ? 500 : 556; // en, em dash
  if (code >= 0x2018 && code <= 0x201d) return font.class === "serif" ? 333 : 222; // curly quotes
  if (code === 0x2026) return 1000; // ellipsis
  return table[0x6e - FIRST_ASCII]!; // an average lowercase letter
}

/** Width of `text` in inches when set in `font` at `fontSize` points. */
export function measureTextWidth(text: string, fontSize: number, font: ResolvedFont): number {
  let thousandths = 0;
  for (const character of text) thousandths += baseAdvance(character.codePointAt(0)!, font);
  return thousandths * font.scale * fontSize / 1000 / 72;
}

interface Token {
  text: string;
  width: number;
  /** Trailing whitespace does not count against the line it ends. */
  trailingWidth: number;
}

/**
 * Split a line into the smallest units that must stay together. Latin words
 * hold together; CJK breaks between characters; Thai and Khmer, which are
 * written without spaces, break anywhere.
 */
function tokenize(line: string, fontSize: number, font: ResolvedFont): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let trailing = "";

  const flush = (): void => {
    if (!current && !trailing) return;
    tokens.push({
      text: current + trailing,
      width: measureTextWidth(current + trailing, fontSize, font),
      trailingWidth: measureTextWidth(trailing, fontSize, font),
    });
    current = "";
    trailing = "";
  };

  for (const character of line) {
    const code = character.codePointAt(0)!;
    if (/\s/.test(character)) {
      trailing += character;
      continue;
    }
    // A non-space after a space closes the previous token.
    if (trailing) flush();
    if (isWideScript(code) || isSpacelessScript(code)) {
      current += character;
      flush();
      continue;
    }
    current += character;
    // A hyphen is a break opportunity in every Latin-script convention.
    if (character === "-" || character === "‐" || character === "–" || character === "—") flush();
  }
  flush();
  return tokens;
}

/** Characters that must not start a line; CJK typesetting hangs them instead. */
const NO_LINE_START = new Set([..."、。，．）」』】〕〉》”’!%),.:;?]}｝｣､"]);

/**
 * How many lines `text` wraps to inside `widthInches`. Greedy, like every
 * renderer: fill a line until the next token will not fit.
 */
export function wrapLineCount(text: string, widthInches: number, fontSize: number, font: ResolvedFont): number {
  if (widthInches <= 0) return text.split(/\r?\n/).length;
  let total = 0;

  for (const paragraph of text.split(/\r?\n/)) {
    const tokens = tokenize(paragraph, fontSize, font);
    if (tokens.length === 0) {
      total += 1;
      continue;
    }
    let lines = 1;
    let used = 0;
    for (const token of tokens) {
      const printable = token.width - token.trailingWidth;
      if (used > 0 && used + printable > widthInches && !NO_LINE_START.has(token.text[0]!)) {
        lines += 1;
        used = 0;
      }
      if (used === 0 && printable > widthInches) {
        // A single unbreakable run wider than the box: PowerPoint breaks it
        // between characters rather than letting it run off the shape.
        const perLine = Math.max(1, Math.floor(widthInches / (printable / [...token.text].length)));
        const characters = [...token.text].length;
        lines += Math.ceil(characters / perLine) - 1;
        used = measureTextWidth([...token.text].slice(-(characters % perLine || perLine)).join(""), fontSize, font);
        continue;
      }
      used += token.width;
    }
    total += lines;
  }

  return total;
}

/** Height in inches that `text` needs, including line spacing. */
export function wrappedTextHeight(text: string, widthInches: number, fontSize: number, font: ResolvedFont): number {
  return wrapLineCount(text, widthInches, fontSize, font) * fontSize * font.lineHeight / 72;
}

/**
 * Height for a text box a layout is about to draw, in the face it will draw it
 * in. Layouts used to multiply a line count by a hand-picked figure between
 * 1.15 and 1.35 while counting those lines in the wrong font, so a box could
 * be built too short for the text it was built to hold — and the validator,
 * measuring properly, would then report the layout's own box as overflowing.
 * Both sides now ask this module.
 */
export function textBlockHeight(
  text: string,
  widthInches: number,
  fontSize: number,
  font: ResolvedFont,
  maximumLines = Number.POSITIVE_INFINITY,
): number {
  const lines = Math.max(1, Math.min(maximumLines, wrapLineCount(text, widthInches, fontSize, font)));
  return lines * fontSize * font.lineHeight / 72;
}
