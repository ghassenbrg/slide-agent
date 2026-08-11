#!/usr/bin/env node
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import {
  CONTRACT_VERSION,
  SCENE_SCHEMA_ID,
  authoringGuide,
  capabilityFacets,
  capabilitySummary,
  contractDescriptor,
  contractJsonSchema,
  guideAsMarkdown,
  guideAsPrompt,
  guideSectionIds,
  CAPABILITY_FACETS,
  type ContractSchemaName,
  type GuideSectionId,
} from "./contract/index.js";
import { TokenAccount } from "./evaluation/token-budget.js";
import {
  deliverPreviews,
  isPreviewFile,
  previewNote,
  previewSlideNumber,
  resolveSelection,
  selectPreviews,
  IMAGE_SELECTIONS,
  PREVIEW_TIERS,
  type ImageSelection,
  type ImageDetail,
} from "./rendering/preview-delivery.js";
import { runDoctor } from "./doctor.js";
import { SlideAgent } from "./pipeline.js";
import { planOutline } from "./planner/index.js";
import { parseStructuredRequest } from "./types/schemas.js";
import type { AgentResult } from "./types/index.js";
import { VERSION } from "./version.js";

/**
 * Results are serialized compactly.
 *
 * Indentation was costing roughly 40% of every packet — 56,558 characters
 * against 34,037 for the same ten-slide review — and buying nothing a model
 * reads better for. The one place it is kept is nowhere: JSON is not prose,
 * and this is the payload the release exists to shrink.
 */
function serialize(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * This server's running token total.
 *
 * One server is one session, which is what makes a running total meaningful;
 * two servers in one host process each keep their own.
 */
const account = new TokenAccount();

/** Attaches the price of a text-only result and returns it as tool content. */
function toolResult(result: AgentResult | unknown, isError = false, note?: string) {
  const budget = account.accountFor({ text: result, ...(note ? { note } : {}) });
  const withBudget = typeof result === "object" && result !== null && !Array.isArray(result)
    ? { ...result as Record<string, unknown>, tokenBudget: budget }
    : result;
  return { content: [{ type: "text" as const, text: serialize(withBudget) }], isError };
}

/**
 * Every preview a run wrote, in slide order.
 *
 * `render` and `validate` report previews only under `generatedFiles`, while
 * `create` splits them into `artifacts`, so both lists are consulted.
 */
export function previewImagePaths(result: AgentResult): string[] {
  const candidates = new Set([...(result.artifacts ?? []), ...(result.generatedFiles ?? [])]);
  return [...candidates]
    .filter(isPreviewFile)
    .sort((left, right) => previewSlideNumber(left) - previewSlideNumber(right));
}

/** The preview parameters every rendering tool accepts. */
export interface PreviewOptions {
  images?: ImageSelection;
  imageDetail?: ImageDetail;
  /** Deprecated. `true` means `"all"`, `false` means `"none"`. */
  includeImages?: boolean;
}

/**
 * The JSON result plus the previews the caller actually asked for.
 *
 * The old behaviour was to return every render on every call, which on a
 * twelve-slide deck is 22,128 image tokens whether the call changed one label
 * or rebuilt the deck. What replaces it is a selection the command can usually
 * make for itself, at a resolution chosen for judging composition rather than
 * for reading words — the words are checked off the PDF text layer, exactly,
 * and never read off an image.
 */
async function toolResultWithPreviews(
  payload: unknown,
  evidence: { previews: string[]; changed?: number[] },
  options: PreviewOptions,
  fallback: ImageSelection,
) {
  const isError = (payload as { status?: string }).status === "error";
  const selection = resolveSelection(options.images, options.includeImages, fallback);
  const { previews, changed } = evidence;
  const chosen = selectPreviews({
    previews,
    selection,
    ...(changed ? { changed } : {}),
  });

  const detail = options.imageDetail ?? "review";
  const delivered = await deliverPreviews(chosen.files, {
    detail,
    overview: selection === "overview",
  });
  if (delivered.images.length === 0) {
    return toolResult(payload, isError, previews.length > 0 ? 'No previews returned. images:"all" returns them.' : undefined);
  }

  const note = previewNote(delivered, {
    totalPreviews: previews.length,
    detail,
    selection,
    ...(chosen.degradedFrom ? { degradedFrom: chosen.degradedFrom } : {}),
  });
  const budget = account.accountFor({ text: payload, images: delivered.sizes, note });
  return {
    content: [
      { type: "text" as const, text: `${serialize({ ...payload as object, tokenBudget: budget })}\n\n${note}` },
      ...delivered.images,
    ],
    isError,
  };
}

/** What an `AgentResult` knows about its own renders. */
function evidenceOf(result: AgentResult): { previews: string[]; changed?: number[] } {
  return {
    previews: previewImagePaths(result),
    ...(result.changedSlides ? { changed: result.changedSlides } : {}),
  };
}

/**
 * The `images` and `detail` parameters, plus the default they document.
 *
 * The default is returned alongside the schema rather than written out twice,
 * because the description is what the model reads and the argument is what
 * actually runs — and a documented default that has drifted from the real one
 * is worse than no documentation.
 */
function previewParameters(fallback: ImageSelection, why: string) {
  return {
    fallback,
    schema: {
      images: z.union([z.enum(IMAGE_SELECTIONS), z.array(z.number().int().positive())]).optional()
        .describe(`Which renders to return: "${IMAGE_SELECTIONS.join('", "')}", or a list of slide numbers. Default "${fallback}" — ${why}. "overview" returns every slide as one contact sheet, which costs about one image instead of one per slide.`),
      imageDetail: z.enum(["review", "full"]).optional()
        .describe(`Returned image size. "review" (default, ${PREVIEW_TIERS.review}px) is sized to judge composition and costs roughly half of "full" (${PREVIEW_TIERS.full}px). Text is checked off the PDF text layer either way, so ask for "full" only when the composition itself is in question.`),
      includeImages: z.boolean().optional().describe("Deprecated: use `images`. true means \"all\", false means \"none\"."),
    },
  };
}

const INSTRUCTIONS = `Slide Agent gives you an expressive PowerPoint canvas, preserves what you author
as editable objects, and shows you the render so you can finish well. You design
the deck; it does not supply taste and will not impose a house style.

Call get_capabilities first. Its default answer is a summary: what this machine
can render, and — read this before planning imagery — whether it can source a
picture at all. Ask for include:["canvas"] before you design; that block is the
expressive surface and the answer to "can I build this idea?".

The workflow that produces good decks is not prompt → deck. It is:

  1. read capabilities, then the guide sections you need
  2. research, and write a claim/source ledger
  3. invent at least two visual theses that differ structurally, not in palette
  4. choose one and write a sequence/silhouette plan
  5. author the deck — a build script for anything substantial, NDJSON for short
     decks and patches
  6. build with render enabled
  7. call review_presentation with images:"overview" and read the contact sheet
  8. look closely at the slides that look wrong: images:[n], imageDetail:"full"
  9. patch specific defects with patch_presentation
 10. rerun readiness and the round-trip check, then deliver the package

Read \`presentationReadiness\`, not just \`status\`. \`packageStatus\` says the file
holds together; readiness says whether it is finished. Repairs default to
\`suggest\` on a model-authored canvas: the engine reports what it would change
and changes nothing, because your values are not its to overwrite.

Every result carries a \`tokenBudget\`: what the call cost you and what the
richer option would cost. Defaults are the cheapest correct answer, never a
reduced one — images:"all" and imageDetail:"full" return everything there is.

create_presentation takes only a prompt and returns a structural draft full of
bracketed placeholders. Use it to start, never to finish.`;

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
      contents: [{ uri: uri.href, mimeType: "application/json", text: serialize(contractDescriptor()) }],
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

  // The full schemas are what a validator needs, and they are large: the scene
  // schema is roughly 12,000 tokens even after the shared subschemas are named
  // rather than repeated. Nothing routes a model here — `get_capabilities` with
  // include:["canvas"] answers "what can I author?" for a quarter of the price
  // — but a host building a structured-output request needs the real thing.
  for (const name of contractDescriptor().schemas) {
    server.registerResource(
      `schema-${name}`,
      `slide-agent://contract/schema/${name}`,
      {
        title: `JSON Schema: ${name}`,
        description: `The ${name} schema, for validators and structured-output requests. Contract version ${CONTRACT_VERSION}. To learn what the canvas can express, read capabilities instead — it is derived from these and far smaller.`,
        mimeType: "application/schema+json",
      },
      async (uri: URL) => ({
        contents: [{
          uri: uri.href,
          mimeType: "application/schema+json",
          text: serialize(contractJsonSchema(name)),
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

  const runPreviews = previewParameters("all", "a build is the first sight of the deck");
  const createPreviews = previewParameters("all", "a build is the first sight of the deck");
  const revisePreviews = previewParameters("changed", "a revise names its slide, so only that slide comes back");
  const editPreviews = previewParameters("changed", "in-place operations name their slides; anything that renumbers the deck returns all of them and says so");
  const renderPreviews = previewParameters("all", "seeing the deck is the purpose of this call");
  const validatePreviews = previewParameters("none", "the report is what this call is for; review_presentation is where you look");
  const reviewPreviews = previewParameters("all", "the renders are the evidence this call exists to supply");
  const patchPreviews = previewParameters("changed", "the engine knows which slides it touched, so only those come back");

  server.registerTool("slide_agent_run", {
    title: "Run Slide Agent",
    description: "Execute a complete structured request: a model-authored outline, creative direction, freeform canvas, native charts, or NDJSON scene. Call get_capabilities with include:[\"canvas\"] first — it says what the canvas can express and is derived from the schemas. The full JSON Schemas are at slide-agent://contract/schema/<name> for validators.",
    inputSchema: z.object({
      request: z.looseObject({
        command: z.enum(["create", "edit", "render", "validate", "revise"]),
      }).describe("A structured request. slide-agent://contract carries the full schema for each command."),
      ...runPreviews.schema,
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ images, imageDetail, includeImages, request }: PreviewOptions & { request: Record<string, unknown> }) => {
    const result = await new SlideAgent().execute(parseStructuredRequest(request));
    return toolResultWithPreviews(result, evidenceOf(result), { images, imageDetail, includeImages }, runPreviews.fallback);
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
        text: serialize({ contractVersion: CONTRACT_VERSION, version: VERSION, ...await new SlideAgent().capabilityReport() }),
      }],
    }),
  );

  server.registerTool("get_capabilities", {
    title: "Get Slide Agent capabilities",
    description: `What this installation can do. The default answer is a summary: what renders here, and — read this before planning imagery — whether images can be fetched, generated, or only read from local paths. Name facets in \`include\` for the full block: ${CAPABILITY_FACETS.join(", ")}, or "all". Ask for "canvas" before you simplify an idea into boxes; it lists every element type, property, and treatment the medium supports.`,
    inputSchema: z.object({
      include: z.array(z.string()).optional()
        .describe(`Facets to return in full: ${CAPABILITY_FACETS.join(", ")}, or "all". Omit for a summary of roughly a tenth the size.`),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ include }: { include?: string[] }) => {
    const report = await new SlideAgent().capabilityReport();
    const meta = { contractVersion: CONTRACT_VERSION, version: VERSION };
    if (!include || include.length === 0) {
      return toolResult(capabilitySummary(report, meta), false, 'A summary. include:["canvas"] returns the expressive surface in full; include:["all"] returns everything.');
    }
    return toolResult(capabilityFacets(report, include, meta));
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
      ...createPreviews.schema,
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ images, imageDetail, includeImages, ...input }: PreviewOptions & { prompt: string; output: string; render?: boolean; validate?: boolean; autoFix?: boolean; maxRetries?: number }) => {
    const result = await new SlideAgent().create({ command: "create", ...input });
    return toolResultWithPreviews(result, evidenceOf(result), { images, imageDetail, includeImages }, createPreviews.fallback);
  });

  server.registerTool("revise_presentation", {
    title: "Revise one slide of an existing deck",
    description: "Replace a single slide from the deck's own scene, leaving every other slide unchanged. Pair with the revise_presentation_scene prompt. Costs roughly one slide's worth of authoring output; patch_presentation costs a fraction of that again when the defect is a named element rather than the whole slide.",
    inputSchema: z.object({
      input: z.string().min(1).describe("The existing .pptx. Its scene blueprint is discovered beside it."),
      output: z.string().min(1),
      slide: z.number().int().positive(),
      sceneNdjson: z.string().min(1).describe("Replacement NDJSON records for that slide only."),
      scene: z.string().optional().describe("Override the scene path when it is not beside the deck."),
      validate: z.boolean().optional(),
      render: z.boolean().optional(),
      ...revisePreviews.schema,
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ images, imageDetail, includeImages, ...request }: PreviewOptions & { input: string; output: string; slide: number; sceneNdjson: string; scene?: string; validate?: boolean; render?: boolean }) => {
    const result = await new SlideAgent().revise({ command: "revise", ...request });
    return toolResultWithPreviews(result, evidenceOf(result), { images, imageDetail, includeImages }, revisePreviews.fallback);
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
      ...editPreviews.schema,
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ images, imageDetail, includeImages, ...input }: PreviewOptions & Record<string, unknown>) => {
    const result = await new SlideAgent().execute(parseStructuredRequest({ command: "edit", ...input }));
    return toolResultWithPreviews(result, evidenceOf(result), { images, imageDetail, includeImages }, editPreviews.fallback);
  });

  server.registerTool("render_presentation", {
    title: "Render PowerPoint presentation",
    description: "Render every slide to PNG previews and a PDF, and return those previews as images so you can see what you built. Look at them before reporting success. For a whole deck, images:\"overview\" returns one contact sheet — enough to judge pacing and spot the slides worth opening properly.",
    inputSchema: z.object({
      input: z.string().min(1),
      output: z.string().min(1),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      ...renderPreviews.schema,
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async ({ images, imageDetail, includeImages, ...request }: PreviewOptions & { input: string; output: string; width?: number; height?: number }) => {
    const result = await new SlideAgent().render({ command: "render", ...request });
    return toolResultWithPreviews(result, evidenceOf(result), { images, imageDetail, includeImages }, renderPreviews.fallback);
  });

  server.registerTool("validate_presentation", {
    title: "Validate PowerPoint presentation",
    description: "Validate package integrity, ECMA-376 conformance, geometry, legibility, and accessibility; optionally render; write a structured JSON report. The report is the answer here, so no previews are returned by default — ask for them with images if you want to look as well as read.",
    inputSchema: z.object({
      input: z.string().min(1),
      report: z.string().min(1).optional(),
      manifest: z.string().optional(),
      previewsDir: z.string().optional(),
      render: z.boolean().optional(),
      ...validatePreviews.schema,
    }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async ({ images, imageDetail, includeImages, ...request }: PreviewOptions & { input: string; report?: string; manifest?: string; previewsDir?: string; render?: boolean }) => {
    const result = await new SlideAgent().validate({ command: "validate", ...request });
    return toolResultWithPreviews(result, evidenceOf(result), { images, imageDetail, includeImages }, validatePreviews.fallback);
  });

  server.registerTool("review_presentation", {
    title: "Review a presentation you built",
    description: "Return the deterministic review packet for the exact PPTX: artifact hashes, per-slide renders, the words read back off the render compared with the deck's own text, element geometry, the author's declared intent, current issues, and questions worth asking. Look at the images before you judge the deck. Start with images:\"overview\" — one contact sheet answers pacing, variety, and which slides repeat each other, for about the price of a single slide. Then open the suspicious ones with images:[n] and imageDetail:\"full\".",
    inputSchema: z.object({
      input: z.string().min(1).describe("The .pptx to review. Its scene, manifest, report, and previews are discovered beside it."),
      scene: z.string().optional(),
      manifest: z.string().optional(),
      slide: z.number().int().positive().optional().describe("Review one slide."),
      from: z.number().int().positive().optional(),
      to: z.number().int().positive().optional(),
      maxSlides: z.number().int().positive().max(40).optional(),
      detail: z.enum(["defects", "full"]).optional()
        .describe("How much of each slide's element list to include. \"defects\" (default) reports the elements something is measurably wrong with and summarises the rest; \"full\" reports every element's geometry and text. A named slide always gets full detail. Not to be confused with `imageDetail`, which is the size of the returned renders."),
      ...reviewPreviews.schema,
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ images, imageDetail, includeImages, input, scene, manifest, slide, from, to, maxSlides, detail }: PreviewOptions & {
    input: string; scene?: string; manifest?: string; slide?: number; from?: number; to?: number; maxSlides?: number;
    detail?: "defects" | "full";
  }) => {
    const packet = await new SlideAgent().review(input, {
      ...(scene ? { scene } : {}),
      ...(manifest ? { manifest } : {}),
      ...(slide === undefined ? {} : { slide }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...(maxSlides === undefined ? {} : { maximumSlides: maxSlides }),
      ...(detail === undefined ? {} : { detail }),
    });
    // The packet knows its own previews, so it does not have to be pretended
    // into the shape of an `AgentResult` to have them found.
    const previews = packet.slides.map((entry) => entry.preview).filter((file): file is string => Boolean(file));
    return toolResultWithPreviews(packet, { previews }, { images, imageDetail, includeImages }, reviewPreviews.fallback);
  });

  server.registerTool("patch_presentation", {
    title: "Patch specific elements of a deck",
    description: "Change named elements on named slides and rebuild, leaving every other element exactly as it was. Use this after review_presentation instead of regenerating the deck: a regeneration discards every decision you are not currently thinking about, and costs the whole deck's authoring output to do it — a patch costs the elements it names. Every operation names its slide and element id; there is no fuzzy matching. Only the slides the patch touched come back as renders.",
    inputSchema: z.object({
      input: z.string().min(1),
      output: z.string().min(1).describe("Must differ from input. Ignored with dryRun."),
      operations: z.array(z.looseObject({ op: z.string() })).min(1)
        .describe("add-element, remove-element, update-text, update-style, update-bbox, update-z-index, update-provenance, update-slide, update-claims, or apply-style-system."),
      scene: z.string().optional(),
      dryRun: z.boolean().optional().describe("Report the semantic diff without writing anything."),
      render: z.boolean().optional(),
      roundTrip: z.boolean().optional(),
      validate: z.boolean().optional(),
      ...patchPreviews.schema,
    }),
    annotations: { destructiveHint: false, idempotentHint: false },
  }, async ({ images, imageDetail, includeImages, ...input }: PreviewOptions & Record<string, unknown>) => {
    const result = await new SlideAgent().execute(parseStructuredRequest({ command: "patch", ...input }));
    return toolResultWithPreviews(result, evidenceOf(result), { images, imageDetail, includeImages }, patchPreviews.fallback);
  });

  server.registerResource(
    "canvas-capabilities",
    "slide-agent://capabilities/canvas",
    {
      title: "The expressive canvas",
      description: "Every element type, property, and treatment the canvas supports, derived from the published schemas — plus what survives as an editable PowerPoint object and what does not.",
      mimeType: "application/json",
    },
    async (uri: URL) => ({
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: serialize(new SlideAgent().capabilities().canvas),
      }],
    }),
  );

  server.registerTool("slide_agent_doctor", {
    title: "Check Slide Agent installation",
    description: "Check Node.js, agent skill registrations, MCP registration, and optional preview-tool availability.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    // Wrapped in an object rather than returned as a bare array, so it can
    // carry its budget like every other result. A tool that quietly opted out
    // of the price list would make "every result is priced" untrue in exactly
    // the place nobody checks.
  }, async () => {
    const checks = await runDoctor();
    return toolResult({ checks });
  });

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
