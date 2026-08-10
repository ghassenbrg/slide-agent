import type {
  CanvasElementSpec,
  DeckManifest,
  DeckSymbol,
  ElementRecord,
  PresentationBrief,
  PresentationOutline,
  SlideSpec,
  SourceCitation,
} from "../types/index.js";
import { readUtf8, writeUtf8 } from "../utils/files.js";
import {
  ContractValidationError,
  ELEMENT_RECORD_KINDS,
  SCENE_SCHEMA_ID,
  parseContract,
  parseSceneElement,
} from "../contract/index.js";

const SCHEMA = SCENE_SCHEMA_ID;

type JsonRecord = Record<string, unknown>;

function elementKind(element: CanvasElementSpec): string {
  return element.type === "text" ? "textbox" : element.type;
}

function elementRecord(element: CanvasElementSpec, slide: number): JsonRecord {
  const { type: _type, x, y, w, h, ...rest } = element;
  // An anchored connector has no frame to emit; writing `[null, null, …]` here
  // would produce a scene the parser refuses to read back.
  const framed = [x, y, w, h].every((value) => typeof value === "number");
  return {
    kind: elementKind(element),
    slide,
    ...(framed ? { bbox: [x, y, w, h] } : {}),
    ...rest,
  };
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
    ...(spec.chrome !== undefined ? { chrome: spec.chrome } : {}),
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
    ...(outline.slideChrome ? { slideChrome: outline.slideChrome } : {}),
    ...(manifest ? { width: manifest.width, height: manifest.height } : {}),
    ...(outline.creativeDirection ? { creativeDirection: outline.creativeDirection } : {}),
    ...(outline.exploration ? { exploration: outline.exploration } : {}),
    ...(outline.sequencePlan?.length ? { sequencePlan: outline.sequencePlan } : {}),
    ...(outline.claims?.length ? { claims: outline.claims } : {}),
    ...(outline.sourceLedger?.length ? { sourceLedger: outline.sourceLedger } : {}),
    ...(outline.hostCapabilities ? { hostCapabilities: outline.hostCapabilities } : {}),
  }];
  // Symbols come before the slides that place them, so a reader can resolve an
  // instance without a second pass.
  for (const symbol of outline.symbols ?? []) {
    records.push({ kind: "symbol", ...symbol });
  }
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

function canvasElement(record: JsonRecord, line: number): CanvasElementSpec {
  try {
    // Scene elements go through the same contract as an inline canvas, so a
    // scene file cannot smuggle in geometry an outline would have rejected.
    return parseSceneElement(record) as unknown as CanvasElementSpec;
  } catch (error) {
    if (error instanceof ContractValidationError) {
      throw new Error(`Scene line ${line} (${String(record.kind)} ${String(record.id ?? "?")}): ${error.issues.map((issue) => `${issue.path || "<root>"} ${issue.message}`).join("; ")}`);
    }
    throw new Error(`Scene line ${line}: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    ...(record.chrome === false || (record.chrome && typeof record.chrome === "object" && !Array.isArray(record.chrome))
      ? { chrome: record.chrome as SlideSpec["chrome"] }
      : {}),
    canvas: [],
  };
}

export function parseSceneNdjson(text: string): PresentationOutline {
  const records = parseLines(text);
  const deck = records.find((record) => record.kind === "deck");
  if (!deck) throw new Error("Scene NDJSON requires one deck record.");
  if (deck.schema !== SCHEMA) throw new Error(`Unsupported scene schema: ${String(deck.schema ?? "missing")}. Expected ${SCHEMA}.`);
  // The deck record carries the whole brief, so validate it against the
  // contract rather than spot-checking two fields and trusting the rest.
  parseContract("brief", deck.brief, "The scene's deck record brief");
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

  records.forEach((record, index) => {
    if (record.mode === "inspection") return;
    if (!(ELEMENT_RECORD_KINDS as readonly string[]).includes(String(record.kind))) return;
    const number = slideNumber(record);
    const slide = byNumber.get(number);
    if (!slide) throw new Error(`${String(record.kind)} record references missing slide ${number}.`);
    if (!slide.canvas) throw new Error(`${String(record.kind)} record cannot target fallback slide ${number}.`);
    slide.canvas.push(canvasElement(record, index + 1));
  });

  for (const record of records.filter((candidate) => candidate.kind === "notes")) {
    const number = slideNumber(record);
    const slide = byNumber.get(number);
    if (!slide) throw new Error(`Notes record references missing slide ${number}.`);
    if (Array.isArray(record.notes)) slide.speakerNotes = record.notes.filter((value): value is string => typeof value === "string");
    if (Array.isArray(record.sources)) slide.sources = record.sources.filter((value): value is SourceCitation => Boolean(value) && typeof value === "object") as SourceCitation[];
  }

  const symbols = records
    .filter((record) => record.kind === "symbol")
    .map((record) => {
      const { kind: _kind, ...rest } = record;
      return rest as unknown as DeckSymbol;
    });

  const brief = deck.brief as unknown as PresentationBrief;
  return {
    brief: { ...brief, slideCount: slides.length },
    narrative: deck.narrative,
    ...(symbols.length ? { symbols } : {}),
    ...(deck.exploration && typeof deck.exploration === "object" ? { exploration: deck.exploration } : {}),
    ...(Array.isArray(deck.sequencePlan) ? { sequencePlan: deck.sequencePlan } : {}),
    ...(Array.isArray(deck.claims) ? { claims: deck.claims } : {}),
    ...(Array.isArray(deck.sourceLedger) ? { sourceLedger: deck.sourceLedger } : {}),
    ...(deck.hostCapabilities && typeof deck.hostCapabilities === "object" ? { hostCapabilities: deck.hostCapabilities } : {}),
    ...(deck.completeness && typeof deck.completeness === "object" && !Array.isArray(deck.completeness)
      ? { completeness: deck.completeness }
      : {}),
    ...(deck.slideChrome && typeof deck.slideChrome === "object" && !Array.isArray(deck.slideChrome)
      ? { slideChrome: deck.slideChrome }
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
