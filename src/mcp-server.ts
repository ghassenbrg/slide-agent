#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { runDoctor } from "./doctor.js";
import { SlideAgent } from "./pipeline.js";
import { parseStructuredRequest } from "./types/schemas.js";
import type { AgentResult } from "./types/index.js";
import { VERSION } from "./version.js";

function toolResult(result: AgentResult | unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    isError,
  };
}

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: "slide-agent", version: VERSION },
    {
      instructions: "Use slide_agent_run for complete model-authored outlines/scenes. Use the convenience tools for prompt creation, editing, rendering, validation, or installation diagnostics. Preserve editable native PowerPoint elements and inspect validation results before claiming success.",
    },
  );

  server.registerTool("slide_agent_run", {
    title: "Run Slide Agent",
    description: "Execute a complete structured Slide Agent request. This is the unrestricted interface for model-authored creativeDirection, outlines, freeform canvases, native charts, and NDJSON scenes.",
    inputSchema: z.object({ request: z.record(z.string(), z.unknown()) }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ request }) => {
    const result = await new SlideAgent().execute(parseStructuredRequest(request));
    return toolResult(result, result.status === "error");
  });

  server.registerTool("create_presentation", {
    title: "Create PowerPoint presentation",
    description: "Create, structurally validate, and repair an editable PowerPoint presentation from a natural-language prompt. Rendering is optional through the render field. Use slide_agent_run for a complete custom outline or freeform scene.",
    inputSchema: z.object({
      prompt: z.string().min(1),
      output: z.string().min(1),
      render: z.boolean().optional(),
      validate: z.boolean().optional(),
      autoFix: z.boolean().optional(),
      maxRetries: z.number().int().min(0).max(10).optional(),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async (input) => {
    const result = await new SlideAgent().create({ command: "create", ...input });
    return toolResult(result, result.status === "error");
  });

  server.registerTool("edit_presentation", {
    title: "Edit PowerPoint presentation",
    description: "Safely edit an existing PowerPoint into a different output file while preserving unaffected OOXML content.",
    inputSchema: z.object({
      input: z.string().min(1),
      output: z.string().min(1),
      operations: z.array(z.record(z.string(), z.unknown())).min(1),
      render: z.boolean().optional(),
      validate: z.boolean().optional(),
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async (input) => {
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
  }, async (input) => {
    const result = await new SlideAgent().render({ command: "render", ...input });
    return toolResult(result, result.status === "error");
  });

  server.registerTool("validate_presentation", {
    title: "Validate PowerPoint presentation",
    description: "Validate PPTX package integrity, editability, geometry, and legibility; optionally validate rendered output; write a structured JSON report.",
    inputSchema: z.object({
      input: z.string().min(1),
      report: z.string().min(1),
      manifest: z.string().optional(),
      previewsDir: z.string().optional(),
      render: z.boolean().optional(),
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async (input) => {
    const result = await new SlideAgent().validate({ command: "validate", ...input });
    return toolResult(result, result.status === "error");
  });

  server.registerTool("slide_agent_doctor", {
    title: "Check Slide Agent installation",
    description: "Check required Node.js and skill registrations, plus optional preview-tool availability.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => toolResult(await runDoctor()));

  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await serveStdio(() => buildMcpServer());
}
