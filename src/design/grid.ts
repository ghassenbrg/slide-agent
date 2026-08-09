import type { DimensionsConfig } from "../types/index.js";
import type { DeckTokens } from "./tokens.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A proportional layout grid derived from the slide's real dimensions.
 *
 * Every built-in layout used to embed literals — `12.1`, `8.85`, `10.0`,
 * `4.95` — that were only valid at 13.333 x 7.5 inches. A 4:3 configuration
 * produced 35 out-of-bounds elements, and vertical or print formats were
 * impossible. Layouts now ask the grid for regions instead of hard-coding them.
 */
export class Grid {
  public readonly columns: number;
  public readonly gutter: number;
  public readonly margin: number;
  public readonly width: number;
  public readonly height: number;

  public constructor(dimensions: DimensionsConfig, private readonly tokens: DeckTokens) {
    this.width = dimensions.width;
    this.height = dimensions.height;
    const aspect = dimensions.width / dimensions.height;
    // Wide stages carry twelve columns comfortably; square and vertical ones
    // need fewer or the columns become unusably narrow.
    this.columns = aspect >= 1.5 ? 12 : aspect >= 1.1 ? 8 : 6;
    this.gutter = tokens.space.md;
    this.margin = Math.max(dimensions.margin, tokens.space.lg);
  }

  /** The area inside the margins. */
  public get safe(): Rect {
    return {
      x: this.margin,
      y: this.margin,
      w: this.width - this.margin * 2,
      h: this.height - this.margin * 2,
    };
  }

  public get columnWidth(): number {
    return (this.safe.w - this.gutter * (this.columns - 1)) / this.columns;
  }

  /** Horizontal region covering `count` columns starting at `start` (0-based). */
  public span(start: number, count: number): { x: number; w: number } {
    const clampedStart = Math.max(0, Math.min(start, this.columns - 1));
    const clampedCount = Math.max(1, Math.min(count, this.columns - clampedStart));
    return {
      x: this.safe.x + clampedStart * (this.columnWidth + this.gutter),
      w: clampedCount * this.columnWidth + (clampedCount - 1) * this.gutter,
    };
  }

  /** Evenly divides `region` into `count` horizontal cells. */
  public divide(region: Rect, count: number, gap = this.gutter): Rect[] {
    const safeCount = Math.max(1, count);
    const cellWidth = (region.w - gap * (safeCount - 1)) / safeCount;
    return Array.from({ length: safeCount }, (_, index) => ({
      x: region.x + index * (cellWidth + gap),
      y: region.y,
      w: cellWidth,
      h: region.h,
    }));
  }

  /**
   * Packs rows of their natural height from the top of `region` rather than
   * spreading them across it. Evenly dividing a tall region left three bullets
   * floating in acres of whitespace on portrait formats.
   */
  public packRows(region: Rect, heights: number[], gap = this.tokens.space.md): Rect[] {
    const total = heights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, heights.length - 1);
    // Fall back to even division only when the content genuinely overflows.
    if (total > region.h) return this.stack(region, heights.length, gap);
    let cursor = region.y;
    return heights.map((height) => {
      const row = { x: region.x, y: cursor, w: region.w, h: height };
      cursor += height + gap;
      return row;
    });
  }

  /** Evenly divides `region` into `count` stacked rows. */
  public stack(region: Rect, count: number, gap = this.tokens.space.sm): Rect[] {
    const safeCount = Math.max(1, count);
    const rowHeight = (region.h - gap * (safeCount - 1)) / safeCount;
    return Array.from({ length: safeCount }, (_, index) => ({
      x: region.x,
      y: region.y + index * (rowHeight + gap),
      w: region.w,
      h: rowHeight,
    }));
  }

  /** The title band, sized to the number of lines the title actually needs. */
  /**
   * `lineHeight` is the single line spacing of the face the title is set in,
   * not a constant: Segoe UI leads at 1.33 and Times at 1.15, and a band built
   * for the wrong one is either short enough to clip or tall enough to push the
   * content band off the stage.
   */
  public titleBand(lines: number, fontSize: number, lineHeight = 1.18): Rect {
    const height = Math.max(1, lines) * (fontSize / 72) * lineHeight;
    return { x: this.safe.x, y: this.safe.y, w: this.safe.w, h: height };
  }

  /** Everything below a title band, minus the footer strip. */
  public contentBelow(band: Rect): Rect {
    const top = band.y + band.h + this.tokens.space.md;
    return {
      x: this.safe.x,
      y: top,
      w: this.safe.w,
      h: Math.max(this.tokens.space.xl, this.height - this.margin - this.footerHeight - top),
    };
  }

  public get footerHeight(): number {
    return this.tokens.type.caption / 72 * 1.6;
  }

  public get footer(): Rect {
    return {
      x: this.safe.x,
      y: this.height - this.margin - this.footerHeight,
      w: this.safe.w,
      h: this.footerHeight,
    };
  }

  /** Insets a rect by a uniform padding. */
  public inset(region: Rect, padding = this.tokens.space.md): Rect {
    return {
      x: region.x + padding,
      y: region.y + padding,
      w: Math.max(0.1, region.w - padding * 2),
      h: Math.max(0.1, region.h - padding * 2),
    };
  }

  /** Clamps a rect so it can never leave the slide. */
  public clamp(region: Rect): Rect {
    const x = Math.max(0, Math.min(region.x, this.width - 0.1));
    const y = Math.max(0, Math.min(region.y, this.height - 0.1));
    return {
      x,
      y,
      w: Math.max(0.1, Math.min(region.w, this.width - x)),
      h: Math.max(0.1, Math.min(region.h, this.height - y)),
    };
  }

  /**
   * True for square and vertical stages, where a side-by-side split leaves
   * columns too narrow to hold a sentence.
   */
  public get isNarrow(): boolean {
    return this.width / this.height < 1.25;
  }

  /**
   * Splits a region into a primary and secondary area. `ratio` is the primary's
   * share and `side` the edge it occupies — but on a narrow stage the split
   * becomes vertical, because two 1.9in columns cannot hold body copy.
   */
  public split(region: Rect, ratio = 0.62, side: "left" | "right" = "left"): { primary: Rect; secondary: Rect } {
    if (this.isNarrow) {
      const primaryHeight = (region.h - this.gutter) * ratio;
      const secondaryHeight = region.h - this.gutter - primaryHeight;
      // `side: "right"` means the primary content follows the secondary, which
      // in a stack means it sits below it.
      const primaryY = side === "left" ? region.y : region.y + secondaryHeight + this.gutter;
      const secondaryY = side === "left" ? region.y + primaryHeight + this.gutter : region.y;
      return {
        primary: { x: region.x, y: primaryY, w: region.w, h: primaryHeight },
        secondary: { x: region.x, y: secondaryY, w: region.w, h: secondaryHeight },
      };
    }
    const primaryWidth = (region.w - this.gutter) * ratio;
    const secondaryWidth = region.w - this.gutter - primaryWidth;
    const primaryX = side === "left" ? region.x : region.x + secondaryWidth + this.gutter;
    const secondaryX = side === "left" ? region.x + primaryWidth + this.gutter : region.x;
    return {
      primary: { x: primaryX, y: region.y, w: primaryWidth, h: region.h },
      secondary: { x: secondaryX, y: region.y, w: secondaryWidth, h: region.h },
    };
  }

  /**
   * Lays items out in a row on a wide stage and a column on a narrow one, so a
   * three-way comparison stays readable at 9:16.
   */
  public flow(region: Rect, count: number, gap = this.gutter): Rect[] {
    return this.isNarrow ? this.stack(region, count, gap) : this.divide(region, count, gap);
  }
}

/** Named slide formats, so a caller does not have to know the inch figures. */
export const SLIDE_FORMATS = {
  "16:9": { layout: "LAYOUT_WIDE", width: 13.333333, height: 7.5, margin: 0.55, titleBandHeight: 1.15, footerHeight: 0.32 },
  "4:3": { layout: "LAYOUT_STANDARD", width: 10, height: 7.5, margin: 0.5, titleBandHeight: 1.1, footerHeight: 0.3 },
  "9:16": { layout: "LAYOUT_WIDE", width: 7.5, height: 13.333333, margin: 0.5, titleBandHeight: 1.2, footerHeight: 0.32 },
  "a4-landscape": { layout: "LAYOUT_WIDE", width: 11.69, height: 8.27, margin: 0.6, titleBandHeight: 1.15, footerHeight: 0.32 },
  "a4-portrait": { layout: "LAYOUT_STANDARD", width: 8.27, height: 11.69, margin: 0.6, titleBandHeight: 1.15, footerHeight: 0.32 },
} as const satisfies Record<string, DimensionsConfig>;

export type SlideFormat = keyof typeof SLIDE_FORMATS;

export function slideFormat(name: string): DimensionsConfig {
  const format = (SLIDE_FORMATS as Record<string, DimensionsConfig | undefined>)[name];
  if (!format) {
    throw new Error(`Unknown slide format: ${name}. Available: ${Object.keys(SLIDE_FORMATS).join(", ")}.`);
  }
  return { ...format };
}
