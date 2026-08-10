import type { DeckManifest, ElementRecord, QualityDimensionScore, QualityScore, SlideAgentConfig, SlideManifest, ValidationIssue } from "../types/index.js";
import { colorContrast } from "../utils/color.js";
import { measureTextWidth, resolveFont, wrapLineCount, wrappedTextHeight } from "../design/font-metrics.js";
import { signDeck, unionArea } from "../evaluation/visual-signature.js";
import { visibleBackgroundFor } from "./manifest-validator.js";
import { HEURISTIC_FLOORS } from "./readiness.js";

/**
 * Heuristics, named as such.
 *
 * These are proxies. `hierarchy` counts type sizes; it cannot see hierarchy.
 * `variety` measures how much the geometry changes across a sequence; it cannot
 * see whether the change was earned. Calling the result a "quality score" told
 * authors the engine had judged their design, which it had not and cannot —
 * so the report calls them heuristics, and the review packet keeps them apart
 * from measured facts and from a reviewer's judgement.
 *
 * They are still worth computing: a deck where every slide has one type size,
 * or where the same silhouette repeats twelve times, has a problem the author
 * usually wants to know about. The scores say what was measured and what would
 * move it, because an unexplained 62/100 tells nobody anything.
 */

export type QualityDimension = QualityDimensionScore;
export type { QualityScore };

const WEIGHTS: Record<QualityDimension["id"], number> = {
  hierarchy: 1.1,
  contrast: 1.2,
  density: 1,
  variety: 0.9,
  evidence: 1,
  accessibility: 1.3,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function textElements(slide: SlideManifest): ElementRecord[] {
  return slide.elements.filter((element) => element.text?.trim() && element.role !== "decorative");
}

/**
 * Whether the type sizes form a ladder, and whether the top of it is loud
 * enough to lead the eye.
 *
 * Counting distinct sizes per slide scored a scatter and a scale identically:
 * a deck whose sizes were 29, 24.5, 15, 13.5, 12.3 and 10.5 — six values, no
 * two of them related — measured the same as one with a deliberate 40/24/16
 * ladder, and both looked "about three or four sizes per slide". What actually
 * separates them is that a ladder is a short shared vocabulary reused across
 * the deck, and that its largest step is decisively larger than its body.
 *
 * So this measures three things a reader would notice: how few distinct sizes
 * the deck commits to overall, how far the dominant text on a slide outranks
 * its body text, and whether any slide is typographically flat.
 */
function hierarchyScore(manifest: DeckManifest): QualityDimension {
  const slides = manifest.slides
    .map((slide) => textElements(slide).map((element) => element.fontSize ?? 0).filter((size) => size > 0))
    .filter((sizes) => sizes.length > 0);
  if (slides.length === 0) return { id: "hierarchy", score: 50, summary: "No text to assess." };

  const deckSizes = new Set(slides.flat().map((size) => Math.round(size * 2) / 2));
  const flat = slides.filter((sizes) => new Set(sizes).size <= 1).length;

  // Dominant-to-body ratio per slide: the largest size against the median of
  // the rest, which is the text the reader spends their time in.
  const ratios = slides.map((sizes) => {
    const sorted = [...sizes].sort((left, right) => right - left);
    const largest = sorted[0]!;
    const rest = sorted.slice(1);
    if (rest.length === 0) return 1;
    const body = rest[Math.floor(rest.length / 2)]!;
    return body > 0 ? largest / body : 1;
  });
  const ratio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;

  // A ladder is short and shared. Six or so values across a whole deck is a
  // system; twenty is a decision made separately every time.
  const ladder = clamp(100 - Math.max(0, deckSizes.size - 7) * 6);
  // 2× is where a title stops competing with its body copy and starts leading.
  const lead = clamp(ratio >= 2.4 ? 100 : ((ratio - 1) / 1.4) * 100);
  const score = clamp(ladder * 0.4 + lead * 0.6 - (flat / slides.length) * 25);

  return {
    id: "hierarchy",
    score,
    summary: `${deckSizes.size} distinct type sizes across the deck; the dominant text averages ${ratio.toFixed(1)}× its body; ${flat} slide(s) use a single size.`,
    ...(score < 70 ? {
      advice: lead < 60
        ? "The largest text barely outranks the body. Give each slide one claim that is decisively bigger than everything supporting it."
        : "Too many unrelated type sizes. Commit to a short ladder and reuse it rather than choosing a size per element.",
    } : {}),
  };
}

function contrastScore(manifest: DeckManifest, config: SlideAgentConfig): QualityDimension {
  let measured = 0;
  let total = 0;
  let worst = Number.POSITIVE_INFINITY;
  for (const slide of manifest.slides) {
    for (const element of textElements(slide)) {
      if (!element.textColor) continue;
      const ratio = colorContrast(element.textColor, visibleBackgroundFor(element, slide, config));
      total += Math.min(ratio, 12);
      worst = Math.min(worst, ratio);
      measured += 1;
    }
  }
  if (measured === 0) return { id: "contrast", score: 50, summary: "No coloured text to assess." };
  const average = total / measured;
  const score = clamp((average / 9) * 100);
  return {
    id: "contrast",
    score,
    summary: `Average ${average.toFixed(1)}:1 across ${measured} text elements; lowest ${worst.toFixed(1)}:1.`,
    ...(worst < 4.5 ? { advice: "Darken or lighten the lowest-contrast text; some of it falls below WCAG AA." } : {}),
  };
}

/**
 * Coverage of the slide area, counting overlaps once and measuring what is
 * actually drawn rather than what was reserved.
 *
 * The earlier version unioned bounding boxes, which answered a question nobody
 * was asking. A text box two inches tall holding one line of ten-point type is
 * seven-eighths empty, and a slide made of six such boxes reported as fully
 * covered while reading as a blank page with some labels on it. Text now
 * contributes the block its glyphs occupy, an unfilled outline contributes its
 * stroke rather than its interior, and only things that really are a mass —
 * pictures, charts, tables, filled shapes — contribute their whole frame.
 */
function inkBox(element: ElementRecord): { x: number; y: number; w: number; h: number } | undefined {
  if (element.role === "decorative") return undefined;
  if (element.type === "connector") return undefined;

  if (element.text?.trim()) {
    const fontSize = element.fontSize ?? 18;
    const font = resolveFont(element.fontFace, element.bold);
    const lines = wrapLineCount(element.text, element.w, fontSize, font);
    const height = Math.min(element.h, wrappedTextHeight(element.text, element.w, fontSize, font));
    const widest = element.text.split(/\r?\n/).reduce(
      (widest, line) => Math.max(widest, measureTextWidth(line, fontSize, font)),
      0,
    );
    const width = Math.min(element.w, lines > 1 ? element.w : widest);
    if (width <= 0 || height <= 0) return undefined;
    return { x: element.x, y: element.y, w: width, h: height };
  }

  const filled = Boolean(element.fillColor) && (element.fillTransparency ?? 0) < 90;
  if (element.type === "image" || element.type === "chart" || element.type === "table" || filled) {
    return { x: element.x, y: element.y, w: element.w, h: element.h };
  }

  // An unfilled shape is a drawn boundary, not a mass. Counting its interior
  // let an empty rectangle stand in for content it does not contain.
  const stroke = 0.04;
  if (element.w <= stroke * 2 || element.h <= stroke * 2) {
    return { x: element.x, y: element.y, w: element.w, h: element.h };
  }
  return undefined;
}

/** Ink area of an outline: its border band, not the space it encloses. */
function outlineInk(element: ElementRecord): number {
  const stroke = 0.04;
  return Math.max(0, element.w * element.h - (element.w - stroke * 2) * (element.h - stroke * 2));
}

function slideInk(slide: SlideManifest): number {
  const boxes: ElementRecord[] = [];
  let extra = 0;
  for (const element of slide.elements) {
    const box = inkBox(element);
    if (box) {
      boxes.push({ ...element, ...box });
      continue;
    }
    if (element.type === "shape" && element.role !== "decorative" && !element.fillColor) extra += outlineInk(element);
  }
  return unionArea(boxes) + extra;
}

function densityScore(manifest: DeckManifest): QualityDimension {
  const area = manifest.width * manifest.height;
  const coverages = manifest.slides.map((slide) => Math.min(1, slideInk(slide) / area));
  if (coverages.length === 0) return { id: "density", score: 50, summary: "No slides to assess." };

  const average = coverages.reduce((sum, value) => sum + value, 0) / coverages.length;
  const sparse = coverages.filter((value) => value < 0.12).length;
  const crowded = coverages.filter((value) => value > 0.62).length;
  // Measured as ink rather than as reserved boxes, a well-filled presented
  // slide sits far lower than the old band: 18–55% is comfortable.
  const penalty = average < 0.18 ? (0.18 - average) * 260 : average > 0.55 ? (average - 0.55) * 200 : 0;
  const score = clamp(100 - penalty - (sparse + crowded) * 6);
  return {
    id: "density",
    score,
    summary: `${Math.round(average * 100)}% average ink coverage; ${sparse} sparse and ${crowded} crowded slide(s).`,
    ...(score < 70 ? {
      advice: sparse > crowded
        ? "Several slides are mostly empty. Add the evidence the claim needs, or merge them."
        : "Several slides are overloaded. Split them or move detail into speaker notes.",
    } : {}),
  };
}

/**
 * How much the deck's *geometry* varies across its sequence.
 *
 * Counting element types was easy to satisfy and meaningless to satisfy: twelve
 * slides with one title and three boxes each scored as twelve distinct
 * silhouettes if the box counts happened to differ. This measures what a person
 * sees from across a room — where the masses sit, how much of the slide is
 * covered, where the whitespace is, and how far the eye travels — so a deck
 * that is genuinely one template twelve times reads as one template twelve
 * times.
 */
function varietyScore(manifest: DeckManifest): QualityDimension {
  if (manifest.slides.length < 3) return { id: "variety", score: 75, summary: "Too few slides to assess pacing." };
  const signature = signDeck(manifest);

  const areaHierarchy = signature.slides.map((slide) => Math.round(slide.dominantMass * 6));
  const readingPaths = signature.slides.map((slide) => Math.round(slide.readingPathLength * 8));
  const whitespace = signature.slides.map((slide) => `${Math.round(slide.whitespaceBands[0] * 4)}${Math.round(slide.whitespaceBands[1] * 4)}`);
  const distinctSilhouettes = Math.round(signature.silhouetteVariety * manifest.slides.length);

  const silhouetteVariety = signature.silhouetteVariety;
  const massVariety = new Set(areaHierarchy).size / manifest.slides.length;
  const pathVariety = new Set(readingPaths).size / manifest.slides.length;
  const whitespaceVariety = new Set(whitespace).size / manifest.slides.length;
  // Rhythm is slide-to-slide change in coverage: a deck that never gets quieter
  // or louder is flat however many element types it contains.
  const rhythm = Math.min(1, signature.rhythm * 4);

  const score = clamp(
    silhouetteVariety * 40
    + massVariety * 20
    + whitespaceVariety * 15
    + pathVariety * 10
    + rhythm * 15,
  );
  return {
    id: "variety",
    score,
    summary: `${distinctSilhouettes} distinct silhouettes across ${manifest.slides.length} slides; `
      + `${new Set(areaHierarchy).size} distinct dominant-mass levels; coverage moves ${Math.round(signature.rhythm * 100)}% between slides on average.`,
    ...(score < 70
      ? {
        advice: silhouetteVariety < 0.5
          ? "Most slides put their masses in the same places. Change what dominates — a full-bleed image, a single number, a wide table — rather than changing what fills the same boxes."
          : "The sequence has little rhythm: nothing gets noticeably quieter or denser. Let some slides breathe and others carry weight.",
      }
      : {}),
  };
}

/**
 * Whether slides show artifacts rather than only asserting claims in prose.
 *
 * Two diagram nodes used to count as evidence, which meant a box-and-arrow row
 * restating a bullet list scored the same as a chart of real data. Evidence now
 * requires a declared relationship: a chart, table, or image with alt text, a
 * diagram of at least three related nodes, or an element the deck's own claim
 * ledger points at.
 */
function evidenceScore(manifest: DeckManifest, claimedElementIds: Set<string>): QualityDimension {
  const substantive = manifest.slides.filter((slide) => slide.kind !== "title" && slide.kind !== "section");
  if (substantive.length === 0) return { id: "evidence", score: 60, summary: "No substantive slides to assess." };

  const withArtifact = substantive.filter((slide) =>
    slide.elements.some((element) => (element.type === "chart" || element.type === "table")
      || (element.type === "image" && Boolean(element.altText?.trim())))
    || slide.elements.filter((element) => element.role === "diagram-node").length >= 3
    || slide.elements.some((element) => claimedElementIds.has(element.name)),
  ).length;
  const withPlaceholders = manifest.slides.filter((slide) =>
    slide.elements.some((element) => /\[[^\]]{6,}\]/.test(element.text ?? "")),
  ).length;

  const ratio = withArtifact / substantive.length;
  const score = clamp(ratio * 110 - (withPlaceholders / manifest.slides.length) * 60);
  return {
    id: "evidence",
    score,
    summary: `${withArtifact} of ${substantive.length} substantive slides show a chart, table, image, or diagram`
      + (withPlaceholders > 0 ? `; ${withPlaceholders} slide(s) still contain placeholders.` : "."),
    ...(withPlaceholders > 0
      ? { advice: "Replace the bracketed placeholders with real content before presenting." }
      : score < 70 ? { advice: "Show more evidence: a chart, table, diagram, or artifact beats another bulleted assertion." } : {}),
  };
}

function accessibilityScore(issues: ValidationIssue[], slideCount: number): QualityDimension {
  // `font-below-scale` is deliberately absent: on a model-authored canvas it is
  // advice about the fallback type scale, not an accessibility defect, and
  // counting it here let Slide Agent's own scale drive an accessibility score.
  const codes = new Set(["missing-alt-text", "uninformative-alt-text", "reading-order", "image-only-slide", "poor-contrast", "contrast-below-aaa", "font-too-small"]);
  const relevant = issues.filter((entry) => codes.has(entry.code));
  const errors = relevant.filter((entry) => entry.severity === "error").length;
  const warnings = relevant.filter((entry) => entry.severity === "warning").length;
  const score = clamp(100 - (errors / Math.max(1, slideCount)) * 120 - (warnings / Math.max(1, slideCount)) * 35);
  return {
    id: "accessibility",
    score,
    summary: relevant.length === 0
      ? "No accessibility issues reported."
      : `${errors} error(s) and ${warnings} warning(s) across ${slideCount} slides.`,
    ...(score < 85 && relevant.length > 0
      ? { advice: `Start with ${relevant[0]!.code}: ${relevant[0]!.message}` }
      : {}),
  };
}

/** Slides still carrying an unresolved `[bracketed instruction]`. */
function placeholderSlides(manifest: DeckManifest): number {
  return manifest.slides.filter((slide) =>
    slide.elements.some((element) => /\[[^\]]{6,}\]/.test(element.text ?? "")),
  ).length;
}

export function scoreDeck(
  manifest: DeckManifest,
  config: SlideAgentConfig,
  issues: ValidationIssue[],
  claimedElementIds: Set<string> = new Set(),
): QualityScore {
  const dimensions: QualityDimension[] = [
    hierarchyScore(manifest),
    contrastScore(manifest, config),
    densityScore(manifest),
    varietyScore(manifest),
    evidenceScore(manifest, claimedElementIds),
    accessibilityScore(issues, manifest.slides.length),
  ];
  const weighted = dimensions.reduce((sum, dimension) => sum + dimension.score * WEIGHTS[dimension.id], 0);
  const divisor = dimensions.reduce((sum, dimension) => sum + WEIGHTS[dimension.id], 0);
  const overall = clamp(weighted / divisor);

  // A deck whose slides still say `[Evidence: something you can show]` is not
  // workable no matter how well it scores on contrast and spacing. The average
  // would otherwise let clean typography disguise an unfinished deck.
  const unfinished = placeholderSlides(manifest);
  const heavilyUnfinished = unfinished / Math.max(1, manifest.slides.length) >= 0.3;
  // A band is not an average. One dimension below its floor caps the band,
  // because clean typography must not be able to disguise unreadable contrast
  // or a deck that is the same slide twelve times.
  const belowFloor = dimensions.filter((dimension) => {
    const floor = HEURISTIC_FLOORS[dimension.id];
    return floor !== undefined && dimension.score < floor;
  });

  return {
    overall,
    band: heavilyUnfinished || belowFloor.length > 0
      ? (belowFloor.length > 1 || heavilyUnfinished ? "weak" : "workable")
      : overall >= 78 ? "strong" : overall >= 58 ? "workable" : "weak",
    dimensions,
  };
}
