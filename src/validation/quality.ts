import type { DeckManifest, ElementRecord, QualityDimensionScore, QualityScore, SlideAgentConfig, SlideManifest, ValidationIssue } from "../types/index.js";
import { colorContrast } from "../utils/color.js";
import { visibleBackgroundFor } from "./manifest-validator.js";

/**
 * A composite read on whether a deck is actually good, separate from whether
 * it is valid.
 *
 * Validation answers "will this open and can it be read". Quality answers "is
 * this worth showing someone". The scores are advisory and deliberately
 * explainable: each dimension names what it measured and what would raise it,
 * because an unexplained 62/100 tells an author nothing.
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

/** Coverage of the slide area: too empty reads as unfinished, too full as noise. */
function densityScore(manifest: DeckManifest): QualityDimension {
  const area = manifest.width * manifest.height;
  const coverages = manifest.slides.map((slide) => {
    const used = slide.elements
      .filter((element) => element.role !== "decorative")
      .reduce((sum, element) => sum + element.w * element.h, 0);
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
 * How much the deck varies across its sequence. A deck where every slide has
 * the same silhouette reads as a template even when each slide is fine.
 */
function varietyScore(manifest: DeckManifest): QualityDimension {
  if (manifest.slides.length < 3) return { id: "variety", score: 75, summary: "Too few slides to assess pacing." };

  const signatures = manifest.slides.map((slide) => {
    const counts = new Map<string, number>();
    for (const element of slide.elements) counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
    return [...counts.entries()].sort().map(([type, count]) => `${type}:${Math.min(count, 4)}`).join(",");
  });
  const distinct = new Set(signatures).size;
  const kinds = new Set(manifest.slides.map((slide) => slide.kind)).size;
  const modes = new Set(manifest.slides.map((slide) => slide.compositionMode ?? "fallback-layout")).size;

  const shapeVariety = distinct / manifest.slides.length;
  const score = clamp(shapeVariety * 70 + Math.min(kinds / manifest.slides.length, 1) * 25 + (modes > 1 ? 5 : 0));
  return {
    id: "variety",
    score,
    summary: `${distinct} distinct slide silhouettes across ${manifest.slides.length} slides; ${kinds} slide kinds.`,
    ...(score < 70 ? { advice: "Vary composition, scale, and slide kind across the sequence so it does not read as one repeated template." } : {}),
  };
}

/** Whether slides show artifacts rather than only asserting claims in prose. */
function evidenceScore(manifest: DeckManifest): QualityDimension {
  const substantive = manifest.slides.filter((slide) => slide.kind !== "title" && slide.kind !== "section");
  if (substantive.length === 0) return { id: "evidence", score: 60, summary: "No substantive slides to assess." };

  const withArtifact = substantive.filter((slide) =>
    slide.elements.some((element) => element.type === "chart" || element.type === "table" || element.type === "image")
    || slide.elements.filter((element) => element.role === "diagram-node").length >= 2,
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

export function scoreDeck(manifest: DeckManifest, config: SlideAgentConfig, issues: ValidationIssue[]): QualityScore {
  const dimensions: QualityDimension[] = [
    hierarchyScore(manifest),
    contrastScore(manifest, config),
    densityScore(manifest),
    varietyScore(manifest),
    evidenceScore(manifest),
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

  return {
    overall,
    band: heavilyUnfinished
      ? "weak"
      : overall >= 78 ? "strong" : overall >= 58 ? "workable" : "weak",
    dimensions,
  };
}
