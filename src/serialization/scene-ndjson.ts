import type {
  CanvasElementSpec,
  DeckManifest,
  ElementRecord,
  PresentationBrief,
  PresentationOutline,
  SlideSpec,
  SourceCitation,
} from "../types/index.js";
import { readUtf8, writeUtf8 } from "../utils/files.js";

const SCHEMA = "slide-agent.scene/1";

type JsonRecord = Record<string, unknown>;

function elementKind(element: CanvasElementSpec): string {
  return element.type === "text" ? "textbox" : element.type;
}

function elementRecord(element: CanvasElementSpec, slide: number): JsonRecord {
  const { type: _type, x, y, w, h, ...rest } = element;
  return { kind: elementKind(element), slide, bbox: [x, y, w, h], ...rest };
}

function inspectionRecord(element: ElementRecord, slide: number): JsonRecord {
  const { x, y, w, h, type, metadata, ...rest } = element;
  return {
    kind: type === "text" ? "textbox" : type,
    mode: "inspection",
    slide,
    bbox: [x, y, w, h],
    ...rest,
    ...(metadata ? { metadata } : {}),
  };
}

function slideRecord(spec: SlideSpec, slide: number): JsonRecord {
  const { canvas: _canvas, speakerNotes: _speakerNotes, sources: _sources, ...fallbackSpec } = spec;
  if (!spec.canvas) return { kind: "slide", slide, freeform: false, spec: fallbackSpec };
  return {
    kind: "slide",
    slide,
    freeform: true,
    id: spec.id,
    semanticKind: spec.kind,
    title: spec.title,
    ...(spec.subtitle ? { subtitle: spec.subtitle } : {}),
    ...(spec.background ? { background: spec.background } : {}),
    ...(spec.communication ? { communication: spec.communication } : {}),
    ...(spec.designIntent ? { designIntent: spec.designIntent } : {}),
    ...(spec.composition ? { composition: spec.composition } : {}),
  };
}

export function serializeSceneNdjson(outline: PresentationOutline, manifest?: DeckManifest): string {
  const records: JsonRecord[] = [{
    kind: "deck",
    schema: SCHEMA,
    unit: "in",
    brief: outline.brief,
    narrative: outline.narrative,
    ...(outline.completeness ? { completeness: outline.completeness } : {}),
    ...(manifest ? { width: manifest.width, height: manifest.height } : {}),
    ...(outline.creativeDirection ? { creativeDirection: outline.creativeDirection } : {}),
  }];
  outline.slides.forEach((slide, index) => {
    const number = index + 1;
    records.push(slideRecord(slide, number));
    for (const element of slide.canvas ?? []) records.push(elementRecord(element, number));
    if (!slide.canvas && manifest) {
      for (const element of manifest.slides[index]?.elements ?? []) records.push(inspectionRecord(element, number));
    }
    if (slide.speakerNotes?.length || slide.sources?.length) {
      records.push({
        kind: "notes",
        slide: number,
        notes: slide.speakerNotes ?? [],
        sources: slide.sources ?? [],
      });
    }
  });
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function parseLines(text: string): JsonRecord[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record must be a JSON object");
      return [value as JsonRecord];
    } catch (error) {
      throw new Error(`Invalid NDJSON on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function requiredString(record: JsonRecord, key: string, lineDescription: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${lineDescription} requires a non-empty ${key}.`);
  return value;
}

function slideNumber(record: JsonRecord): number {
  const value = record.slide;
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${String(record.kind)} record requires a positive integer slide number.`);
  return Number(value);
}

function canvasElement(record: JsonRecord): CanvasElementSpec {
  const kind = record.kind === "textbox" ? "text" : record.kind;
  if (!(["text", "shape", "connector", "image", "table", "chart", "native-chart"] as unknown[]).includes(kind)) {
    throw new Error(`Unsupported scene element kind: ${String(record.kind)}`);
  }
  const bbox = record.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${String(record.kind)} record requires bbox: [x, y, w, h] in inches.`);
  }
  const { kind: _kind, slide: _slide, bbox: _bbox, ...rest } = record;
  return {
    ...rest,
    id: requiredString(record, "id", `${String(record.kind)} record`),
    type: kind,
    x: bbox[0],
    y: bbox[1],
    w: bbox[2],
    h: bbox[3],
  } as CanvasElementSpec;
}

function freeformSlide(record: JsonRecord): SlideSpec {
  return {
    id: requiredString(record, "id", "slide record"),
    kind: requiredString(record, "semanticKind", "slide record"),
    title: requiredString(record, "title", "slide record"),
    ...(typeof record.subtitle === "string" ? { subtitle: record.subtitle } : {}),
    ...(typeof record.background === "string" ? { background: record.background } : {}),
    ...(record.communication && typeof record.communication === "object" && !Array.isArray(record.communication)
      ? { communication: record.communication as SlideSpec["communication"] }
      : {}),
    ...(typeof record.designIntent === "string" ? { designIntent: record.designIntent } : {}),
    ...(typeof record.composition === "string" ? { composition: record.composition } : {}),
    canvas: [],
  };
}

export function parseSceneNdjson(text: string): PresentationOutline {
  const records = parseLines(text);
  const deck = records.find((record) => record.kind === "deck");
  if (!deck) throw new Error("Scene NDJSON requires one deck record.");
  if (deck.schema !== SCHEMA) throw new Error(`Unsupported scene schema: ${String(deck.schema ?? "missing")}. Expected ${SCHEMA}.`);
  if (!deck.brief || typeof deck.brief !== "object" || Array.isArray(deck.brief)) throw new Error("Deck record requires a complete brief object.");
  if (typeof deck.narrative !== "string") throw new Error("Deck record requires a narrative string.");

  const slideRecords = records.filter((record) => record.kind === "slide")
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  if (slideRecords.length === 0) throw new Error("Scene NDJSON requires at least one slide record.");
  const seen = new Set<number>();
  const slides = slideRecords.map((record) => {
    const number = slideNumber(record);
    if (seen.has(number)) throw new Error(`Duplicate slide record for slide ${number}.`);
    seen.add(number);
    if (record.freeform === false) {
      if (!record.spec || typeof record.spec !== "object" || Array.isArray(record.spec)) throw new Error(`Fallback slide ${number} requires spec.`);
      return record.spec as unknown as SlideSpec;
    }
    return freeformSlide(record);
  });
  const byNumber = new Map(slideRecords.map((record, index) => [slideNumber(record), slides[index]!]));

  for (const record of records) {
    if (record.mode === "inspection") continue;
    if (!["textbox", "text", "shape", "connector", "image", "table", "chart", "native-chart"].includes(String(record.kind))) continue;
    const number = slideNumber(record);
    const slide = byNumber.get(number);
    if (!slide) throw new Error(`${String(record.kind)} record references missing slide ${number}.`);
    if (!slide.canvas) throw new Error(`${String(record.kind)} record cannot target fallback slide ${number}.`);
    slide.canvas.push(canvasElement(record));
  }

  for (const record of records.filter((candidate) => candidate.kind === "notes")) {
    const number = slideNumber(record);
    const slide = byNumber.get(number);
    if (!slide) throw new Error(`Notes record references missing slide ${number}.`);
    if (Array.isArray(record.notes)) slide.speakerNotes = record.notes.filter((value): value is string => typeof value === "string");
    if (Array.isArray(record.sources)) slide.sources = record.sources.filter((value): value is SourceCitation => Boolean(value) && typeof value === "object") as SourceCitation[];
  }

  const brief = deck.brief as unknown as PresentationBrief;
  return {
    brief: { ...brief, slideCount: slides.length },
    narrative: deck.narrative,
    ...(deck.completeness && typeof deck.completeness === "object" && !Array.isArray(deck.completeness)
      ? { completeness: deck.completeness }
      : {}),
    ...(deck.creativeDirection && typeof deck.creativeDirection === "object" && !Array.isArray(deck.creativeDirection)
      ? { creativeDirection: deck.creativeDirection }
      : {}),
    slides,
  } as PresentationOutline;
}

export async function readSceneNdjson(filePath: string): Promise<PresentationOutline> {
  return parseSceneNdjson(await readUtf8(filePath));
}

export async function writeSceneNdjson(filePath: string, outline: PresentationOutline, manifest?: DeckManifest): Promise<string> {
  return writeUtf8(filePath, serializeSceneNdjson(outline, manifest));
}
