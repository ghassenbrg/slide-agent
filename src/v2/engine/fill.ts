import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { loadDataTable } from "../../data/connectors.js";
import { assertInsideWorkspace } from "../../security/policy.js";
import { SlideAgentError } from "../../utils/errors.js";
import type { Engine, BuildResult } from "./engine.js";

/**
 * Template-fill: direct once, fill many.
 *
 * An intent template is a DeckIntent a model (or person) designed once, with
 * bindings: `{{account.name}}` inside strings, a whole-string `{{quarters}}`
 * that takes the value itself, a slide-level `"$each": "regions"` that repeats
 * a slide per item, and `"$if": "path"` that keeps a slide only when the value
 * is truthy. `"$requires": ["account.name", …]` asserts the data's shape.
 * Filling is deterministic and uses no model.
 */

type Scope = Record<string, unknown>;

const BINDING = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;
const WHOLE_BINDING = /^\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}$/;

function lookup(scope: Scope, name: string): unknown {
  let value: unknown = scope;
  for (const part of name.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function bind(template: unknown, scope: Scope, missing: Set<string>): unknown {
  if (typeof template === "string") {
    const whole = WHOLE_BINDING.exec(template);
    if (whole) {
      const value = lookup(scope, whole[1]!);
      if (value === undefined) missing.add(whole[1]!);
      return value ?? "";
    }
    return template.replace(BINDING, (_match, name: string) => {
      const value = lookup(scope, name);
      if (value === undefined) missing.add(name);
      return value === undefined || value === null ? "" : String(value);
    });
  }
  if (Array.isArray(template)) return template.map((item) => bind(item, scope, missing));
  if (template && typeof template === "object") {
    return Object.fromEntries(Object.entries(template as Record<string, unknown>).map(([key, value]) => [key, bind(value, scope, missing)]));
  }
  return template;
}

export function fillTemplate(template: Record<string, unknown>, data: Scope): { intent: Record<string, unknown>; missing: string[] } {
  const missing = new Set<string>();
  const requires = Array.isArray(template.$requires) ? template.$requires as string[] : [];
  for (const requirement of requires) if (lookup(data, requirement) === undefined) missing.add(requirement);
  const slides: unknown[] = [];
  for (const slide of (template.slides as Array<Record<string, unknown>>) ?? []) {
    const condition = slide.$if;
    if (typeof condition === "string" && !lookup(data, condition)) continue;
    const { $each: each, $if: _if, ...body } = slide;
    if (typeof each === "string") {
      const list = lookup(data, each);
      if (!Array.isArray(list)) {
        missing.add(each);
        continue;
      }
      list.forEach((item, index) => {
        const scope = { ...data, item, index: index + 1, ...(item && typeof item === "object" ? item as Scope : {}) };
        const bound = bind(body, scope, missing) as Record<string, unknown>;
        bound.id = `${String(bound.id ?? "slide")}-${index + 1}`.slice(0, 41);
        slides.push(bound);
      });
    } else {
      slides.push(bind(body, data, missing));
    }
  }
  const { $requires: _requires, slides: _slides, ...rest } = template;
  const intent = bind(rest, data, missing) as Record<string, unknown>;
  intent.slides = slides;
  return { intent, missing: [...missing].sort() };
}

function slug(value: string, index: number): string {
  const base = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return base || `deck-${index + 1}`;
}

export interface FillRequest {
  template: string;
  data: string;
  out: string;
  /** Data field naming each output deck. */
  nameBy?: string;
  previews?: "sheet" | "none";
}

export async function fillDecks(engine: Engine, request: FillRequest): Promise<Array<{ name: string; deck: string; state: string; missing: string[]; result?: BuildResult }>> {
  const templatePath = assertInsideWorkspace(request.template, "template");
  const template = JSON.parse(await readFile(templatePath, "utf8")) as Record<string, unknown>;
  const dataPath = assertInsideWorkspace(request.data, "data");
  let rows: Scope[];
  if (/\.json$/i.test(dataPath)) {
    const parsed = JSON.parse(await readFile(dataPath, "utf8")) as unknown;
    rows = Array.isArray(parsed) ? parsed as Scope[] : [parsed as Scope];
  } else {
    const table = await loadDataTable(dataPath);
    rows = table.rows.map((row) => Object.fromEntries(table.headers.map((column, index) => [column, row[index]])));
  }
  if (rows.length === 0) throw new SlideAgentError("FILL_NO_DATA", `${dataPath} has no rows to fill.`);
  const out = assertInsideWorkspace(request.out, "out");
  await mkdir(out, { recursive: true });
  const results = [];
  for (const [index, row] of rows.entries()) {
    const { intent, missing } = fillTemplate(template, row);
    const name = slug(String(request.nameBy ? lookup(row, request.nameBy) ?? "" : row.name ?? row.id ?? ""), index);
    const deck = path.join(out, name);
    if (missing.length > 0) {
      results.push({ name, deck, state: "needs-attention", missing });
      continue;
    }
    const result = await engine.build({ deck, intent, previews: request.previews ?? "none" });
    results.push({ name, deck, state: result.verdict.state, missing, result });
  }
  return results;
}
