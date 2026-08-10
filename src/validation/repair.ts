import type {
  AppliedRepair,
  CanvasElementSpec,
  PresentationOutline,
  RepairMode,
  SlideAgentConfig,
  SuggestedRepair,
  ValidationReport,
} from "../types/index.js";
import { AutoFixer, type FixResult } from "./auto-fixer.js";

/**
 * Repair with the author's consent, rather than behind their back.
 *
 * The old loop rewrote model-authored colours and type sizes to satisfy a
 * contrast or overflow metric and reported a single line of prose about it. The
 * deck that came out was not the deck that was designed, the change was not
 * reversible, and nothing recorded what the value had been.
 *
 * So `suggest` is now the default for a model-authored canvas: the engine says
 * precisely what it would change, from what, to what, and why — and changes
 * nothing. `safe` still applies repairs, but records every one with its
 * rollback value and whether it touched something the author wrote
 * deliberately. `off` does nothing at all.
 */

export interface RepairPlan {
  mode: RepairMode;
  /** What the fixer would change. Empty in `off` mode. */
  suggestions: SuggestedRepair[];
  /** The repaired outline, or the original when nothing was applied. */
  outline: PresentationOutline;
  applied: boolean;
  /** Present when `safe` applied changes. */
  appliedRepairs: AppliedRepair[];
  /** Issues the fixer was asked to repair but could not. */
  unfixed: FixResult["unfixed"];
}

/**
 * The default is `suggest` for anything the model authored and `safe` for a
 * prompt-only draft. A draft is scaffolding nobody designed, so repairing it
 * silently costs nothing; a canvas is somebody's work.
 */
export function defaultRepairMode(outline: PresentationOutline): RepairMode {
  return outline.slides.some((slide) => slide.canvas?.length) ? "suggest" : "safe";
}

interface ValueChange {
  slide: number;
  elementId: string;
  property: string;
  before: unknown;
  after: unknown;
}

function canvasById(outline: PresentationOutline, slideIndex: number): Map<string, CanvasElementSpec> {
  return new Map((outline.slides[slideIndex]?.canvas ?? []).map((element) => [element.id, element]));
}

const TRACKED_STYLE_PROPERTIES = [
  "color", "fill", "fontSize", "fontFace", "bold", "italic", "lineColor", "lineWidth", "transparency", "rotate",
];

/**
 * Exactly which values differ between the authored outline and the repaired
 * one. Derived by comparison rather than reported by each repair, so a fix that
 * quietly touched something it did not mention still shows up here.
 */
function valueChanges(before: PresentationOutline, after: PresentationOutline): ValueChange[] {
  const changes: ValueChange[] = [];
  after.slides.forEach((slide, index) => {
    const originals = canvasById(before, index);
    const original = before.slides[index];
    // Slide-level copy matters as much as element style: a fallback layout's
    // repair shortens `body` or `bullets`, and a plan that could not see those
    // would report "nothing changed" and stall the loop.
    for (const property of ["title", "subtitle", "body"] as const) {
      if (slide[property] !== original?.[property]) {
        changes.push({ slide: index + 1, elementId: "<slide>", property, before: original?.[property], after: slide[property] });
      }
    }
    if (JSON.stringify(slide.bullets) !== JSON.stringify(original?.bullets)) {
      changes.push({ slide: index + 1, elementId: "<slide>", property: "bullets", before: original?.bullets, after: slide.bullets });
    }
    for (const element of slide.canvas ?? []) {
      const original = originals.get(element.id);
      if (!original) {
        changes.push({ slide: index + 1, elementId: element.id, property: "<element>", before: undefined, after: element });
        continue;
      }
      for (const axis of ["x", "y", "w", "h"] as const) {
        if (element[axis] !== original[axis]) {
          changes.push({ slide: index + 1, elementId: element.id, property: axis, before: original[axis], after: element[axis] });
        }
      }
      if (element.type === "text" && original.type === "text" && element.text !== original.text) {
        changes.push({ slide: index + 1, elementId: element.id, property: "text", before: original.text, after: element.text });
      }
      const style = (element as { style?: Record<string, unknown> }).style ?? {};
      const originalStyle = (original as { style?: Record<string, unknown> }).style ?? {};
      for (const property of TRACKED_STYLE_PROPERTIES) {
        if (style[property] !== originalStyle[property]) {
          changes.push({
            slide: index + 1,
            elementId: element.id,
            property: `style.${property}`,
            before: originalStyle[property],
            after: style[property],
          });
        }
      }
    }
  });
  return changes;
}

/** The repair whose slide and element best explain one value change. */
function rationaleFor(change: ValueChange, result: FixResult): { code: string; rationale: string } {
  const outcome = result.outcomes.find((entry) => entry.slide === change.slide
    && (!entry.elementIds?.length || entry.elementIds.some((id) => id.endsWith(change.elementId.toLowerCase().replace(/[^a-z0-9]+/g, "-")))))
    ?? result.outcomes.find((entry) => entry.slide === change.slide);
  return {
    code: outcome?.code ?? "unspecified",
    rationale: outcome?.change ?? `Proposed while repairing slide ${change.slide}.`,
  };
}

/** Slide numbers whose composition the model authored itself. */
export function authoredSlideNumbers(outline: PresentationOutline): Set<number> {
  const authored = new Set<number>();
  outline.slides.forEach((slide, index) => {
    if (slide.canvas?.length) authored.add(index + 1);
  });
  return authored;
}

export function planRepairs(
  outline: PresentationOutline,
  report: ValidationReport,
  config: SlideAgentConfig,
  mode: RepairMode,
): RepairPlan {
  if (mode === "off") {
    return { mode, suggestions: [], outline, applied: false, appliedRepairs: [], unfixed: [] };
  }
  const result = new AutoFixer(config).fix(outline, report);
  const changes = valueChanges(outline, result.outline);
  const suggestions: SuggestedRepair[] = changes.map((change) => {
    const { code, rationale } = rationaleFor(change, result);
    return {
      issueCode: code,
      slide: change.slide,
      elementIds: [change.elementId],
      property: change.property,
      before: change.before,
      after: change.after,
      rationale,
      // A value that was already there is a decision somebody made. Replacing
      // one is different in kind from filling one in, and the report has to say
      // which of the two this is.
      changesAuthorIntent: change.before !== undefined,
    };
  });

  if (mode === "suggest") {
    // A deck is often part model-authored and part fallback draft. The reason
    // to hold back is that somebody designed the slide, so the decision is per
    // slide: a canvas is reported and left alone, a scaffolded slide is
    // repaired, because nobody designed it and there is nothing to preserve.
    const authored = authoredSlideNumbers(outline);
    const held = suggestions.filter((suggestion) => suggestion.slide === undefined || authored.has(suggestion.slide));
    const appliedElsewhere = suggestions.filter((suggestion) => suggestion.slide !== undefined && !authored.has(suggestion.slide));
    const slides = result.outline.slides.map((slide, index) => authored.has(index + 1) ? outline.slides[index]! : slide);
    const appliedAt = new Date().toISOString();
    return {
      mode,
      suggestions: held,
      outline: { ...result.outline, slides },
      applied: appliedElsewhere.length > 0,
      appliedRepairs: appliedElsewhere.map((suggestion) => ({
        ...suggestion,
        appliedAt,
        rollback: { property: suggestion.property, value: suggestion.before },
        renderRegression: "not-checked" as const,
      })),
      unfixed: result.unfixed,
    };
  }

  const appliedAt = new Date().toISOString();
  return {
    mode,
    suggestions,
    outline: result.outline,
    applied: suggestions.length > 0,
    appliedRepairs: suggestions.map((suggestion) => ({
      ...suggestion,
      appliedAt,
      rollback: { property: suggestion.property, value: suggestion.before },
      renderRegression: "not-checked",
    })),
    unfixed: result.unfixed,
  };
}

/** Worsening order, so a repair that made the render worse can be detected. */
const FIDELITY_RANK: Record<string, number> = { pass: 0, skipped: 0, review: 1, fail: 2 };

/**
 * Did applying these repairs make the render worse?
 *
 * A repair that satisfies a contrast metric by shrinking a title until its last
 * word falls off the slide has not repaired anything. Comparing the render's
 * own text before and after is the only check that can see that.
 */
export function detectRenderRegression(
  before: ValidationReport["fidelity"],
  after: ValidationReport["fidelity"],
): boolean {
  if (!before || !after) return false;
  if ((FIDELITY_RANK[after.status] ?? 0) > (FIDELITY_RANK[before.status] ?? 0)) return true;
  const count = (report: NonNullable<ValidationReport["fidelity"]>) =>
    report.slides.reduce((sum, slide) => sum + slide.missing.length + slide.truncated.length, 0);
  return count(after) > count(before);
}

/** A compact summary of a repair plan for a human or a model to read. */
export function describeRepairs(plan: RepairPlan): string[] {
  return plan.suggestions.map((suggestion) => {
    const where = suggestion.slide ? `slide ${suggestion.slide}` : "the deck";
    const target = suggestion.elementIds?.[0] ?? "";
    const verb = plan.applied ? "Changed" : "Would change";
    const intent = suggestion.changesAuthorIntent ? " (this replaces a value you set)" : "";
    return `${verb} ${target} on ${where}: ${suggestion.property} ${JSON.stringify(suggestion.before)} → ${JSON.stringify(suggestion.after)}${intent}. ${suggestion.rationale}`;
  });
}
