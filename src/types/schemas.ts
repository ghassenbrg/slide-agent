import { z } from "zod";

import {
  canvasElementSchema,
  claimLedgerItemSchema,
  creativeDirectionSchema,
  presentationBriefSchema,
  presentationOutlineSchema,
  sourceCitationSchema,
} from "../contract/index.js";
import type { StructuredAgentRequest } from "./index.js";

const chartSeries = z.object({ name: z.string(), values: z.array(z.number()) });
const editOperation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("replace-text"), find: z.string(), replace: z.string(), slide: z.number().int().positive().optional(), replaceAll: z.boolean().optional() }),
  z.object({ type: z.literal("remove-slide"), slide: z.number().int().positive() }),
  z.object({ type: z.enum(["duplicate-slide", "add-slide"]), slide: z.number().int().positive(), insertAt: z.number().int().positive().optional(), replacements: z.array(z.object({ find: z.string(), replace: z.string() })).optional() }),
  z.object({ type: z.literal("import-slide"), source: z.string().min(1), slide: z.number().int().positive(), insertAt: z.number().int().positive().optional(), replacements: z.array(z.object({ find: z.string(), replace: z.string() })).optional() }),
  z.object({ type: z.literal("reorder-slides"), order: z.array(z.number().int().positive()) }),
  z.object({ type: z.literal("apply-theme"), colors: z.record(z.string(), z.string()).optional(), headingFont: z.string().optional(), bodyFont: z.string().optional() }),
  z.object({ type: z.literal("replace-image"), slide: z.number().int().positive(), imagePath: z.string(), name: z.string().optional(), relationshipId: z.string().optional() }),
  z.object({ type: z.literal("update-table"), slide: z.number().int().positive(), rows: z.array(z.array(z.union([z.string(), z.number()]))), name: z.string().optional(), tableIndex: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("update-chart"), slide: z.number().int().positive(), chartIndex: z.number().int().nonnegative().optional(), labels: z.array(z.string()), series: z.array(chartSeries) }),
]);

const createRequest = z.object({
  command: z.literal("create"),
  prompt: z.string().optional(),
  // A request-level brief supplies overrides, so every field is optional here.
  // The outline's own brief is validated in full by the contract.
  brief: presentationBriefSchema.partial().optional(),
  // Previously `z.unknown()`, which left the entire high-quality path
  // unvalidated: a malformed outline crashed deep inside the builder with no
  // indication of which field was wrong.
  outline: presentationOutlineSchema.optional(),
  scene: z.string().optional(),
  sceneNdjson: z.string().optional(),
  creativeDirection: creativeDirectionSchema.optional(),
  output: z.string(),
  previewsDir: z.string().optional(),
  reportPath: z.string().optional(),
  metadataPath: z.string().optional(),
  inspectPath: z.string().optional(),
  configDir: z.string().optional(),
  render: z.boolean().optional(),
  validate: z.boolean().optional(),
  autoFix: z.boolean().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  allowRemoteAssets: z.boolean().optional(),
  roundTrip: z.boolean().optional(),
  repair: z.enum(["safe", "suggest", "off"]).optional(),
  assetBaseDir: z.string().optional(),
  brand: z.string().optional(),
  bilingual: z.enum(["parallel", "stacked", "notes"]).optional(),
});

const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const styleBag = z.record(z.string(), z.unknown());

/**
 * Every operation names its slide and its element id. Nothing is matched
 * fuzzily, and nothing is inferred, so a patch either applies to exactly what
 * the author meant or fails with the ids that do exist.
 */
const patchOperation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add-element"), slide: z.number().int().positive(), element: canvasElementSchema, index: z.number().int().nonnegative().optional() }),
  z.object({ op: z.literal("remove-element"), slide: z.number().int().positive(), elementId: z.string().min(1) }),
  z.object({ op: z.literal("update-text"), slide: z.number().int().positive(), elementId: z.string().min(1), text: z.string().optional(), runs: z.array(z.object({ text: z.string(), options: styleBag.optional() })).optional() }),
  z.object({ op: z.literal("update-style"), slide: z.number().int().positive(), elementId: z.string().min(1), style: styleBag, replace: z.boolean().optional() }),
  z.object({ op: z.literal("update-bbox"), slide: z.number().int().positive(), elementId: z.string().min(1), bbox }),
  z.object({ op: z.literal("update-z-index"), slide: z.number().int().positive(), elementId: z.string().min(1), zIndex: z.number() }),
  z.object({ op: z.literal("update-provenance"), slide: z.number().int().positive(), elementId: z.string().min(1), provenance: styleBag }),
  z.object({
    op: z.literal("update-slide"),
    slide: z.number().int().positive(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    designIntent: z.string().optional(),
    composition: z.string().optional(),
    background: z.string().optional(),
    speakerNotes: z.array(z.string()).optional(),
    sources: z.array(sourceCitationSchema).optional(),
  }),
  z.object({ op: z.literal("update-claims"), claims: z.array(claimLedgerItemSchema) }),
  z.object({
    op: z.literal("apply-style-system"),
    slide: z.number().int().positive().optional(),
    selector: z.object({
      role: z.string().optional(),
      layer: z.string().optional(),
      type: z.string().optional(),
      elementIds: z.array(z.string()).optional(),
    }),
    styleRef: z.union([z.string(), z.array(z.string())]).optional(),
    style: styleBag.optional(),
  }),
]);

export const patchOperationSchema = patchOperation;

const patchRequest = z.object({
  command: z.literal("patch"),
  input: z.string(),
  output: z.string(),
  operations: z.array(patchOperation).min(1),
  scene: z.string().optional(),
  /** Report the diff without writing a deck. */
  dryRun: z.boolean().optional(),
  configDir: z.string().optional(),
  render: z.boolean().optional(),
  validate: z.boolean().optional(),
  roundTrip: z.boolean().optional(),
  allowRemoteAssets: z.boolean().optional(),
});

const editRequest = z.object({
  command: z.literal("edit"),
  input: z.string(),
  output: z.string(),
  operations: z.array(editOperation).min(1),
  previewsDir: z.string().optional(),
  beforePreviewsDir: z.string().optional(),
  reportPath: z.string().optional(),
  render: z.boolean().optional(),
  validate: z.boolean().optional(),
  preserveUnsupported: z.boolean().optional(),
  configDir: z.string().optional(),
});

const renderRequest = z.object({
  command: z.literal("render"),
  input: z.string(),
  output: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const validateRequest = z.object({
  command: z.literal("validate"),
  input: z.string(),
  report: z.string().optional(),
  manifest: z.string().optional(),
  previewsDir: z.string().optional(),
  configDir: z.string().optional(),
  render: z.boolean().optional(),
  roundTrip: z.boolean().optional(),
});

const reviseRequest = z.object({
  command: z.literal("revise"),
  input: z.string(),
  output: z.string(),
  slide: z.number().int().positive(),
  sceneNdjson: z.string().min(1),
  scene: z.string().optional(),
  configDir: z.string().optional(),
  render: z.boolean().optional(),
  validate: z.boolean().optional(),
  autoFix: z.boolean().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  allowRemoteAssets: z.boolean().optional(),
});

export const structuredRequestSchema = z.discriminatedUnion("command", [createRequest, editRequest, renderRequest, validateRequest, reviseRequest, patchRequest]);

export function parseStructuredRequest(value: unknown): StructuredAgentRequest {
  return structuredRequestSchema.parse(value) as StructuredAgentRequest;
}
