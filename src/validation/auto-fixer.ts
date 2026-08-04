import type {
  CanvasElementSpec,
  CanvasTextElement,
  PresentationOutline,
  SlideAgentConfig,
  SlideSpec,
  ValidationIssue,
  ValidationReport,
} from "../types/index.js";
import { truncateWords, words } from "../utils/text.js";
import { ensureContrast, requiredContrast } from "../utils/color.js";
import { estimatedTextHeight } from "./manifest-validator.js";

export interface FixOutcome {
  /** The issue code that prompted the change. */
  code: string;
  slide?: number;
  elementIds?: string[];
  change: string;
}

export interface UnfixedIssue {
  code: string;
  slide?: number;
  elementIds?: string[];
  reason: string;
}

export interface FixResult {
  outline: PresentationOutline;
  changes: string[];
  outcomes: FixOutcome[];
  /** Issues the fixer was asked to repair but could not, with the reason. */
  unfixed: UnfixedIssue[];
}

/** Longest prefix of `text` that fits the box at `fontSize`, on a word boundary. */
function shortenToFit(text: string, widthInches: number, heightInches: number, fontSize: number): string | undefined {
  const tokens = words(text);
  for (let count = tokens.length - 1; count >= 3; count -= 1) {
    const candidate = tokens.slice(0, count).join(" ");
    if (estimatedTextHeight(candidate, widthInches, fontSize) <= heightInches * 1.08) return candidate;
  }
  return undefined;
}

function canvasTextElements(slide: SlideSpec): CanvasTextElement[] {
  return (slide.canvas ?? []).filter((element): element is CanvasTextElement => element.type === "text");
}

/** Matches a manifest element id (`003-deck-title`) back to its canvas element. */
function matchesElementId(manifestId: string | undefined, canvasId: string): boolean {
  if (!manifestId) return false;
  return manifestId.endsWith(canvasId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
}

function elementText(element: CanvasTextElement): string {
  return element.text ?? element.runs?.map((run) => run.text).join("") ?? "";
}

/** The color a canvas element visually sits on, honouring z-order and layering. */
function resolvedBackdrop(slide: SlideSpec, element: CanvasElementSpec, deckBackground: string): string {
  const slideBackground = slide.background?.replace(/^#/, "") ?? deckBackground;
  if (element.type === "text" && element.style?.fill) return element.style.fill.replace(/^#/, "");
  const ordered = [...(slide.canvas ?? [])].sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));
  const index = ordered.indexOf(element);
  for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = ordered[candidateIndex]!;
    if (candidate.type !== "shape" || !candidate.style?.fill) continue;
    const covers = element.x >= candidate.x - 0.03
      && element.y >= candidate.y - 0.03
      && element.x + element.w <= candidate.x + candidate.w + 0.03
      && element.y + element.h <= candidate.y + candidate.h + 0.03;
    if (covers) return candidate.style.fill.replace(/^#/, "");
  }
  return slideBackground;
}

/**
 * Repairs the defects the validator marks `fixable`, and reports honestly on
 * the ones it cannot. Every repair mutates the outline, so the next build
 * produces a genuinely different deck; a fixer that cannot change the outline
 * must declare the issue unfixed rather than let the pipeline rebuild the same
 * input and fail again.
 */
export class AutoFixer {
  public constructor(private readonly config: SlideAgentConfig) {}

  public fix(outline: PresentationOutline, report: ValidationReport): FixResult {
    const clone = structuredClone(outline);
    const outcomes: FixOutcome[] = [];
    const unfixed: UnfixedIssue[] = [];
    const deckBackground = outline.creativeDirection?.palette?.background?.replace(/^#/, "") ?? this.config.colors.background;
    const bySlide = new Map<number, ValidationIssue[]>();
    for (const item of report.issues) {
      if (item.slide === undefined || !item.fixable) continue;
      bySlide.set(item.slide, [...(bySlide.get(item.slide) ?? []), item]);
    }

    this.makeTitlesUnique(clone, outcomes);

    clone.slides.forEach((slide, index) => {
      const number = index + 1;
      for (const item of bySlide.get(number) ?? []) {
        switch (item.code) {
          case "text-overflow":
            this.fixOverflow(slide, number, item, outcomes, unfixed);
            break;
          case "poor-contrast":
            this.fixContrast(slide, number, item, deckBackground, outcomes, unfixed);
            break;
          case "excessive-text-density":
            this.reduceDensity(slide, number, outcomes, unfixed);
            break;
          case "object-outside-slide":
            this.clampGeometry(slide, number, item, outcomes, unfixed);
            break;
          case "invalid-chart-data":
            this.normalizeCharts(slide, number, outcomes, unfixed);
            break;
          case "font-too-small":
            this.raiseFontSize(slide, number, item, outcomes, unfixed);
            break;
          case "empty-slide":
            this.fillEmptySlide(slide, number, outcomes, unfixed);
            break;
          case "missing-slide-title":
          case "duplicate-slide-title":
            break; // handled by makeTitlesUnique
          default:
            unfixed.push({ code: item.code, slide: number, elementIds: item.elementIds, reason: `No automatic repair is implemented for ${item.code}.` });
        }
      }
    });

    return { outline: clone, changes: outcomes.map((outcome) => outcome.change), outcomes, unfixed };
  }

  private makeTitlesUnique(outline: PresentationOutline, outcomes: FixOutcome[]): void {
    const seen = new Map<string, number>();
    outline.slides.forEach((slide, index) => {
      const number = index + 1;
      if (!slide.title.trim()) {
        slide.title = `Slide ${number}`;
        outcomes.push({ code: "missing-slide-title", slide: number, change: `Added a title to slide ${number}.` });
      }
      const normalized = slide.title.trim().toLowerCase();
      const count = (seen.get(normalized) ?? 0) + 1;
      seen.set(normalized, count);
      if (count > 1) {
        slide.title = `${slide.title} (${count})`;
        outcomes.push({ code: "duplicate-slide-title", slide: number, change: `Made the title on slide ${number} unique.` });
      }
    });
  }

  private fixOverflow(
    slide: SlideSpec,
    number: number,
    item: ValidationIssue,
    outcomes: FixOutcome[],
    unfixed: UnfixedIssue[],
  ): void {
    const details = item.details as { box?: { w: number; h: number }; declaredFontSize?: number; minimum?: number } | undefined;
    const elementId = item.elementIds?.[0];
    const element = canvasTextElements(slide).find((candidate) => matchesElementId(elementId, candidate.id));

    // Model-authored canvas: shrink the element's own type size, then its text.
    if (element) {
      const minimum = details?.minimum ?? this.config.fonts.minimums.body;
      const current = element.style?.fontSize ?? this.config.fonts.minimums.body;
      const text = elementText(element);
      for (let size = current - 1; size >= minimum; size -= 1) {
        if (estimatedTextHeight(text, element.w, size) <= element.h * 1.08) {
          element.style = { ...element.style, fontSize: size };
          outcomes.push({ code: "text-overflow", slide: number, elementIds: item.elementIds, change: `Reduced ${element.id} on slide ${number} to ${size}pt so its text fits.` });
          return;
        }
      }
      const shortened = element.text ? shortenToFit(text, element.w, element.h, minimum) : undefined;
      if (shortened) {
        element.text = shortened;
        element.style = { ...element.style, fontSize: minimum };
        outcomes.push({ code: "text-overflow", slide: number, elementIds: item.elementIds, change: `Shortened ${element.id} on slide ${number} to fit at the ${minimum}pt minimum.` });
        return;
      }
      unfixed.push({
        code: "text-overflow",
        slide: number,
        elementIds: item.elementIds,
        reason: `${element.id} cannot hold its text at the ${minimum}pt minimum. Enlarge the element or shorten the copy.`,
      });
      return;
    }

    // Fallback layout: the box is fixed, so the outline text has to give.
    const box = details?.box;
    if (elementId?.includes("title") && box) {
      const fontSize = details?.minimum ?? this.config.fonts.minimums.slideTitle;
      const shortened = shortenToFit(slide.title, box.w, box.h, fontSize);
      if (shortened && shortened !== slide.title) {
        slide.title = shortened;
        outcomes.push({ code: "text-overflow", slide: number, change: `Shortened the slide ${number} title to fit its fixed layout header.` });
        return;
      }
      unfixed.push({
        code: "text-overflow",
        slide: number,
        elementIds: item.elementIds,
        reason: `The slide ${number} title cannot be shortened further without losing meaning. Supply a shorter title or a model-authored canvas.`,
      });
      return;
    }

    if (slide.body && words(slide.body).length > 12) {
      slide.body = truncateWords(slide.body, Math.max(12, Math.floor(words(slide.body).length * 0.7)));
      outcomes.push({ code: "text-overflow", slide: number, change: `Shortened the body copy on slide ${number}.` });
      return;
    }
    if (slide.bullets?.some((bullet) => words(bullet).length > 6)) {
      slide.bullets = slide.bullets.map((bullet) => truncateWords(bullet, Math.max(6, this.config.generation.maximumWordsPerBullet - 2)));
      outcomes.push({ code: "text-overflow", slide: number, change: `Shortened the bullets on slide ${number}.` });
      return;
    }
    unfixed.push({ code: "text-overflow", slide: number, elementIds: item.elementIds, reason: `Slide ${number} has no further text the fixer can safely shorten.` });
  }

  private fixContrast(
    slide: SlideSpec,
    number: number,
    item: ValidationIssue,
    deckBackground: string,
    outcomes: FixOutcome[],
    unfixed: UnfixedIssue[],
  ): void {
    const elementId = item.elementIds?.[0];
    const element = canvasTextElements(slide).find((candidate) => matchesElementId(elementId, candidate.id));
    if (!element) {
      // Built-in layouts derive their colors from the resolved palette, which
      // CreativeDirector already corrects for legibility. Anything reaching
      // here comes from a supplied palette the fixer must not silently rewrite.
      unfixed.push({
        code: "poor-contrast",
        slide: number,
        elementIds: item.elementIds,
        reason: `Slide ${number} places supplied palette colors through a built-in layout. Adjust creativeDirection.palette or author a canvas to control this contrast.`,
      });
      return;
    }
    const backdrop = resolvedBackdrop(slide, element, deckBackground);
    const fontSize = element.style?.fontSize ?? this.config.fonts.minimums.body;
    const current = (element.style?.color ?? this.config.colors.ink).replace(/^#/, "").toUpperCase();
    const corrected = ensureContrast(current, backdrop, requiredContrast(fontSize, element.style?.bold));
    if (corrected === current) {
      unfixed.push({ code: "poor-contrast", slide: number, elementIds: item.elementIds, reason: `${element.id} already uses the most legible variant of its hue on ${backdrop}.` });
      return;
    }
    element.style = { ...element.style, color: corrected };
    outcomes.push({ code: "poor-contrast", slide: number, elementIds: item.elementIds, change: `Adjusted ${element.id} on slide ${number} to ${corrected} for legibility on ${backdrop}.` });
  }

  private raiseFontSize(
    slide: SlideSpec,
    number: number,
    item: ValidationIssue,
    outcomes: FixOutcome[],
    unfixed: UnfixedIssue[],
  ): void {
    const minimum = (item.details as { minimum?: number } | undefined)?.minimum;
    const element = canvasTextElements(slide).find((candidate) => matchesElementId(item.elementIds?.[0], candidate.id));
    if (!element || !minimum) {
      unfixed.push({ code: "font-too-small", slide: number, elementIds: item.elementIds, reason: `Slide ${number} font size comes from a built-in layout and cannot be raised from the outline.` });
      return;
    }
    const text = elementText(element);
    if (text && estimatedTextHeight(text, element.w, minimum) > element.h * 1.08) {
      unfixed.push({ code: "font-too-small", slide: number, elementIds: item.elementIds, reason: `${element.id} cannot reach ${minimum}pt without overflowing. Enlarge the element instead.` });
      return;
    }
    element.style = { ...element.style, fontSize: minimum };
    outcomes.push({ code: "font-too-small", slide: number, elementIds: item.elementIds, change: `Raised ${element.id} on slide ${number} to the ${minimum}pt minimum.` });
  }

  private reduceDensity(slide: SlideSpec, number: number, outcomes: FixOutcome[], unfixed: UnfixedIssue[]): void {
    let changed = false;
    if (slide.body && words(slide.body).length > this.config.generation.maximumBodyWords) {
      slide.body = truncateWords(slide.body, this.config.generation.maximumBodyWords);
      changed = true;
    }
    if (slide.bullets && slide.bullets.length > this.config.generation.maximumBulletsPerSlide) {
      slide.bullets = slide.bullets.slice(0, this.config.generation.maximumBulletsPerSlide);
      changed = true;
    }
    if (changed) {
      outcomes.push({ code: "excessive-text-density", slide: number, change: `Reduced the visible copy on slide ${number}.` });
      return;
    }
    unfixed.push({ code: "excessive-text-density", slide: number, reason: `Slide ${number} density comes from model-authored content. Split the slide or shorten the copy deliberately.` });
  }

  private clampGeometry(slide: SlideSpec, number: number, item: ValidationIssue, outcomes: FixOutcome[], unfixed: UnfixedIssue[]): void {
    const { width, height } = this.config.dimensions;
    let changed = false;
    for (const region of slide.custom ?? []) {
      const x = Math.max(0, Math.min(region.x, width - 0.1));
      const y = Math.max(0, Math.min(region.y, height - 0.1));
      const w = Math.max(0.1, Math.min(region.w, width - x));
      const h = Math.max(0.1, Math.min(region.h, height - y));
      if (x !== region.x || y !== region.y || w !== region.w || h !== region.h) changed = true;
      Object.assign(region, { x, y, w, h });
      if (region.type === "text") region.fontSize = Math.max(region.fontSize ?? 18, this.config.fonts.minimums.body);
    }
    for (const element of slide.canvas ?? []) {
      const x = Math.max(0, Math.min(element.x, width - 0.05));
      const y = Math.max(0, Math.min(element.y, height - 0.05));
      if (x !== element.x || y !== element.y) changed = true;
      element.x = x;
      element.y = y;
      if (element.type === "connector") continue;
      const w = Math.max(0.05, Math.min(element.w, width - x));
      const h = Math.max(0.05, Math.min(element.h, height - y));
      if (w !== element.w || h !== element.h) changed = true;
      element.w = w;
      element.h = h;
    }
    if (changed) {
      outcomes.push({ code: "object-outside-slide", slide: number, elementIds: item.elementIds, change: `Moved off-canvas elements on slide ${number} back inside the slide.` });
      return;
    }
    unfixed.push({
      code: "object-outside-slide",
      slide: number,
      elementIds: item.elementIds,
      reason: `Slide ${number} places an element outside the slide from a built-in layout, which the outline cannot move. Report this as a layout defect.`,
    });
  }

  private normalizeCharts(slide: SlideSpec, number: number, outcomes: FixOutcome[], unfixed: UnfixedIssue[]): void {
    const normalize = (chart: { kind: string; labels: string[]; series: Array<{ name: string; values: number[] }> }): boolean => {
      const length = chart.labels.length;
      const before = JSON.stringify(chart.series);
      chart.series = chart.series.map((series) => ({
        ...series,
        values: Array.from({ length }, (_, index) => Number.isFinite(series.values[index]) ? series.values[index]! : 0),
      }));
      if (chart.kind === "pie") chart.series = chart.series.slice(0, 1);
      return JSON.stringify(chart.series) !== before;
    };
    let changed = slide.chart ? normalize(slide.chart) : false;
    for (const element of slide.canvas ?? []) {
      if (element.type === "chart" && normalize(element.chart)) changed = true;
    }
    if (changed) {
      outcomes.push({ code: "invalid-chart-data", slide: number, change: `Normalized chart data on slide ${number}.` });
      return;
    }
    unfixed.push({ code: "invalid-chart-data", slide: number, reason: `Slide ${number} chart data is structurally invalid in a way the fixer cannot infer. Supply labels and matching series values.` });
  }

  private fillEmptySlide(slide: SlideSpec, number: number, outcomes: FixOutcome[], unfixed: UnfixedIssue[]): void {
    if (slide.canvas?.length || slide.bullets?.length || slide.body) {
      unfixed.push({ code: "empty-slide", slide: number, reason: `Slide ${number} has content in the outline but rendered nothing. Report this as a layout defect.` });
      return;
    }
    slide.body = slide.subtitle ?? slide.title;
    outcomes.push({ code: "empty-slide", slide: number, change: `Gave slide ${number} visible content derived from its title.` });
  }
}
