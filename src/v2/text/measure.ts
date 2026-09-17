import { measureTextWidth as tableWidth, resolveFont as resolveTableFont } from "../../design/font-metrics.js";
import { isOfficeFamily } from "./catalog.js";
import type { FontRegistry } from "./registry.js";
import { applyCase, type RichParagraph, type RichRun } from "./rich.js";

/**
 * Text measurement for layout, fit, and previews — one implementation, so a
 * preview shows exactly the lines the fit engine counted.
 *
 * Widths come from the font's own advance widths when its file can be found
 * (or a metric-compatible substitute's), and from V1's per-class tables
 * otherwise; every element records which. Wrapping is greedy like PowerPoint's,
 * over UAX #14-style break opportunities, with a small safety margin so the
 * engine wraps no later than PowerPoint does.
 */

export interface FaceSpec {
  family: string;
  weight: number;
  italic: boolean;
}

export interface LoadedFace {
  key: string;
  requested: FaceSpec;
  /** The typeface name PowerPoint should be given (legacy family of the file). */
  typeface: string;
  /** Whether PowerPoint's `b` / `i` attributes select this face within `typeface`. */
  bold: boolean;
  italic: boolean;
  source: "font-file" | "table";
  file?: string;
  faceIndex?: number;
  sha256?: string;
  embeddable: boolean;
  editable: boolean;
  office: boolean;
  substituteFor?: string;
  /** Line height (ascent + descent + gap) in em, as PowerPoint's single spacing. */
  lineHeight: number;
  ascent: number;
  capHeight: number;
  advance(codePoint: number): number;
  hasGlyph(codePoint: number): boolean;
}

export function faceKey(spec: FaceSpec): string {
  return `${spec.family.toLowerCase()}|${spec.weight}|${spec.italic ? 1 : 0}`;
}

/** Wrap a little early so PowerPoint never needs a line the engine did not count. */
export const WRAP_SAFETY = 0.985;

export class TextEngine {
  private readonly faces = new Map<string, LoadedFace>();

  public constructor(private readonly registry?: FontRegistry) {}

  public async load(spec: FaceSpec): Promise<LoadedFace> {
    const key = faceKey(spec);
    const existing = this.faces.get(key);
    if (existing) return existing;
    const resolved = this.registry ? await this.registry.resolve(spec.family, spec.weight, spec.italic) : undefined;
    let face: LoadedFace;
    if (resolved) {
      const { face: font, metrics, entry } = resolved;
      const subfamily = entry.subfamily.toLowerCase();
      const winLineHeight = (font.winAscent + font.winDescent) / font.unitsPerEm;
      const typoLineHeight = (font.ascent - font.descent + font.lineGap) / font.unitsPerEm;
      face = {
        key,
        requested: spec,
        typeface: resolved.substituteFor ?? entry.family,
        // Legacy subfamilies are exactly Regular, Bold, Italic, or Bold Italic;
        // other weights live in the family name ("Fraunces Light").
        bold: resolved.substituteFor ? spec.weight >= 600 : /^bold( italic)?$/.test(subfamily),
        italic: resolved.substituteFor ? spec.italic : /italic|oblique/.test(subfamily),
        source: "font-file",
        file: entry.file,
        faceIndex: entry.faceIndex,
        sha256: resolved.sha256,
        embeddable: resolved.embeddable && !resolved.substituteFor,
        editable: resolved.editable,
        office: isOfficeFamily(spec.family),
        ...(resolved.substituteFor ? { substituteFor: resolved.substituteFor } : {}),
        lineHeight: Math.max(winLineHeight, typoLineHeight, 1),
        ascent: font.winAscent / font.unitsPerEm,
        capHeight: font.capHeight / font.unitsPerEm,
        advance: (codePoint) => metrics.hasGlyph(codePoint) ? metrics.advance(codePoint) : fallbackAdvance(codePoint, spec),
        hasGlyph: (codePoint) => metrics.hasGlyph(codePoint),
      };
    } else {
      face = tableFace(spec, key);
    }
    this.faces.set(key, face);
    return face;
  }

  /** A face already loaded, or the table fallback (never throws, never awaits). */
  public face(spec: FaceSpec): LoadedFace {
    const key = faceKey(spec);
    const existing = this.faces.get(key);
    if (existing) return existing;
    const fallback = tableFace(spec, key);
    this.faces.set(key, fallback);
    return fallback;
  }

  /** Drop a cached face and the registry index, e.g. after fetching new files. */
  public forget(spec: FaceSpec): void {
    this.faces.delete(faceKey(spec));
    this.registry?.invalidate();
  }

  public loadedFaces(): LoadedFace[] {
    return [...this.faces.values()];
  }

  /** Width in inches of `text` set in `face` at `size` points with `tracking` em. */
  public width(text: string, face: LoadedFace, size: number, tracking = 0): number {
    let em = 0;
    let count = 0;
    for (const character of text) {
      em += face.advance(character.codePointAt(0)!);
      count += 1;
    }
    return ((em + tracking * count) * size) / 72;
  }

  public layout(input: LayoutInput): TextLayout {
    const width = Math.max(0.01, input.width) * WRAP_SAFETY;
    const lines: LaidLine[] = [];
    let paragraphIndex = 0;
    let height = 0;
    let widest = 0;
    const lineHeight = (input.size * input.leading) / 72;
    const paragraphGap = ((input.paragraphSpacing ?? 0) * input.size) / 72;

    for (const paragraph of input.paragraphs) {
      const indent = paragraph.bullet ? ((input.size * 1.1) / 72) * (1 + paragraph.level) : 0;
      const available = Math.max(0.01, width - indent);
      const glyphs = this.glyphs(paragraph.runs, input);
      const paragraphLines = breakLines(glyphs, available);
      if (paragraphIndex > 0) height += paragraphGap;
      for (const glyphLine of paragraphLines) {
        const segments = segmentsOf(withoutTrailingSpaces(glyphLine));
        const lineWidth = glyphLine.reduce((total, glyph) => total + glyph.width, 0) - trailingSpaceWidth(glyphLine);
        widest = Math.max(widest, lineWidth + indent);
        lines.push({ paragraph: paragraphIndex, segments, width: lineWidth, indent, ...(paragraph.bullet ? { bullet: paragraph.bullet, level: paragraph.level } : {}), first: glyphLine === paragraphLines[0] });
        height += lineHeight;
      }
      paragraphIndex += 1;
    }
    return { lines, height, lineCount: lines.length, widest: widest / WRAP_SAFETY, lineHeight };
  }

  /** The narrowest width that keeps the same number of lines: balanced wrapping. */
  public balancedWidth(input: LayoutInput): number {
    const base = this.layout(input);
    if (base.lineCount <= 1) return Math.min(input.width, base.widest);
    let low = input.width / base.lineCount;
    let high = input.width;
    for (let iteration = 0; iteration < 18; iteration += 1) {
      const middle = (low + high) / 2;
      if (this.layout({ ...input, width: middle }).lineCount <= base.lineCount) high = middle;
      else low = middle;
    }
    return Math.min(input.width, high * 1.01);
  }

  /** Largest single unbreakable token width: the narrowest a box may be without breaking words. */
  public minContentWidth(input: LayoutInput): number {
    let widest = 0;
    for (const paragraph of input.paragraphs) {
      let current = 0;
      for (const glyph of this.glyphs(paragraph.runs, input)) {
        if (glyph.breakAfter || glyph.space) {
          widest = Math.max(widest, current + (glyph.space ? 0 : glyph.width));
          current = 0;
        } else {
          current += glyph.width;
        }
      }
      widest = Math.max(widest, current);
    }
    return widest;
  }

  private glyphs(runs: RichRun[], input: LayoutInput): Glyph[] {
    const glyphs: Glyph[] = [];
    runs.forEach((run, runIndex) => {
      const face = input.faceFor(run);
      const text = applyCase(run.text, input.textCase);
      for (const character of text) {
        const code = character.codePointAt(0)!;
        const width = ((face.advance(code) + (input.tracking ?? 0)) * input.size) / 72;
        glyphs.push({
          character,
          run: runIndex,
          width,
          space: /\s/.test(character),
          breakAfter: character === "-" || character === "‐" || character === "–" || character === "—" || character === "/" || isWide(code) || isSpaceless(code),
          breakBefore: isWide(code) && !NO_LINE_START.has(character),
          noStart: NO_LINE_START.has(character),
        });
      }
    });
    return glyphs;
  }
}

export interface LayoutInput {
  paragraphs: RichParagraph[];
  size: number;
  leading: number;
  width: number;
  tracking?: number;
  textCase?: string;
  paragraphSpacing?: number;
  faceFor: (run: RichRun) => LoadedFace;
}

export interface LaidSegment {
  text: string;
  run: number;
  width: number;
}

export interface LaidLine {
  paragraph: number;
  segments: LaidSegment[];
  width: number;
  indent: number;
  bullet?: "bullet" | "number";
  level?: number;
  first: boolean;
}

export interface TextLayout {
  lines: LaidLine[];
  height: number;
  lineCount: number;
  widest: number;
  lineHeight: number;
}

interface Glyph {
  character: string;
  run: number;
  width: number;
  space: boolean;
  breakAfter: boolean;
  breakBefore: boolean;
  noStart: boolean;
}

const NO_LINE_START = new Set([..."、。，．）」』】〕〉》”’!%),.:;?]}｝｣､"]);

function isWide(code: number): boolean {
  return (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0x303e) || (code >= 0x3041 && code <= 0x33ff)
    || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xff60);
}

function isSpaceless(code: number): boolean {
  return (code >= 0x0e00 && code <= 0x0eff) || (code >= 0x1000 && code <= 0x109f) || (code >= 0x1780 && code <= 0x17ff);
}

function trailingSpaceWidth(line: Glyph[]): number {
  let width = 0;
  for (let index = line.length - 1; index >= 0 && line[index]!.space; index -= 1) width += line[index]!.width;
  return width;
}

/** Greedy line breaking over break opportunities. */
function breakLines(glyphs: Glyph[], width: number): Glyph[][] {
  if (glyphs.length === 0) return [[]];
  // Group glyphs into unbreakable tokens: a token ends after a space run, after a break-after glyph, or before a break-before glyph.
  const tokens: Glyph[][] = [];
  let current: Glyph[] = [];
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index]!;
    const next = glyphs[index + 1];
    if (glyph.breakBefore && current.length > 0 && !current.every((item) => item.space)) {
      tokens.push(current);
      current = [];
    }
    current.push(glyph);
    const endsSpaceRun = glyph.space && (!next || !next.space);
    if ((endsSpaceRun || glyph.breakAfter) && !(next?.noStart)) {
      tokens.push(current);
      current = [];
    }
  }
  if (current.length) tokens.push(current);

  const lines: Glyph[][] = [];
  let line: Glyph[] = [];
  let used = 0;
  for (const token of tokens) {
    const tokenWidth = token.reduce((total, glyph) => total + glyph.width, 0);
    const printable = tokenWidth - trailingSpaceWidth(token);
    if (line.length > 0 && used + printable > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    if (line.length === 0 && printable > width) {
      // An unbreakable run wider than the box: break between characters, as PowerPoint does.
      let chunk: Glyph[] = [];
      let chunkWidth = 0;
      for (const glyph of token) {
        if (chunk.length > 0 && chunkWidth + glyph.width > width && !glyph.space) {
          lines.push(chunk);
          chunk = [];
          chunkWidth = 0;
        }
        chunk.push(glyph);
        chunkWidth += glyph.width;
      }
      line = chunk;
      used = chunkWidth;
      continue;
    }
    line.push(...token);
    used += tokenWidth;
  }
  lines.push(line);
  return lines;
}

function withoutTrailingSpaces(line: Glyph[]): Glyph[] {
  let end = line.length;
  while (end > 0 && line[end - 1]!.space) end -= 1;
  return line.slice(0, end);
}

function segmentsOf(line: Glyph[]): LaidSegment[] {
  const segments: LaidSegment[] = [];
  for (const glyph of line) {
    const last = segments.at(-1);
    if (last && last.run === glyph.run) {
      last.text += glyph.character;
      last.width += glyph.width;
    } else {
      segments.push({ text: glyph.character, run: glyph.run, width: glyph.width });
    }
  }
  return segments;
}

function tableFace(spec: FaceSpec, key: string): LoadedFace {
  const font = resolveTableFont(spec.family, spec.weight >= 600);
  const cache = new Map<number, number>();
  return {
    key,
    requested: spec,
    typeface: spec.family,
    bold: spec.weight >= 600,
    italic: spec.italic,
    source: "table",
    embeddable: false,
    editable: false,
    office: isOfficeFamily(spec.family),
    lineHeight: font.lineHeight,
    ascent: font.lineHeight * 0.8,
    capHeight: 0.7,
    advance: (codePoint) => {
      const cached = cache.get(codePoint);
      if (cached !== undefined) return cached;
      // At 72 pt one em is one inch, so the table's inches are em.
      const value = tableWidth(String.fromCodePoint(codePoint), 72, font);
      cache.set(codePoint, value);
      return value;
    },
    hasGlyph: () => false,
  };
}

function fallbackAdvance(codePoint: number, spec: FaceSpec): number {
  const font = resolveTableFont(spec.family, spec.weight >= 600);
  return tableWidth(String.fromCodePoint(codePoint), 72, font);
}
