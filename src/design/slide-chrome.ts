/**
 * The furniture every slide carries: a kicker, a slide number, a footer rule,
 * a brand mark.
 *
 * None of it is expensive to design and all of it is expensive to repeat. On a
 * thirteen-slide deck a four-element chrome band is fifty-two more records to
 * write by hand, each with its own coordinates, and the predictable result is
 * that it gets dropped — which is most of why a deck reads as unfinished even
 * when every slide on its own is fine.
 *
 * So the deck states it once, in its own elements, and the engine repeats it.
 * This is deliberately not a house style: Slide Agent ships no chrome, has no
 * opinion about whether a deck should have any, and draws exactly the elements
 * the author wrote. What it supplies is the repetition and the handful of
 * values that differ per slide.
 */
import type { CanvasElementSpec, SlideChrome, SlideSpec } from "../types/index.js";

export interface ChromeContext {
  slideNumber: number;
  slideCount: number;
  deckTitle: string;
}

/** Values a chrome string may interpolate, resolved per slide. */
function tokensFor(spec: SlideSpec, context: ChromeContext): Record<string, string> {
  const overrides = typeof spec.chrome === "object" && spec.chrome !== null ? spec.chrome : {};
  return {
    slideNumber: String(context.slideNumber),
    slideNumberPadded: String(context.slideNumber).padStart(2, "0"),
    slideCount: String(context.slideCount),
    slideTitle: spec.title,
    deckTitle: context.deckTitle,
    ...Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, String(value)])),
  };
}

const TOKEN = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/**
 * The reserved token that selects a chrome variant.
 *
 * Chrome declared once has to survive the deck it belongs to, and alternating
 * a light slide against a dark one is a normal way to pace a sequence — but a
 * kicker legible on graphite is invisible on paper. Rather than make the author
 * choose between chrome and pacing, the deck declares what changes between the
 * two and each slide says which one it is. Only style properties vary; the
 * elements, their text, and their positions stay the single declaration.
 */
const VARIANT = "variant";

/**
 * Substitutes `{{token}}` in every string an element carries.
 *
 * An unknown token resolves to an empty string rather than being left on the
 * slide: `{{kicker}}` showing through on the one slide that never set it is a
 * defect the author would only find by looking, and an empty band is the
 * honest rendering of "this slide has no kicker".
 */
function interpolate(value: unknown, tokens: Record<string, string>): unknown {
  if (typeof value === "string") return value.replace(TOKEN, (_match, name: string) => tokens[name] ?? "");
  if (Array.isArray(value)) return value.map((entry) => interpolate(entry, tokens));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, interpolate(entry, tokens)]));
  }
  return value;
}

/** True when a chrome element resolved to nothing worth drawing. */
function isEmptyText(element: CanvasElementSpec): boolean {
  return element.type === "text" && !element.text?.trim() && !element.runs?.length;
}

/**
 * Returns the slide with its chrome expanded into the canvas.
 *
 * Chrome only applies to a model-authored canvas. A slide built from a fallback
 * layout already has that layout's own furniture, and stacking a second set on
 * top of it would be two designs arguing on one slide.
 */
export function withSlideChrome(spec: SlideSpec, chrome: SlideChrome | undefined, context: ChromeContext): SlideSpec {
  if (!chrome?.elements?.length || !spec.canvas) return spec;
  if (spec.chrome === false) return spec;
  if (chrome.skipSlides?.includes(spec.id)) return spec;

  const prefix = chrome.idPrefix ?? "chrome";
  const tokens = tokensFor(spec, context);
  const variant = tokens[VARIANT] ? chrome.variants?.[tokens[VARIANT]] : undefined;
  const expanded = chrome.elements
    .map((element) => {
      const overrides = variant?.[element.id];
      const styled = overrides
        ? { ...element, style: { ...(element as { style?: Record<string, unknown> }).style, ...overrides } }
        : element;
      return interpolate({ ...styled, id: `${prefix}.${element.id}` }, tokens) as CanvasElementSpec;
    })
    .filter((element) => !isEmptyText(element));

  // Chrome is spliced into the canvas by where it sits, not bolted to the
  // front. Paint order is reading order, so putting a footer at the head of the
  // array makes a screen reader announce the bottom of the slide before its
  // title. Anything above the slide's own content is announced first; anything
  // level with or below it is announced last.
  const contentTop = Math.min(...spec.canvas.map((element) => element.y ?? Number.POSITIVE_INFINITY));
  const above = expanded.filter((element) => (element.y ?? 0) < contentTop);
  const below = expanded.filter((element) => (element.y ?? 0) >= contentTop);
  return { ...spec, canvas: [...above, ...spec.canvas, ...below] };
}
