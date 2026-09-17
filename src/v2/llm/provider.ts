import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { SlideAgentError } from "../../utils/errors.js";
import { fontCacheDirectory } from "../text/registry.js";

/**
 * The model runtime's one seam. Engine-managed mode is the only part of Slide
 * Agent that calls a model, and it calls this interface; host-mode installs
 * carry no provider SDK at all.
 */

export interface ModelImage {
  mediaType: "image/png" | "image/jpeg";
  base64: string;
}

export interface ModelMessage {
  role: "user" | "assistant";
  text: string;
  images?: ModelImage[];
}

export interface ModelRequest {
  model: string;
  /** Stable, cacheable prefix: role, grammar, rules. Never contains per-deck content. */
  system: string;
  messages: ModelMessage[];
  maxTokens: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  task: string;
  promptVersion: string;
}

export interface ModelUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelResponse {
  text: string;
  usage: ModelUsage;
  model: string;
  stopReason?: string;
  cached?: boolean;
}

export interface ModelProvider {
  id: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/** Per-million-token prices in USD: input, output, cache read, cache write. Overridable in models.json. */
export const DEFAULT_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export function priceOf(model: string, usage: ModelUsage, prices = DEFAULT_PRICES): number {
  const key = Object.keys(prices).find((name) => model.startsWith(name));
  const price = key ? prices[key]! : { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };
  return (usage.input * price.input + usage.output * price.output + usage.cacheRead * price.cacheRead + usage.cacheWrite * price.cacheWrite) / 1_000_000;
}

interface AnthropicLike {
  messages: {
    stream(body: Record<string, unknown>): { finalMessage(): Promise<{ content: Array<{ type: string; text?: string }>; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }; model: string; stop_reason?: string | null }> };
  };
}

/**
 * Anthropic Messages API. The SDK is an optional peer dependency, loaded only
 * when engine-managed mode runs. Credentials come from the environment
 * (ANTHROPIC_API_KEY), never from a request.
 */
export class AnthropicProvider implements ModelProvider {
  public readonly id = "anthropic";
  private client: AnthropicLike | undefined;

  private async sdk(): Promise<AnthropicLike> {
    if (this.client) return this.client;
    let module: { default: new (options?: Record<string, unknown>) => AnthropicLike };
    try {
      module = createRequire(import.meta.url)("@anthropic-ai/sdk") as typeof module;
    } catch {
      try {
        module = await import("@anthropic-ai/sdk" as string) as typeof module;
      } catch {
        throw new SlideAgentError("PROVIDER_SDK_MISSING", "Engine-managed generation needs the Anthropic SDK: npm install @anthropic-ai/sdk, and set ANTHROPIC_API_KEY.");
      }
    }
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new SlideAgentError("PROVIDER_CREDENTIALS_MISSING", "Set ANTHROPIC_API_KEY where Slide Agent runs to use engine-managed generation.");
    }
    const Client = module.default;
    this.client = new Client();
    return this.client;
  }

  public async complete(request: ModelRequest): Promise<ModelResponse> {
    const client = await this.sdk();
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens,
      system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
      messages: request.messages.map((message) => ({
        role: message.role,
        content: [
          ...(message.images ?? []).map((image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } })),
          { type: "text", text: message.text },
        ],
      })),
      ...(request.effort ? { output_config: { effort: request.effort } } : {}),
    };
    // Streaming keeps long structured outputs clear of request timeouts.
    const message = await client.messages.stream(body).finalMessage();
    if (message.stop_reason === "refusal") throw new SlideAgentError("PROVIDER_REFUSAL", `The model declined the ${request.task} request.`);
    const text = message.content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
    return {
      text,
      model: message.model,
      ...(message.stop_reason ? { stopReason: message.stop_reason } : {}),
      usage: {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
        cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}

/** Replays queued responses; for tests and offline evaluation. */
export class ScriptedProvider implements ModelProvider {
  public readonly id = "scripted";
  public readonly requests: ModelRequest[] = [];

  public constructor(private readonly responses: Array<string | ((request: ModelRequest) => string)>) {}

  public async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(structuredClone(request));
    const next = this.responses.shift();
    if (next === undefined) throw new SlideAgentError("SCRIPTED_EXHAUSTED", `No scripted response left for ${request.task}.`);
    const text = typeof next === "function" ? next(request) : next;
    const input = Math.ceil((request.system.length + request.messages.reduce((sum, message) => sum + message.text.length, 0)) / 4);
    return { text, model: request.model, usage: { input, output: Math.ceil(text.length / 4), cacheRead: 0, cacheWrite: 0 } };
  }
}

/**
 * Exact-input response cache. The key covers model, prompt version, system,
 * messages, and images: the same request returns the same answer, and nothing
 * semantically "similar" is ever reused for creative output.
 */
export class CachingProvider implements ModelProvider {
  public readonly id: string;

  public constructor(private readonly inner: ModelProvider, private readonly directory = path.join(path.dirname(fontCacheDirectory()), "responses")) {
    this.id = `${inner.id}+cache`;
  }

  public async complete(request: ModelRequest): Promise<ModelResponse> {
    const key = createHash("sha256").update(JSON.stringify({ provider: this.inner.id, model: request.model, version: request.promptVersion, system: request.system, messages: request.messages, effort: request.effort, maxTokens: request.maxTokens })).digest("hex");
    const file = path.join(this.directory, `${key}.json`);
    const cached = await readFile(file, "utf8").then((text) => JSON.parse(text) as ModelResponse).catch(() => undefined);
    if (cached) return { ...cached, cached: true, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    const response = await this.inner.complete(request);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(response), { mode: 0o600 });
    await rename(temporary, file);
    return response;
  }
}

/** The first JSON object or array in a model's text, tolerating code fences and prose around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.search(/[{[]/);
  if (start < 0) throw new SlideAgentError("MODEL_OUTPUT_NOT_JSON", "The model's answer contained no JSON.");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const character = candidate[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") depth += 1;
    else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, index + 1));
        } catch (error) {
          throw new SlideAgentError("MODEL_OUTPUT_INVALID_JSON", `The model's JSON did not parse: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
  throw new SlideAgentError("MODEL_OUTPUT_TRUNCATED", "The model's JSON was cut off; raise the output budget.");
}
