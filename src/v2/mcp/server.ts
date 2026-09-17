import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";

import { assetPath } from "../assets.js";
import { COMMANDS, type CommandContext } from "../commands/registry.js";
import { GRAMMAR, catalog } from "../commands/catalog.js";
import { getRecipe, RECIPES } from "../compose/recipes.js";
import { Engine } from "../engine/engine.js";
import { deckIntent } from "../ir/intent.js";
import { getWorkspaceRoots, setWorkspaceRoots } from "../../security/policy.js";
import { VERSION } from "../../version.js";

/**
 * MCP server v2: seven tools generated from the command registry, plus the
 * resources a host reads before it designs.
 */

export const V2_INSTRUCTIONS = `Slide Agent builds native PowerPoint from your design decisions. You direct; the engine computes.

1. Read slide-agent://grammar (or slides_catalog) once: the composition language, in grid units, roles, and tokens.
2. Write an intent: brief, a visual concept, a design language written for this deck, components for anything repeated, and a composition per slide. Use recipes only where a starting point is good enough.
3. slides_build. Read the verdict: adjustments the engine made (refuse with a pin), choices to answer, rhythm notes. Optional: mode "explore" to compare two design languages on key slides first.
4. slides_view {what:"sheet"} and judge the design against the brief — hierarchy, focus, rhythm, craft, genericness. Overflow, contrast, and bounds are already checked.
5. slides_edit with EditOps (compositions, design language, answers to choices), then slides_finalize for the fidelity render and exports.

Paths are confined to the workspace roots. Previews are previews, not PowerPoint renders.`;

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function examplesDirectory(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [0, 1, 2, 3, 4].map((depth) => path.resolve(moduleDir, ...Array<string>(depth).fill(".."), "examples", "v2"));
  return candidates.find((candidate) => { try { return require_exists(candidate); } catch { return false; } }) ?? path.resolve(path.dirname(assetPath()), "examples", "v2");
}

function require_exists(candidate: string): boolean {
  // Synchronous existence check without importing fs twice at module scope.
  return process.getBuiltinModule("node:fs").existsSync(candidate);
}

export interface V2ServerOptions {
  engine?: Engine;
  context?: Partial<CommandContext>;
  maxInlineImages?: number;
}

export function registerV2(server: McpServer, options: V2ServerOptions = {}): McpServer {
  const engine = options.engine ?? new Engine();
  const context: CommandContext = { engine, ...options.context };
  const maxInline = options.maxInlineImages ?? 6;

  // The client's roots, when it has them, confine every path a tool names.
  const previous = server.server.oninitialized;
  server.server.oninitialized = () => {
    previous?.();
    if (!server.server.getClientCapabilities()?.roots || process.env.SLIDE_AGENT_ROOTS) return;
    server.server.listRoots().then((result) => {
      const roots = result.roots.map((root) => root.uri).filter((uri) => uri.startsWith("file://")).map((uri) => fileURLToPath(uri));
      if (roots.length) setWorkspaceRoots(roots);
    }).catch(() => undefined);
  };

  for (const command of COMMANDS) {
    server.registerTool(command.tool, {
      title: command.title,
      description: command.description,
      inputSchema: command.input as z.ZodObject,
      annotations: command.annotations,
    }, async (input: Record<string, unknown>) => {
      try {
        if (!getWorkspaceRoots()) setWorkspaceRoots([process.cwd()]);
        const result = await (command.run as (input: unknown, context: CommandContext) => Promise<{ payload: Record<string, unknown>; images?: string[]; isError?: boolean }>)(command.input.parse(input), context);
        const content: Array<Record<string, unknown>> = [{ type: "text", text: serialize(result.payload) }];
        const inline = command.name === "view";
        for (const [index, image] of (result.images ?? []).entries()) {
          if (inline && index < maxInline) {
            const bytes = await readFile(image).catch(() => undefined);
            if (bytes) content.push({ type: "image", data: bytes.toString("base64"), mimeType: "image/png" });
          } else {
            content.push({ type: "resource_link", uri: `file://${image}`, name: path.basename(image), mimeType: "image/png", description: "Preview, not a PowerPoint render. slides_view returns it inline." });
          }
        }
        return { content, isError: result.isError ?? false } as never;
      } catch (error) {
        const code = (error as { code?: string }).code;
        return { content: [{ type: "text", text: serialize({ error: { ...(code ? { code } : {}), message: error instanceof Error ? error.message : String(error) } }) }], isError: true } as never;
      }
    });
  }

  server.registerResource("grammar", "slide-agent://grammar", {
    title: "Composition grammar",
    description: "The composition language with worked examples. The most important page to read before writing an intent.",
    mimeType: "text/markdown",
  }, async (uri: URL) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: GRAMMAR }] }));

  server.registerResource("catalog", "slide-agent://catalog", {
    title: "Slide Agent catalog",
    description: "Grammar, starter components, recipes, presets. Byte-stable per version.",
    mimeType: "application/json",
  }, async (uri: URL) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: serialize(catalog()) }] }));

  server.registerResource("intent-schema", "slide-agent://schema/intent", {
    title: "JSON Schema: slide-agent.intent/1",
    description: "The full schema, for validators and structured-output requests — not for reading. Compositions are validated with JSON-pointer findings by the engine.",
    mimeType: "application/schema+json",
  }, async (uri: URL) => ({ contents: [{ uri: uri.href, mimeType: "application/schema+json", text: serialize(z.toJSONSchema(deckIntent, { io: "input", unrepresentable: "any" })) }] }));

  server.registerResource("recipe", new ResourceTemplate("slide-agent://recipes/{family}/{variant}", {
    list: async () => ({ resources: RECIPES.map((recipe) => ({ uri: `slide-agent://recipes/${recipe.id}`, name: recipe.id, description: recipe.summary, mimeType: "application/json" })) }),
  }), {
    title: "Recipe",
    description: "A recipe's slots and composition.",
    mimeType: "application/json",
  }, async (uri: URL, variables: Record<string, string | string[]>) => {
    const recipe = getRecipe(`${String(variables.family)}/${String(variables.variant)}`);
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: serialize(recipe ?? { error: "unknown recipe" }) }] };
  });

  server.registerResource("example", new ResourceTemplate("slide-agent://examples/{name}", {
    list: async () => {
      const names = (await readdir(examplesDirectory()).catch(() => [])).filter((name) => name.endsWith(".intent.json"));
      return { resources: names.map((name) => ({ uri: `slide-agent://examples/${name.replace(/\.intent\.json$/, "")}`, name: name.replace(/\.intent\.json$/, ""), mimeType: "application/json" })) };
    },
  }), {
    title: "Example intent",
    description: "A complete directed intent with its design language.",
    mimeType: "application/json",
  }, async (uri: URL, variables: Record<string, string | string[]>) => {
    const name = String(variables.name).replace(/[^a-z0-9-]/gi, "");
    const text = await readFile(path.join(examplesDirectory(), `${name}.intent.json`), "utf8").catch(() => serialize({ error: "unknown example" }));
    return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
  });

  return server;
}

export function buildV2McpServer(options: V2ServerOptions & { compatV1?: (server: McpServer) => McpServer } = {}): McpServer {
  const server = new McpServer({ name: "slide-agent", version: VERSION }, { instructions: V2_INSTRUCTIONS });
  registerV2(server, options);
  if (options.compatV1) options.compatV1(server);
  return server;
}
