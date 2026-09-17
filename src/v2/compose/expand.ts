import type { ComponentDef } from "../ir/intent.js";
import { didYouMean, joinPointer, type Finding } from "../ir/issues.js";
import { NODE_KINDS } from "../ir/compose.js";

/**
 * Expansion: components, repeats, and recipe slots become plain composition
 * JSON before anything is solved.
 *
 * Works on authored JSON, not on normalised nodes, so a component or recipe is
 * exactly a composition with holes. Every object produced is stamped with
 * `$ptr` (where a finding about it should point: the instance, not the
 * definition), `$prov`, and `$component` / `$recipe`.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Scope = Record<string, unknown>;

/** Keys a `use` instance may set on the component's root instead of passing as params. */
const OVERRIDE_KEYS = new Set([
  "id", "at", "box", "grow", "basis", "width", "height", "minHeight", "maxWidth", "alignSelf", "bleed", "surface",
  "z", "rotate", "opacity", "decorative", "order", "optional", "tone", "size", "pins", "gap", "pad", "align", "justify",
]);

export interface ExpandContext {
  components: Record<string, ComponentDef>;
  findings: Finding[];
  slide: string;
  provenance: "composed" | "recipe" | "draft";
  recipe?: string;
  /** Guards against components that use themselves. */
  stack?: string[];
}

const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const WHOLE_PLACEHOLDER = /^\{([a-zA-Z_][a-zA-Z0-9_.]*)\}$/;

function lookup(scope: Scope, name: string): unknown {
  let value: unknown = scope;
  for (const part of name.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Substitute `{param}` holes. A whole-string hole takes the value itself (arrays, objects, numbers). */
export function substitute(template: unknown, scope: Scope): unknown {
  if (typeof template === "string") {
    const whole = WHOLE_PLACEHOLDER.exec(template);
    if (whole) return lookup(scope, whole[1]!);
    return template.replace(PLACEHOLDER, (_match, name: string) => {
      const value = lookup(scope, name);
      return value === undefined || value === null ? "" : String(value);
    });
  }
  if (Array.isArray(template)) return template.map((item) => substitute(item, scope));
  if (template && typeof template === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      // A repeat's item template is substituted per entry, later.
      result[key] = key === "item" ? value : substitute(value, scope);
    }
    return result;
  }
  return template;
}

function kindOf(node: Record<string, unknown>): string | undefined {
  return (NODE_KINDS as readonly string[]).find((kind) => Object.hasOwn(node, kind));
}

/** A node whose only content resolved to nothing and that was marked optional disappears. */
function droppedAsEmpty(node: Record<string, unknown>): boolean {
  if (node.optional !== true) return false;
  const kind = kindOf(node);
  if (!kind) return true;
  const value = node[kind];
  if (kind === "text" || kind === "image" || kind === "icon") return isEmpty(value) || (typeof value === "string" && value.trim() === "");
  if (kind === "chart" || kind === "table") return isEmpty(value) || (typeof value === "object" && isEmpty((value as Record<string, unknown>).data));
  const inner = value && typeof value === "object" ? value as Record<string, unknown> : node;
  if (Array.isArray(inner.items)) return inner.items.length === 0;
  return false;
}

/**
 * Expand one authored node. `path` is the pointer findings about this node
 * should carry; inside a component it stays on the instance.
 */
export function expandNode(raw: unknown, path: string, scope: Scope, context: ExpandContext, insideDefinition = false): Json | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw as Json;
  let node = { ...(raw as Record<string, unknown>) };

  if (typeof node.use === "string") return expandUse(node, path, scope, context);

  const stamp = (target: Record<string, unknown>) => {
    if (target.$ptr === undefined) target.$ptr = path;
    if (target.$prov === undefined) target.$prov = context.provenance === "composed" && insideDefinition ? "component" : context.provenance;
    if (context.recipe && target.$recipe === undefined) target.$recipe = context.recipe;
  };

  const kind = kindOf(node);
  const containerValue = kind && ["grid", "row", "column", "layer", "free"].includes(kind) && node[kind] && typeof node[kind] === "object" && !Array.isArray(node[kind])
    ? { ...(node[kind] as Record<string, unknown>) }
    : undefined;
  const host = containerValue ?? node;
  const itemsKey = Array.isArray(host.items) || host.each !== undefined ? "items" : undefined;

  if (itemsKey !== undefined || host.each !== undefined) {
    const expandedItems: Json[] = [];
    if (typeof host.each === "string") {
      const list = lookup(scope, host.each);
      const template = host.item;
      if (list === undefined || list === null) {
        // An absent optional list is an empty repeat.
      } else if (!Array.isArray(list)) {
        context.findings.push({ code: "repeat-not-a-list", severity: "blocking", tier: "T0", message: `"each": "${host.each}" needs a list; got ${typeof list}.`, path, slide: context.slide });
      } else if (!template || typeof template !== "object") {
        context.findings.push({ code: "repeat-without-item", severity: "blocking", tier: "T0", message: `A repeat over "${host.each}" needs an "item" template.`, path, slide: context.slide });
      } else {
        list.forEach((entry, index) => {
          const entryScope: Scope = {
            ...scope,
            ...(entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Scope : {}),
            item: entry,
            index: index + 1,
            first: index === 0,
            last: index === list.length - 1,
          };
          const instance = substitute(template, entryScope) as Record<string, unknown>;
          const entryPath = context.provenance === "composed" ? path : joinPointer(path, "items", index);
          const expanded = expandNode({ ...instance, $slot: `${host.each}[${index}]` }, entryPath, entryScope, context, insideDefinition);
          if (expanded !== undefined) expandedItems.push(expanded);
        });
      }
      delete host.each;
      delete host.item;
    }
    if (Array.isArray(host.items)) {
      (host.items as unknown[]).forEach((item, index) => {
        const itemPath = insideDefinition || context.provenance !== "composed"
          ? path
          : joinPointer(path, ...(containerValue ? [kind!, "items", index] : ["items", index]));
        const substituted = insideDefinition || context.provenance !== "composed" ? substitute(item, scope) : item;
        const expanded = expandNode(substituted, itemPath, scope, context, insideDefinition);
        if (expanded !== undefined) expandedItems.push(expanded);
      });
    }
    host.items = expandedItems;
    if (containerValue) node = { ...node, [kind!]: host };
    else node = host;
  }

  if (droppedAsEmpty(node)) return undefined;
  stamp(node);
  return node as Json;
}

function expandUse(node: Record<string, unknown>, path: string, scope: Scope, context: ExpandContext): Json | undefined {
  const name = node.use as string;
  const definition = context.components[name];
  if (!definition) {
    context.findings.push({
      code: "component-unknown",
      severity: "blocking",
      tier: "T0",
      message: `No component "${name}".${didYouMean(name, Object.keys(context.components))} Define it once in "components".`,
      path: joinPointer(path, "use"),
      slide: context.slide,
    });
    return undefined;
  }
  const stack = context.stack ?? [];
  if (stack.includes(name)) {
    context.findings.push({ code: "component-cycle", severity: "blocking", tier: "T0", message: `Component "${name}" uses itself (${[...stack, name].join(" → ")}).`, path, slide: context.slide });
    return undefined;
  }
  const params: Scope = { ...(definition.defaults ?? {}) };
  const overrides: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(node)) {
    if (key === "use" || key.startsWith("$")) continue;
    const value = typeof raw === "string" || Array.isArray(raw) || (raw && typeof raw === "object") ? substitute(raw, scope) : raw;
    if (definition.params.includes(key)) params[key] = value;
    else if (OVERRIDE_KEYS.has(key)) overrides[key] = value;
    else {
      context.findings.push({
        code: "component-param-unknown",
        severity: "blocking",
        tier: "T0",
        message: `Component "${name}" has no parameter "${key}".${didYouMean(key, [...definition.params, ...OVERRIDE_KEYS])} Parameters: ${definition.params.join(", ") || "none"}.`,
        path: joinPointer(path, key),
        slide: context.slide,
      });
    }
  }
  const root = substitute(definition.root, params) as Record<string, unknown>;
  const withOverrides: Record<string, unknown> = { ...root };
  for (const [key, value] of Object.entries(overrides)) withOverrides[key] = value;
  const expanded = expandNode(
    { ...withOverrides, $ptr: path, $component: name },
    path,
    params,
    { ...context, stack: [...stack, name] },
    true,
  );
  if (expanded && typeof expanded === "object" && !Array.isArray(expanded)) stampTree(expanded, path, name, context.provenance === "composed" ? "component" : context.provenance);
  return expanded;
}

function stampTree(node: Record<string, Json>, path: string, component: string, provenance: string): void {
  // Only composition nodes carry metadata; property objects (fit, crop, data…) stay as authored.
  if (kindOf(node)) {
    if (node.$ptr === undefined) node.$ptr = path;
    node.$component ??= component;
    if (node.$prov === undefined || node.$prov === "composed") node.$prov = provenance;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item === "object" && !Array.isArray(item)) stampTree(item as Record<string, Json>, path, component, provenance);
    } else if (value && typeof value === "object") {
      stampTree(value as Record<string, Json>, path, component, provenance);
    }
  }
}

/** Apply recipe `adjust` entries to nodes by id or slot (`steps[3]`). */
export function applyAdjustments(root: Json, adjustments: Array<{ node: string; set: Record<string, unknown> }>, findings: Finding[], slide: string, path: string): void {
  const matched = new Set<number>();
  const visit = (node: Json) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    adjustments.forEach((adjustment, index) => {
      if (node.id === adjustment.node || node.$slot === adjustment.node) {
        Object.assign(node, adjustment.set);
        matched.add(index);
      }
    });
    for (const value of Object.values(node)) visit(value);
  };
  visit(root);
  adjustments.forEach((adjustment, index) => {
    if (!matched.has(index)) {
      findings.push({ code: "adjust-no-match", severity: "major", tier: "T0", message: `No node "${adjustment.node}" in this recipe to adjust.`, path: joinPointer(path, "adjust", index, "node"), slide });
    }
  });
}
