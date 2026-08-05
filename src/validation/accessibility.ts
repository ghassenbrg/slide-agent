import type { DeckManifest, ElementRecord, SlideAgentConfig, SlideManifest, ValidationIssue } from "../types/index.js";
import { colorContrast, requiredContrast } from "../utils/color.js";
import { visibleBackgroundFor } from "./manifest-validator.js";

/**
 * Accessibility checks that run on every deck.
 *
 * These are a floor, not a design goal. A deck that clears them can still be
 * unusable; a deck that fails them is unusable for someone specific, which is
 * why alt text and reading order are errors rather than style notes.
 */

/** Roles whose elements are decoration and legitimately have no alt text. */
const DECORATIVE_ROLES = new Set(["decorative", "accent", "rule", "visual-background", "motif", "texture"]);

function issue(
  code: string,
  severity: ValidationIssue["severity"],
  message: string,
  fixable: boolean,
  options: Partial<ValidationIssue> = {},
): ValidationIssue {
  return { code, severity, message, fixable, ...options };
}

function isDecorative(element: ElementRecord): boolean {
  return DECORATIVE_ROLES.has(element.role);
}

/**
 * Reading order follows the visual order a sighted reader uses: top to bottom,
 * then left to right within a band. Screen readers announce shapes in document
 * order, so the two have to agree.
 */
function readingOrderIssues(slide: SlideManifest): ValidationIssue[] {
  const readable = slide.elements.filter((element) => element.text?.trim() && !isDecorative(element));
  if (readable.length < 2) return [];

  // An inversion only counts inside a single column. Multi-column layouts are
  // legitimately announced column by column, so "this heading sits above that
  // bullet" says nothing when they are in different columns — flagging it made
  // the check fire on every comparison, KPI, and process slide, and a check
  // that cries wolf on good design gets switched off.
  const sameColumn = (left: ElementRecord, right: ElementRecord): boolean =>
    left.x < right.x + right.w && right.x < left.x + left.w;

  const inversions: Array<[string, string]> = [];
  for (let earlier = 0; earlier < readable.length; earlier += 1) {
    for (let later = earlier + 1; later < readable.length; later += 1) {
      const first = readable[earlier]!;
      const second = readable[later]!;
      if (!sameColumn(first, second)) continue;
      if (second.y + second.h <= first.y) inversions.push([first.id, second.id]);
    }
  }
  if (inversions.length === 0) return [];

  return [issue(
    "reading-order",
    "warning",
    `Slide ${slide.number} announces ${inversions.length} element(s) before text that sits entirely above them, so a screen reader reads the slide out of order.`,
    false,
    {
      slide: slide.number,
      elementIds: [...new Set(inversions.flat())],
      details: { inversions },
    },
  )];
}

export interface AccessibilityOptions {
  /** Raise the contrast requirement from WCAG AA to AAA. */
  level?: "AA" | "AAA";
}

export class AccessibilityValidator {
  public constructor(
    private readonly config: SlideAgentConfig,
    private readonly options: AccessibilityOptions = {},
  ) {}

  public validate(manifest: DeckManifest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const enhanced = this.options.level === "AAA";

    for (const slide of manifest.slides) {
      for (const element of slide.elements) {
        if ((element.type === "image" || element.type === "chart") && !isDecorative(element)) {
          const alt = element.altText;
          if (!alt?.trim()) {
            issues.push(issue(
              "missing-alt-text",
              "error",
              `${element.name} on slide ${slide.number} has no alternative text. Describe what it shows, or mark it role: "decorative".`,
              false,
              { slide: slide.number, elementIds: [element.id] },
            ));
          } else if (/^(image|picture|chart|graph|figure|screenshot)\b/i.test(alt.trim())) {
            issues.push(issue(
              "uninformative-alt-text",
              "warning",
              `${element.name} on slide ${slide.number} has alt text that names the medium rather than the content: "${alt}".`,
              false,
              { slide: slide.number, elementIds: [element.id] },
            ));
          }
        }

        if (enhanced && element.text?.trim() && element.textColor && !isDecorative(element)) {
          const background = visibleBackgroundFor(element, slide, this.config);
          const ratio = colorContrast(element.textColor, background);
          const floor = requiredContrast(element.fontSize ?? this.config.fonts.minimums.body, false, "AAA");
          if (ratio < floor) {
            issues.push(issue(
              "contrast-below-aaa",
              "warning",
              `${element.name} on slide ${slide.number} meets AA but not AAA (${ratio.toFixed(2)}:1).`,
              true,
              { slide: slide.number, elementIds: [element.id], details: { ratio, required: floor } },
            ));
          }
        }
      }

      issues.push(...readingOrderIssues(slide));

      const hasText = slide.elements.some((element) => element.text?.trim() && !isDecorative(element));
      if (!hasText && slide.elements.length > 0) {
        issues.push(issue(
          "image-only-slide",
          "warning",
          `Slide ${slide.number} carries no readable text, so it is invisible to a screen reader.`,
          false,
          { slide: slide.number },
        ));
      }
    }

    return issues;
  }
}
