import { z } from "zod";

import { canvasElementSchema } from "./schemas.js";

/**
 * Turning the authoring schemas into JSON Schema a model can afford to read.
 *
 * Zod inlines every shared subschema by default, which is correct and
 * unreadable: `canvasElement`'s style object was written out once per element
 * type, and `sceneRecord` then repeated the whole of `canvasElement` per record
 * kind, for 254,937 characters — roughly 64,000 tokens for one resource read.
 *
 * Naming the shared parts fixes the size and breaks the skim: applied
 * uniformly it also hides every discriminant behind an indirection, and the
 * discriminant is the part of a union a reader needs first. So the big objects
 * are published by reference and the small ones are put back where they were
 * used, which is how a scene schema goes from 254,937 characters to 49,175
 * while `{"type":"string","const":"text"}` stays visible in the branch it
 * discriminates.
 */

/**
 * The longest a shared subschema may be and still be written out in place.
 *
 * Set above a bare discriminant and well below any real object. A definition
 * that itself holds a reference is never inlined, whatever its length, because
 * doing so would strand the reference it carries.
 */
export const INLINE_DEFINITION_LIMIT = 160;

export type SchemaNode = Record<string, unknown>;

function isReference(node: unknown): node is { $ref: string } {
  return typeof node === "object" && node !== null && typeof (node as { $ref?: unknown }).$ref === "string";
}

function definitionName(reference: string): string | undefined {
  return reference.startsWith("#/$defs/") ? reference.slice("#/$defs/".length) : undefined;
}

/**
 * Puts the small shared subschemas back where they were used, and drops any
 * definition nothing points at afterwards.
 */
export function inlineSmallDefinitions(schema: SchemaNode): SchemaNode {
  const definitions = (schema.$defs ?? {}) as Record<string, SchemaNode>;
  if (Object.keys(definitions).length === 0) return schema;

  const inlinable = new Set(
    Object.entries(definitions)
      .filter(([, node]) => {
        const serialized = JSON.stringify(node);
        return serialized.length <= INLINE_DEFINITION_LIMIT && !serialized.includes('"$ref"');
      })
      .map(([name]) => name),
  );

  const referenced = new Set<string>();
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (typeof node !== "object" || node === null) return node;
    if (isReference(node)) {
      const name = definitionName(node.$ref);
      if (!name) return node;
      if (inlinable.has(name)) return structuredClone(definitions[name]);
      referenced.add(name);
      return node;
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, rewrite(value)]));
  };

  const { $defs: _generated, ...body } = schema;
  const rewritten = rewrite(body) as SchemaNode;

  // A surviving definition can reference another, so the set has to be closed
  // transitively. `rewrite` adds to `referenced` as it walks, and a JavaScript
  // Set visits entries appended during iteration — so the set is its own
  // worklist and no queue is needed.
  const survivors: Record<string, SchemaNode> = {};
  for (const name of referenced) {
    if (definitions[name]) survivors[name] = rewrite(definitions[name]) as SchemaNode;
  }

  return Object.keys(survivors).length > 0 ? { ...rewritten, $defs: survivors } : rewritten;
}

/**
 * A zod schema as the JSON Schema this project publishes.
 *
 * Both forms are generated and the smaller one wins. Reference reuse is a
 * large saving on the big schemas and a small loss on the little ones, where
 * the definition table costs more than the repetition it replaces — and a
 * schema small enough not to need the indirection is better off without it.
 */
const published = new WeakMap<z.ZodType, SchemaNode>();

export function publishedJsonSchema(schema: z.ZodType): SchemaNode {
  // A pure function of module-level constants, and `canvasCapabilities()` runs
  // it on every capability call — which the MCP instructions tell a model to
  // make first. Generating both forms took 5.5 ms each time for an answer that
  // cannot change.
  const cached = published.get(schema);
  if (cached) return cached;

  const options = { io: "input", unrepresentable: "any" } as const;
  const referenced = inlineSmallDefinitions(z.toJSONSchema(schema, { ...options, reused: "ref" }) as SchemaNode);
  const inlined = z.toJSONSchema(schema, options) as SchemaNode;
  const chosen = JSON.stringify(referenced).length < JSON.stringify(inlined).length ? referenced : inlined;
  published.set(schema, chosen);
  return chosen;
}

/**
 * The published canvas-element schema.
 *
 * Capability discovery reads this rather than generating its own, because
 * capabilities derived from a schema hosts are not served would be a second
 * contract nobody agreed to.
 */
export function publishedCanvasElementSchema(): SchemaNode {
  return publishedJsonSchema(canvasElementSchema);
}
