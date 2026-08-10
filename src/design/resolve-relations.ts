/**
 * Turns relational placement into coordinates, before anything is composed.
 *
 * The solved numbers are what the rest of the system sees: the manifest, the
 * emitted scene, patch-by-id, and the round-trip all deal in inches exactly as
 * they did before. A relation is a way to *say* where something goes, not a new
 * concept every consumer has to learn — which is also why an element that
 * states one is rewritten rather than annotated.
 *
 * Resolution is a single forward pass in declaration order, so an element may
 * only relate to something already placed. That rules out cycles by
 * construction instead of detecting them, and it gives an author a rule they
 * can hold in their head: things depend on what came before them.
 */
import type { CanvasElementSpec, SlideSpec } from "../types/index.js";
import { solveFrame, type SolvedFrame } from "./relations.js";

function resolveList(
  canvas: CanvasElementSpec[],
  solved: Map<string, SolvedFrame>,
  slideId: string,
): CanvasElementSpec[] {
  return canvas.map((element) => {
    const place = element.place;
    let frame: SolvedFrame = {
      x: element.x ?? 0,
      y: element.y ?? 0,
      w: element.w ?? 0,
      h: element.h ?? 0,
    };
    if (place) {
      frame = solveFrame(
        {
          x: place.x ?? frame.x,
          y: place.y ?? frame.y,
          w: place.w ?? frame.w,
          h: place.h ?? frame.h,
        },
        solved,
        `Slide "${slideId}" element "${element.id}"`,
      );
    }
    solved.set(element.id, frame);

    // Children resolve in their own coordinate space, against their siblings.
    const children = element.type === "group" && element.children.length
      ? resolveList(element.children, new Map(), slideId)
      : undefined;

    if (!place && !children) return element;
    const { place: _place, ...rest } = element as CanvasElementSpec & { place?: unknown };
    return {
      ...rest,
      ...(element.type === "connector" && element.from !== undefined && element.to !== undefined ? {} : frame),
      ...(children ? { children } : {}),
    } as CanvasElementSpec;
  });
}

/** Rewrites a slide's canvas with every relation solved into inches. */
export function resolveSlideRelations(spec: SlideSpec): SlideSpec {
  if (!spec.canvas?.length) return spec;
  const uses = (elements: CanvasElementSpec[]): boolean => elements.some((element) =>
    element.place !== undefined || (element.type === "group" && uses(element.children)));
  if (!uses(spec.canvas)) return spec;
  return { ...spec, canvas: resolveList(spec.canvas, new Map(), spec.id) };
}
