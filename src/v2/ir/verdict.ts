import { z } from "zod";

/** One operation model, four levels. Edits go to the highest level that can express them. */
export const editOp = z.discriminatedUnion("level", [
  z.object({
    level: z.literal("intent"),
    op: z.enum(["set", "insert", "remove", "move", "choose", "expand"]),
    path: z.string().describe("JSON pointer into the intent, e.g. /slides/2/compose/items/0/text"),
    value: z.unknown().optional(),
    to: z.string().optional().describe("For move: destination pointer"),
    option: z.number().int().nonnegative().optional().describe("For choose: the index of the option in the suggested edit"),
    edit: z.string().optional().describe("For choose: the suggested-edit id"),
  }).strict(),
  z.object({
    level: z.literal("design"),
    op: z.enum(["set", "remove", "brand"]),
    path: z.string().optional().describe("JSON pointer into design.language, e.g. /color/palette/signal"),
    value: z.unknown().optional(),
  }).strict(),
  z.object({
    level: z.literal("element"),
    slide: z.string(),
    element: z.string(),
    set: z.object({
      frame: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).partial().optional(),
      hidden: z.boolean().optional(),
      refuse: z.enum(["contrast", "type-step", "snap", "font-substitute", "clamp-bounds"]).optional(),
      size: z.number().optional(),
      color: z.string().optional(),
    }).strict(),
  }).strict(),
  z.object({
    level: z.literal("package"),
    op: z.record(z.string(), z.unknown()).describe("A V1 edit operation applied through the OOXML editor: replace-text, update-table-cell, update-chart-data, replace-image, reorder, delete-slide, duplicate-slide, import-slide"),
  }).strict(),
]);
export type EditOp = z.infer<typeof editOp>;

export const suggestedEdit = z.object({
  id: z.string(),
  kind: z.enum(["choose", "shorten", "provide", "reconcile", "font", "icon"]),
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
  slide: z.string().optional(),
  why: z.string().max(160),
  options: z.array(z.object({
    do: z.enum(["size", "span", "split", "recipe", "font", "icon", "set"]),
    path: z.string().optional(),
    value: z.unknown().optional(),
    effect: z.string().max(80),
  })).optional(),
  maxChars: z.number().optional(),
  currentChars: z.number().optional(),
});
export type SuggestedEdit = z.infer<typeof suggestedEdit>;

export const readinessState = z.enum(["broken", "needs-attention", "ready-unrendered", "ready"]);
export type ReadinessState = z.infer<typeof readinessState>;

export const verdict = z.object({
  run: z.string(),
  deck: z.string().optional(),
  state: readinessState,
  slides: z.number(),
  changed: z.array(z.string()).optional(),
  authoring: z.object({
    composed: z.number(),
    recipe: z.number(),
    draft: z.number(),
    canvas: z.number(),
    design: z.enum(["authored", "brand", "preset", "tokens"]),
  }),
  designReview: z.enum(["none", "host", "critic"]),
  issues: z.array(z.object({
    code: z.string(),
    severity: z.enum(["blocking", "major", "minor"]),
    count: z.number(),
    where: z.array(z.string()).max(8),
    hint: z.string().max(140),
  })).max(12),
  adjustments: z.array(z.object({ kind: z.string(), count: z.number(), where: z.array(z.string()).max(8) })).max(6),
  suggestedEdits: z.array(suggestedEdit).max(10),
  rhythm: z.array(z.object({ slides: z.tuple([z.string(), z.string()]), similarity: z.number(), note: z.string().max(80) })).max(5),
  views: z.object({ sheet: z.string().optional(), slides: z.array(z.string()).optional(), pptx: z.string().optional() }),
  cost: z.object({
    engineMs: z.number(),
    modelTokens: z.object({ input: z.number(), output: z.number(), cached: z.number() }).optional(),
    usd: z.number().optional(),
  }),
  more: z.string().optional(),
});
export type Verdict = z.infer<typeof verdict>;

export interface StageTiming {
  stage: string;
  ms: number;
  cached: number;
  computed: number;
}

export interface ModelCall {
  task: string;
  model: string;
  provider: string;
  promptVersion: string;
  input: number;
  output: number;
  cached: number;
  usd: number;
  ms: number;
}

export interface RunRecord {
  schema: "slide-agent.run/1";
  id: string;
  command: string;
  startedAt: string;
  finishedAt: string;
  versions: { engine: string; grammar: string; recipes: string; compiler: string; writer: string };
  intentHash: string;
  stages: StageTiming[];
  decisions: Array<{ slide?: string; kind: string; detail: string; score?: number }>;
  adjustments: Array<{ slide: string; element: string; kind: string; from: unknown; to: unknown; reason: string }>;
  findings: Array<{ code: string; severity: string; tier: string; message: string; path?: string; slide?: string; element?: string; hint?: string }>;
  fit: Array<{ slide: string; element: string; status: string; steps: string[] }>;
  artifacts: Array<{ path: string; sha256: string; bytes: number; kind: string }>;
  modelCalls: ModelCall[];
  verdict?: Verdict;
}
