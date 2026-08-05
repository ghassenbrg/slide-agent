import { existsSync } from "node:fs";

import type {
  ChartSpec,
  DeckManifest,
  ElementRecord,
  SlideAgentConfig,
  SlideManifest,
  ValidationIssue,
} from "../types/index.js";
import { words } from "../utils/text.js";
import { colorContrast as contrastRatio, requiredContrast } from "../utils/color.js";
import { area, contains, intersectionArea, normalizedBox } from "./geometry.js";

function issue(code: string, severity: ValidationIssue["severity"], message: string, fixable: boolean, options: Partial<ValidationIssue> = {}): ValidationIssue {
  return { code, severity, message, fixable, ...options };
}

/** Estimated wrapped-line count for a text run at a given point size. */
export function estimatedLineCount(text: string, widthInches: number, fontSize: number): number {
  const averageCharacterWidthInches = fontSize * 0.33 / 72;
  const charactersPerLine = Math.max(1, Math.floor(widthInches / averageCharacterWidthInches));
  return text.split(/\r?\n/).reduce((total, line) => {
    const lineWords = line.split(/\s+/).filter(Boolean);
    let lines = 1;
    let used = 0;
    for (const word of lineWords) {
      const next = used === 0 ? word.length : used + 1 + word.length;
      if (next > charactersPerLine && used > 0) {
        lines += 1;
        used = word.length;
      } else {
        used = next;
      }
    }
    return total + lines;
  }, 0);
}

/** Estimated height in inches that `text` needs at `fontSize`. */
export function estimatedTextHeight(text: string, widthInches: number, fontSize: number): number {
  return estimatedLineCount(text, widthInches, fontSize) * fontSize / 72;
}

export interface TextFitResult {
  /** The size the text will actually render at once autofit is applied. */
  effectiveFontSize: number;
  /** True when even the smallest autofit step cannot contain the text. */
  clipped: boolean;
}

/**
 * PowerPoint shrinks `normAutofit` text to fit its box, so a declared size that
 * overflows is only a defect when the shrink needed to contain it would push
 * the text below its legibility minimum — or when autofit is off and the text
 * would be clipped outright.
 */
export function measureTextFit(element: ElementRecord, minimumFontSize: number): TextFitResult | undefined {
  if (!element.text || !element.fontSize || element.w <= 0 || element.h <= 0) return undefined;
  const fits = (size: number): boolean => estimatedTextHeight(element.text!, element.w, size) <= element.h * 1.08;
  if (fits(element.fontSize)) return { effectiveFontSize: element.fontSize, clipped: false };
  if (element.fit !== "shrink") return { effectiveFontSize: element.fontSize, clipped: true };
  // PowerPoint's autofit reduces in roughly 1pt steps down to about 25% scale.
  const floor = Math.max(1, Math.floor(element.fontSize * 0.25));
  for (let size = element.fontSize - 1; size >= floor; size -= 1) {
    if (fits(size)) return { effectiveFontSize: size, clipped: size < minimumFontSize };
  }
  return { effectiveFontSize: floor, clipped: true };
}

function overlapAllowed(left: ElementRecord, right: ElementRecord): boolean {
  if (left.intentionalOverlap || right.intentionalOverlap) return true;
  if (left.type === "connector" || right.type === "connector") return true;
  if (left.allowOverlapWith?.includes(right.id) || right.allowOverlapWith?.includes(left.id)) return true;
  if ((left.type === "shape" || left.type === "image") && right.type === "text" && contains(left, right)) return true;
  if ((right.type === "shape" || right.type === "image") && left.type === "text" && contains(right, left)) return true;
  if (left.role === "decorative" || right.role === "decorative") return true;
  return false;
}

function validateChart(chart: ChartSpec): string[] {
  const errors: string[] = [];
  if (chart.labels.length === 0) errors.push("chart has no category labels");
  if (chart.series.length === 0) errors.push("chart has no data series");
  for (const series of chart.series) {
    if (series.values.length !== chart.labels.length) errors.push(`${series.name} has ${series.values.length} values for ${chart.labels.length} labels`);
    if (series.values.some((value) => !Number.isFinite(value))) errors.push(`${series.name} contains a non-finite value`);
  }
  if (chart.kind === "pie" && chart.series.length !== 1) errors.push("pie charts require exactly one data series");
  return errors;
}

function minimumFont(element: ElementRecord, config: SlideAgentConfig): number {
  // Labels attached to a mark — a diagram node, an axis, a lane — are read at
  // the distance of the thing they label, not as body copy, so they carry the
  // caption minimum. Holding them to the body minimum forced diagrams to use
  // type large enough to crowd out the diagram.
  if ([
    "footer", "caption", "chart-label", "eyebrow", "index", "lane-label", "attribution",
    "diagram-label", "axis-label", "roadmap-label",
  ].includes(element.role)) return config.fonts.minimums.caption;
  if (["title"].includes(element.role)) return element.name.includes("deck") ? config.fonts.minimums.deckTitle : config.fonts.minimums.slideTitle;
  if (["subheading", "kpi-value", "quote", "lead", "insight"].includes(element.role)) return config.fonts.minimums.subheading;
  return config.fonts.minimums.body;
}

function visibleBackground(
  element: ElementRecord,
  elementIndex: number,
  elements: ElementRecord[],
  slideBackground: string,
): string | undefined {
  if (element.fillColor) return element.fillColor;
  for (let index = elementIndex - 1; index >= 0; index -= 1) {
    const candidate = elements[index]!;
    if (!(candidate.type === "shape" || candidate.type === "image")) continue;
    if (!contains(candidate, element)) continue;
    if (candidate.type === "image") return undefined;
    return candidate.fillColor ?? slideBackground;
  }
  return slideBackground;
}

/**
 * The colour a reader actually sees behind `element`: its own fill, the fill of
 * the nearest shape painted under it, or the slide background.
 */
export function visibleBackgroundFor(element: ElementRecord, slide: SlideManifest, config: SlideAgentConfig): string {
  const index = slide.elements.indexOf(element);
  return visibleBackground(element, index, slide.elements, slide.backgroundColor ?? config.colors.background)
    ?? slide.backgroundColor ?? config.colors.background;
}

function dominantAlignment(values: Array<{ id: string; value: number }>, tolerance = 0.08): { expected: number; outliers: string[] } | undefined {
  if (values.length < 3) return undefined;
  let aligned: Array<{ id: string; value: number }> = [];
  for (const candidate of values) {
    const cluster = values.filter((item) => Math.abs(item.value - candidate.value) <= tolerance);
    if (cluster.length > aligned.length) aligned = cluster;
  }
  if (aligned.length !== values.length - 1) return undefined;
  const alignedIds = new Set(aligned.map((item) => item.id));
  return {
    expected: aligned.reduce((total, item) => total + item.value, 0) / aligned.length,
    outliers: values.filter((item) => !alignedIds.has(item.id)).map((item) => item.id),
  };
}

export class ManifestValidator {
  public constructor(private readonly config: SlideAgentConfig) {}

  public validate(manifest: DeckManifest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!manifest.presentationTitle.trim()) issues.push(issue("missing-presentation-title", "error", "Presentation title is missing.", true));
    if (manifest.slides.length === 0) issues.push(issue("empty-presentation", "error", "Presentation has no slides.", false));

    const titles = new Map<string, number[]>();
    const titlePositions: Array<{ slide: number; x: number }> = [];
    for (const slide of manifest.slides) {
      if (slide.elements.length === 0) issues.push(issue("empty-slide", "error", `Slide ${slide.number} is empty.`, true, { slide: slide.number }));
      if (!slide.title.trim()) issues.push(issue("missing-slide-title", "error", `Slide ${slide.number} has no title.`, true, { slide: slide.number }));
      const normalizedTitle = slide.title.trim().toLowerCase();
      if (normalizedTitle) titles.set(normalizedTitle, [...(titles.get(normalizedTitle) ?? []), slide.number]);

      const textWordCount = slide.elements.filter((element) => element.type === "text").reduce((total, element) => total + words(element.text ?? "").length, 0);
      if (textWordCount > 120) {
        issues.push(issue("excessive-text-density", "warning", `Slide ${slide.number} contains ${textWordCount} visible words.`, true, {
          slide: slide.number,
          details: { words: textWordCount, threshold: 120 },
        }));
      }

      for (let elementIndex = 0; elementIndex < slide.elements.length; elementIndex += 1) {
        const element = slide.elements[elementIndex]!;
        const box = normalizedBox(element);
        const invalidSize = element.type === "connector"
          ? element.w === 0 && element.h === 0
          : element.w <= 0 || element.h < 0;
        if (invalidSize || box.left < -0.01 || box.top < -0.01 || box.right > manifest.width + 0.01 || box.bottom > manifest.height + 0.01) {
          issues.push(issue("object-outside-slide", "error", `${element.name} is outside slide ${slide.number}.`, true, {
            slide: slide.number,
            elementIds: [element.id],
            details: { box, slideSize: { width: manifest.width, height: manifest.height } },
          }));
        }
        if (element.type === "text" && element.fontSize !== undefined) {
          const minimum = minimumFont(element, this.config);
          if (element.fontSize < minimum) {
            issues.push(issue("font-too-small", "warning", `${element.name} uses ${element.fontSize}pt; minimum for ${element.role} is ${minimum}pt.`, true, {
              slide: slide.number,
              elementIds: [element.id],
              details: { fontSize: element.fontSize, minimum },
            }));
          }
          if (element.fontFace && !this.config.fonts.supported.includes(element.fontFace)) {
            issues.push(issue("unsupported-font", "warning", `${element.name} uses unsupported font ${element.fontFace}.`, true, {
              slide: slide.number,
              elementIds: [element.id],
              details: { fontFace: element.fontFace },
            }));
          }
          const fit = measureTextFit(element, minimum);
          if (fit?.clipped) {
            issues.push(issue("text-overflow", "error", `${element.name} does not fit its text box${element.fit === "shrink" ? ` even after autofit shrinks it to ${fit.effectiveFontSize}pt` : ""}.`, true, {
              slide: slide.number,
              elementIds: [element.id],
              details: { declaredFontSize: element.fontSize, effectiveFontSize: fit.effectiveFontSize, minimum, box: { w: element.w, h: element.h } },
            }));
          }
          const fillColor = visibleBackground(element, elementIndex, slide.elements, slide.backgroundColor ?? this.config.colors.background);
          const required = requiredContrast(fit?.effectiveFontSize ?? element.fontSize, element.bold);
          if (element.role !== "decorative" && element.textColor && fillColor && contrastRatio(element.textColor, fillColor) < required) {
            issues.push(issue("poor-contrast", "warning", `${element.name} has insufficient text contrast.`, true, {
              slide: slide.number,
              elementIds: [element.id],
              details: { textColor: element.textColor, fillColor, ratio: Number(contrastRatio(element.textColor, fillColor).toFixed(2)), required },
            }));
          }
          if (element.role === "title" && slide.compositionMode !== "model-authored") {
            titlePositions.push({ slide: slide.number, x: element.x });
          }
        }
        if (element.type === "image" && element.imagePath && !element.metadata?.packagePath && !existsSync(element.imagePath)) {
          issues.push(issue("missing-image", "error", `Image is missing: ${element.imagePath}`, true, {
            slide: slide.number,
            elementIds: [element.id],
          }));
        }
        if (element.type === "chart") {
          const chart = element.metadata?.chart as ChartSpec | undefined;
          const nativeChart = element.metadata?.nativeChart as { nativeType?: string; data?: unknown[] } | undefined;
          const messages = chart
            ? validateChart(chart)
            : nativeChart?.nativeType && nativeChart.data?.length
              ? []
              : ["chart metadata is missing"];
          for (const message of messages) {
            issues.push(issue("invalid-chart-data", "error", message, true, { slide: slide.number, elementIds: [element.id] }));
          }
        }
      }

      for (let leftIndex = 0; leftIndex < slide.elements.length; leftIndex += 1) {
        const left = slide.elements[leftIndex]!;
        for (let rightIndex = leftIndex + 1; rightIndex < slide.elements.length; rightIndex += 1) {
          const right = slide.elements[rightIndex]!;
          if (overlapAllowed(left, right)) continue;
          const overlap = intersectionArea(left, right);
          if (overlap > Math.min(area(left), area(right)) * 0.08 && overlap > 0.025) {
            issues.push(issue("overlapping-elements", "error", `${left.name} overlaps ${right.name} on slide ${slide.number}.`, true, {
              slide: slide.number,
              elementIds: [left.id, right.id],
              details: { overlapArea: overlap },
            }));
          }
        }
      }

      if (slide.compositionMode !== "model-authored") {
        const alignmentGroups = new Map<string, ElementRecord[]>();
        for (const element of slide.elements.filter((item) => item.type !== "connector" && item.role !== "decorative")) {
          const group = element.name.toLowerCase().replace(/[-_ ]+\d+$/, "");
          alignmentGroups.set(group, [...(alignmentGroups.get(group) ?? []), element]);
        }
        for (const [group, elements] of alignmentGroups) {
          for (const axis of ["x", "y"] as const) {
            const alignment = dominantAlignment(elements.map((element) => ({ id: element.id, value: element[axis] })));
            if (!alignment) continue;
            issues.push(issue("misaligned-elements", "warning", `${group} contains a misaligned ${axis}-position on slide ${slide.number}.`, true, {
              slide: slide.number,
              elementIds: alignment.outliers,
              details: { axis, expected: alignment.expected },
            }));
          }
        }
      }
    }

    for (const [title, slides] of titles) {
      if (slides.length > 1 && !["thank you", "next steps"].includes(title)) {
        issues.push(issue("duplicate-slide-title", "warning", `Duplicate slide title appears on slides ${slides.join(", ")}.`, true, {
          details: { title, slides },
        }));
      }
    }
    if (titlePositions.length >= 3) {
      const sorted = titlePositions.map((item) => item.x).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      for (const item of titlePositions) {
        if (Math.abs(item.x - median) > 0.35) {
          issues.push(issue("inconsistent-margin", "warning", `Slide ${item.slide} title is misaligned with the deck title margin.`, true, {
            slide: item.slide,
            details: { x: item.x, expected: median },
          }));
        }
      }
    }
    return issues;
  }
}
