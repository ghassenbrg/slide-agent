import type { CanvasElementSpec, DeckVisualSystem, JsonValue, VariableReference } from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";

/**
 * The deck's own design language, resolved.
 *
 * Slide Agent's fixed `DeckTokens` describe *its* fallback design system. This
 * describes the author's. The names are arbitrary on purpose — `excavation-note`
 * and `signal-fog` are as valid as `title` — so the resolver's only jobs are to
 * follow references, apply them in a defined order, and refuse an incoherent
 * system with a message the author can act on. It never renames a style, never
 * substitutes a value, and never adds one the author did not write.
 */

/** The one reference syntax: `{"$var":"map-ink"}`. */
export const VARIABLE_REFERENCE_KEY = "$var";

const HEX = /^#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

type PropertyKind = "color" | "number" | "boolean" | "string" | "string-list" | "any";

/**
 * What a concrete element property will accept. A variable is general JSON, so
 * the moment it lands on a property with a type this is what catches the
 * mismatch — precisely, at the property, rather than by coercing it into
 * something the renderer will silently draw wrong.
 */
const PROPERTY_KINDS: Record<string, PropertyKind> = {
  color: "color",
  fill: "color",
  lineColor: "color",
  background: "color",
  textColor: "color",
  shadow: "color",
  highlight: "color",
  fontSize: "number",
  lineWidth: "number",
  width: "number",
  transparency: "number",
  rotate: "number",
  lineSpacing: "number",
  lineSpacingMultiple: "number",
  charSpacing: "number",
  indent: "number",
  columns: "number",
  scale: "number",
  amount: "number",
  bold: "boolean",
  italic: "boolean",
  underline: "boolean",
  noBreak: "boolean",
  dashed: "boolean",
  arrow: "boolean",
  beginArrow: "boolean",
  grayscale: "boolean",
  fontFace: "string",
  align: "string",
  valign: "string",
  fit: "string",
  shape: "string",
  maskShape: "string",
  colors: "string-list",
};

export function isVariableReference(value: unknown): value is VariableReference {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value as object).length === 1
    && typeof (value as Record<string, unknown>)[VARIABLE_REFERENCE_KEY] === "string";
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  return typeof value;
}

function accepts(kind: PropertyKind, value: unknown): boolean {
  switch (kind) {
    case "color": return typeof value === "string" && HEX.test(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "string": return typeof value === "string";
    case "string-list": return Array.isArray(value) && value.every((entry) => typeof entry === "string");
    default: return true;
  }
}

function expectation(kind: PropertyKind): string {
  switch (kind) {
    case "color": return "a hex color such as \"1B2A41\"";
    case "number": return "a finite number";
    case "boolean": return "true or false";
    case "string": return "a string";
    case "string-list": return "an array of strings";
    default: return "a JSON value";
  }
}

/** A resolved, deck-specific visual system. Construct once per deck. */
export class VisualSystem {
  private readonly variables: Record<string, JsonValue>;
  private readonly styles: NonNullable<DeckVisualSystem["styles"]>;

  public constructor(system: DeckVisualSystem | undefined) {
    this.variables = system?.variables ?? {};
    this.styles = system?.styles ?? {};
  }

  public get isEmpty(): boolean {
    return Object.keys(this.variables).length === 0 && Object.keys(this.styles).length === 0;
  }

  public get styleNames(): string[] {
    return Object.keys(this.styles);
  }

  public get variableNames(): string[] {
    return Object.keys(this.variables);
  }

  /**
   * Resolves one variable, following chains of references and refusing a cycle.
   * The value is returned exactly as authored; nothing is coerced here.
   */
  public variable(name: string, where: string, trail: string[] = []): JsonValue {
    if (trail.includes(name)) {
      throw new SlideAgentError(
        "VISUAL_SYSTEM_VARIABLE_CYCLE",
        `${where}: variable "${name}" refers to itself through ${[...trail, name].join(" → ")}. Break the cycle by giving one of them a literal value.`,
        { variable: name, trail: [...trail, name] },
      );
    }
    if (!(name in this.variables)) {
      const known = Object.keys(this.variables);
      throw new SlideAgentError(
        "VISUAL_SYSTEM_UNKNOWN_VARIABLE",
        `${where}: no variable named "${name}" in creativeDirection.visualSystem.variables.${known.length ? ` Declared: ${known.join(", ")}.` : " None are declared."}`,
        { variable: name, declared: known },
      );
    }
    const value = this.variables[name] as JsonValue;
    return this.substitute(value, `${where} → $var:${name}`, [...trail, name], undefined) as JsonValue;
  }

  /**
   * Replaces every `{"$var":…}` inside a value, checking each substitution
   * against the property it lands on.
   */
  private substitute(value: unknown, where: string, trail: string[], propertyName: string | undefined): unknown {
    if (isVariableReference(value)) {
      const name = value[VARIABLE_REFERENCE_KEY];
      const resolved = this.variable(name, where, trail);
      const kind = propertyName ? PROPERTY_KINDS[propertyName] ?? "any" : "any";
      if (!accepts(kind, resolved)) {
        throw new SlideAgentError(
          "VISUAL_SYSTEM_VARIABLE_TYPE",
          `${where}: variable "${name}" is ${describe(resolved)}, but "${propertyName}" needs ${expectation(kind)}. Give the property a literal value, or point it at a variable of the right shape.`,
          { variable: name, property: propertyName, expected: kind, received: describe(resolved) },
        );
      }
      return resolved;
    }
    if (Array.isArray(value)) {
      return value.map((entry, index) => this.substitute(entry, `${where}[${index}]`, trail, propertyName));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .map(([key, entry]) => [key, this.substitute(entry, `${where}.${key}`, trail, key)]),
      );
    }
    return value;
  }

  /** One named style with its `basedOn` chain flattened, references intact. */
  private namedStyle(name: string, where: string, trail: string[]): Record<string, unknown> {
    if (trail.includes(name)) {
      throw new SlideAgentError(
        "VISUAL_SYSTEM_STYLE_CYCLE",
        `${where}: style "${name}" inherits from itself through ${[...trail, name].join(" → ")}. Remove one link from the basedOn chain.`,
        { style: name, trail: [...trail, name] },
      );
    }
    const entry = this.styles[name];
    if (!entry) {
      const known = Object.keys(this.styles);
      throw new SlideAgentError(
        "VISUAL_SYSTEM_UNKNOWN_STYLE",
        `${where}: no style named "${name}" in creativeDirection.visualSystem.styles.${known.length ? ` Declared: ${known.join(", ")}.` : " None are declared."}`,
        { style: name, declared: known },
      );
    }
    let merged: Record<string, unknown> = {};
    for (const parent of entry.basedOn ?? []) {
      merged = mergeStyle(merged, this.namedStyle(parent, where, [...trail, name]));
    }
    return mergeStyle(merged, entry.style ?? {});
  }

  /**
   * The final style for one element: every referenced style in order, then the
   * element's own values as the last word, then variable substitution.
   */
  public resolveStyle(
    refs: string | string[] | undefined,
    own: Record<string, unknown> | undefined,
    where: string,
  ): Record<string, unknown> | undefined {
    const names = refs === undefined ? [] : Array.isArray(refs) ? refs : [refs];
    if (names.length === 0 && !own) return undefined;
    let merged: Record<string, unknown> = {};
    for (const name of names) merged = mergeStyle(merged, this.namedStyle(name, where, []));
    merged = mergeStyle(merged, own ?? {});
    return this.substitute(merged, where, [], undefined) as Record<string, unknown>;
  }

  /**
   * Resolves any `$var` in a value that is not part of an element style — a
   * slide background, a table cell, a chart colour list.
   */
  public resolveValue<T>(value: T, where: string, propertyName?: string): T {
    return this.substitute(value, where, [], propertyName) as T;
  }
}

/**
 * Shallow merge, except `options`, which merges one level deeper so two styles
 * can each contribute native PptxGenJS options without the second erasing the
 * first.
 */
function mergeStyle(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base, ...over };
  const baseOptions = base.options;
  const overOptions = over.options;
  if (baseOptions && overOptions && typeof baseOptions === "object" && typeof overOptions === "object") {
    merged.options = { ...(baseOptions as object), ...(overOptions as object) };
  }
  return merged;
}

/** Where a resolution failure happened, for the error message. */
export function elementContext(slideNumber: number, element: { id: string; type?: string }): string {
  return `Slide ${slideNumber} element "${element.id}"${element.type ? ` (${element.type})` : ""}`;
}

/**
 * Applies the deck's visual system to one canvas element, returning a new
 * element. Untouched when the element references nothing and the system is
 * empty, so an author who never used the feature pays nothing for it.
 */
export function applyVisualSystem(
  system: VisualSystem,
  element: CanvasElementSpec,
  slideNumber: number,
): CanvasElementSpec {
  const where = elementContext(slideNumber, element);
  const hasRefs = element.styleRef !== undefined;
  if (!hasRefs && system.isEmpty) return element;

  // `table` and `native-chart` carry their native properties on `options`;
  // everything else on `style`. A styleRef targets whichever one the element
  // actually has, so one vocabulary covers the whole canvas.
  const target = element.type === "table" || element.type === "native-chart" ? "options" : "style";
  const source = element as unknown as Record<string, unknown>;
  const resolved = system.resolveStyle(
    element.styleRef,
    source[target] as Record<string, unknown> | undefined,
    where,
  );

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    // The reference itself is authoring intent: it stays on the element so the
    // emitted scene round-trips exactly what the author wrote.
    if (key === target || key === "styleRef") continue;
    next[key] = system.isEmpty ? value : system.resolveValue(value, `${where}.${key}`, key);
  }
  if (resolved !== undefined) next[target] = resolved;
  if (element.styleRef !== undefined) next.styleRef = element.styleRef;
  return next as unknown as CanvasElementSpec;
}
