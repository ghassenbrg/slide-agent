import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SlideAgentError } from "../../utils/errors.js";
import { INTENT_SCHEMA_ID, type DeckIntent } from "../ir/intent.js";
import type { Finding } from "../ir/issues.js";
import { editOp, type EditOp, type ModelCall, type RunRecord, type Verdict } from "../ir/verdict.js";
import type { BuildResult, Engine } from "../engine/engine.js";
import { validateIntent } from "../engine/scene-builder.js";
import { digest, ingest, type SourcePack } from "../ingest/index.js";
import { BudgetGuard, resolveProfile, type ModelsConfig, type Profile, type ProfileName, type Task } from "./profiles.js";
import { extractJson, priceOf, type ModelMessage, type ModelProvider } from "./provider.js";
import { ALT_TEXT_SYSTEM, CRITIC_SYSTEM, DIRECTOR_SYSTEM, NOTES_SYSTEM, PROMPT_VERSION, REVISE_SYSTEM, SECTION_SYSTEM } from "./prompts.js";

/**
 * Engine-managed direction: a director model at the profile's tier writes the
 * intent, the engine builds it, a critic judges the preview against the brief,
 * and the director revises. Small models only write alt text and notes.
 */

export interface GenerateRequest {
  deck: string;
  brief: string;
  sources?: string[];
  /** A design constraint: a brand reference or a full design request. */
  design?: DeckIntent["design"];
  profile?: ProfileName;
  format?: DeckIntent["brief"]["format"];
  slides?: number;
  images?: Array<{ asset: string; alt?: string; note?: string }>;
}

export interface GenerateResult extends BuildResult {
  modelCalls: ModelCall[];
  usd: number;
  profile: ProfileName;
  critique?: unknown;
  degraded: string[];
}

class Session {
  public readonly calls: ModelCall[] = [];
  public readonly guard: BudgetGuard;

  public constructor(private readonly provider: ModelProvider, public readonly profile: Profile, config: ModelsConfig) {
    this.guard = new BudgetGuard(profile.maxUsd);
    this.prices = config.prices;
  }

  private readonly prices: ModelsConfig["prices"];

  public async ask(task: Task, system: string, messages: ModelMessage[]): Promise<string> {
    const route = this.profile.routes[task];
    const started = performance.now();
    const response = await this.provider.complete({ task, system, messages, model: route.model, maxTokens: route.maxTokens, ...(route.effort ? { effort: route.effort } : {}), promptVersion: PROMPT_VERSION });
    const usd = priceOf(response.model, response.usage, this.prices);
    this.guard.add(usd);
    this.calls.push({ task, model: response.model, provider: this.provider.id, promptVersion: PROMPT_VERSION, input: response.usage.input, output: response.usage.output, cached: response.usage.cacheRead, usd, ms: Math.round(performance.now() - started) });
    return response.text;
  }

  public usage(): { input: number; output: number; cached: number } {
    return this.calls.reduce((total, call) => ({ input: total.input + call.input, output: total.output + call.output, cached: total.cached + call.cached }), { input: 0, output: 0, cached: 0 });
  }
}

function briefMessage(request: GenerateRequest, pack: SourcePack | undefined): string {
  return [
    `BRIEF\n${request.brief}`,
    request.format ? `FORMAT ${request.format}` : "",
    request.slides ? `TARGET LENGTH about ${request.slides} slides` : "",
    request.design ? `DESIGN CONSTRAINT (use exactly this "design" value; direct within it)\n${JSON.stringify(request.design)}` : "",
    request.images?.length ? `IMAGES YOU MAY USE\n${request.images.map((image) => `- ${image.asset}${image.alt ? ` (alt: ${image.alt})` : ""}${image.note ? ` — ${image.note}` : ""}`).join("\n")}` : "IMAGES: none available; do not use image nodes.",
    pack ? `SOURCES (cite span ids)\n${digest(pack)}` : "SOURCES: none beyond the brief. Do not state figures the brief does not give.",
  ].filter(Boolean).join("\n\n");
}

function findingsMessage(findings: Finding[]): string {
  return findings.slice(0, 30).map((finding) => `- ${finding.path ?? ""} ${finding.code}: ${finding.message}`).join("\n");
}

/** Ask for JSON, validate, and give the model up to `attempts` repairs with the exact findings. */
async function directIntent(session: Session, request: GenerateRequest, pack: SourcePack | undefined): Promise<{ intent: DeckIntent; conversation: ModelMessage[] }> {
  const conversation: ModelMessage[] = [{ role: "user", text: `${briefMessage(request, pack)}\n\nWrite the complete intent.` }];
  const parallel = (request.slides ?? 0) > session.profile.parallelAbove;
  if (parallel) {
    conversation[0]!.text = `${briefMessage(request, pack)}\n\nThis is a long deck. First write the intent with brief, direction, design, components, and data, and a "slides" array where each slide has only "id", "message", and "plan" (one sentence on what the slide shows and how). Sections are composed next.`;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const text = await session.ask("direct", DIRECTOR_SYSTEM, conversation);
    conversation.push({ role: "assistant", text });
    let raw: unknown;
    try {
      raw = extractJson(text);
    } catch (error) {
      conversation.push({ role: "user", text: `${error instanceof Error ? error.message : String(error)} Return only the JSON object.` });
      continue;
    }
    if (raw && typeof raw === "object" && !(raw as Record<string, unknown>).schema) (raw as Record<string, unknown>).schema = INTENT_SCHEMA_ID;
    if (request.design && raw && typeof raw === "object") (raw as Record<string, unknown>).design = request.design;
    if (parallel) {
      const skeleton = raw as { slides?: Array<{ id: string; message: string; plan?: string }> };
      const slides = await composeSections(session, request, pack, conversation, skeleton.slides ?? []);
      raw = { ...(raw as object), slides };
    }
    const validated = validateIntent(raw);
    if (validated.intent) return { intent: validated.intent, conversation };
    conversation.push({ role: "user", text: `The intent does not validate. Fix exactly these and return the whole JSON again:\n${findingsMessage(validated.findings)}` });
  }
  throw new SlideAgentError("GENERATE_INVALID_INTENT", "The director did not produce a valid intent after three attempts.");
}

async function composeSections(session: Session, request: GenerateRequest, pack: SourcePack | undefined, conversation: ModelMessage[], skeleton: Array<{ id: string; message: string; plan?: string }>): Promise<unknown[]> {
  const size = 6;
  const sections: Array<typeof skeleton> = [];
  for (let index = 0; index < skeleton.length; index += size) sections.push(skeleton.slice(index, index + size));
  const prefix = conversation.map((message) => `${message.role.toUpperCase()}:\n${message.text}`).join("\n\n");
  const results = await Promise.all(sections.map(async (section) => {
    const text = await session.ask("compose-section", SECTION_SYSTEM, [{ role: "user", text: `${prefix}\n\nCompose these slides fully (compose, recipe+content, or auto), keeping their ids and messages:\n${JSON.stringify(section)}` }]);
    const parsed = extractJson(text) as { slides?: unknown[] };
    return parsed.slides ?? [];
  }));
  void request;
  void pack;
  return results.flat();
}

export async function generateDeck(engine: Engine, provider: ModelProvider, request: GenerateRequest, config: ModelsConfig = {}): Promise<GenerateResult> {
  const profileName = request.profile ?? config.profile ?? "balanced";
  const profile = resolveProfile(profileName, config);
  const session = new Session(provider, profile, config);
  const degraded: string[] = [];
  const pack = request.sources?.length ? await ingest(request.sources) : undefined;

  const { intent, conversation } = await directIntent(session, request, pack);
  let result = await engine.build({ deck: request.deck, intent, previews: "sheet" });
  let critique: unknown;

  for (let pass = 0; pass < Math.max(1, profile.revisePasses); pass += 1) {
    const pending = result.verdict.suggestedEdits;
    const wantsCritique = profile.critique && pass < profile.revisePasses;
    let notes: unknown;
    if (wantsCritique) {
      const estimate = priceOf(profile.routes.critique.model, { input: 6000, output: 1500, cacheRead: 0, cacheWrite: 0 });
      if (!session.guard.allows(estimate)) {
        degraded.push(pass === 0 ? "critic skipped: budget" : "second revise pass skipped: budget");
      } else if (result.files.sheet) {
        const sheet = await readFile(result.files.sheet);
        const text = await session.ask("critique", CRITIC_SYSTEM, [{
          role: "user",
          images: [{ mediaType: "image/png", base64: sheet.toString("base64") }],
          text: `BRIEF\n${request.brief}\n\nCONCEPT\n${intent.direction.concept}\n\nSLIDES\n${intent.slides.map((slide) => `${slide.id}: ${slide.message}`).join("\n")}\n\nMECHANICAL VERDICT\n${JSON.stringify({ state: result.verdict.state, issues: result.verdict.issues, rhythm: result.verdict.rhythm })}`,
        }]);
        try {
          notes = extractJson(text);
          critique = notes;
        } catch {
          degraded.push("critique unreadable; skipped");
        }
      }
    }
    const hasWork = pending.length > 0 || (notes && Array.isArray((notes as { notes?: unknown[] }).notes) && (notes as { notes: unknown[] }).notes.length > 0) || result.verdict.state === "needs-attention";
    if (!hasWork) break;
    const reviseEstimate = priceOf(profile.routes.revise.model, { input: 20000, output: 4000, cacheRead: 0, cacheWrite: 0 });
    if (pass > 0 && !session.guard.allows(reviseEstimate)) {
      degraded.push("revise pass skipped: budget");
      break;
    }
    const current = JSON.parse(await readFile(path.join(result.files.deck, "intent.json"), "utf8")) as DeckIntent;
    const reviseText = await session.ask("revise", REVISE_SYSTEM, [
      ...conversation.slice(0, 1),
      { role: "assistant", text: JSON.stringify(current) },
      { role: "user", text: `CRITIQUE\n${JSON.stringify(notes ?? { notes: [] })}\n\nPENDING CHOICES AND BUDGETS\n${JSON.stringify(pending)}\n\nOPEN ISSUES\n${JSON.stringify(result.verdict.issues)}\n\nReturn the EditOps.` },
    ]);
    let ops: EditOp[] = [];
    try {
      const parsed = extractJson(reviseText) as { ops?: unknown[] };
      ops = (parsed.ops ?? []).map((op) => editOp.parse(op)).filter((op) => op.level !== "package");
    } catch (error) {
      degraded.push(`revise output unusable: ${error instanceof Error ? error.message.slice(0, 80) : String(error)}`);
      break;
    }
    if (ops.length === 0) break;
    try {
      result = await engine.edit({ deck: result.files.deck, ops, previews: "sheet" });
    } catch (error) {
      degraded.push(`revise edits rejected: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
      break;
    }
  }

  await microTasks(engine, session, result, degraded);
  return finish(engine, session, result, profileName, critique, degraded);
}

/** Alt text for images the director left without it, and generated notes when asked for. */
async function microTasks(engine: Engine, session: Session, result: BuildResult, degraded: string[]): Promise<void> {
  const intent = result.intent;
  const scene = result.scene;
  if (!intent || !scene) return;
  const missingAlt = scene.slides.flatMap((slide) => slide.elements.filter((element) => element.kind === "image" && !element.alt && !element.decorative).map((element) => ({ slide: slide.id, element: element.id, message: slide.message })));
  const ops: EditOp[] = [];
  if (missingAlt.length > 0 && session.guard.remaining() > 0.005) {
    const text = await session.ask("alt-text", ALT_TEXT_SYSTEM, [{ role: "user", text: JSON.stringify(missingAlt) }]);
    try {
      const alts = (extractJson(text) as { alts?: Record<string, string> }).alts ?? {};
      for (const entry of missingAlt) {
        const alt = alts[entry.element];
        const element = scene.slides.flatMap((slide) => slide.elements).find((candidate) => candidate.id === entry.element);
        if (alt && element) ops.push({ level: "intent", op: "set", path: `${element.provenance.path}/image/alt`, value: alt.slice(0, 200) });
      }
    } catch {
      degraded.push("alt-text micro-task unreadable");
    }
  }
  if (intent.options?.speakerNotes === "generate" && session.guard.remaining() > 0.005) {
    const slides = scene.slides.filter((slide) => !slide.notes).map((slide) => ({ id: slide.id, message: slide.message, text: slide.elements.flatMap((element) => element.kind === "text" ? [element.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join(" ")] : []).join(" / ").slice(0, 600) }));
    if (slides.length) {
      const text = await session.ask("speaker-notes", NOTES_SYSTEM, [{ role: "user", text: JSON.stringify(slides) }]);
      try {
        const notes = (extractJson(text) as { notes?: Record<string, string> }).notes ?? {};
        intent.slides.forEach((slide, index) => {
          if (notes[slide.id]) ops.push({ level: "intent", op: "set", path: `/slides/${index}/notes`, value: notes[slide.id]!.slice(0, 3000) });
        });
      } catch {
        degraded.push("speaker-notes micro-task unreadable");
      }
    }
  }
  if (ops.length) {
    const edited = await engine.edit({ deck: result.files.deck, ops, previews: "sheet" }).catch((error: unknown) => {
      degraded.push(`micro-task edits rejected: ${error instanceof Error ? error.message.slice(0, 80) : String(error)}`);
      return undefined;
    });
    if (edited) Object.assign(result, edited);
  }
}

async function finish(engine: Engine, session: Session, result: BuildResult, profile: ProfileName, critique: unknown, degraded: string[]): Promise<GenerateResult> {
  void engine;
  const usd = session.calls.reduce((sum, call) => sum + call.usd, 0);
  const verdict: Verdict = {
    ...result.verdict,
    designReview: critique ? "critic" : result.verdict.designReview,
    cost: { ...result.verdict.cost, modelTokens: session.usage(), usd: Math.round(usd * 10000) / 10000 },
    ...(degraded.length ? { more: `${result.verdict.more ? `${result.verdict.more}; ` : ""}degraded: ${degraded.join("; ")}`.slice(0, 400) } : {}),
  };
  const record: RunRecord = { ...result.record, command: "generate", modelCalls: session.calls, verdict };
  await writeFile(path.join(result.files.deck, "run.json"), `${JSON.stringify({ ...record, critique, profile }, null, 1)}\n`);
  return { ...result, verdict, record, modelCalls: session.calls, usd, profile, critique, degraded };
}
