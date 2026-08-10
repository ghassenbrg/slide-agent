import { z } from "zod";

import {
  canvasElementSchema,
  chartSpecSchema,
  claimLedgerItemSchema,
  creativeDirectionSchema,
  deckCompletenessSchema,
  designExplorationSchema,
  hostAuthoringCapabilitiesSchema,
  presentationBriefSchema,
  slideChromeSchema,
  sequencePlanItemSchema,
  slideCommunicationSchema,
  slideSpecSchema,
  sourceCitationSchema,
  sourceLedgerItemSchema,
  tableSpecSchema,
} from "./schemas.js";
import { SCENE_SCHEMA_ID } from "./version.js";

/**
 * `slide-agent.scene/1`: one JSON object per line describing a whole deck.
 *
 * The scene is the durable artifact. It round-trips, so it is what makes
 * slide-level revision, regeneration, and diffing possible; treat it as the
 * contract's primary interchange format rather than a debug dump.
 */

const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()])
  .describe("[x, y, w, h] in inches. Connectors may use a negative w or h for direction.");

export const deckRecordSchema = z.looseObject({
  kind: z.literal("deck"),
  schema: z.literal(SCENE_SCHEMA_ID),
  unit: z.literal("in").optional(),
  brief: presentationBriefSchema,
  narrative: z.string(),
  completeness: deckCompletenessSchema.optional(),
  slideChrome: slideChromeSchema.optional(),
  creativeDirection: creativeDirectionSchema.optional(),
  exploration: designExplorationSchema.optional(),
  sequencePlan: z.array(sequencePlanItemSchema).optional(),
  claims: z.array(claimLedgerItemSchema).optional(),
  sourceLedger: z.array(sourceLedgerItemSchema).optional(),
  hostCapabilities: hostAuthoringCapabilitiesSchema.optional()
    .describe("What the host AI that authored this scene could do. Planning context that survives round-trip."),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

/** A reusable element collection the deck defined for itself. */
export const symbolRecordSchema = z.looseObject({
  kind: z.literal("symbol"),
  id: z.string().min(1),
  w: z.number().positive(),
  h: z.number().positive(),
  elements: z.array(canvasElementSchema).min(1),
  description: z.string().optional(),
});

export const freeformSlideRecordSchema = z.looseObject({
  kind: z.literal("slide"),
  slide: z.number().int().positive(),
  freeform: z.literal(true),
  id: z.string().min(1),
  semanticKind: z.string().min(1),
  title: z.string(),
  subtitle: z.string().optional(),
  background: z.string().optional(),
  communication: slideCommunicationSchema.optional(),
  designIntent: z.string().optional(),
  composition: z.string().optional(),
  chrome: z.union([z.literal(false), z.record(z.string(), z.string())]).optional(),
});

export const fallbackSlideRecordSchema = z.looseObject({
  kind: z.literal("slide"),
  slide: z.number().int().positive(),
  freeform: z.literal(false),
  spec: slideSpecSchema,
});

export const slideRecordSchema = z.union([freeformSlideRecordSchema, fallbackSlideRecordSchema]);

/** Element records use `kind` + `bbox` instead of `type` + x/y/w/h. */
const elementRecordBase = {
  slide: z.number().int().positive(),
  id: z.string().min(1),
  bbox,
  zIndex: z.number().optional(),
  role: z.string().optional(),
  intentionalOverlap: z.boolean().optional(),
  allowOverlapWith: z.array(z.string()).optional(),
  mode: z.literal("inspection").optional().describe("Read-only inventory row; ignored on import."),
};

export const textboxRecordSchema = z.looseObject({ ...elementRecordBase, kind: z.literal("textbox") });
export const groupRecordSchema = z.looseObject({
  ...elementRecordBase,
  kind: z.literal("group"),
  children: z.array(canvasElementSchema).min(1),
});
export const symbolInstanceRecordSchema = z.looseObject({
  ...elementRecordBase,
  kind: z.literal("symbol-instance"),
  symbol: z.string().min(1),
});
export const shapeRecordSchema = z.looseObject({ ...elementRecordBase, kind: z.literal("shape") });
export const connectorRecordSchema = z.looseObject({
  ...elementRecordBase,
  // Anchored connectors carry `from`/`to` instead of a frame, so the bbox that
  // every other record requires is optional here and validated in context.
  bbox: bbox.optional(),
  kind: z.literal("connector"),
});
export const imageRecordSchema = z.looseObject({ ...elementRecordBase, kind: z.literal("image") });
export const tableRecordSchema = z.looseObject({ ...elementRecordBase, kind: z.literal("table"), table: tableSpecSchema.optional() });
export const chartRecordSchema = z.looseObject({ ...elementRecordBase, kind: z.literal("chart"), chart: chartSpecSchema.optional() });
export const nativeChartRecordSchema = z.looseObject({ ...elementRecordBase, kind: z.literal("native-chart") });
export const diagramRecordSchema = z.looseObject({ ...elementRecordBase, kind: z.literal("diagram"), grammar: z.string(), spec: z.record(z.string(), z.unknown()) });

export const notesRecordSchema = z.looseObject({
  kind: z.literal("notes"),
  slide: z.number().int().positive(),
  notes: z.array(z.string()).optional(),
  sources: z.array(sourceCitationSchema).optional(),
});

export const sceneRecordSchema = z.discriminatedUnion("kind", [
  deckRecordSchema,
  symbolRecordSchema,
  freeformSlideRecordSchema,
  fallbackSlideRecordSchema,
  textboxRecordSchema,
  shapeRecordSchema,
  connectorRecordSchema,
  imageRecordSchema,
  tableRecordSchema,
  chartRecordSchema,
  nativeChartRecordSchema,
  diagramRecordSchema,
  groupRecordSchema,
  symbolInstanceRecordSchema,
  notesRecordSchema,
]);

export const ELEMENT_RECORD_KINDS = [
  "textbox", "shape", "connector", "image", "table", "chart",
  "native-chart", "diagram", "group", "symbol-instance",
] as const;

/** Maps a scene record kind onto the canvas element type it becomes. */
export function canvasTypeForRecordKind(kind: string): string | undefined {
  if (kind === "textbox") return "text";
  return (ELEMENT_RECORD_KINDS as readonly string[]).includes(kind) ? kind : undefined;
}

/**
 * Validates one element record as a canvas element, so a scene file gets the
 * same guarantees as an inline outline instead of a looser parallel check.
 */
export function parseSceneElement(record: Record<string, unknown>): Record<string, unknown> {
  const type = canvasTypeForRecordKind(String(record.kind));
  if (!type) throw new Error(`Unsupported scene element kind: ${String(record.kind)}`);
  const bounds = record.bbox;
  const { kind: _kind, slide: _slide, bbox: _bbox, mode: _mode, ...rest } = record;
  // An anchored connector has no frame of its own: it is wherever the two
  // elements it joins turned out to be. Requiring a bbox would mean writing
  // coordinates that the router is about to discard, and reading them back as
  // if they meant something.
  const anchored = type === "connector" && rest.from !== undefined && rest.to !== undefined;
  if (!anchored) {
    if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`${String(record.kind)} record requires bbox: [x, y, w, h] in inches.`);
    }
  }
  const frame = Array.isArray(bounds) && bounds.length === 4 && bounds.every((value) => typeof value === "number" && Number.isFinite(value))
    ? { x: bounds[0], y: bounds[1], w: bounds[2], h: bounds[3] }
    : {};
  return canvasElementSchema.parse({ ...rest, type, ...frame }) as Record<string, unknown>;
}

export type SceneRecord = z.infer<typeof sceneRecordSchema>;
