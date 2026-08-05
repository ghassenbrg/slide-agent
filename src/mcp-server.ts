#!/usr/bin/env node
import { realpathSync } from "node:fs";
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

const INSTRUCTIONS = `Slide Agent builds editable PowerPoint decks from a design you author.

Read slide-agent://contract/guide first — it is the complete authoring guide.
Then fetch slide-agent://contract/schema/outline (or .../sceneRecord for the
line-oriented format) and design the deck yourself: palette, typography,
composition, diagrams, and every element's coordinates are your decisions.
Call slide_agent_run with that outline or scene.

create_presentation takes only a prompt and returns a structural draft full of
bracketed placeholders. Use it to start, never to finish. Always read the
validation report before reporting success.`;

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
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ request }: { request: Record<string, unknown> }) => {
    const result = await new SlideAgent().execute(parseStructuredRequest(request));
    return toolResult(result, result.status === "error");
  });

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
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async (input: { prompt: string; output: string; render?: boolean; validate?: boolean; autoFix?: boolean; maxRetries?: number }) => {
    const result = await new SlideAgent().create({ command: "create", ...input });
    return toolResult(result, result.status === "error");
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
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async (input: { input: string; output: string; slide: number; sceneNdjson: string; scene?: string; validate?: boolean; render?: boolean }) => {
    const result = await new SlideAgent().revise({ command: "revise", ...input });
    return toolResult(result, result.status === "error");
  });

  server.registerTool("edit_presentation", {
    title: "Edit PowerPoint presentation",
    description: "Safely edit an existing PowerPoint into a different output file while preserving unaffected OOXML content.",
    inputSchema: z.object({
      input: z.string().min(1),
      output: z.string().min(1),
      operations: z.array(z.looseObject({ type: z.string() })).min(1)
        .describe("replace-text, remove-slide, duplicate-slide, add-slide, reorder-slides, apply-theme, replace-image, update-table, or update-chart."),
      render: z.boolean().optional(),
      validate: z.boolean().optional(),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async (input: Record<string, unknown>) => {
    const request = parseStructuredRequest({ command: "edit", ...input });
    const result = await new SlideAgent().execute(request);
    return toolResult(result, result.status === "error");
  });

  server.registerTool("render_presentation", {
    title: "Render PowerPoint presentation",
    description: "Render every slide to PNG previews and a PDF using LibreOffice and Poppler.",
    inputSchema: z.object({
      input: z.string().min(1),
      output: z.string().min(1),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async (input: { input: string; output: string; width?: number; height?: number }) => {
    const result = await new SlideAgent().render({ command: "render", ...input });
    return toolResult(result, result.status === "error");
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
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async (input: { input: string; report?: string; manifest?: string; previewsDir?: string; render?: boolean }) => {
    const result = await new SlideAgent().validate({ command: "validate", ...input });
    return toolResult(result, result.status === "error");
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
