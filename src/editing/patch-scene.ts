import type {
  CanvasElementSpec,
  PresentationOutline,
  SlideSpec,
  SourceCitation,
} from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";

/**
 * Changing one thing without restating everything.
 *
 * Slide-level replacement was safe but expensive: to move a caption the model
 * had to re-emit every element on that slide, and every re-emission is a chance
 * to lose a decision it made an hour ago. These operations address elements by
 * id on an explicit slide, so the cost of a critique is proportional to what
 * the critique found.
 *
 * There is deliberately no "make it nicer" operation. Taste belongs to the
 * host; a deterministic engine that tried to act on that instruction would be
 * guessing, and its guess would be a house style.
 */

export type PatchOperation =
  | { op: "add-element"; slide: number; element: CanvasElementSpec; index?: number }
  | { op: "remove-element"; slide: number; elementId: string }
  | { op: "update-text"; slide: number; elementId: string; text?: string; runs?: CanvasElementSpec extends never ? never : Array<{ text: string; options?: Record<string, unknown> }> }
  | { op: "update-style"; slide: number; elementId: string; style: Record<string, unknown>; replace?: boolean }
  | { op: "update-bbox"; slide: number; elementId: string; bbox: [number, number, number, number] }
  | { op: "update-z-index"; slide: number; elementId: string; zIndex: number }
  | { op: "update-provenance"; slide: number; elementId: string; provenance: Record<string, unknown> }
  | { op: "update-slide"; slide: number; title?: string; subtitle?: string; designIntent?: string; composition?: string; background?: string; speakerNotes?: string[]; sources?: SourceCitation[] }
  | { op: "update-claims"; claims: NonNullable<PresentationOutline["claims"]> }
  | { op: "apply-style-system"; slide?: number; selector: { role?: string; layer?: string; type?: string; elementIds?: string[] }; styleRef?: string | string[]; style?: Record<string, unknown> };

export interface PatchChange {
  op: PatchOperation["op"];
  slide?: number;
  elementId?: string;
  property?: string;
  before?: unknown;
  after?: unknown;
  description: string;
}

export interface PatchResult {
  outline: PresentationOutline;
  changes: PatchChange[];
  /** Elements the patch did not touch, per slide. Proof of what was preserved. */
  untouched: Array<{ slide: number; elementIds: string[] }>;
}

function slideAt(outline: PresentationOutline, number: number): SlideSpec {
  const slide = outline.slides[number - 1];
  if (!slide) {
    throw new SlideAgentError(
      "PATCH_SLIDE_NOT_FOUND",
      `The deck has ${outline.slides.length} slide(s); this patch targets slide ${number}.`,
      { slide: number, slideCount: outline.slides.length },
    );
  }
  return slide;
}

function elementIn(slide: SlideSpec, slideNumber: number, elementId: string): CanvasElementSpec {
  const found = findElement(slide.canvas ?? [], elementId);
  if (!found) {
    const known = (slide.canvas ?? []).map((element) => element.id);
    throw new SlideAgentError(
      "PATCH_ELEMENT_NOT_FOUND",
      `Slide ${slideNumber} has no element "${elementId}".${known.length ? ` Its elements are: ${known.join(", ")}.` : " It has no canvas elements."}`,
      { slide: slideNumber, elementId, known },
    );
  }
  return found;
}

/** Finds an element by id, descending into groups. */
function findElement(canvas: CanvasElementSpec[], elementId: string): CanvasElementSpec | undefined {
  for (const element of canvas) {
    if (element.id === elementId) return element;
    if (element.type === "group") {
      const nested = findElement(element.children, elementId);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Rebuilds a canvas with one element replaced or removed, groups included. */
function mapElement(
  canvas: CanvasElementSpec[],
  elementId: string,
  change: (element: CanvasElementSpec) => CanvasElementSpec | undefined,
): CanvasElementSpec[] {
  const next: CanvasElementSpec[] = [];
  for (const element of canvas) {
    if (element.id === elementId) {
      const replaced = change(element);
      if (replaced) next.push(replaced);
      continue;
    }
    if (element.type === "group") {
      next.push({ ...element, children: mapElement(element.children, elementId, change) });
      continue;
    }
    next.push(element);
  }
  return next;
}

function allElementIds(canvas: CanvasElementSpec[] | undefined): string[] {
  const ids: string[] = [];
  for (const element of canvas ?? []) {
    ids.push(element.id);
    if (element.type === "group") ids.push(...allElementIds(element.children));
  }
  return ids;
}

function matches(element: CanvasElementSpec, selector: { role?: string; layer?: string; type?: string; elementIds?: string[] }): boolean {
  if (selector.elementIds && !selector.elementIds.includes(element.id)) return false;
  if (selector.role && element.role !== selector.role) return false;
  if (selector.layer && element.layer !== selector.layer) return false;
  if (selector.type && element.type !== selector.type) return false;
  return Boolean(selector.elementIds || selector.role || selector.layer || selector.type);
}

/**
 * Applies operations in order and reports exactly what changed.
 *
 * The outline is never mutated: the caller keeps its original, which is what
 * makes `--dry-run` a real preview rather than a promise.
 */
export function patchOutline(original: PresentationOutline, operations: PatchOperation[]): PatchResult {
  let outline: PresentationOutline = { ...original, slides: [...original.slides] };
  const changes: PatchChange[] = [];
  const touched = new Map<number, Set<string>>();
  const markTouched = (slide: number, elementId: string) => {
    touched.set(slide, (touched.get(slide) ?? new Set()).add(elementId));
  };

  const replaceSlide = (number: number, slide: SlideSpec) => {
    const slides = [...outline.slides];
    slides[number - 1] = slide;
    outline = { ...outline, slides };
  };

  for (const operation of operations) {
    switch (operation.op) {
      case "add-element": {
        const slide = slideAt(outline, operation.slide);
        const canvas = [...(slide.canvas ?? [])];
        if (canvas.some((element) => element.id === operation.element.id)) {
          throw new SlideAgentError(
            "PATCH_DUPLICATE_ELEMENT_ID",
            `Slide ${operation.slide} already has an element called "${operation.element.id}". Element ids must be unique within a slide because every other operation addresses them by id.`,
            { slide: operation.slide, elementId: operation.element.id },
          );
        }
        canvas.splice(operation.index ?? canvas.length, 0, operation.element);
        replaceSlide(operation.slide, { ...slide, canvas });
        markTouched(operation.slide, operation.element.id);
        changes.push({
          op: operation.op,
          slide: operation.slide,
          elementId: operation.element.id,
          after: operation.element,
          description: `Added ${operation.element.type} "${operation.element.id}" to slide ${operation.slide}.`,
        });
        break;
      }
      case "remove-element": {
        const slide = slideAt(outline, operation.slide);
        const existing = elementIn(slide, operation.slide, operation.elementId);
        replaceSlide(operation.slide, {
          ...slide,
          canvas: mapElement(slide.canvas ?? [], operation.elementId, () => undefined),
        });
        markTouched(operation.slide, operation.elementId);
        changes.push({
          op: operation.op,
          slide: operation.slide,
          elementId: operation.elementId,
          before: existing,
          description: `Removed ${existing.type} "${operation.elementId}" from slide ${operation.slide}.`,
        });
        break;
      }
      case "update-text": {
        const slide = slideAt(outline, operation.slide);
        const existing = elementIn(slide, operation.slide, operation.elementId);
        if (existing.type !== "text") {
          throw new SlideAgentError(
            "PATCH_WRONG_ELEMENT_TYPE",
            `"${operation.elementId}" on slide ${operation.slide} is a ${existing.type} element, so it has no text to update.`,
            { slide: operation.slide, elementId: operation.elementId, type: existing.type },
          );
        }
        const before = existing.text ?? existing.runs?.map((run) => run.text).join("");
        replaceSlide(operation.slide, {
          ...slide,
          canvas: mapElement(slide.canvas ?? [], operation.elementId, (element) => ({
            ...element,
            ...(operation.text !== undefined ? { text: operation.text, runs: undefined } : {}),
            ...(operation.runs !== undefined ? { runs: operation.runs, text: undefined } : {}),
          } as CanvasElementSpec)),
        });
        markTouched(operation.slide, operation.elementId);
        changes.push({
          op: operation.op,
          slide: operation.slide,
          elementId: operation.elementId,
          property: "text",
          before,
          after: operation.text ?? operation.runs?.map((run) => run.text).join(""),
          description: `Rewrote the text of "${operation.elementId}" on slide ${operation.slide}.`,
        });
        break;
      }
      case "update-style": {
        const slide = slideAt(outline, operation.slide);
        const existing = elementIn(slide, operation.slide, operation.elementId) as CanvasElementSpec & { style?: Record<string, unknown> };
        replaceSlide(operation.slide, {
          ...slide,
          canvas: mapElement(slide.canvas ?? [], operation.elementId, (element) => ({
            ...element,
            style: operation.replace
              ? operation.style
              : { ...((element as { style?: Record<string, unknown> }).style ?? {}), ...operation.style },
          } as CanvasElementSpec)),
        });
        markTouched(operation.slide, operation.elementId);
        changes.push({
          op: operation.op,
          slide: operation.slide,
          elementId: operation.elementId,
          property: "style",
          before: existing.style,
          after: operation.replace ? operation.style : { ...(existing.style ?? {}), ...operation.style },
          description: `${operation.replace ? "Replaced" : "Merged"} the style of "${operation.elementId}" on slide ${operation.slide}.`,
        });
        break;
      }
      case "update-bbox": {
        const slide = slideAt(outline, operation.slide);
        const existing = elementIn(slide, operation.slide, operation.elementId);
        const [x, y, w, h] = operation.bbox;
        replaceSlide(operation.slide, {
          ...slide,
          canvas: mapElement(slide.canvas ?? [], operation.elementId, (element) => ({ ...element, x, y, w, h })),
        });
        markTouched(operation.slide, operation.elementId);
        changes.push({
          op: operation.op,
          slide: operation.slide,
          elementId: operation.elementId,
          property: "bbox",
          before: [existing.x, existing.y, existing.w, existing.h],
          after: operation.bbox,
          description: `Moved "${operation.elementId}" on slide ${operation.slide}.`,
        });
        break;
      }
      case "update-z-index": {
        const slide = slideAt(outline, operation.slide);
        const existing = elementIn(slide, operation.slide, operation.elementId);
        replaceSlide(operation.slide, {
          ...slide,
          canvas: mapElement(slide.canvas ?? [], operation.elementId, (element) => ({ ...element, zIndex: operation.zIndex })),
        });
        markTouched(operation.slide, operation.elementId);
        changes.push({
          op: operation.op,
          slide: operation.slide,
          elementId: operation.elementId,
          property: "zIndex",
          before: existing.zIndex,
          after: operation.zIndex,
          description: `Restacked "${operation.elementId}" on slide ${operation.slide}.`,
        });
        break;
      }
      case "update-provenance": {
        const slide = slideAt(outline, operation.slide);
        const existing = elementIn(slide, operation.slide, operation.elementId) as CanvasElementSpec & { provenance?: Record<string, unknown> };
        replaceSlide(operation.slide, {
          ...slide,
          canvas: mapElement(slide.canvas ?? [], operation.elementId, (element) => ({
            ...element,
            provenance: { ...((element as { provenance?: Record<string, unknown> }).provenance ?? {}), ...operation.provenance },
          } as CanvasElementSpec)),
        });
        markTouched(operation.slide, operation.elementId);
        changes.push({
          op: operation.op,
          slide: operation.slide,
          elementId: operation.elementId,
          property: "provenance",
          before: existing.provenance,
          after: { ...(existing.provenance ?? {}), ...operation.provenance },
          description: `Updated the provenance of "${operation.elementId}" on slide ${operation.slide}.`,
        });
        break;
      }
      case "update-slide": {
        const slide = slideAt(outline, operation.slide);
        const { op: _op, slide: _slide, ...fields } = operation;
        const before: Record<string, unknown> = {};
        for (const key of Object.keys(fields)) before[key] = (slide as unknown as Record<string, unknown>)[key];
        replaceSlide(operation.slide, { ...slide, ...fields });
        changes.push({
          op: operation.op,
          slide: operation.slide,
          before,
          after: fields,
          description: `Updated slide ${operation.slide}: ${Object.keys(fields).join(", ")}.`,
        });
        break;
      }
      case "update-claims": {
        const before = outline.claims;
        outline = { ...outline, claims: operation.claims };
        changes.push({
          op: operation.op,
          before,
          after: operation.claims,
          description: `Replaced the claim ledger with ${operation.claims.length} entr${operation.claims.length === 1 ? "y" : "ies"}.`,
        });
        break;
      }
      case "apply-style-system": {
        const targets = operation.slide ? [operation.slide] : outline.slides.map((_, index) => index + 1);
        let matched = 0;
        for (const number of targets) {
          const slide = outline.slides[number - 1];
          if (!slide?.canvas) continue;
          const apply = (canvas: CanvasElementSpec[]): CanvasElementSpec[] => canvas.map((element) => {
            if (element.type === "group") return { ...element, children: apply(element.children) };
            if (!matches(element, operation.selector)) return element;
            matched += 1;
            markTouched(number, element.id);
            return {
              ...element,
              ...(operation.styleRef !== undefined ? { styleRef: operation.styleRef } : {}),
              ...(operation.style
                ? { style: { ...((element as { style?: Record<string, unknown> }).style ?? {}), ...operation.style } }
                : {}),
            } as CanvasElementSpec;
          });
          replaceSlide(number, { ...slide, canvas: apply(slide.canvas) });
        }
        changes.push({
          op: operation.op,
          ...(operation.slide ? { slide: operation.slide } : {}),
          after: { styleRef: operation.styleRef, style: operation.style },
          description: `Applied a style-system change to ${matched} element(s) matching ${JSON.stringify(operation.selector)}.`,
        });
        break;
      }
    }
  }

  const untouched = outline.slides.map((slide, index) => {
    const number = index + 1;
    const changed = touched.get(number) ?? new Set<string>();
    return { slide: number, elementIds: allElementIds(slide.canvas).filter((id) => !changed.has(id)) };
  });

  return { outline, changes, untouched };
}

/** A compact, human- and model-readable summary of what a patch did. */
export function formatPatchDiff(result: PatchResult): string {
  if (result.changes.length === 0) return "No changes.";
  const lines = result.changes.map((change) => {
    const target = change.elementId ? ` ${change.elementId}` : "";
    const where = change.slide ? ` (slide ${change.slide})` : "";
    const detail = change.property && change.before !== undefined
      ? `\n    ${change.property}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`
      : "";
    return `  ${change.op}${target}${where}: ${change.description}${detail}`;
  });
  const preserved = result.untouched.reduce((sum, slide) => sum + slide.elementIds.length, 0);
  return [...lines, "", `${preserved} element(s) left exactly as they were.`].join("\n");
}
