#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import {
  CONTRACT_VERSION,
  SCENE_SCHEMA_ID,
  authoringGuide,
  contractDescriptor,
  contractJsonSchema,
  guideAsMarkdown,
  guideAsPrompt,
  guideSectionIds,
  type ContractSchemaName,
  type GuideSectionId,
} from "./contract/index.js";
import { runDoctor } from "./doctor.js";
import { SlideAgent } from "./pipeline.js";
import { planOutline } from "./planner/index.js";
import { parseStructuredRequest } from "./types/schemas.js";
import type { AgentResult } from "./types/index.js";
import { VERSION } from "./version.js";

function toolResult(result: AgentResult | unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    isError,
  };
}

/**
 * A model that cannot see what it built can only revise from its own
 * assumptions. Slide previews already exist on disk after a render; returning
 * them as MCP image content is what closes render → look → revise for a host
 * that has no filesystem access of its own.
 */
export const PREVIEW_IMAGE_LIMITS = {
  /** Beyond this a long deck costs more context than the look is worth. */
  maximumImages: 20,
  /** Total decoded bytes across all returned previews. */
  maximumTotalBytes: 12 * 1024 * 1024,
};

const PREVIEW_PATTERN = /^slide-(\d+)\.(png|svg)$/i;

function slideOrdinal(file: string): number {
  return Number(PREVIEW_PATTERN.exec(path.basename(file))?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function previewMimeType(file: string): string {
  return file.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png";
}

/**
 * The slide previews a render wrote, in slide order. `render` and `validate`
 * report previews only under `generatedFiles`, while `create` splits them out
 * into `artifacts`, so both lists are consulted. SVG previews are the
 * schematic fallback drawn when LibreOffice is not installed.
 */
export function previewImagePaths(result: AgentResult): string[] {
  const candidates = new Set([...(result.artifacts ?? []), ...(result.generatedFiles ?? [])]);
  return [...candidates]
    .filter((file) => PREVIEW_PATTERN.test(path.basename(file)))
    .sort((left, right) => slideOrdinal(left) - slideOrdinal(right));
}

type ImageContent = { type: "image"; data: string; mimeType: string };

export async function previewImageContent(
  result: AgentResult,
  limits = PREVIEW_IMAGE_LIMITS,
): Promise<{ images: ImageContent[]; omitted: number }> {
  const paths = previewImagePaths(result);
  const images: ImageContent[] = [];
  let budget = limits.maximumTotalBytes;

  for (const file of paths.slice(0, limits.maximumImages)) {
    // A preview is written by this process into its own artifacts directory,
    // but a caller can point `previewsDir` anywhere, so size is checked before
    // the bytes are read rather than after.
    const size = await stat(file).then((entry) => entry.size).catch(() => undefined);
    if (size === undefined || size > budget) break;
    const bytes = await readFile(file).catch(() => undefined);
    if (!bytes) break;
    budget -= bytes.byteLength;
    images.push({ type: "image", data: bytes.toString("base64"), mimeType: previewMimeType(file) });
  }

  return { images, omitted: paths.length - images.length };
}

/**
 * The JSON result plus every slide preview the run produced. `includeImages`
 * defaults to true: a host that cannot display images ignores the blocks, and
 * one that can no longer has to guess what the deck looks like.
 */
async function toolResultWithPreviews(result: AgentResult, includeImages = true) {
  const isError = result.status === "error";
  if (!includeImages) return toolResult(result, isError);

  const { images, omitted } = await previewImageContent(result);
  if (images.length === 0) return toolResult(result, isError);

  const note = omitted > 0
    ? `\n\n${images.length} of ${images.length + omitted} slide previews follow. The rest are on disk under the artifacts directory.`
    : `\n\n${images.length} slide preview${images.length === 1 ? "" : "s"} follow, in slide order.`;

  return {
    content: [
      { type: "text" as const, text: `${JSON.stringify(result, null, 2)}${note}` },
      ...images,
    ],
    isError,
  };
}

const INSTRUCTIONS = `Slide Agent builds editable PowerPoint decks from a design you author.

Read slide-agent://contract/guide first — it is the complete authoring guide —
and slide-agent://capabilities for what this installation can do. Check its
images block before planning a photo-led deck: some installations can only
read local files, and cannot fetch or generate a picture at all.

Then fetch slide-agent://contract/schema/outline (or .../sceneRecord for the
line-oriented format) and design the deck yourself: palette, typography,
composition, diagrams, and every element's coordinates are your decisions.
Call slide_agent_run with that outline or scene.

create_presentation takes only a prompt and returns a structural draft full of
bracketed placeholders. Use it to start, never to finish. Always read the
validation report before reporting success.

Ask for render when you build. Every build, edit, and render tool returns the
slide previews as images: look at them, and revise what reads badly with
revise_presentation rather than reporting a deck you have never seen.`;

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "slide-agent", version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  // ---------------------------------------------------------------- resources
  // Without these an MCP-only host has no way to learn the authoring contract,
  // so it can only reach the prompt path, which produces the weakest output
  // the project can make.

  server.registerResource(
    "contract-descriptor",
    "slide-agent://contract",
    {
      title: "Slide Agent contract",
      description: "Contract version, scene schema id, and the available schemas.",
      mimeType: "application/json",
    },
    async (uri: URL) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(contractDescriptor(), null, 2) }],
    }),
  );

  server.registerResource(
    "authoring-guide",
    "slide-agent://contract/guide",
    {
      title: "Slide Agent authoring guide",
      description: "How to author a deck: art direction, narrative, composition, canvas, scene format, diagrams, data, accessibility, and honesty.",
      mimeType: "text/markdown",
    },
    async (uri: URL) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: guideAsMarkdown() }],
    }),
  );

  for (const section of guideSectionIds()) {
    server.registerResource(
      `guide-${section}`,
      `slide-agent://contract/guide/${section}`,
      {
        title: `Authoring guide: ${authoringGuide(section).sections[0]?.title ?? section}`,
        description: authoringGuide(section).sections[0]?.body[0] ?? section,
        mimeType: "text/markdown",
      },
      async (uri: URL) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: guideAsMarkdown(section) }],
      }),
    );
  }

  for (const name of contractDescriptor().schemas) {
    server.registerResource(
      `schema-${name}`,
      `slide-agent://contract/schema/${name}`,
      {
        title: `JSON Schema: ${name}`,
        description: `The ${name} schema a host must satisfy. Contract version ${CONTRACT_VERSION}.`,
        mimeType: "application/schema+json",
      },
      async (uri: URL) => ({
        contents: [{
          uri: uri.href,
          mimeType: "application/schema+json",
          text: JSON.stringify(contractJsonSchema(name), null, 2),
        }],
      }),
    );
  }

  // ------------------------------------------------------------------ prompts

  server.registerPrompt(
    "author_presentation_scene",
    {
      title: "Author a presentation scene",
      description: `Produce a complete ${SCENE_SCHEMA_ID} NDJSON deck from a brief. This is the high-quality path.`,
      argsSchema: z.object({
        brief: z.string().describe("What the deck is for: audience, objective, content, constraints."),
      }),
    },
    ({ brief }: { brief: string }) => ({
      messages: [{
        role: "user" as const,
        content: { type: "text" as const, text: `${guideAsPrompt()}\n\nBRIEF:\n${brief}` },
      }],
    }),
  );

  server.registerPrompt(
    "revise_presentation_scene",
    {
      title: "Revise one slide of an existing scene",
      description: "Rewrite a single slide's records while preserving the deck's established design system.",
      argsSchema: z.object({
        scene: z.string().describe("The current NDJSON scene, or at least its deck record and the target slide's records."),
        slide: z.string().describe("The 1-based slide number to revise."),
        instruction: z.string().describe("What should change about that slide."),
      }),
    },
    ({ scene, slide, instruction }: { scene: string; slide: string; instruction: string }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `${guideAsPrompt()}\n\nRevise ONLY slide ${slide}. Keep the deck's existing palette, typography, and spatial logic so the revision belongs to this deck. Return the replacement records for that slide as NDJSON — its slide record, its element records, and its notes record if it has one. Do not return records for any other slide, and do not return the deck record.\n\nINSTRUCTION:\n${instruction}\n\nCURRENT SCENE:\n${scene}`,
        },
      }],
    }),
  );

  // -------------------------------------------------------------------- tools

  server.registerTool("slide_agent_run", {
    title: "Run Slide Agent",
    description: "Execute a complete structured request: a model-authored outline, creative direction, freeform canvas, native charts, or NDJSON scene. Read slide-agent://contract/schema/outline first.",
    inputSchema: z.object({
      request: z.looseObject({
        command: z.enum(["create", "edit", "render", "validate", "revise"]),
      }).describe("A structured request. slide-agent://contract carries the full schema for each command."),
      includeImages: z.boolean().optional().describe("Return the rendered slide previews as images. Default true. Requires render."),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ request, includeImages }: { request: Record<string, unknown>; includeImages?: boolean }) => {
    const result = await new SlideAgent().execute(parseStructuredRequest(request));
    return toolResultWithPreviews(result, includeImages);
  });

  // A model that designs a photo-led deck and only then discovers this
  // installation cannot fetch or generate a single image has wasted the whole
  // design. Publish what is possible before it plans.
  server.registerResource(
    "capabilities",
    "slide-agent://capabilities",
    {
      title: "Slide Agent capabilities",
      description: "Diagram grammars, chart renderers, layouts, checks, and how images can reach a slide in this installation.",
      mimeType: "application/json",
    },
    async (uri: URL) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ contractVersion: CONTRACT_VERSION, version: VERSION, ...new SlideAgent().capabilities() }, null, 2),
      }],
    }),
  );

  server.registerTool("get_capabilities", {
    title: "Get Slide Agent capabilities",
    description: "What this installation can do: diagram grammars, chart renderers, layouts, quality checks, and — read this before planning imagery — whether images can be fetched, generated, or only read from local paths.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => toolResult({ contractVersion: CONTRACT_VERSION, version: VERSION, ...new SlideAgent().capabilities() }));

  server.registerTool("get_authoring_contract", {
    title: "Get the Slide Agent authoring contract",
    description: "Return the authoring guide or a JSON Schema. Use this when your host cannot read MCP resources.",
    inputSchema: z.object({
      section: z.string().optional().describe(`One of: ${guideSectionIds().join(", ")}. Omit for the whole guide.`),
      schema: z.string().optional().describe(`One of: ${contractDescriptor().schemas.join(", ")}. Returns that JSON Schema instead of the guide.`),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ section, schema }: { section?: string; schema?: string }) => {
    if (schema) {
      const names = contractDescriptor().schemas as string[];
      if (!names.includes(schema)) return toolResult({ error: `Unknown schema: ${schema}. Available: ${names.join(", ")}.` }, true);
      return toolResult(contractJsonSchema(schema as ContractSchemaName));
    }
    const sections = guideSectionIds() as string[];
    if (section && !sections.includes(section)) {
      return toolResult({ error: `Unknown guide section: ${section}. Available: ${sections.join(", ")}.` }, true);
    }
    return {
      content: [{ type: "text" as const, text: guideAsMarkdown(section as GuideSectionId | undefined) }],
      isError: false,
    };
  });

  server.registerTool("plan_presentation", {
    title: "Plan a presentation",
    description: "Turn a brief into a structural outline skeleton without building anything. Replace its placeholders and add your own art direction, then call slide_agent_run.",
    inputSchema: z.object({
      prompt: z.string().min(1),
      slideCount: z.number().int().min(3).max(60).optional(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ prompt, slideCount }: { prompt: string; slideCount?: number }) => {
    const outline = await planOutline(prompt, slideCount === undefined ? {} : { slideCount });
    return toolResult({
      contractVersion: CONTRACT_VERSION,
      provenance: "template-draft",
      note: "A structural skeleton with bracketed placeholders, not a designed deck. Replace the content, add creativeDirection and per-slide canvases, then call slide_agent_run.",
      outline,
    });
  });

  server.registerTool("create_presentation", {
    title: "Create a draft PowerPoint presentation",
    description: "Build a structural draft from a prompt. The result contains bracketed placeholders and no art direction. For a designed deck, author an outline or scene and use slide_agent_run.",
    inputSchema: z.object({
      prompt: z.string().min(1),
      output: z.string().min(1),
      render: z.boolean().optional(),
      validate: z.boolean().optional(),
      autoFix: z.boolean().optional(),
      maxRetries: z.number().int().min(0).max(10).optional(),
      includeImages: z.boolean().optional().describe("Return the rendered slide previews as images. Default true. Requires render."),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ includeImages, ...input }: { prompt: string; output: string; render?: boolean; validate?: boolean; autoFix?: boolean; maxRetries?: number; includeImages?: boolean }) => {
    const result = await new SlideAgent().create({ command: "create", ...input });
    return toolResultWithPreviews(result, includeImages);
  });

  server.registerTool("revise_presentation", {
    title: "Revise one slide of an existing deck",
    description: "Replace a single slide from the deck's own scene, leaving every other slide unchanged. Pair with the revise_presentation_scene prompt.",
    inputSchema: z.object({
      input: z.string().min(1).describe("The existing .pptx. Its scene blueprint is discovered beside it."),
      output: z.string().min(1),
      slide: z.number().int().positive(),
      sceneNdjson: z.string().min(1).describe("Replacement NDJSON records for that slide only."),
      scene: z.string().optional().describe("Override the scene path when it is not beside the deck."),
      validate: z.boolean().optional(),
      render: z.boolean().optional(),
      includeImages: z.boolean().optional().describe("Return the rendered slide previews as images. Default true. Requires render."),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ includeImages, ...input }: { input: string; output: string; slide: number; sceneNdjson: string; scene?: string; validate?: boolean; render?: boolean; includeImages?: boolean }) => {
    const result = await new SlideAgent().revise({ command: "revise", ...input });
    return toolResultWithPreviews(result, includeImages);
  });

  server.registerTool("edit_presentation", {
    title: "Edit PowerPoint presentation",
    description: "Safely edit an existing PowerPoint into a different output file while preserving unaffected OOXML content.",
    inputSchema: z.object({
      input: z.string().min(1),
      output: z.string().min(1),
      operations: z.array(z.looseObject({ type: z.string() })).min(1)
        .describe("replace-text, remove-slide, duplicate-slide, add-slide, import-slide, reorder-slides, apply-theme, replace-image, update-table, or update-chart."),
      render: z.boolean().optional(),
      validate: z.boolean().optional(),
      includeImages: z.boolean().optional().describe("Return the rendered slide previews as images. Default true. Requires render."),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ includeImages, ...input }: Record<string, unknown> & { includeImages?: boolean }) => {
    const request = parseStructuredRequest({ command: "edit", ...input });
    const result = await new SlideAgent().execute(request);
    return toolResultWithPreviews(result, includeImages);
  });

  server.registerTool("render_presentation", {
    title: "Render PowerPoint presentation",
    description: "Render every slide to PNG previews and a PDF, and return those previews as images so you can see what you built. Look at them before reporting success.",
    inputSchema: z.object({
      input: z.string().min(1),
      output: z.string().min(1),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      includeImages: z.boolean().optional().describe("Return the slide previews as images. Default true."),
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async ({ includeImages, ...input }: { input: string; output: string; width?: number; height?: number; includeImages?: boolean }) => {
    const result = await new SlideAgent().render({ command: "render", ...input });
    return toolResultWithPreviews(result, includeImages);
  });

  server.registerTool("validate_presentation", {
    title: "Validate PowerPoint presentation",
    description: "Validate package integrity, ECMA-376 conformance, geometry, legibility, and accessibility; optionally render; write a structured JSON report.",
    inputSchema: z.object({
      input: z.string().min(1),
      report: z.string().min(1).optional(),
      manifest: z.string().optional(),
      previewsDir: z.string().optional(),
      render: z.boolean().optional(),
      includeImages: z.boolean().optional().describe("Return the rendered slide previews as images. Default true. Requires render."),
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async ({ includeImages, ...input }: { input: string; report?: string; manifest?: string; previewsDir?: string; render?: boolean; includeImages?: boolean }) => {
    const result = await new SlideAgent().validate({ command: "validate", ...input });
    return toolResultWithPreviews(result, includeImages);
  });

  server.registerTool("slide_agent_doctor", {
    title: "Check Slide Agent installation",
    description: "Check Node.js, agent skill registrations, MCP registration, and optional preview-tool availability.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => toolResult(await runDoctor()));

  return server;
}

// npm and npx expose bin entries through symlinks on macOS and Linux, so the
// executed argv path and this module's resolved URL differ; compare realpaths
// or the server would silently exit instead of serving stdio.
function executedDirectly(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (executedDirectly()) {
  await serveStdio(() => buildMcpServer());
}
