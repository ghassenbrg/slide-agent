import { readFile } from "node:fs/promises";
import path from "node:path";

import { SlideAgentError } from "../../utils/errors.js";
import type { DeckIntent } from "../ir/intent.js";
import { editOp, type EditOp } from "../ir/verdict.js";
import type { BuildResult, Engine } from "../engine/engine.js";
import { BudgetGuard, resolveProfile, type ModelsConfig, type ProfileName } from "./profiles.js";
import { extractJson, priceOf, type ModelProvider } from "./provider.js";
import { PROMPT_VERSION, REVISE_SYSTEM } from "./prompts.js";

/**
 * Natural-language edits in engine-managed mode. Mechanical edits (a number, a
 * word, an order) go to a small model; design edits ("calmer", "this feels
 * generic") go to the director tier with the preview of the deck.
 */

const DESIGN_WORDS = /\b(calm|bold|generic|feel|feels|look|looks|style|colou?r|palette|font|type(face)?|layout|compos|emphasi|hierarch|busy|clutter|crowded|space|breath|contrast|brand|modern|elegant|premium|playful|serious|visual|design|rhythm|varied|boring|flat|punch)/i;

export function classifyInstruction(instruction: string): "mechanical" | "design" {
  return DESIGN_WORDS.test(instruction) ? "design" : "mechanical";
}

export async function editWithInstruction(engine: Engine, provider: ModelProvider, request: { deck: string; instruction: string; profile?: ProfileName }, config: ModelsConfig = {}): Promise<BuildResult & { route: "mechanical" | "design"; ops: EditOp[]; usd: number }> {
  const intent = JSON.parse(await readFile(path.join(request.deck, "intent.json"), "utf8").catch(() => {
    throw new SlideAgentError("INTENT_NOT_FOUND", `${request.deck} has no intent.json; natural-language edits need a built V2 deck.`);
  })) as DeckIntent;
  const route = classifyInstruction(request.instruction);
  const profile = resolveProfile(request.profile ?? config.profile ?? "balanced", config);
  const task = route === "design" ? "design-edit" : "alt-text";
  const model = route === "design" ? profile.routes["design-edit"] : { ...profile.routes["alt-text"], maxTokens: 8000 };
  const images = route === "design"
    ? await readFile(path.join(request.deck, "previews", "sheet.png")).then((bytes) => [{ mediaType: "image/png" as const, base64: bytes.toString("base64") }]).catch(() => [])
    : [];
  const response = await provider.complete({
    task,
    system: REVISE_SYSTEM,
    model: model.model,
    maxTokens: model.maxTokens,
    ...(model.effort ? { effort: model.effort } : {}),
    promptVersion: PROMPT_VERSION,
    messages: [{ role: "user", images, text: `CURRENT INTENT\n${JSON.stringify(intent)}\n\nINSTRUCTION\n${request.instruction}\n\nReturn the EditOps that carry out the instruction and nothing else.` }],
  });
  const usd = priceOf(response.model, response.usage, config.prices);
  new BudgetGuard(profile.maxUsd).add(usd);
  const parsed = extractJson(response.text) as { ops?: unknown[] };
  const ops = (parsed.ops ?? []).map((op) => editOp.parse(op));
  if (ops.length === 0) throw new SlideAgentError("EDIT_NO_OPS", "The instruction produced no edits.");
  const result = await engine.edit({ deck: request.deck, ops });
  return { ...result, route, ops, usd };
}
