import { z } from "zod";

import {
  canvasElementSchema,
  chartSpecSchema,
  claimLedgerItemSchema,
  creativeDirectionSchema,
  deckSymbolSchema,
  deckVisualSystemSchema,
  designExplorationSchema,
  hostAuthoringCapabilitiesSchema,
  presentationBriefSchema,
  presentationOutlineSchema,
  sequencePlanItemSchema,
  slideSpecSchema,
  tableSpecSchema,
} from "./schemas.js";
import { sceneRecordSchema } from "./scene.js";
import { publishedJsonSchema } from "./json-schema.js";
import { CONTRACT_VERSION, SCENE_SCHEMA_ID } from "./version.js";

export * from "./schemas.js";
export * from "./scene.js";
export * from "./guide.js";
export * from "./canvas-capabilities.js";
export { INLINE_DEFINITION_LIMIT, inlineSmallDefinitions, publishedJsonSchema, type SchemaNode } from "./json-schema.js";
export {
  CAPABILITY_FACETS,
  capabilityFacets,
  capabilitySummary,
  isCapabilityFacet,
  type CapabilityFacet,
  type CapabilitySummary,
} from "./capability-facets.js";
export { CONTRACT_VERSION, SCENE_SCHEMA_ID, SUPPORTED_CONTRACT_VERSIONS, supportsContractVersion } from "./version.js";

/** Every schema a host may need, addressable by name. */
export const contractSchemas = {
  outline: presentationOutlineSchema,
  brief: presentationBriefSchema,
  slide: slideSpecSchema,
  canvasElement: canvasElementSchema,
  creativeDirection: creativeDirectionSchema,
  visualSystem: deckVisualSystemSchema,
  symbol: deckSymbolSchema,
  exploration: designExplorationSchema,
  sequencePlanItem: sequencePlanItemSchema,
  claim: claimLedgerItemSchema,
  hostCapabilities: hostAuthoringCapabilitiesSchema,
  chart: chartSpecSchema,
  table: tableSpecSchema,
  sceneRecord: sceneRecordSchema,
} as const;

export type ContractSchemaName = keyof typeof contractSchemas;

/**
 * JSON Schema for a named contract schema. This is what an MCP client, an
 * OpenAPI surface, or a structured-output request needs; a model fills in a
 * described schema far better than it guesses at an opaque object.
 *
 * See `json-schema.ts` for why the published form names its shared subschemas
 * and inlines its small ones.
 */
export function contractJsonSchema(name: ContractSchemaName): Record<string, unknown> {
  return publishedJsonSchema(contractSchemas[name]);
}

export function allContractJsonSchemas(): Record<ContractSchemaName, Record<string, unknown>> {
  const entries = Object.keys(contractSchemas).map((name) => [name, contractJsonSchema(name as ContractSchemaName)]);
  return Object.fromEntries(entries) as Record<ContractSchemaName, Record<string, unknown>>;
}

export interface ContractDescriptor {
  contractVersion: string;
  sceneSchema: string;
  schemas: ContractSchemaName[];
}

export function contractDescriptor(): ContractDescriptor {
  return {
    contractVersion: CONTRACT_VERSION,
    sceneSchema: SCENE_SCHEMA_ID,
    schemas: Object.keys(contractSchemas) as ContractSchemaName[],
  };
}

export interface ContractIssue {
  path: string;
  message: string;
}

export class ContractValidationError extends Error {
  public readonly code = "CONTRACT_VALIDATION_FAILED";

  public constructor(public readonly what: string, public readonly issues: ContractIssue[]) {
    super(`${what} does not satisfy the Slide Agent authoring contract:\n${issues.map((issue) => `  ${issue.path || "<root>"}: ${issue.message}`).join("\n")}`);
    this.name = "ContractValidationError";
  }
}

/**
 * Parses `value` against a named schema, reporting every problem with the path
 * that caused it. A model can act on `slides[2].canvas[0].bbox: expected 4
 * numbers`; it cannot act on "invalid outline".
 */
export function parseContract<Name extends ContractSchemaName>(
  name: Name,
  value: unknown,
  what: string = name,
): z.infer<(typeof contractSchemas)[Name]> {
  const result = contractSchemas[name].safeParse(value);
  if (result.success) return result.data as z.infer<(typeof contractSchemas)[Name]>;
  throw new ContractValidationError(what, result.error.issues.map((issue) => ({
    path: issue.path.map((segment) => typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`).join("").replace(/^\./, ""),
    message: issue.message,
  })));
}
