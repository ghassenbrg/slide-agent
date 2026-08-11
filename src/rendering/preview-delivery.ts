import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { estimateImageTokens, savingNote, IMAGE_LONG_EDGE_LIMIT } from "../evaluation/token-budget.js";
import { contactSheet, decodePng, encodePng, fitWithin, pngSize, type RasterImage } from "./png.js";

/**
 * Deciding which renders cross into the model's context, and at what size.
 *
 * A model that cannot see what it built can only revise from its own
 * assumptions, so previews have to be returned. But the engine was returning
 * every slide on every call — a patch that moved one label on slide 3 sent back
 * all twelve renders — at a resolution above the point where extra pixels buy
 * anything. On a twelve-slide deck that is 22,128 image tokens per call, four
 * times a cycle, for evidence the model had mostly already seen.
 *
 * Two decisions live here. *Which* slides: the engine usually knows what it
 * touched, and when it does not it says so rather than guessing. *How big*:
 * enough to judge composition, because the words are checked deterministically
 * off the PDF's text layer and never read off the image.
 */

/** Longest edge of a returned preview, per tier. */
export const PREVIEW_TIERS = {
  /**
   * Composition, hierarchy, collision, crop. On a 13.33 in slide this is
   * 77 px/in, so 14 pt body type sets 15 px tall — comfortably legible, and
   * 57% cheaper than the tier above it.
   */
  review: 1024,
  /**
   * The vision API downscales past this, so it is both the largest size that
   * costs more than `review` and the largest worth sending.
   */
  full: IMAGE_LONG_EDGE_LIMIT,
} as const;

/** Which resolution tier a returned preview is delivered at. */
export type ImageDetail = keyof typeof PREVIEW_TIERS;

/**
 * Which renders to return.
 *
 * `changed` is the default wherever the engine knows what it touched. It
 * degrades to `all` rather than to nothing when it does not, and says so.
 */
export type ImageSelection = "all" | "changed" | "none" | "overview" | number[];

export const IMAGE_SELECTIONS = ["all", "changed", "none", "overview"] as const;

/** Beyond this a long deck costs more context than the look is worth. */
export const MAXIMUM_IMAGES = 20;

/** Total decoded bytes across all returned previews. */
export const MAXIMUM_TOTAL_BYTES = 12 * 1024 * 1024;

const PREVIEW_PATTERN = /^slide-(\d+)\.(png|svg)$/i;

export function isPreviewFile(file: string): boolean {
  return PREVIEW_PATTERN.test(path.basename(file));
}

/** The 1-based slide number a preview filename encodes. */
export function previewSlideNumber(file: string): number {
  return Number(PREVIEW_PATTERN.exec(path.basename(file))?.[1] ?? Number.MAX_SAFE_INTEGER);
}

export function previewMimeType(file: string): string {
  return file.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png";
}

/** Normalizes the deprecated `includeImages` boolean onto the selection type. */
export function resolveSelection(
  images: ImageSelection | undefined,
  includeImages: boolean | undefined,
  fallback: ImageSelection,
): ImageSelection {
  if (images !== undefined) return images;
  if (includeImages === true) return "all";
  if (includeImages === false) return "none";
  return fallback;
}

export interface SelectionInput {
  /** Every preview the run produced, in any order. */
  previews: string[];
  selection: ImageSelection;
  /** Slides the caller changed, when the command knows. 1-based. */
  changed?: number[];
}

export interface SelectionResult {
  files: string[];
  /** Set when `changed` was asked for and the command could not determine it. */
  degradedFrom?: "changed";
}

/**
 * The previews a selection names, in slide order.
 *
 * An explicit slide list is honoured even when a slide has no render, so a
 * caller asking for slide 7 is told it is missing rather than quietly handed
 * slide 6.
 */
export function selectPreviews({ previews, selection, changed }: SelectionInput): SelectionResult {
  const ordered = [...previews]
    .filter((file) => isPreviewFile(file))
    .sort((left, right) => previewSlideNumber(left) - previewSlideNumber(right));
  if (selection === "none") return { files: [] };
  if (selection === "all" || selection === "overview") return { files: ordered };
  if (Array.isArray(selection)) {
    const wanted = new Set(selection);
    return { files: ordered.filter((file) => wanted.has(previewSlideNumber(file))) };
  }
  // "changed" with nothing to go on is a degraded answer, not an empty one:
  // silently returning no images would read as "nothing to see".
  if (!changed) return { files: ordered, degradedFrom: "changed" };
  const wanted = new Set(changed);
  return { files: ordered.filter((file) => wanted.has(previewSlideNumber(file))) };
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface DeliveredImages {
  images: ImageContent[];
  /** Pixel sizes of what was delivered, for the token budget. */
  sizes: Array<{ width: number; height: number }>;
  /** Selected previews that did not fit the limits. */
  omitted: number;
  /** Slide numbers the delivered images correspond to, in order. */
  slides: number[];
  /** True when the images were composed into a single sheet. */
  overview: boolean;
}

async function readPreview(file: string, budget: number): Promise<Buffer | undefined> {
  // A caller can point `previewsDir` anywhere, so size is checked before the
  // bytes are read rather than after.
  const size = await stat(file).then((entry) => entry.size).catch(() => undefined);
  if (size === undefined || size > budget) return undefined;
  return readFile(file).catch(() => undefined);
}

/**
 * Reads the selected previews and prepares them for return.
 *
 * SVG previews pass through untouched: they are the schematic fallback drawn
 * when LibreOffice is absent, they are text rather than pixels, and rasterizing
 * one to save tokens would cost tokens.
 */
export async function deliverPreviews(
  files: string[],
  options: { detail?: ImageDetail; overview?: boolean } = {},
): Promise<DeliveredImages> {
  const detail = options.detail ?? "review";
  const longestEdge = PREVIEW_TIERS[detail];
  const selected = files.slice(0, MAXIMUM_IMAGES);
  let budget = MAXIMUM_TOTAL_BYTES;

  type Delivered = { slide: number; content: ImageContent; size: { width: number; height: number } };
  const delivered: Delivered[] = [];
  // Only the contact sheet needs every image at once. The per-slide path scales
  // and encodes each one as it is read, because a decoded 1600×900 preview is
  // 5.8 MB of RGBA — twenty of them would be 115 MB live, and the byte budget
  // counts compressed file size, so it would not have stopped it.
  const forSheet: Array<{ slide: number; image: RasterImage }> = [];
  let read = 0;

  for (const file of selected) {
    const bytes = await readPreview(file, budget);
    if (!bytes) break;
    budget -= bytes.byteLength;
    read += 1;
    const slide = previewSlideNumber(file);
    const asIs = (mimeType: string, size: { width: number; height: number }): Delivered => ({
      slide,
      content: { type: "image", data: bytes.toString("base64"), mimeType },
      size,
    });

    if (previewMimeType(file) !== "image/png") {
      delivered.push(asIs("image/svg+xml", { width: 0, height: 0 }));
      continue;
    }
    let decoded: RasterImage;
    try {
      decoded = decodePng(bytes);
    } catch {
      // An image this decoder does not handle is still worth returning: it
      // costs its own size rather than the tier's, which the budget reports.
      delivered.push(asIs("image/png", pngSize(bytes) ?? { width: 0, height: 0 }));
      continue;
    }
    if (options.overview) {
      forSheet.push({ slide, image: decoded });
      continue;
    }
    const image = fitWithin(decoded, longestEdge);
    delivered.push({
      slide,
      content: { type: "image", data: encodePng(image).toString("base64"), mimeType: "image/png" },
      size: { width: image.width, height: image.height },
    });
  }

  const omitted = Math.max(0, files.length - read);

  if (forSheet.length > 1) {
    const sheet = contactSheet(forSheet.map((entry) => entry.image), {
      longestEdge: PREVIEW_TIERS.full,
      numbers: forSheet.map((entry) => entry.slide),
    });
    return {
      images: [{ type: "image", data: encodePng(sheet).toString("base64"), mimeType: "image/png" }],
      sizes: [{ width: sheet.width, height: sheet.height }],
      omitted: omitted + delivered.length,
      slides: forSheet.map((entry) => entry.slide),
      overview: true,
    };
  }
  // One slide is a slide, not a one-cell sheet.
  for (const entry of forSheet) {
    const image = fitWithin(entry.image, longestEdge);
    delivered.push({
      slide: entry.slide,
      content: { type: "image", data: encodePng(image).toString("base64"), mimeType: "image/png" },
      size: { width: image.width, height: image.height },
    });
  }

  delivered.sort((left, right) => left.slide - right.slide);
  return {
    images: delivered.map((entry) => entry.content),
    sizes: delivered.map((entry) => entry.size),
    omitted,
    slides: delivered.map((entry) => entry.slide),
    overview: false,
  };
}

/**
 * Writes every render as one numbered grid image, for a human or a CLI caller.
 *
 * Returns the path written, or `undefined` when there was nothing to tile —
 * reporting a file that was never created is worse than reporting nothing.
 */
export async function writeContactSheet(previews: string[], output: string): Promise<string | undefined> {
  const pngs = previews.filter((file) => previewMimeType(file) === "image/png");
  if (pngs.length === 0) return undefined;
  const images: RasterImage[] = [];
  const numbers: number[] = [];
  for (const file of pngs) {
    const bytes = await readFile(file).catch(() => undefined);
    if (!bytes) continue;
    try {
      images.push(decodePng(bytes));
      numbers.push(previewSlideNumber(file));
    } catch {
      // A preview this decoder cannot read is left out of the sheet rather
      // than failing the whole review it was part of.
    }
  }
  if (images.length === 0) return undefined;
  const sheet = contactSheet(images, { longestEdge: PREVIEW_TIERS.full, numbers });
  await writeFile(path.resolve(output), encodePng(sheet));
  return path.resolve(output);
}

/**
 * Roughly what N slides cost as separate images at a tier.
 *
 * A 16:9 slide is the only shape this has to price, because it is answering
 * "what would the other option have cost" rather than measuring anything.
 */
function costOfSlides(detail: ImageDetail, count: number): number {
  const edge = PREVIEW_TIERS[detail];
  return estimateImageTokens(edge, Math.round(edge * 9 / 16)) * count;
}

/**
 * What the images cost, and what the alternatives would have cost.
 *
 * Written for a model deciding what to ask for next, so it names the option
 * rather than describing it.
 */
export function previewNote(
  delivered: DeliveredImages,
  context: { totalPreviews: number; detail: ImageDetail; selection: ImageSelection; degradedFrom?: "changed" },
): string {
  const parts: string[] = [];
  const count = delivered.images.length;
  const spent = delivered.sizes.reduce((sum, size) => sum + estimateImageTokens(size.width, size.height), 0);

  if (delivered.overview) {
    parts.push(`A contact sheet of ${delivered.slides.length} slide${delivered.slides.length === 1 ? "" : "s"}, in order, numbered. These are what the audience will see.`);
    const separately = savingNote(spent, costOfSlides(context.detail, delivered.slides.length), "Sending them separately");
    if (separately) parts.push(separately);
    parts.push('For a slide worth a closer look, ask for it by number with imageDetail:"full".');
  } else if (count === 0) {
    parts.push(delivered.omitted > 0
      ? `${delivered.omitted} preview${delivered.omitted === 1 ? " is" : "s are"} on disk under the artifacts directory but did not fit the size limits.`
      : "No previews were returned.");
  } else {
    const which = count === context.totalPreviews
      ? `${count} slide preview${count === 1 ? "" : "s"}`
      : `${count} of ${context.totalPreviews} slide previews (${delivered.slides.join(", ")})`;
    parts.push(`${which} follow, in slide order, at the ${context.detail} tier.`);
    if (context.detail === "review") {
      parts.push('Text fidelity is read off the PDF text layer, not off these images; ask for imageDetail:"full" only when the composition itself is in question.');
    }
    const everything = savingNote(
      spent,
      costOfSlides(context.detail, context.totalPreviews),
      `images:"all" (all ${context.totalPreviews})`,
    );
    if (everything) parts.push(`${everything} images:"overview" returns them as one contact sheet for about the price of one.`);
  }

  if (context.degradedFrom === "changed") {
    parts.push('This command could not determine which slides changed, so every preview was returned. Name the slides explicitly with images:[1,2] to narrow it.');
  }
  if (delivered.omitted > 0 && count > 0) {
    parts.push(`${delivered.omitted} further preview${delivered.omitted === 1 ? "" : "s"} did not fit the size limits and remain on disk.`);
  }
  return parts.join(" ");
}
