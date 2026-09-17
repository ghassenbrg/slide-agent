import type { TypedContent } from "../ir/intent.js";
import { suggestChartKind, toChartData } from "../charts/stats.js";
import { getRecipe, type Recipe, type SlotSpec } from "./recipes.js";
import { joinPointer, type Finding } from "../ir/issues.js";

/**
 * Draft mode: pick a recipe from the shape of the content.
 *
 * Used only for `auto` slides (draft mode, and template-fill without an
 * explicit recipe). Every selection writes a scored trail so `explain` can say
 * why. In a directed deck these rules never run as decisions.
 */

export interface Selection {
  recipe: string;
  content: Record<string, unknown>;
  trail: Array<{ recipe: string; score: number; reason: string }>;
}

export function selectRecipe(content: TypedContent, context: { index: number; count: number; previous?: string }): Selection {
  const candidates: Array<{ recipe: string; score: number; reason: string }> = [];
  const add = (recipe: string, score: number, reason: string) => candidates.push({ recipe, score, reason });
  const metrics = content.metrics?.length ?? 0;
  const points = content.points?.length ?? 0;
  const groups = content.groups?.length ?? 0;

  if (context.index === 0 && !metrics && !content.chart && !content.table && points === 0) add("title/left-anchored", 0.95, "first slide with no body content");
  if (content.image && points === 0 && !content.subtitle) add("image/full-bleed-caption", 0.7, "an image and a title");
  if (content.image) add(context.index === 0 ? "title/split" : "image/half-bleed", 0.8, "an image with text");
  if (metrics >= 2 && metrics <= 5) add("metrics/row", 0.9, `${metrics} metrics fit a row`);
  if (metrics === 6) add("metrics/grid", 0.9, "6 metrics need a grid");
  if (metrics === 1) add("metrics/hero", 0.85, "a single hero metric");
  if (content.events?.length) add((content.events.length > 7) ? "timeline/vertical" : "timeline/horizontal", 0.9, `${content.events.length} dated events`);
  if (content.steps?.length) add(content.steps.length > 6 ? "process/numbered" : "process/chevrons", 0.88, `${content.steps.length} ordered steps`);
  if (groups >= 2 && groups <= 4) {
    const longest = Math.max(...content.groups!.map((group) => group.points.length));
    add(longest > 5 ? "table/compact" : "comparison/columns", longest > 5 ? 0.7 : 0.87, `${groups} parallel groups, up to ${longest} points each`);
  }
  if (content.chart) add(content.points?.length ? "chart/with-takeaways" : "chart/full", 0.9, "numeric series");
  if (content.table) add("table/standard", 0.85, "tabular data");
  if (content.nodes?.length) add("process/flow", 0.8, "nodes and edges");
  if (content.quote) add("quote/pull", 0.9, "a quotation");
  if (content.people?.length) add("people/grid", 0.85, "people");
  if (content.pairs?.length) add("qa/two-column", 0.85, "questions and answers");
  if (content.sources?.length) add("sources/list", 0.85, "references");
  if (content.actions?.length || (context.index === context.count - 1 && context.count > 2 && !metrics && !content.chart)) add("closing/call-to-action", 0.75, "last slide or actions");
  if (content.statement && points === 0) add("statement/big-claim", 0.85, "a single claim with no evidence");
  if (points > 0) add(points > 6 ? "bullets/two-column" : "bullets/one-column", 0.6, `${points} points`);
  if (candidates.length === 0) add("statement/big-claim", 0.3, "nothing else matched");

  // Rhythm: avoid repeating the previous slide's recipe when an alternative scores close.
  for (const candidate of candidates) {
    if (context.previous && candidate.recipe === context.previous) {
      candidate.score -= 0.15;
      candidate.reason += "; same recipe as the previous slide";
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.recipe.localeCompare(right.recipe));
  const chosen = candidates[0]!;
  return { recipe: chosen.recipe, content: contentFor(chosen.recipe, content), trail: candidates };
}

/** Map typed content onto a recipe's slot names. */
export function contentFor(recipeId: string, content: TypedContent): Record<string, unknown> {
  const recipe = getRecipe(recipeId);
  const mapped: Record<string, unknown> = { ...content };
  mapped.title ??= content.statement ?? content.quote ?? "";
  mapped.items ??= content.points?.map((point) => typeof point === "string" ? { label: point } : { label: point.text, detail: point.sub?.join("; ") });
  mapped.points = content.points?.map((point) => typeof point === "string" ? point : point.text);
  if (recipeId === "statement/big-claim") mapped.statement = content.statement ?? content.title;
  if (recipeId === "metrics/hero" && content.metrics?.[0]) {
    mapped.hero = content.metrics[0];
    mapped.metrics = content.metrics.slice(1);
  }
  if (recipeId.startsWith("table/") && !content.table && content.groups) {
    const longest = Math.max(...content.groups.map((group) => group.points.length));
    mapped.table = {
      columns: content.groups.map((group) => group.name),
      rows: Array.from({ length: longest }, (_, row) => content.groups!.map((group) => group.points[row] ?? "")),
    };
  }
  if (recipeId === "closing/call-to-action") mapped.actions = content.actions ?? mapped.points;
  if (recipeId === "chart/with-takeaways") mapped.takeaways = mapped.points;
  if (recipeId === "image/half-bleed") mapped.body = content.subtitle ?? (mapped.points as string[] | undefined)?.join("\n");
  if (recipeId === "decision/recommendation") mapped.statement ??= content.statement;
  return normalizeContent(recipe, mapped);
}

/** Charts written as bare data become chart specs; nothing else changes. */
export function normalizeContent(recipe: Recipe | undefined, content: Record<string, unknown>): Record<string, unknown> {
  const result = { ...content };
  const chart = result.chart as Record<string, unknown> | undefined;
  if (chart && (Array.isArray(chart.categories) || Array.isArray(chart.columns)) && chart.data === undefined) {
    const data = toChartData(chart);
    result.chart = { data: chart, ...(data ? { kind: typeof chart.kind === "string" ? chart.kind : suggestChartKind(data) } : {}) };
  }
  if (recipe) {
    for (const [slot, spec] of Object.entries(recipe.slots)) {
      if (typeof spec === "object" && result[slot] === undefined) result[slot] = [];
    }
  }
  return result;
}

/** Check content against a recipe's slots: required slots present, list lengths within bounds. */
export function checkSlots(recipe: Recipe, content: Record<string, unknown>, path: string, slide: string, reportUnknown = true): Finding[] {
  const findings: Finding[] = [];
  for (const [slot, spec] of Object.entries(recipe.slots) as Array<[string, SlotSpec]>) {
    const value = content[slot];
    const slotPath = joinPointer(path, "content", slot);
    if (typeof spec === "string") {
      const optional = spec.endsWith("?");
      if (!optional && (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0))) {
        findings.push({ code: "recipe-slot-missing", severity: "blocking", tier: "T0", message: `Recipe ${recipe.id} needs "${slot}".`, path: slotPath, slide });
      }
      continue;
    }
    const list = Array.isArray(value) ? value : [];
    if (list.length < spec.min || list.length > spec.max) {
      findings.push({ code: "recipe-slot-count", severity: list.length > spec.max ? "blocking" : "major", tier: "T0", message: `Recipe ${recipe.id} takes ${spec.min}–${spec.max} ${slot}; got ${list.length}.`, path: slotPath, slide, hint: list.length > spec.max ? "Split the slide or choose a recipe with more capacity." : undefined });
    }
  }
  for (const key of reportUnknown ? Object.keys(content) : []) {
    if (!(key in recipe.slots) && content[key] !== undefined) {
      findings.push({ code: "recipe-slot-unknown", severity: "minor", tier: "T0", message: `Recipe ${recipe.id} has no slot "${key}"; it is ignored.`, path: joinPointer(path, "content", key), slide });
    }
  }
  return findings;
}
