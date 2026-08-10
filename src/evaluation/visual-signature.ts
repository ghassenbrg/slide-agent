import type { DeckManifest, ElementRecord, SlideManifest } from "../types/index.js";

/**
 * What a deck's composition looks like, as numbers.
 *
 * An open schema does not prove freedom. If every deck the tool produces has
 * the same silhouette, the cage moved from the schema into the habits of
 * whatever authored it — and the only way to see that is to measure the shapes
 * rather than read the JSON.
 *
 * This is a diagnostic, deliberately not an optimiser. It says "these two decks
 * are structurally the same"; it never says what to do instead. A metric that
 * prescribed a replacement layout would be a new cage with better manners, and
 * a metric that rewarded novelty would push authors toward strangeness rather
 * than fit.
 *
 * Colour carries almost no weight on purpose: a palette swap over identical
 * geometry is the exact failure this is built to catch, so it must read as
 * near-identical.
 */

const GRID = 6;

export interface SlideSignature {
  slide: number;
  /** Fraction of each cell of a 6×6 grid covered by non-decorative elements. */
  occupancy: number[];
  /** Share of the slide covered at all, counting overlaps once. */
  coverage: number;
  /** The largest single element's share of the slide. */
  dominantMass: number;
  /** The three largest elements' combined share. */
  topThreeMass: number;
  /** Where the ink sits, 0–1 in each axis. */
  centroid: [number, number];
  /** Text area ÷ (text + image + chart + table) area. */
  textToVisual: number;
  /** Distinct left/right/top/bottom edges elements share, normalized. */
  alignmentDensity: number;
  /** The largest empty horizontal and vertical band, as a fraction. */
  whitespaceBands: [number, number];
  /** Distinct fill colours in play, normalized. Weighted lightly. */
  colorFields: number;
  /** Reading path: the total normalized distance between elements in z-order. */
  readingPathLength: number;
  elementCount: number;
}

export interface DeckSignature {
  title: string;
  slideCount: number;
  slides: SlideSignature[];
  /** Slide-to-slide change in coverage: a flat deck has no rhythm. */
  rhythm: number;
  /** Distinct rounded silhouettes across the deck, normalized. */
  silhouetteVariety: number;
}

function isStructural(element: ElementRecord): boolean {
  return element.role !== "decorative" && element.w > 0 && element.h > 0;
}

/**
 * Area of the union of a set of rectangles.
 *
 * Summing bounding boxes double-counts every overlap, which made a slide with
 * a full-bleed photograph and a caption over it read as 130% covered — so
 * "density" reported crowding on a composition that is mostly one image.
 */
export function unionArea(rectangles: Array<{ x: number; y: number; w: number; h: number }>): number {
  if (rectangles.length === 0) return 0;
  const xs = [...new Set(rectangles.flatMap((rectangle) => [rectangle.x, rectangle.x + rectangle.w]))].sort((a, b) => a - b);
  let total = 0;
  for (let index = 0; index < xs.length - 1; index += 1) {
    const left = xs[index]!;
    const right = xs[index + 1]!;
    const width = right - left;
    if (width <= 0) continue;
    // Within this vertical strip every rectangle is either present for its
    // whole height or absent, so the covered height is a 1-D interval union.
    const spans = rectangles
      .filter((rectangle) => rectangle.x <= left && rectangle.x + rectangle.w >= right)
      .map((rectangle) => [rectangle.y, rectangle.y + rectangle.h] as const)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let end = Number.NEGATIVE_INFINITY;
    for (const [top, bottom] of spans) {
      if (bottom <= end) continue;
      covered += bottom - Math.max(top, end);
      end = bottom;
    }
    total += width * covered;
  }
  return total;
}

function occupancyGrid(slide: SlideManifest, width: number, height: number): number[] {
  const cells: number[] = [];
  const cellWidth = width / GRID;
  const cellHeight = height / GRID;
  const elements = slide.elements.filter(isStructural);
  for (let row = 0; row < GRID; row += 1) {
    for (let column = 0; column < GRID; column += 1) {
      const cell = { x: column * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight };
      const clipped = elements
        .map((element) => ({
          x: Math.max(element.x, cell.x),
          y: Math.max(element.y, cell.y),
          w: Math.min(element.x + element.w, cell.x + cell.w) - Math.max(element.x, cell.x),
          h: Math.min(element.y + element.h, cell.y + cell.h) - Math.max(element.y, cell.y),
        }))
        .filter((rectangle) => rectangle.w > 0 && rectangle.h > 0);
      cells.push(Math.min(1, unionArea(clipped) / (cellWidth * cellHeight)));
    }
  }
  return cells;
}

/** How many distinct edges the elements share, as a fraction of the maximum. */
function alignmentDensity(elements: ElementRecord[]): number {
  if (elements.length < 2) return 0;
  const tolerance = 0.05;
  const edges = elements.flatMap((element) => [element.x, element.x + element.w, element.y, element.y + element.h]);
  const clusters: number[] = [];
  for (const edge of edges.sort((a, b) => a - b)) {
    const last = clusters.at(-1);
    if (last === undefined || Math.abs(edge - last) > tolerance) clusters.push(edge);
  }
  // Fewer clusters than edges means elements line up. 1 is perfectly aligned.
  return 1 - (clusters.length - 1) / Math.max(1, edges.length - 1);
}

function whitespaceBands(slide: SlideManifest, width: number, height: number): [number, number] {
  const elements = slide.elements.filter(isStructural);
  const largestGap = (starts: number[], ends: number[], extent: number): number => {
    const intervals = starts.map((start, index) => [start, ends[index]!] as const).sort((a, b) => a[0] - b[0]);
    let gap = intervals.length ? intervals[0]![0] : extent;
    let reach = 0;
    for (const [start, end] of intervals) {
      gap = Math.max(gap, start - reach);
      reach = Math.max(reach, end);
    }
    return Math.max(gap, extent - reach) / extent;
  };
  return [
    largestGap(elements.map((element) => element.x), elements.map((element) => element.x + element.w), width),
    largestGap(elements.map((element) => element.y), elements.map((element) => element.y + element.h), height),
  ];
}

function readingPathLength(slide: SlideManifest, width: number, height: number): number {
  const points = slide.elements.filter(isStructural)
    .map((element) => [(element.x + element.w / 2) / width, (element.y + element.h / 2) / height] as const);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const [previousX, previousY] = points[index - 1]!;
    const [x, y] = points[index]!;
    total += Math.hypot(x - previousX, y - previousY);
  }
  return points.length > 1 ? total / (points.length - 1) : 0;
}

export function signSlide(slide: SlideManifest, width: number, height: number): SlideSignature {
  const elements = slide.elements.filter(isStructural);
  const area = width * height;
  const areas = elements.map((element) => element.w * element.h).sort((left, right) => right - left);
  const textArea = elements.filter((element) => element.type === "text").reduce((sum, element) => sum + element.w * element.h, 0);
  const visualArea = elements
    .filter((element) => ["image", "chart", "table"].includes(element.type))
    .reduce((sum, element) => sum + element.w * element.h, 0);
  const centroidWeight = areas.reduce((sum, value) => sum + value, 0) || 1;
  const centroidX = elements.reduce((sum, element) => sum + (element.x + element.w / 2) * element.w * element.h, 0) / centroidWeight / width;
  const centroidY = elements.reduce((sum, element) => sum + (element.y + element.h / 2) * element.w * element.h, 0) / centroidWeight / height;

  return {
    slide: slide.number,
    occupancy: occupancyGrid(slide, width, height),
    coverage: Math.min(1, unionArea(elements) / area),
    dominantMass: Math.min(1, (areas[0] ?? 0) / area),
    topThreeMass: Math.min(1, areas.slice(0, 3).reduce((sum, value) => sum + value, 0) / area),
    centroid: [Number.isFinite(centroidX) ? centroidX : 0.5, Number.isFinite(centroidY) ? centroidY : 0.5],
    textToVisual: textArea + visualArea > 0 ? textArea / (textArea + visualArea) : 1,
    alignmentDensity: alignmentDensity(elements),
    whitespaceBands: whitespaceBands(slide, width, height),
    colorFields: Math.min(1, new Set(elements.map((element) => element.fillColor).filter(Boolean)).size / 6),
    readingPathLength: readingPathLength(slide, width, height),
    elementCount: elements.length,
  };
}

export function signDeck(manifest: DeckManifest): DeckSignature {
  const slides = manifest.slides.map((slide) => signSlide(slide, manifest.width, manifest.height));
  const coverages = slides.map((slide) => slide.coverage);
  const rhythm = coverages.length < 2
    ? 0
    : coverages.slice(1).reduce((sum, value, index) => sum + Math.abs(value - coverages[index]!), 0) / (coverages.length - 1);
  const silhouettes = new Set(slides.map((slide) => slide.occupancy.map((cell) => Math.round(cell * 3)).join("")));
  return {
    title: manifest.presentationTitle,
    slideCount: slides.length,
    slides,
    rhythm,
    silhouetteVariety: slides.length ? silhouettes.size / slides.length : 0,
  };
}

/**
 * The feature vector two slides are compared on.
 *
 * Geometry dominates and colour barely registers, because the failure being
 * measured is "the same deck in different colours" — which must read as
 * near-identical, not as two designs.
 */
function featureVector(signature: SlideSignature): number[] {
  return [
    ...signature.occupancy.map((cell) => cell * 3),
    signature.coverage * 3,
    signature.dominantMass * 3,
    signature.topThreeMass * 2,
    signature.centroid[0] * 2,
    signature.centroid[1] * 2,
    signature.textToVisual * 2,
    signature.alignmentDensity * 2,
    signature.whitespaceBands[0] * 2,
    signature.whitespaceBands[1] * 2,
    signature.readingPathLength * 2,
    Math.min(1, signature.elementCount / 20) * 2,
    // Colour is included so the signature is complete, and weighted at a
    // twentieth so it can never make two identical layouts look different.
    signature.colorFields * 0.05,
  ];
}

function cosine(left: number[], right: number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return leftNorm === rightNorm ? 1 : 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export type SimilarityVerdict = "near-duplicate" | "similar" | "distinct";

/** Above this, two decks are the same design wearing different clothes. */
export const NEAR_DUPLICATE_THRESHOLD = 0.93;
export const SIMILAR_THRESHOLD = 0.82;

export interface SimilarityResult {
  left: string;
  right: string;
  similarity: number;
  verdict: SimilarityVerdict;
  /** Best-matching slide pairs, most similar first. */
  closestSlides: Array<{ left: number; right: number; similarity: number }>;
  explanation: string;
}

/**
 * How structurally alike two decks are.
 *
 * Slides are matched greedily on their own similarity rather than by position,
 * so reordering a deck does not disguise it as a new design.
 */
export function compareSignatures(left: DeckSignature, right: DeckSignature): SimilarityResult {
  const pairs: Array<{ left: number; right: number; similarity: number }> = [];
  const usedRight = new Set<number>();
  for (const slide of left.slides) {
    let best: { right: number; similarity: number } | undefined;
    for (const other of right.slides) {
      if (usedRight.has(other.slide)) continue;
      const similarity = cosine(featureVector(slide), featureVector(other));
      if (!best || similarity > best.similarity) best = { right: other.slide, similarity };
    }
    if (!best) continue;
    usedRight.add(best.right);
    pairs.push({ left: slide.slide, right: best.right, similarity: best.similarity });
  }
  const similarity = pairs.length
    ? pairs.reduce((sum, pair) => sum + pair.similarity, 0) / pairs.length
    : 0;
  const verdict: SimilarityVerdict = similarity >= NEAR_DUPLICATE_THRESHOLD
    ? "near-duplicate"
    : similarity >= SIMILAR_THRESHOLD ? "similar" : "distinct";
  return {
    left: left.title,
    right: right.title,
    similarity: Number(similarity.toFixed(4)),
    verdict,
    closestSlides: [...pairs].sort((a, b) => b.similarity - a.similarity).slice(0, 5),
    explanation: verdict === "near-duplicate"
      ? "These decks put their masses in the same places. Whatever differs between them — palette, typeface, wording — is not composition."
      : verdict === "similar"
        ? "These decks share a compositional habit. Look at whether the shared structure is the subject's doing or the author's."
        : "These decks are compositionally independent.",
  };
}
