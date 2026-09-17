import { z } from "zod";

import { designRequest } from "../ir/design.js";
import { editOp, type Verdict } from "../ir/verdict.js";
import type { BuildResult, Engine } from "../engine/engine.js";
import { inspectFile } from "../engine/inspect.js";
import { generateDeck } from "../llm/generate.js";
import { editWithInstruction } from "../llm/edit-router.js";
import { loadModelsConfig } from "../llm/profiles.js";
import { AnthropicProvider, CachingProvider, type ModelProvider } from "../llm/provider.js";
import { SlideAgentError } from "../../utils/errors.js";
import { catalog, type CatalogSection } from "./catalog.js";

/**
 * One registry of commands; the CLI and the MCP server are generated from it,
 * so their inputs, descriptions, and response budgets cannot drift apart.
 */

export interface CommandContext {
  engine: Engine;
  provider?: () => ModelProvider;
}

export interface CommandResult {
  payload: Record<string, unknown>;
  /** Image files a surface may attach or link. */
  images?: string[];
  isError?: boolean;
}

export interface CommandDefinition<Input extends z.ZodType = z.ZodType> {
  name: string;
  tool: string;
  title: string;
  description: string;
  input: Input;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  /** Default response budget in tokens (chars / 4). */
  budget: number;
  run(input: z.infer<Input>, context: CommandContext): Promise<CommandResult>;
}

function define<Input extends z.ZodType>(definition: CommandDefinition<Input>): CommandDefinition<Input> {
  return definition;
}

/** Trim a verdict until it fits its budget: lower-value detail goes first. */
export function withinBudget(verdict: Verdict, budget: number): Verdict {
  const size = (value: unknown) => Math.ceil(JSON.stringify(value).length / 4);
  if (size(verdict) <= budget) return verdict;
  const trimmed: Verdict = structuredClone(verdict);
  const steps: Array<() => void> = [
    () => { trimmed.rhythm = trimmed.rhythm.slice(0, 2); },
    () => { trimmed.adjustments = trimmed.adjustments.map((entry) => ({ ...entry, where: entry.where.slice(0, 3) })); },
    () => { trimmed.issues = trimmed.issues.map((issue) => ({ ...issue, where: issue.where.slice(0, 3) })); },
    () => { trimmed.suggestedEdits = trimmed.suggestedEdits.slice(0, 5); },
    () => { trimmed.changed = trimmed.changed && trimmed.changed.length > 12 ? [...trimmed.changed.slice(0, 12)] : trimmed.changed; },
    () => { trimmed.issues = trimmed.issues.filter((issue) => issue.severity !== "minor"); },
    () => { trimmed.suggestedEdits = trimmed.suggestedEdits.slice(0, 3); },
    () => { trimmed.issues = trimmed.issues.slice(0, 6); },
  ];
  for (const step of steps) {
    if (size(trimmed) <= budget) break;
    step();
    trimmed.more = "Trimmed to the response budget: slides_view report has everything.";
  }
  return trimmed;
}

function buildPayload(result: BuildResult, budget: number, extra: Record<string, unknown> = {}): CommandResult {
  return { payload: { verdict: withinBudget(result.verdict, budget), ...extra }, ...(result.files.sheet ? { images: [result.files.sheet] } : {}) };
}

const intentInput = z.record(z.string(), z.unknown()).describe("A slide-agent.intent/1 document. See slide-agent://grammar.");

async function provider(context: CommandContext): Promise<{ provider: ModelProvider; config: Awaited<ReturnType<typeof loadModelsConfig>> }> {
  const config = await loadModelsConfig();
  return { provider: context.provider?.() ?? new CachingProvider(new AnthropicProvider()), config };
}

export const COMMANDS = [
  define({
    name: "catalog",
    tool: "slides_catalog",
    title: "Read the composition grammar and catalog",
    description: "The composition language with worked examples, starter components, recipe one-liners, and presets (≤3k tokens, byte-stable, cacheable). Read it before writing an intent. include adds fonts (search with fonts:\"geometric sans\"), icons (icons:\"growth\"), textures, or the JSON schema pointer.",
    input: z.object({
      include: z.array(z.enum(["grammar", "components", "recipes", "fonts", "icons", "presets", "textures", "schema"])).optional(),
      fonts: z.string().max(80).optional(),
      icons: z.string().max(80).optional(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    budget: 3000,
    async run(input) {
      const include = (input.include ?? ["grammar", "components", "recipes", "presets"]) as CatalogSection[];
      const payload = catalog(include, { ...(input.fonts ? { fonts: input.fonts } : {}), ...(input.icons ? { icons: input.icons } : {}) });
      if (include.includes("schema")) payload.schemaResource = "slide-agent://schema/intent";
      return { payload };
    },
  }),
  define({
    name: "build",
    tool: "slides_build",
    title: "Build or check a deck from an intent",
    description: "Validates, compiles the design language, solves every composition, fits text, checks, writes deck.pptx, and renders a preview sheet. Returns a verdict: mechanical state, adjustments the engine made (refuse with pins), choices to answer (slides_edit), rhythm notes, and the sheet. mode:\"check\" writes nothing. mode:\"explore\" renders up to 3 design requests × 4 slides side by side, without writing a deck. Look at the sheet and judge the design against the brief; overflow and contrast are already handled.",
    input: z.object({
      deck: z.string().min(1).describe("Deck directory inside the workspace"),
      intent: intentInput.optional(),
      intentPath: z.string().optional().describe("Read the intent from a file instead"),
      mode: z.enum(["check", "build", "explore"]).optional(),
      explore: z.object({ designs: z.array(designRequest).min(1).max(3), slides: z.array(z.string()).min(1).max(4) }).optional(),
      strict: z.boolean().optional().describe("Validate every part against the ECMA-376 schemas"),
      reviewed: z.object({ by: z.string(), at: z.string(), notes: z.array(z.object({ slide: z.string().optional(), note: z.string() })).max(40).optional() }).optional().describe("Record your design review of the last preview"),
    }),
    annotations: { destructiveHint: true, idempotentHint: true },
    budget: 800,
    async run(input, context) {
      if (input.mode === "explore") {
        if (!input.explore) throw new SlideAgentError("EXPLORE_NEEDS_DESIGNS", "mode \"explore\" needs explore: {designs, slides}.");
        const explored = await context.engine.explore({ deck: input.deck, ...(input.intent ? { intent: input.intent } : {}), designs: input.explore.designs, slides: input.explore.slides });
        return { payload: { explore: explored, note: "Preview, not a PowerPoint render. Commit one design with slides_build." }, ...(explored.sheet ? { images: [explored.sheet] } : {}) };
      }
      const result = await context.engine.build({
        deck: input.deck,
        ...(input.intent ? { intent: input.intent } : {}),
        ...(input.intentPath ? { intentPath: input.intentPath } : {}),
        mode: input.mode === "check" ? "check" : "build",
        ...(input.strict ? { strict: true } : {}),
        ...(input.reviewed ? { reviewed: input.reviewed } : {}),
      });
      return buildPayload(result, 800);
    },
  }),
  define({
    name: "edit",
    tool: "slides_edit",
    title: "Edit a deck",
    description: "Apply EditOps to the deck's intent and rebuild only what changed: {level:\"intent\", op:\"set|insert|remove|move|choose|expand\", path, value}; {level:\"design\", op:\"set\", path:\"/color/palette/signal\", value}; {level:\"element\", slide, element, set:{refuse:\"type-step\"|frame|hidden}} (pins survive rebuilds); {level:\"package\", op:{…}} on a foreign .pptx. Or pass instruction (engine-managed: a model writes the ops). Returns a delta verdict.",
    input: z.object({
      deck: z.string().min(1),
      ops: z.array(editOp).optional(),
      instruction: z.string().max(1000).optional(),
      profile: z.enum(["quality", "balanced", "draft"]).optional(),
    }),
    annotations: { destructiveHint: true, idempotentHint: false },
    budget: 500,
    async run(input, context) {
      if (input.ops?.length) {
        const result = await context.engine.edit({ deck: input.deck, ops: input.ops });
        return buildPayload(result, 500, result.notes.length ? { notes: result.notes } : {});
      }
      if (input.instruction) {
        const { provider: model, config } = await provider(context);
        const result = await editWithInstruction(context.engine, model, { deck: input.deck, instruction: input.instruction, ...(input.profile ? { profile: input.profile } : {}) }, config);
        return buildPayload(result, 500, { route: result.route, ops: result.ops.length, usd: Math.round(result.usd * 10000) / 10000 });
      }
      throw new SlideAgentError("EDIT_NEEDS_OPS", "slides_edit needs ops, or an instruction in engine-managed mode.");
    },
  }),
  define({
    name: "view",
    tool: "slides_view",
    title: "View a built deck",
    description: "what: sheet (contact sheet), slides (previews for slide ids), crop (an element or issue, ≤400 px), rhythm (silhouettes and densities, ≤300 tokens), expand (a recipe slide as its composition), report (all findings, paged), explain (why an element looks the way it does). Previews are not PowerPoint renders.",
    input: z.object({
      deck: z.string().min(1),
      what: z.enum(["sheet", "slides", "crop", "rhythm", "expand", "report", "explain"]),
      slides: z.array(z.string()).max(12).optional(),
      element: z.string().optional(),
      issue: z.string().optional(),
      page: z.number().int().min(0).optional(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    budget: 1500,
    async run(input, context) {
      const payload = await context.engine.view({ deck: input.deck, what: input.what, ...(input.slides ? { slides: input.slides } : {}), ...(input.element ? { element: input.element } : {}), ...(input.issue ? { issue: input.issue } : {}), ...(input.page !== undefined ? { page: input.page } : {}) });
      const images: string[] = [];
      if (typeof payload.sheet === "string") images.push(payload.sheet);
      if (typeof payload.crop === "string") images.push(payload.crop);
      if (Array.isArray(payload.slides)) for (const slide of payload.slides as Array<{ preview?: string }>) if (slide.preview) images.push(slide.preview);
      return { payload, ...(images.length ? { images } : {}) };
    },
  }),
  define({
    name: "finalize",
    tool: "slides_finalize",
    title: "Finalize a deck",
    description: "Fidelity render with LibreOffice, text-survival checks, full schema validation, a clean-directory round-trip rebuild, and exports (pdf, png). The deck is ready only when this passes.",
    input: z.object({
      deck: z.string().min(1),
      exports: z.array(z.enum(["pdf", "png"])).optional(),
      roundTrip: z.boolean().optional(),
    }),
    annotations: { destructiveHint: true, idempotentHint: true },
    budget: 800,
    async run(input, context) {
      const result = await context.engine.finalize({ deck: input.deck, ...(input.exports ? { exports: input.exports } : {}), ...(input.roundTrip !== undefined ? { roundTrip: input.roundTrip } : {}) });
      return buildPayload(result, 800);
    },
  }),
  define({
    name: "inspect",
    tool: "slides_inspect",
    title: "Inspect a PowerPoint file or template",
    description: "Layouts and placeholders, brand tokens and locks a build would inherit (use design:{brand:\"file.potx\"}), and a per-slide text outline, paged.",
    input: z.object({ file: z.string().min(1), page: z.number().int().min(0).optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    budget: 1500,
    async run(input) {
      return { payload: await inspectFile(input.file, { ...(input.page !== undefined ? { page: input.page } : {}) }) };
    },
  }),
  define({
    name: "generate",
    tool: "slides_generate",
    title: "Generate a deck with Slide Agent's own models",
    description: "Engine-managed direction for callers without a model of their own: a director at the profile's tier writes the intent, the engine builds it, a critic reviews the preview against the brief, and the director revises. Profiles: quality, balanced (default), draft (small model, labelled). Needs ANTHROPIC_API_KEY and @anthropic-ai/sdk where the server runs.",
    input: z.object({
      deck: z.string().min(1),
      brief: z.string().min(10).max(8000),
      sources: z.array(z.string()).max(20).optional(),
      design: designRequest.optional(),
      profile: z.enum(["quality", "balanced", "draft"]).optional(),
      format: z.enum(["16:9", "4:3", "9:16", "a4-landscape", "a4-portrait"]).optional(),
      slides: z.number().int().min(1).max(80).optional(),
      images: z.array(z.object({ asset: z.string(), alt: z.string().optional(), note: z.string().optional() })).max(30).optional(),
    }),
    annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    budget: 800,
    async run(input, context) {
      const { provider: model, config } = await provider(context);
      const result = await generateDeck(context.engine, model, {
        deck: input.deck,
        brief: input.brief,
        ...(input.sources ? { sources: input.sources } : {}),
        ...(input.design ? { design: input.design } : {}),
        ...(input.profile ? { profile: input.profile } : {}),
        ...(input.format ? { format: input.format } : {}),
        ...(input.slides ? { slides: input.slides } : {}),
        ...(input.images ? { images: input.images.map((image) => ({ asset: image.asset, ...(image.alt ? { alt: image.alt } : {}), ...(image.note ? { note: image.note } : {}) })) } : {}),
      }, config);
      return buildPayload(result, 800, { profile: result.profile, usd: Math.round(result.usd * 10000) / 10000, ...(result.degraded.length ? { degraded: result.degraded } : {}) });
    },
  }),
] as const;

export type CommandName = typeof COMMANDS[number]["name"];

export function command(name: string): CommandDefinition | undefined {
  return (COMMANDS as readonly CommandDefinition[]).find((candidate) => candidate.name === name || candidate.tool === name);
}
