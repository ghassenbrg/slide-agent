/**
 * Placement stated as a relationship instead of a number.
 *
 * A build script can compute coordinates, so a program does not need this. A
 * hand-authored scene cannot, and that is where alignment quietly becomes a
 * coincidence: every element carries four floats the author worked out, and
 * keeping a caption's left edge on its title's left edge means restating the
 * same number in two places and remembering to change both. The margins in a
 * deck drift for exactly this reason, one edit at a time.
 *
 * So a frame value may say what it is relative to. `{"alignLeft":"title"}` is
 * the title's left edge, whatever that becomes; `{"below":"chart","gap":0.2}`
 * is under the chart, whatever height it ends up.
 *
 * The resolution is deterministic and happens before anything is composed, and
 * the *solved* numbers are what get written into the scene. Nothing downstream
 * — the manifest, patching by id, the clean-directory round-trip — ever sees a
 * relation, so this adds a way to say something rather than a new thing to
 * understand everywhere else.
 */
import { SlideAgentError } from "../utils/errors.js";

/** One edge or size expressed against another element. */
export interface FrameRelation {
  /** Match this element's left edge. */
  alignLeft?: string;
  /** Match this element's right edge (the value becomes an x). */
  alignRight?: string;
  /** Match this element's top edge. */
  alignTop?: string;
  /** Match this element's bottom edge (the value becomes a y). */
  alignBottom?: string;
  /** Centre on this element's horizontal centre. */
  centerX?: string;
  /** Centre on this element's vertical centre. */
  centerY?: string;
  /** Sit below this element. */
  below?: string;
  /** Sit above this element. */
  above?: string;
  /** Sit to the right of this element. */
  rightOf?: string;
  /** Sit to the left of this element. */
  leftOf?: string;
  /** Take this element's width or height, depending on the axis. */
  sameAs?: string;
  /** Span from this element's left edge to `to`'s right edge. */
  spanFrom?: string;
  spanTo?: string;
  /** Distance held from the referenced element, in inches. Defaults to 0. */
  gap?: number;
  /** Added after everything else, in inches. */
  offset?: number;
}

export type FrameValue = number | FrameRelation;

export interface RelativeFrame {
  x?: FrameValue;
  y?: FrameValue;
  w?: FrameValue;
  h?: FrameValue;
}

export interface SolvedFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isRelation(value: unknown): value is FrameRelation {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every element id a frame's relations depend on. */
export function relationDependencies(frame: RelativeFrame): string[] {
  const ids: string[] = [];
  for (const value of [frame.x, frame.y, frame.w, frame.h]) {
    if (!isRelation(value)) continue;
    for (const [key, target] of Object.entries(value)) {
      if (key === "gap" || key === "offset") continue;
      if (typeof target === "string") ids.push(target);
    }
  }
  return ids;
}

type Axis = "x" | "y" | "w" | "h";

function resolveValue(
  axis: Axis,
  value: FrameValue | undefined,
  own: Partial<SolvedFrame>,
  solved: Map<string, SolvedFrame>,
  describe: string,
): number {
  if (typeof value === "number") return value;
  if (value === undefined) return 0;

  const gap = value.gap ?? 0;
  const offset = value.offset ?? 0;
  const target = (id: string): SolvedFrame => {
    const frame = solved.get(id);
    if (!frame) {
      throw new SlideAgentError(
        "UNRESOLVED_RELATION",
        `${describe} is positioned relative to "${id}", which is not an element earlier on this slide. A relation may only reference an element the engine has already placed.`,
        { element: describe, target: id, placed: [...solved.keys()] },
      );
    }
    return frame;
  };

  if (axis === "w" || axis === "h") {
    if (value.sameAs) return (axis === "w" ? target(value.sameAs).w : target(value.sameAs).h) + offset;
    if (value.spanFrom && value.spanTo) {
      const from = target(value.spanFrom);
      const to = target(value.spanTo);
      return axis === "w"
        ? to.x + to.w - from.x + offset
        : to.y + to.h - from.y + offset;
    }
    throw new SlideAgentError(
      "UNRESOLVED_RELATION",
      `${describe} states a ${axis} relation the engine cannot read. A width or height may use sameAs, or spanFrom with spanTo.`,
      { element: describe, axis, relation: value },
    );
  }

  const size = axis === "x" ? own.w ?? 0 : own.h ?? 0;
  if (axis === "x") {
    if (value.alignLeft) return target(value.alignLeft).x + offset;
    if (value.alignRight) return target(value.alignRight).x + target(value.alignRight).w - size + offset;
    if (value.centerX) { const box = target(value.centerX); return box.x + box.w / 2 - size / 2 + offset; }
    if (value.rightOf) { const box = target(value.rightOf); return box.x + box.w + gap + offset; }
    if (value.leftOf) return target(value.leftOf).x - gap - size + offset;
    if (value.spanFrom) return target(value.spanFrom).x + offset;
  } else {
    if (value.alignTop) return target(value.alignTop).y + offset;
    if (value.alignBottom) return target(value.alignBottom).y + target(value.alignBottom).h - size + offset;
    if (value.centerY) { const box = target(value.centerY); return box.y + box.h / 2 - size / 2 + offset; }
    if (value.below) { const box = target(value.below); return box.y + box.h + gap + offset; }
    if (value.above) return target(value.above).y - gap - size + offset;
    if (value.spanFrom) return target(value.spanFrom).y + offset;
  }

  throw new SlideAgentError(
    "UNRESOLVED_RELATION",
    `${describe} states an ${axis} relation the engine cannot read. Use alignLeft, alignRight, centerX, rightOf, leftOf, alignTop, alignBottom, centerY, below, or above.`,
    { element: describe, axis, relation: value },
  );
}

/**
 * Solves one frame against the elements already placed.
 *
 * Size is solved before position, because an element centred on another needs
 * to know how wide it is before it can know where its left edge goes.
 */
export function solveFrame(
  frame: RelativeFrame,
  solved: Map<string, SolvedFrame>,
  describe: string,
): SolvedFrame {
  const own: Partial<SolvedFrame> = {};
  own.w = resolveValue("w", frame.w, own, solved, describe);
  own.h = resolveValue("h", frame.h, own, solved, describe);
  own.x = resolveValue("x", frame.x, own, solved, describe);
  own.y = resolveValue("y", frame.y, own, solved, describe);
  return own as SolvedFrame;
}
