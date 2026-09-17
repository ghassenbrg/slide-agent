import { getRecipe } from "../compose/recipes.js";
import { expandNode } from "../compose/expand.js";
import { normalizeContent } from "../compose/selector.js";
import type { DeckIntent } from "../ir/intent.js";
import { parsePointer, pointer } from "../ir/issues.js";
import type { EditOp, SuggestedEdit } from "../ir/verdict.js";
import { SlideAgentError } from "../../utils/errors.js";

/**
 * EditOps applied to a DeckIntent. Edits go to the highest level that can
 * express them: intent (content and composition), design (the language),
 * element (pins and overrides that survive rebuilds). Package-level edits on
 * foreign decks are applied by the engine through the OOXML editor.
 */

type Json = unknown;

function containerAt(root: Json, segments: string[], create = false): { parent: Record<string, Json> | Json[]; key: string } {
  if (segments.length === 0) throw new SlideAgentError("EDIT_PATH_INVALID", "An edit path cannot be the document root.");
  let current = root as Record<string, Json> | Json[];
  for (const segment of segments.slice(0, -1)) {
    const next = Array.isArray(current) ? current[Number(segment)] : current[segment];
    if (next === undefined || next === null || typeof next !== "object") {
      if (!create || Array.isArray(current)) throw new SlideAgentError("EDIT_PATH_NOT_FOUND", `Nothing at /${segments.join("/")} (stopped at "${segment}").`, { path: `/${segments.join("/")}` });
      (current as Record<string, Json>)[segment] = {};
      current = (current as Record<string, Json>)[segment] as Record<string, Json>;
      continue;
    }
    current = next as Record<string, Json> | Json[];
  }
  return { parent: current, key: segments.at(-1)! };
}

export function getAt(root: Json, path: string): Json {
  let current = root;
  for (const segment of parsePointer(path)) {
    if (current === null || typeof current !== "object") return undefined;
    current = Array.isArray(current) ? current[Number(segment)] : (current as Record<string, Json>)[segment];
  }
  return current;
}

export function setAt(root: Json, path: string, value: Json): void {
  const { parent, key } = containerAt(root, parsePointer(path), true);
  if (Array.isArray(parent)) {
    const index = key === "-" ? parent.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new SlideAgentError("EDIT_PATH_INVALID", `Index ${key} is outside the list at ${path}.`);
    parent[index] = value;
  } else {
    parent[key] = value;
  }
}

export function insertAt(root: Json, path: string, value: Json): void {
  const { parent, key } = containerAt(root, parsePointer(path));
  if (!Array.isArray(parent)) throw new SlideAgentError("EDIT_PATH_INVALID", `insert needs a list position; ${path} is not in a list.`);
  const index = key === "-" ? parent.length : Number(key);
  if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new SlideAgentError("EDIT_PATH_INVALID", `Index ${key} is outside the list at ${path}.`);
  parent.splice(index, 0, value);
}

export function removeAt(root: Json, path: string): Json {
  const { parent, key } = containerAt(root, parsePointer(path));
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) throw new SlideAgentError("EDIT_PATH_NOT_FOUND", `Nothing at ${path}.`);
    return parent.splice(index, 1)[0];
  }
  if (!(key in parent)) throw new SlideAgentError("EDIT_PATH_NOT_FOUND", `Nothing at ${path}.`);
  const removed = parent[key];
  delete parent[key];
  return removed;
}

/** Remove `$`-prefixed expansion metadata so an expanded recipe reads as authored JSON. */
export function stripMetadata(value: Json): Json {
  if (Array.isArray(value)) return value.map(stripMetadata);
  if (value && typeof value === "object") {
    const result: Record<string, Json> = {};
    for (const [key, item] of Object.entries(value as Record<string, Json>)) if (!key.startsWith("$")) result[key] = stripMetadata(item);
    return result;
  }
  return value;
}

/** The composition behind a recipe slide, ready to edit as a `compose` slide. */
export function expandRecipeSlide(intent: DeckIntent, index: number): Json {
  const slide = intent.slides[index] as { recipe?: string; content?: Record<string, unknown> } | undefined;
  if (!slide?.recipe) throw new SlideAgentError("EXPAND_NOT_A_RECIPE", `Slide ${index} is not a recipe slide.`);
  const recipe = getRecipe(slide.recipe);
  if (!recipe) throw new SlideAgentError("RECIPE_UNKNOWN", `No recipe "${slide.recipe}".`);
  const expanded = expandNode(structuredClone(recipe.root), pointer("slides", index, "compose"), normalizeContent(recipe, slide.content ?? {}), {
    components: intent.components ?? {}, findings: [], slide: String(index), provenance: "recipe", recipe: recipe.id,
  });
  return stripMetadata(expanded);
}

export interface ApplyResult {
  intent: DeckIntent;
  /** Slide ids whose content changed; `undefined` means the whole deck (design or components). */
  changed?: Set<string>;
  notes: string[];
}

function slideIdAt(intent: DeckIntent, path: string): string | undefined {
  const match = /^\/slides\/(\d+)/.exec(path);
  return match ? intent.slides[Number(match[1])]?.id : undefined;
}

export function applyEdits(source: DeckIntent, ops: EditOp[], context: { suggestedEdits?: SuggestedEdit[] } = {}): ApplyResult {
  const intent = structuredClone(source) as DeckIntent;
  const notes: string[] = [];
  let changed: Set<string> | undefined = new Set<string>();
  const touch = (id: string | undefined) => {
    if (!id) changed = undefined;
    else changed?.add(id);
  };

  for (const op of ops) {
    switch (op.level) {
      case "intent": {
        const path = op.path ?? "";
        if (!path && op.op !== "choose") throw new SlideAgentError("EDIT_PATH_REQUIRED", `${op.op} needs a JSON pointer in path.`);
        if (path.startsWith("/design") || path.startsWith("/components") || path.startsWith("/data") || path.startsWith("/options") || path.startsWith("/brief")) touch(undefined);
        switch (op.op) {
          case "set":
            touch(slideIdAt(intent, path));
            setAt(intent, path, op.value);
            touch(slideIdAt(intent, path));
            break;
          case "insert":
            insertAt(intent, path, op.value);
            touch(/^\/slides\/[^/]+$/.test(path) ? (op.value as { id?: string })?.id : slideIdAt(intent, path));
            break;
          case "remove":
            touch(slideIdAt(intent, path));
            removeAt(intent, path);
            if (/^\/slides\/\d+$/.test(path)) touch(undefined);
            break;
          case "move": {
            if (!op.to) throw new SlideAgentError("EDIT_MOVE_NEEDS_TO", "move needs a destination pointer in `to`.");
            touch(slideIdAt(intent, path));
            const value = removeAt(intent, path);
            insertAt(intent, op.to, value);
            if (/^\/slides\/\d+$/.test(path)) touch(undefined);
            else touch(slideIdAt(intent, op.to));
            break;
          }
          case "choose": {
            const edit = context.suggestedEdits?.find((candidate) => candidate.id === (op.edit ?? path));
            if (!edit) throw new SlideAgentError("EDIT_CHOICE_UNKNOWN", `No pending choice "${op.edit ?? path}". Rebuild to see current choices.`);
            const option = edit.options?.[op.option ?? 0];
            if (!option) throw new SlideAgentError("EDIT_CHOICE_OPTION", `Choice ${edit.id} has no option ${op.option ?? 0}.`);
            if (option.do === "split") {
              const split = splitSlide(intent, edit.slide ?? slideIdAt(intent, edit.path ?? "") ?? "");
              notes.push(split);
              touch(undefined);
            } else if (option.path) {
              setAt(intent, option.path, option.value);
              touch(slideIdAt(intent, option.path));
            }
            break;
          }
          case "expand": {
            const match = /^\/slides\/(\d+)$/.exec(path);
            if (!match) throw new SlideAgentError("EDIT_PATH_INVALID", "expand takes a slide pointer, e.g. /slides/3.");
            const index = Number(match[1]);
            const slide = intent.slides[index] as Record<string, unknown>;
            const compose = expandRecipeSlide(intent, index);
            delete slide.recipe;
            delete slide.content;
            delete slide.adjust;
            slide.compose = compose;
            touch(slide.id as string);
            notes.push(`Slide ${slide.id as string} is now a composition you can edit freely.`);
            break;
          }
        }
        break;
      }
      case "design": {
        touch(undefined);
        if (op.op === "brand") {
          intent.design = { brand: String(op.value) };
          break;
        }
        if (!("language" in intent.design)) throw new SlideAgentError("EDIT_DESIGN_NOT_AUTHORED", "Design edits by path apply to an authored design language; this deck uses a preset, brand, or token document.");
        const base = `/design/language${op.path ?? ""}`;
        if (op.op === "set") setAt(intent, base, op.value);
        else removeAt(intent, base);
        break;
      }
      case "element": {
        const index = intent.slides.findIndex((slide) => slide.id === op.slide);
        if (index < 0) throw new SlideAgentError("EDIT_SLIDE_UNKNOWN", `No slide "${op.slide}".`);
        const slide = intent.slides[index]!;
        const pins = [...(slide.pins ?? [])];
        if (op.set.refuse) {
          pins.push({ path: `/elements/${op.element}`, refuse: op.set.refuse });
        }
        const { refuse: _refuse, ...override } = op.set;
        if (Object.keys(override).length > 0) pins.push({ path: `/elements/${op.element}`, value: override });
        slide.pins = pins;
        touch(slide.id);
        break;
      }
      case "package":
        throw new SlideAgentError("EDIT_PACKAGE_NEEDS_PPTX", "Package edits apply to a .pptx; pass the file as the deck.");
    }
  }
  return { intent, ...(changed ? { changed } : {}), notes };
}

/**
 * Continue a slide on a new one. Recipe and draft slides split their longest
 * list in half; a composed slide is duplicated for the author to divide, since
 * where a composition breaks is a design decision.
 */
function splitSlide(intent: DeckIntent, slideId: string): string {
  const index = intent.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) throw new SlideAgentError("EDIT_SLIDE_UNKNOWN", `No slide "${slideId}" to split.`);
  const slide = intent.slides[index] as Record<string, unknown>;
  const continuation = structuredClone(slide);
  continuation.id = uniqueId(intent, `${slideId}-cont`);
  continuation.message = `${String(slide.message)} (continued)`.slice(0, 200);
  const content = (slide.content ?? slide.auto) as Record<string, unknown> | undefined;
  if (content) {
    const key = Object.entries(content).filter(([, value]) => Array.isArray(value) && value.length > 1).sort(([, a], [, b]) => (b as unknown[]).length - (a as unknown[]).length)[0]?.[0];
    if (key) {
      const list = content[key] as unknown[];
      const half = Math.ceil(list.length / 2);
      content[key] = list.slice(0, half);
      ((continuation.content ?? continuation.auto) as Record<string, unknown>)[key] = list.slice(half);
      intent.slides.splice(index + 1, 0, continuation as never);
      return `Split ${key} across ${slideId} and ${String(continuation.id)}.`;
    }
  }
  intent.slides.splice(index + 1, 0, continuation as never);
  return `Duplicated ${slideId} as ${String(continuation.id)}; divide the composition between them.`;
}

function uniqueId(intent: DeckIntent, base: string): string {
  const ids = new Set(intent.slides.map((slide) => slide.id));
  let candidate = base.slice(0, 41);
  let counter = 2;
  while (ids.has(candidate)) {
    candidate = `${base.slice(0, 38)}-${counter}`;
    counter += 1;
  }
  return candidate;
}
