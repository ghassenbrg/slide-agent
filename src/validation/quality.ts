import type { DeckManifest, ElementRecord, QualityDimensionScore, QualityScore, SlideAgentConfig, SlideManifest, ValidationIssue } from "../types/index.js";
import { colorContrast } from "../utils/color.js";
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
 * Distinct type sizes in play. One size across a whole slide means nothing is
 * emphasised; more than about five means nothing is either.
 */
function hierarchyScore(manifest: DeckManifest): QualityDimension {
  const perSlide = manifest.slides.map((slide) => {
    const sizes = new Set(textElements(slide).map((element) => Math.round(element.fontSize ?? 0)).filter(Boolean));
    return sizes.size;
  }).filter((count) => count > 0);
  if (perSlide.length === 0) return { id: "hierarchy", score: 50, summary: "No text to assess." };

  const average = perSlide.reduce((sum, count) => sum + count, 0) / perSlide.length;
  const flat = perSlide.filter((count) => count <= 1).length;
  // Three levels is the target: a claim, its support, and its labels.
  const distance = Math.abs(average - 3);
  const score = clamp(100 - distance * 22 - (flat / perSlide.length) * 30);
  return {
    id: "hierarchy",
    score,
    summary: `${average.toFixed(1)} type sizes per slide on average; ${flat} slide(s) use a single size.`,
    ...(score < 70 ? {
      advice: flat > 0
        ? "Give each slide a clear primary claim at a larger size than its supporting text."
        : "Reduce the number of competing type sizes so the reading order is obvious.",
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
 * Coverage of the slide area, counting overlaps once.
 *
 * Summing bounding boxes double-counted every overlap, so a slide made of one
 * full-bleed photograph with a caption over it reported as 130% covered and
 * scored as overcrowded. The union is what a person actually sees.
 */
function densityScore(manifest: DeckManifest): QualityDimension {
  const area = manifest.width * manifest.height;
  const coverages = manifest.slides.map((slide) => {
    const used = unionArea(slide.elements.filter((element) => element.role !== "decorative"));
    return Math.min(1, used / area);
  });
  if (coverages.length === 0) return { id: "density", score: 50, summary: "No slides to assess." };

  const average = coverages.reduce((sum, value) => sum + value, 0) / coverages.length;
  const sparse = coverages.filter((value) => value < 0.18).length;
  const crowded = coverages.filter((value) => value > 0.82).length;
  // 30–65% coverage is the comfortable band for a presented slide.
  const penalty = average < 0.3 ? (0.3 - average) * 180 : average > 0.65 ? (average - 0.65) * 180 : 0;
  const score = clamp(100 - penalty - (sparse + crowded) * 6);
  return {
    id: "density",
    score,
    summary: `${Math.round(average * 100)}% average coverage; ${sparse} sparse and ${crowded} crowded slide(s).`,
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
