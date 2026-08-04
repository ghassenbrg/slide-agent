import { z } from "zod";

import {
  creativeDirectionSchema,
  presentationBriefSchema,
  presentationOutlineSchema,
} from "../contract/index.js";
import type { StructuredAgentRequest } from "./index.js";

const chartSeries = z.object({ name: z.string(), values: z.array(z.number()) });
const editOperation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("replace-text"), find: z.string(), replace: z.string(), slide: z.number().int().positive().optional(), replaceAll: z.boolean().optional() }),
  z.object({ type: z.literal("remove-slide"), slide: z.number().int().positive() }),
  z.object({ type: z.enum(["duplicate-slide", "add-slide"]), slide: z.number().int().positive(), insertAt: z.number().int().positive().optional(), replacements: z.array(z.object({ find: z.string(), replace: z.string() })).optional() }),
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
});

export const structuredRequestSchema = z.discriminatedUnion("command", [createRequest, editRequest, renderRequest, validateRequest]);

export function parseStructuredRequest(value: unknown): StructuredAgentRequest {
  return structuredRequestSchema.parse(value) as StructuredAgentRequest;
}
