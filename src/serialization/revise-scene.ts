import { ELEMENT_RECORD_KINDS } from "../contract/index.js";
import { SlideAgentError } from "../utils/errors.js";

type JsonRecord = Record<string, unknown>;

function parseRecords(text: string, what: string): JsonRecord[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record must be a JSON object");
      return [value as JsonRecord];
    } catch (error) {
      throw new SlideAgentError("SCENE_PARSE_FAILED", `${what} line ${index + 1} is not a valid NDJSON record: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function recordSlide(record: JsonRecord): number | undefined {
  return typeof record.slide === "number" ? record.slide : undefined;
}

/** Records that belong to a slide, in the order a scene file expects them. */
function orderWithinSlide(record: JsonRecord): number {
  if (record.kind === "slide") return 0;
  if (record.kind === "notes") return 2;
  return 1;
}

export interface ReviseSceneResult {
  scene: string;
  /** How many records the revision replaced, and how many it introduced. */
  replaced: number;
  added: number;
}

/**
 * Splices a revised slide into an existing scene.
 *
 * Every other slide's records pass through untouched, which is what makes the
 * rebuilt deck identical outside the revised slide — the reason the scene is
 * worth round-tripping at all.
 */
export function reviseScene(baseScene: string, slide: number, replacement: string): ReviseSceneResult {
  if (!Number.isInteger(slide) || slide < 1) {
    throw new SlideAgentError("INVALID_SLIDE_NUMBER", `Slide number must be a positive integer, received ${String(slide)}.`);
  }
  const base = parseRecords(baseScene, "The existing scene");
  const incoming = parseRecords(replacement, "The replacement scene");
  if (incoming.length === 0) {
    throw new SlideAgentError("EMPTY_REVISION", "The replacement contains no records. Return the slide record and its element records.");
  }

  const deck = base.find((record) => record.kind === "deck");
  if (!deck) throw new SlideAgentError("SCENE_MISSING_DECK", "The existing scene has no deck record.");
  const slideNumbers = new Set(base.filter((record) => record.kind === "slide").map(recordSlide));
  if (!slideNumbers.has(slide)) {
    throw new SlideAgentError(
      "SLIDE_NOT_FOUND",
      `The scene has no slide ${slide}. It contains slides ${[...slideNumbers].filter((value) => value !== undefined).sort((a, b) => a! - b!).join(", ")}.`,
    );
  }

  // A replacement may address a different slide number, or none at all. Force
  // every incoming record onto the target so a model cannot damage its
  // neighbours by mislabelling one line.
  const revised: JsonRecord[] = incoming
    .filter((record) => record.kind !== "deck")
    .map((record) => ({ ...record, slide }));
  if (!revised.some((record) => record.kind === "slide")) {
    throw new SlideAgentError(
      "REVISION_MISSING_SLIDE_RECORD",
      `The replacement must include the slide record for slide ${slide}, not only its elements.`,
    );
  }
  const elementCount = revised.filter((record) => (ELEMENT_RECORD_KINDS as readonly string[]).includes(String(record.kind))).length;
  if (elementCount === 0) {
    throw new SlideAgentError("REVISION_HAS_NO_ELEMENTS", `Slide ${slide} would render empty. Include at least one element record.`);
  }

  const kept = base.filter((record) => record.kind === "deck" || recordSlide(record) !== slide);
  const replaced = base.length - kept.length;

  const bySlide = new Map<number, JsonRecord[]>();
  for (const record of [...kept.filter((record) => record.kind !== "deck"), ...revised]) {
    const number = recordSlide(record);
    if (number === undefined) continue;
    bySlide.set(number, [...(bySlide.get(number) ?? []), record]);
  }

  const ordered: JsonRecord[] = [deck];
  for (const number of [...bySlide.keys()].sort((left, right) => left - right)) {
    const records = [...bySlide.get(number)!].sort((left, right) => orderWithinSlide(left) - orderWithinSlide(right));
    ordered.push(...records);
  }

  return {
    scene: `${ordered.map((record) => JSON.stringify(record)).join("\n")}\n`,
    replaced,
    added: revised.length,
  };
}
