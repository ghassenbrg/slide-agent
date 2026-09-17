import { readFile } from "node:fs/promises";
import path from "node:path";

import { SlideAgentError } from "../../utils/errors.js";
import { DEFAULT_PRICES } from "./provider.js";

/**
 * Routing profiles with a creative floor.
 *
 * Judgement tasks — direction, composition, critique, revision, design edits —
 * run at the profile's tier and may never be routed below `balanced`'s models,
 * whatever a budget says. Small models do mechanical language tasks only. The
 * budget guard degrades by dropping a second revise pass, then the critic,
 * then stopping; it never swaps in a smaller director.
 */

export type Task = "direct" | "compose-section" | "critique" | "revise" | "design-edit" | "alt-text" | "speaker-notes" | "summarize-source" | "draft";
export type ProfileName = "quality" | "balanced" | "draft";

export const JUDGEMENT_TASKS: ReadonlySet<Task> = new Set(["direct", "compose-section", "critique", "revise", "design-edit"]);

export interface TaskRoute {
  model: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens: number;
}

export interface Profile {
  name: ProfileName;
  routes: Record<Task, TaskRoute>;
  critique: boolean;
  revisePasses: number;
  /** Decks over this many slides compose sections in parallel after direction. */
  parallelAbove: number;
  maxUsd: number;
}

const MECHANICAL: TaskRoute = { model: "claude-haiku-4-5", maxTokens: 4000 };

export const PROFILES: Record<ProfileName, Profile> = {
  quality: {
    name: "quality",
    routes: {
      direct: { model: "claude-opus-5", effort: "high", maxTokens: 64000 },
      "compose-section": { model: "claude-opus-5", effort: "high", maxTokens: 32000 },
      critique: { model: "claude-opus-5", effort: "high", maxTokens: 8000 },
      revise: { model: "claude-opus-5", effort: "high", maxTokens: 16000 },
      "design-edit": { model: "claude-opus-5", effort: "high", maxTokens: 16000 },
      "alt-text": MECHANICAL, "speaker-notes": MECHANICAL, "summarize-source": MECHANICAL,
      draft: { model: "claude-sonnet-5", maxTokens: 32000 },
    },
    critique: true,
    revisePasses: 2,
    parallelAbove: 15,
    maxUsd: 2,
  },
  balanced: {
    name: "balanced",
    routes: {
      direct: { model: "claude-sonnet-5", effort: "high", maxTokens: 48000 },
      "compose-section": { model: "claude-sonnet-5", effort: "high", maxTokens: 24000 },
      critique: { model: "claude-sonnet-5", effort: "medium", maxTokens: 6000 },
      revise: { model: "claude-sonnet-5", effort: "medium", maxTokens: 12000 },
      "design-edit": { model: "claude-sonnet-5", effort: "medium", maxTokens: 12000 },
      "alt-text": MECHANICAL, "speaker-notes": MECHANICAL, "summarize-source": MECHANICAL,
      draft: { model: "claude-haiku-4-5", maxTokens: 24000 },
    },
    critique: true,
    revisePasses: 1,
    parallelAbove: 15,
    maxUsd: 0.6,
  },
  draft: {
    name: "draft",
    routes: {
      direct: { model: "claude-haiku-4-5", maxTokens: 24000 },
      "compose-section": { model: "claude-haiku-4-5", maxTokens: 16000 },
      critique: { model: "claude-haiku-4-5", maxTokens: 4000 },
      revise: { model: "claude-haiku-4-5", maxTokens: 8000 },
      "design-edit": { model: "claude-haiku-4-5", maxTokens: 8000 },
      "alt-text": MECHANICAL, "speaker-notes": MECHANICAL, "summarize-source": MECHANICAL,
      draft: { model: "claude-haiku-4-5", maxTokens: 24000 },
    },
    critique: false,
    revisePasses: 0,
    parallelAbove: 40,
    maxUsd: 0.15,
  },
};

/** Models allowed for judgement tasks outside the draft profile. */
const CREATIVE_FLOOR = ["claude-sonnet-5", "claude-opus-5", "claude-fable-5-1", "claude-fable-5", "claude-opus-4-8"];

export interface ModelsConfig {
  profile?: ProfileName;
  profiles?: Partial<Record<ProfileName, { routes?: Partial<Record<Task, Partial<TaskRoute>>>; maxUsd?: number; critique?: boolean; revisePasses?: number }>>;
  prices?: typeof DEFAULT_PRICES;
}

export async function loadModelsConfig(directory = process.cwd()): Promise<ModelsConfig> {
  const file = path.join(directory, ".slide-agent", "models.json");
  try {
    return JSON.parse(await readFile(file, "utf8")) as ModelsConfig;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return {};
    throw new SlideAgentError("MODELS_CONFIG_INVALID", `${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Merge operator overrides into a profile, enforcing the creative floor. */
export function resolveProfile(name: ProfileName, config: ModelsConfig = {}): Profile {
  const base = PROFILES[name];
  const override = config.profiles?.[name];
  const routes = { ...base.routes };
  for (const [task, route] of Object.entries(override?.routes ?? {}) as Array<[Task, Partial<TaskRoute>]>) {
    const merged = { ...routes[task], ...route };
    if (name !== "draft" && JUDGEMENT_TASKS.has(task) && !CREATIVE_FLOOR.some((model) => merged.model.startsWith(model))) {
      throw new SlideAgentError("CREATIVE_FLOOR", `${task} in the ${name} profile cannot run on ${merged.model}: design judgement stays at ${CREATIVE_FLOOR.slice(0, 2).join(" or ")} or above. Use the draft profile for a small-model draft.`, { task, model: merged.model });
    }
    routes[task] = merged;
  }
  return {
    ...base,
    routes,
    ...(override?.maxUsd !== undefined ? { maxUsd: override.maxUsd } : {}),
    ...(override?.critique !== undefined ? { critique: override.critique } : {}),
    ...(override?.revisePasses !== undefined ? { revisePasses: override.revisePasses } : {}),
  };
}

/** Tracks spend and says what the next call may do. */
export class BudgetGuard {
  public spent = 0;

  public constructor(public readonly maxUsd: number) {}

  public add(usd: number): void {
    this.spent += usd;
  }

  public remaining(): number {
    return Math.max(0, this.maxUsd - this.spent);
  }

  /** Whether an optional stage estimated at `usd` still fits. Required stages always run once. */
  public allows(usd: number): boolean {
    return this.spent + usd <= this.maxUsd;
  }
}
