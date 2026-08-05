import type { DeckManifest, ElementRecord, SlideManifest } from "../types/index.js";

/**
 * A semantic comparison of two decks.
 *
 * A binary diff of two .pptx files is useless — the ZIP changes on every
 * rebuild. What a reviewer needs is which slides changed and how, which the
 * manifest can answer because it records what was placed and where.
 */

export type ChangeKind = "added" | "removed" | "changed" | "moved" | "unchanged";

export interface ElementChange {
  id: string;
  name: string;
  kind: Exclude<ChangeKind, "unchanged">;
  /** Field-level differences, for `changed`. */
  fields?: string[];
  before?: { text?: string; x: number; y: number; w: number; h: number };
  after?: { text?: string; x: number; y: number; w: number; h: number };
}

export interface SlideDiff {
  number: number;
  kind: ChangeKind;
  title: { before?: string; after?: string };
  elements: ElementChange[];
  summary: string;
}

export interface DeckDiff {
  slides: SlideDiff[];
  summary: {
    slidesAdded: number;
    slidesRemoved: number;
    slidesChanged: number;
    slidesUnchanged: number;
    elementsChanged: number;
  };
  /** True when the two decks are semantically identical. */
  identical: boolean;
}

const POSITION_TOLERANCE = 0.01;

function box(element: ElementRecord): { text?: string; x: number; y: number; w: number; h: number } {
  return {
    ...(element.text === undefined ? {} : { text: element.text }),
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
  };
}

function moved(left: ElementRecord, right: ElementRecord): boolean {
  return Math.abs(left.x - right.x) > POSITION_TOLERANCE
    || Math.abs(left.y - right.y) > POSITION_TOLERANCE
    || Math.abs(left.w - right.w) > POSITION_TOLERANCE
    || Math.abs(left.h - right.h) > POSITION_TOLERANCE;
}

function changedFields(left: ElementRecord, right: ElementRecord): string[] {
  const fields: string[] = [];
  if (left.text !== right.text) fields.push("text");
  if (moved(left, right)) fields.push("geometry");
  if (left.fontSize !== right.fontSize) fields.push("fontSize");
  if (left.fontFace !== right.fontFace) fields.push("fontFace");
  if (left.textColor !== right.textColor) fields.push("textColor");
  if (left.fillColor !== right.fillColor) fields.push("fillColor");
  if (left.imagePath !== right.imagePath) fields.push("image");
  if (JSON.stringify(left.metadata) !== JSON.stringify(right.metadata)) fields.push("data");
  return fields;
}

function diffElements(before: SlideManifest, after: SlideManifest): ElementChange[] {
  // Match on name rather than id: ids carry a sequence prefix that shifts when
  // anything before them changes, which would report a whole slide as rewritten
  // after a single insertion.
  const beforeByName = new Map(before.elements.map((element) => [element.name, element]));
  const afterByName = new Map(after.elements.map((element) => [element.name, element]));
  const changes: ElementChange[] = [];

  for (const [name, element] of beforeByName) {
    const counterpart = afterByName.get(name);
    if (!counterpart) {
      changes.push({ id: element.id, name, kind: "removed", before: box(element) });
      continue;
    }
    const fields = changedFields(element, counterpart);
    if (fields.length === 0) continue;
    changes.push({
      id: counterpart.id,
      name,
      kind: fields.length === 1 && fields[0] === "geometry" ? "moved" : "changed",
      fields,
      before: box(element),
      after: box(counterpart),
    });
  }

  for (const [name, element] of afterByName) {
    if (!beforeByName.has(name)) changes.push({ id: element.id, name, kind: "added", after: box(element) });
  }

  return changes;
}

function describe(slide: SlideDiff): string {
  if (slide.kind === "added") return `Slide ${slide.number} added: "${slide.title.after ?? ""}".`;
  if (slide.kind === "removed") return `Slide ${slide.number} removed: "${slide.title.before ?? ""}".`;
  if (slide.kind === "unchanged") return `Slide ${slide.number} unchanged.`;
  const counts = slide.elements.reduce<Record<string, number>>((totals, change) => {
    totals[change.kind] = (totals[change.kind] ?? 0) + 1;
    return totals;
  }, {});
  const parts = Object.entries(counts).map(([kind, count]) => `${count} ${kind}`);
  const retitled = slide.title.before !== slide.title.after ? ", retitled" : "";
  return `Slide ${slide.number}: ${parts.join(", ") || "no element changes"}${retitled}.`;
}

export function diffDecks(before: DeckManifest, after: DeckManifest): DeckDiff {
  const slides: SlideDiff[] = [];
  const count = Math.max(before.slides.length, after.slides.length);

  for (let index = 0; index < count; index += 1) {
    const left = before.slides[index];
    const right = after.slides[index];
    const number = index + 1;

    if (!left && right) {
      slides.push({ number, kind: "added", title: { after: right.title }, elements: [], summary: "" });
      continue;
    }
    if (left && !right) {
      slides.push({ number, kind: "removed", title: { before: left.title }, elements: [], summary: "" });
      continue;
    }
    if (!left || !right) continue;

    const elements = diffElements(left, right);
    const titleChanged = left.title !== right.title;
    slides.push({
      number,
      kind: elements.length === 0 && !titleChanged ? "unchanged" : "changed",
      title: { before: left.title, after: right.title },
      elements,
      summary: "",
    });
  }

  for (const slide of slides) slide.summary = describe(slide);

  return {
    slides,
    summary: {
      slidesAdded: slides.filter((slide) => slide.kind === "added").length,
      slidesRemoved: slides.filter((slide) => slide.kind === "removed").length,
      slidesChanged: slides.filter((slide) => slide.kind === "changed").length,
      slidesUnchanged: slides.filter((slide) => slide.kind === "unchanged").length,
      elementsChanged: slides.reduce((total, slide) => total + slide.elements.length, 0),
    },
    identical: slides.every((slide) => slide.kind === "unchanged"),
  };
}

export function formatDiff(diff: DeckDiff): string {
  if (diff.identical) return "The two decks are semantically identical.";
  const lines: string[] = [];
  for (const slide of diff.slides) {
    if (slide.kind === "unchanged") continue;
    lines.push(slide.summary);
    for (const change of slide.elements.slice(0, 8)) {
      const detail = change.fields?.length ? ` (${change.fields.join(", ")})` : "";
      lines.push(`    ${change.kind.padEnd(8)} ${change.name}${detail}`);
    }
    if (slide.elements.length > 8) lines.push(`    … and ${slide.elements.length - 8} more`);
  }
  const { slidesAdded, slidesRemoved, slidesChanged, elementsChanged } = diff.summary;
  lines.push("", `${slidesChanged} slide(s) changed, ${slidesAdded} added, ${slidesRemoved} removed; ${elementsChanged} element change(s).`);
  return lines.join("\n");
}
