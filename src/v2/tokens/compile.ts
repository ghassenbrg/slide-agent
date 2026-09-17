import { createHash } from "node:crypto";

import {
  COLOR_ROLES,
  TYPE_ROLE_FLOORS,
  TYPE_ROLE_STEPS,
  TYPE_ROLES,
  designLanguage as designLanguageSchema,
  type ColorRole,
  type DesignLanguage,
  type DesignRequest,
  type FontSpec,
  type SurfaceSpec,
  type TextureRule,
  type TypeRole,
} from "../ir/design.js";
import { SLIDE_FORMATS_V2, type Pin, type SlideFormatV2 } from "../ir/intent.js";
import { didYouMean, type Finding } from "../ir/issues.js";
import type { Adjustment, ColorRef } from "../ir/scene.js";
import { isOfficeFamily } from "../text/catalog.js";
import type { LoadedFace, TextEngine } from "../text/measure.js";
import { contrastRatio, deltaE, isDark, nearestPassing, normalizeHex, parseColor, tint } from "./color.js";
import { presetLanguage, presetNames } from "./presets.js";

export const COMPILER_VERSION = "2.0.0";

export const THEME_SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as const;
export type ThemeSlot = typeof THEME_SLOTS[number];

export interface ResolvedFontRole {
  role: "display" | "body" | "mono";
  spec: FontSpec;
  weight: number;
  regular: LoadedFace;
  bold: LoadedFace;
  italic: LoadedFace;
  boldItalic: LoadedFace;
}

export interface ThemeSpec {
  source: "authored" | "brand" | "preset" | "tokens";
  preset?: string;
  concept: string;
  format: SlideFormatV2;
  slide: { width: number; height: number };
  palette: Record<string, string>;
  roles: Record<ColorRole, string>;
  roleNames: Record<ColorRole, string>;
  slots: Record<ThemeSlot, string>;
  slotOfName: Record<string, ThemeSlot>;
  /** Extra named colours emitted to `a:custClrLst`. */
  custom: Record<string, string>;
  clrMap: { bg1: "lt1" | "dk1"; tx1: "dk1" | "lt1"; bg2: "lt2" | "dk2"; tx2: "dk2" | "lt2" };
  data: string[];
  fonts: { display: ResolvedFontRole; body: ResolvedFontRole; mono: ResolvedFontRole };
  sizes: Record<TypeRole, number>;
  leading: Record<TypeRole, number>;
  floors: Record<TypeRole, number>;
  space: { unit: number; margin: number; gutter: number; baseline?: number };
  grid: { columns: number; rows: number };
  shape: { radius: number; stroke: number; shadow: "none" | "soft" | "hard" };
  surfaces: Record<string, SurfaceSpec>;
  texture: TextureRule[];
  imagery: NonNullable<DesignLanguage["imagery"]>;
  charts: NonNullable<DesignLanguage["charts"]>;
  chrome: NonNullable<DesignLanguage["chrome"]>;
  language: DesignLanguage;
  adjustments: Adjustment[];
  findings: Finding[];
  locks: string[];
  hash: string;
}

const DEFAULT_LEADING: Record<TypeRole, number> = {
  display: 0.95,
  title: 1.05,
  subtitle: 1.2,
  h2: 1.12,
  h3: 1.18,
  lead: 1.3,
  quote: 1.25,
  body: 1.3,
  small: 1.3,
  caption: 1.25,
  label: 1.2,
};

const WEIGHT_NAMES: Record<string, number> = { light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, black: 900 };

export function fontWeight(value: FontSpec["weight"] | number | string | undefined, fallback = 400): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return WEIGHT_NAMES[value] ?? (Number(value) || fallback);
  return fallback;
}

export interface CompileContext {
  format: SlideFormatV2;
  text: TextEngine;
  pins?: Pin[];
  /** Resolve a brand reference (path or registered name) to a partial language plus locks. */
  brand?: (reference: string) => Promise<{ language: DesignLanguage; locks: string[]; name: string }>;
  /** Called for faces that are not available locally, e.g. to fetch them under operator policy. */
  acquireFont?: (family: string, weights: number[]) => Promise<boolean>;
  officeSafe?: boolean;
}

function pinnedRefusal(pins: Pin[] | undefined, path: string, kind: string): boolean {
  return (pins ?? []).some((pin) => typeof pin !== "string" && pin.refuse === kind && (path === pin.path || path.startsWith(`${pin.path}/`)));
}

/**
 * DesignRequest → ThemeSpec. Deterministic for a given request, compiler
 * version, and set of font files. Verifies; does not choose.
 */
export async function compileDesign(request: DesignRequest, context: CompileContext): Promise<ThemeSpec> {
  const findings: Finding[] = [];
  const adjustments: Adjustment[] = [];
  let source: ThemeSpec["source"] = "authored";
  let language: DesignLanguage;
  let preset: string | undefined;
  let locks: string[] = [];
  const base = "/design";

  if ("preset" in request) {
    const generated = presetLanguage(request.preset, request.params);
    if (!generated) {
      findings.push({ code: "preset-unknown", severity: "blocking", tier: "T0", message: `No preset "${request.preset}".${didYouMean(request.preset, presetNames())} Available: ${presetNames().join(", ")}.`, path: `${base}/preset` });
      language = presetLanguage("draft/confident")!;
    } else {
      language = generated;
    }
    source = "preset";
    preset = request.preset;
  } else if ("brand" in request) {
    source = "brand";
    if (!context.brand) {
      findings.push({ code: "brand-unavailable", severity: "blocking", tier: "T0", message: "Brand design requests need a brand resolver (a template path or an imported brand pack).", path: `${base}/brand` });
      language = presetLanguage("office/safe")!;
    } else {
      const brand = await context.brand(request.brand);
      locks = brand.locks;
      language = mergeLanguage(brand.language, request.language ?? {}, locks, findings);
    }
  } else if ("tokens" in request) {
    source = "tokens";
    const imported = languageFromDtcg(request.tokens);
    if (!imported.language) {
      findings.push({ code: "tokens-invalid", severity: "blocking", tier: "T0", message: imported.error ?? "The DTCG document does not describe a design language.", path: `${base}/tokens` });
      language = presetLanguage("office/safe")!;
    } else {
      language = imported.language;
    }
  } else {
    language = request.language;
  }

  const parsed = designLanguageSchema.safeParse(language);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      findings.push({ code: "design-invalid", severity: "blocking", tier: "T0", message: issue.message, path: `${base}/language/${issue.path.join("/")}` });
    }
    // Keep compiling so every problem is reported at once, on a scaffold for
    // whatever parts are missing. The blocking findings above stop the build.
    const scaffold = presetLanguage("office/safe")!;
    const partial = (language ?? {}) as Partial<DesignLanguage>;
    language = {
      ...scaffold,
      ...partial,
      color: partial.color?.palette && partial.color.roles ? partial.color : scaffold.color,
      type: partial.type?.display && partial.type.body && partial.type.scale ? partial.type : scaffold.type,
      space: partial.space?.unit ? partial.space : scaffold.space,
      grid: partial.grid?.columns ? partial.grid : scaffold.grid,
      shape: partial.shape ?? scaffold.shape,
    };
  }

  const format = context.format;
  const slide = SLIDE_FORMATS_V2[format];
  const languagePath = `${base}/language`;

  // ------------------------------------------------------------ colours
  const palette: Record<string, string> = {};
  for (const [name, value] of Object.entries(language.color.palette)) {
    const hex = parseColor(value);
    if (!hex) {
      findings.push({ code: "color-invalid", severity: "blocking", tier: "T0", message: `"${value}" is not a colour.`, path: `${languagePath}/color/palette/${name}` });
      palette[name] = "808080";
    } else {
      palette[name] = hex;
    }
  }
  const roleNames = {} as Record<ColorRole, string>;
  for (const role of COLOR_ROLES) {
    const declared = (language.color.roles as Record<string, string | undefined>)[role];
    const fallback = role === "accentAlt" ? language.color.roles.accent : role === "rule" ? language.color.roles.muted : undefined;
    const name = declared ?? fallback;
    if (!name) continue;
    if (!palette[name]) {
      findings.push({ code: "color-role-unknown", severity: "blocking", tier: "T0", message: `Role ${role} names "${name}", which is not in the palette.${didYouMean(name, Object.keys(palette))}`, path: `${languagePath}/color/roles/${role}` });
      palette[name] = role === "background" ? "FFFFFF" : role === "text" ? "111111" : "808080";
    }
    roleNames[role] = name;
  }

  // Contrast between the roles text is set in and the grounds it sits on.
  const grounds: ColorRole[] = ["background", "surface"];
  const foregrounds: Array<{ role: ColorRole; ratio: number }> = [{ role: "text", ratio: 4.5 }, { role: "muted", ratio: 4.5 }, { role: "accent", ratio: 3 }];
  for (const { role, ratio } of foregrounds) {
    const name = roleNames[role];
    const path = `${languagePath}/color/palette/${name}`;
    for (const ground of grounds) {
      const groundName = roleNames[ground];
      if (!name || !groundName || name === groundName) continue;
      const foregroundHex = palette[name]!;
      const groundHex = palette[groundName]!;
      const current = contrastRatio(foregroundHex, groundHex);
      if (current >= ratio) continue;
      if (pinnedRefusal(context.pins, path, "contrast")) {
        findings.push({ code: "contrast-pinned", severity: "blocking", tier: "T1", message: `${role} (${name}) on ${ground} (${groundName}) is ${current.toFixed(2)}:1, under ${ratio}:1, and the adjustment is refused by a pin.`, path, hint: "Remove the pin or choose a passing value; contrast is a hard constraint." });
        continue;
      }
      // Text on the background is primary; repair against it, then re-check the surface.
      const repaired = nearestPassing(foregroundHex, groundHex, ratio);
      if (!repaired.changed) continue;
      adjustments.push({ kind: "contrast", from: `#${foregroundHex}`, to: `#${repaired.hex}`, reason: `${role} on ${ground} ${current.toFixed(2)}:1 → ${contrastRatio(repaired.hex, groundHex).toFixed(2)}:1 (needs ${ratio}:1)`, path });
      palette[name] = repaired.hex;
    }
  }

  const roles = {} as Record<ColorRole, string>;
  for (const role of COLOR_ROLES) if (roleNames[role]) roles[role] = palette[roleNames[role]]!;

  const dataNames = (language.color.data ?? [roleNames.accent, roleNames.accentAlt].filter(Boolean) as string[]);
  const data: string[] = [];
  dataNames.forEach((name, index) => {
    const hex = palette[name];
    if (!hex) {
      findings.push({ code: "color-data-unknown", severity: "blocking", tier: "T0", message: `Data colour "${name}" is not in the palette.${didYouMean(name, Object.keys(palette))}`, path: `${languagePath}/color/data/${index}` });
      return;
    }
    data.push(hex);
  });
  for (let index = 1; index < data.length; index += 1) {
    for (let previous = 0; previous < index; previous += 1) {
      if (deltaE(data[index]!, data[previous]!) < 0.06) {
        findings.push({ code: "data-colors-close", severity: "minor", tier: "T1", message: `Data colours ${dataNames[previous]} and ${dataNames[index]} are hard to tell apart (ΔE ${deltaE(data[index]!, data[previous]!).toFixed(3)}).`, path: `${languagePath}/color/data/${index}` });
      }
    }
  }

  const { slots, slotOfName, custom, clrMap } = mapSlots(palette, roleNames, dataNames);

  // ------------------------------------------------------------ type
  const fonts = {
    display: await resolveFontRole("display", language.type.display, context, findings, `${languagePath}/type/display/family`),
    body: await resolveFontRole("body", language.type.body, context, findings, `${languagePath}/type/body/family`),
    mono: await resolveFontRole("mono", language.type.mono ?? { family: "JetBrains Mono" }, context, findings, `${languagePath}/type/mono/family`, !language.type.mono),
  };

  const widthScale = Math.max(0.75, Math.min(1, slide.width / 13.333333));
  const floors = {} as Record<TypeRole, number>;
  const sizes = {} as Record<TypeRole, number>;
  const leading = {} as Record<TypeRole, number>;
  const scale = language.type.scale;
  const explicit = !("base" in scale) ? scale as Partial<Record<TypeRole, number>> : undefined;
  const baseSize = "base" in scale ? scale.base as number : (explicit?.body ?? 18);
  const ratio = "ratio" in scale ? scale.ratio as number : 1.25;
  for (const role of TYPE_ROLES) {
    floors[role] = Math.round(TYPE_ROLE_FLOORS[role] * widthScale);
    const computed = baseSize * ratio ** TYPE_ROLE_STEPS[role];
    sizes[role] = explicit?.[role] ?? Math.round(computed * 2) / 2;
    leading[role] = language.type.leading?.[role] ?? DEFAULT_LEADING[role];
  }

  // ------------------------------------------------------------ space
  const toPoints = (value: number | string, what: string): number => {
    if (typeof value === "number") return value;
    const space = /^space\.(\d+(?:\.\d+)?)$/.exec(value);
    if (space) return Number(space[1]) * language.space.unit;
    const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
    if (percent) return (Number(percent[1]) / 100) * slide.width * 72;
    findings.push({ code: "space-invalid", severity: "blocking", tier: "T0", message: `${what} "${value}" is not points, space.N, or a percentage.`, path: `${languagePath}/space` });
    return 36;
  };
  const space = {
    unit: language.space.unit,
    margin: toPoints(language.space.margin, "margin") / 72,
    gutter: toPoints(language.space.gutter, "gutter") / 72,
    ...(language.space.baseline ? { baseline: language.space.baseline } : {}),
  };
  if (space.margin * 2 >= Math.min(slide.width, slide.height)) {
    findings.push({ code: "margin-too-large", severity: "blocking", tier: "T0", message: `A ${Math.round(space.margin * 72)} pt margin leaves no room on a ${format} slide.`, path: `${languagePath}/space/margin` });
    space.margin = 0.5;
  }

  const surfaces: Record<string, SurfaceSpec> = { ...(language.surfaces ?? {}) };
  for (const [name, surface] of Object.entries(surfaces)) {
    for (const key of ["fill", "stroke"] as const) {
      const reference = surface[key];
      if (reference && reference !== "none" && !resolveColorFromParts(reference, palette, roleNames)) {
        findings.push({ code: "surface-color-unknown", severity: "blocking", tier: "T0", message: `Surface ${name} ${key} "${reference}" is not a role, palette colour, tint, or hex.${didYouMean(reference, [...Object.keys(palette), ...COLOR_ROLES])}`, path: `${languagePath}/surfaces/${name}/${key}` });
      }
    }
  }

  const theme: ThemeSpec = {
    source,
    ...(preset ? { preset } : {}),
    concept: language.concept ?? "",
    format,
    slide: { width: slide.width, height: slide.height },
    palette,
    roles,
    roleNames,
    slots,
    slotOfName,
    custom,
    clrMap,
    data,
    fonts,
    sizes,
    leading,
    floors,
    space,
    grid: language.grid,
    shape: { radius: language.shape.radius, stroke: language.shape.stroke, shadow: language.shape.shadow ?? "none" },
    surfaces,
    texture: language.texture ?? [],
    imagery: language.imagery ?? {},
    charts: language.charts ?? {},
    chrome: language.chrome ?? {},
    language,
    adjustments,
    findings,
    locks,
    hash: "",
  };
  theme.hash = createHash("sha256").update(JSON.stringify({
    v: COMPILER_VERSION,
    format,
    language,
    palette,
    fonts: Object.values(fonts).map((font) => [font.regular.key, font.regular.sha256 ?? font.regular.source, font.bold.sha256 ?? "", font.italic.sha256 ?? ""]),
    pins: context.pins ?? [],
  })).digest("hex").slice(0, 16);
  return theme;
}

async function resolveFontRole(
  role: "display" | "body" | "mono",
  spec: FontSpec,
  context: CompileContext,
  findings: Finding[],
  path: string,
  implicit = false,
): Promise<ResolvedFontRole> {
  const weight = fontWeight(spec.weight, role === "display" ? 600 : 400);
  const boldWeight = Math.min(900, Math.max(weight + 300, 700));
  let regular = await context.text.load({ family: spec.family, weight, italic: Boolean(spec.italic) });
  if (regular.source === "table" && !regular.office && context.acquireFont) {
    const acquired = await context.acquireFont(spec.family, [...new Set([weight, boldWeight, 400, 700])]).catch(() => false);
    if (acquired) {
      // The engine caches faces by request; a fresh load after acquisition sees the new file.
      regular = await reloadFace(context.text, { family: spec.family, weight, italic: Boolean(spec.italic) });
    }
  }
  const bold = await context.text.load({ family: spec.family, weight: boldWeight, italic: Boolean(spec.italic) });
  const italic = await context.text.load({ family: spec.family, weight, italic: true });
  const boldItalic = await context.text.load({ family: spec.family, weight: boldWeight, italic: true });

  if (regular.source === "table" && !implicit) {
    if (regular.office) {
      findings.push({ code: "font-measured-by-table", severity: "minor", tier: "T1", message: `${spec.family} is an Office face with no local file or substitute; it is measured from class tables with a safety margin.`, path, hint: "Install the face or its metric-compatible substitute for exact measurement." });
    } else {
      findings.push({
        code: "font-unavailable",
        severity: context.officeSafe ? "minor" : "major",
        tier: "T1",
        message: `${spec.family} is not available to measure or embed; the audience will see a substitute.`,
        path,
        hint: "Run `slide-agent fonts add` for it, choose an available face, or allow downloads.",
      });
    }
  } else if (regular.substituteFor) {
    findings.push({ code: "font-substitute-measured", severity: "minor", tier: "T1", message: `${spec.family} is measured with its metric-compatible substitute; it is not embedded because Office supplies it.`, path });
  }
  return { role, spec, weight, regular, bold, italic, boldItalic };
}

async function reloadFace(text: TextEngine, spec: { family: string; weight: number; italic: boolean }): Promise<LoadedFace> {
  text.forget(spec);
  return text.load(spec);
}

/**
 * Roles and named colours onto the twelve theme slots. The lighter of
 * background and text goes to lt1, the darker to dk1, and the colour map says
 * which one is the background — so a dark deck is still a native dark theme.
 */
function mapSlots(palette: Record<string, string>, roleNames: Record<ColorRole, string>, dataNames: string[]) {
  const slots = {} as Record<ThemeSlot, string>;
  const slotOfName: Record<string, ThemeSlot> = {};
  const background = palette[roleNames.background] ?? "FFFFFF";
  const text = palette[roleNames.text] ?? "111111";
  const darkGround = isDark(background) || contrastRatio(background, "000000") < contrastRatio(text, "000000");
  const assign = (slot: ThemeSlot, name: string | undefined) => {
    if (!name || !palette[name]) return;
    slots[slot] = palette[name]!;
    if (!slotOfName[name]) slotOfName[name] = slot;
  };
  if (darkGround) {
    assign("dk1", roleNames.background);
    assign("lt1", roleNames.text);
    assign("dk2", roleNames.surface);
    assign("lt2", roleNames.muted);
  } else {
    assign("lt1", roleNames.background);
    assign("dk1", roleNames.text);
    assign("lt2", roleNames.surface);
    assign("dk2", roleNames.muted);
  }
  const accents: string[] = [];
  const pushAccent = (name: string | undefined) => {
    if (name && palette[name] && !accents.includes(name) && ![roleNames.background, roleNames.text, roleNames.surface, roleNames.muted].includes(name)) accents.push(name);
  };
  pushAccent(roleNames.accent);
  pushAccent(roleNames.accentAlt);
  for (const name of dataNames) pushAccent(name);
  for (const name of Object.keys(palette)) pushAccent(name);
  const accentSlots: ThemeSlot[] = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
  accentSlots.forEach((slot, index) => {
    const name = accents[index];
    if (name) assign(slot, name);
    else slots[slot] = tint(palette[roleNames.accent] ?? "4472C4", (index - 2) * 18);
  });
  assign("hlink", roleNames.accent);
  slots.hlink ??= palette[roleNames.accent] ?? "0563C1";
  slots.folHlink = palette[roleNames.muted] ?? "954F72";
  slots.dk1 ??= "000000";
  slots.lt1 ??= "FFFFFF";
  slots.dk2 ??= "44546A";
  slots.lt2 ??= "E7E6E6";
  const custom: Record<string, string> = {};
  for (const [name, hex] of Object.entries(palette)) if (!slotOfName[name]) custom[name] = hex;
  const clrMap: ThemeSpec["clrMap"] = darkGround
    ? { bg1: "dk1", tx1: "lt1", bg2: "dk2", tx2: "lt2" }
    : { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
  return { slots, slotOfName, custom, clrMap };
}

/** Theme slot names as they appear in `a:schemeClr` given the colour map (bg1, tx1…). */
export function schemeName(slot: ThemeSlot, theme: ThemeSpec): string {
  const inverse: Record<string, string> = {};
  for (const [alias, target] of Object.entries(theme.clrMap)) inverse[target] = alias;
  return inverse[slot] ?? slot;
}

function resolveColorFromParts(reference: string, palette: Record<string, string>, roleNames: Record<ColorRole, string>): string | undefined {
  const [name, amountText] = reference.split("/");
  if (!name) return undefined;
  const hex = normalizeHex(name) ?? (reference.startsWith("oklch(") ? parseColor(reference) : undefined)
    ?? palette[(roleNames as Record<string, string>)[name] ?? ""]
    ?? palette[name];
  if (!hex) return undefined;
  if (amountText === undefined || reference.startsWith("oklch(")) return hex;
  const amount = Number(amountText);
  if (!Number.isFinite(amount)) return undefined;
  return tint(hex, amount);
}

/**
 * A colour reference as written in a composition — a role, a palette name,
 * `name/NN` for a tint toward white (negative toward black), a hex literal,
 * or `none` — resolved to hex and, where possible, a theme slot.
 */
export function resolveColor(reference: string | undefined, theme: ThemeSpec): ColorRef | undefined {
  if (!reference || reference === "none") return undefined;
  const hex = resolveColorFromParts(reference, theme.palette, theme.roleNames);
  if (!hex) return undefined;
  const [name, amount] = reference.split("/");
  const paletteName = (theme.roleNames as Record<string, string>)[name ?? ""] ?? name ?? "";
  const slot = theme.slotOfName[paletteName];
  if (slot && amount === undefined) return { hex, slot, token: reference };
  return { hex, token: reference };
}

export function roleColor(role: ColorRole, theme: ThemeSpec): ColorRef {
  const name = theme.roleNames[role] ?? theme.roleNames.text;
  return { hex: theme.roles[role] ?? theme.roles.text, token: role, ...(theme.slotOfName[name] ? { slot: theme.slotOfName[name] } : {}) };
}

/** Merge a brand language with the model's partial language, refusing changes to locked paths. */
function mergeLanguage(brand: DesignLanguage, partial: Record<string, unknown>, locks: string[], findings: Finding[]): DesignLanguage {
  const merged = structuredClone(brand) as unknown as Record<string, unknown>;
  const visit = (target: Record<string, unknown>, patch: Record<string, unknown>, path: string) => {
    for (const [key, value] of Object.entries(patch)) {
      const childPath = `${path}/${key}`;
      if (locks.some((lock) => childPath === lock || childPath.startsWith(`${lock}/`))) {
        findings.push({ code: "brand-locked", severity: "major", tier: "T0", message: `${childPath} is locked by the brand; the brand's value is kept.`, path: `/design/language${childPath}` });
        continue;
      }
      if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
        visit(target[key] as Record<string, unknown>, value as Record<string, unknown>, childPath);
      } else {
        target[key] = value;
      }
    }
  };
  visit(merged, partial, "");
  return merged as unknown as DesignLanguage;
}

// ------------------------------------------------------------------ DTCG

interface DtcgToken { $value?: unknown; $type?: string }

function tokenValue(node: unknown): unknown {
  return node && typeof node === "object" && "$value" in (node as object) ? (node as DtcgToken).$value : undefined;
}

/** Import a W3C DTCG token document shaped like `languageToDtcg`'s output. */
export function languageFromDtcg(document: Record<string, unknown>): { language?: DesignLanguage; error?: string } {
  const embedded = (document.$extensions as Record<string, unknown> | undefined)?.["dev.slide-agent.language"];
  if (embedded) {
    const parsed = designLanguageSchema.safeParse(embedded);
    return parsed.success ? { language: parsed.data } : { error: parsed.error.issues[0]?.message ?? "invalid embedded language" };
  }
  const color = document.color as Record<string, unknown> | undefined;
  const palette: Record<string, string> = {};
  for (const [name, node] of Object.entries((color?.palette as Record<string, unknown>) ?? {})) {
    const value = tokenValue(node);
    if (typeof value === "string") palette[name] = value;
    else if (value && typeof value === "object" && "hex" in (value as object)) palette[name] = String((value as { hex: string }).hex);
  }
  const roles: Record<string, string> = {};
  for (const [name, node] of Object.entries((color?.role as Record<string, unknown>) ?? {})) {
    const value = tokenValue(node);
    if (typeof value === "string") roles[name] = value.replace(/^\{color\.palette\.(.+)\}$/, "$1");
  }
  const font = document.font as Record<string, unknown> | undefined;
  const family = (role: string) => {
    const value = tokenValue((font?.family as Record<string, unknown> | undefined)?.[role]);
    return Array.isArray(value) ? String(value[0]) : typeof value === "string" ? value : undefined;
  };
  if (Object.keys(palette).length === 0 || !roles.background || !roles.text) return { error: "The DTCG document needs color.palette and color.role.background/text." };
  const language: DesignLanguage = {
    color: { palette, roles: { background: roles.background, surface: roles.surface ?? roles.background, text: roles.text, muted: roles.muted ?? roles.text, accent: roles.accent ?? roles.text, ...(roles.accentAlt ? { accentAlt: roles.accentAlt } : {}), ...(roles.rule ? { rule: roles.rule } : {}) } },
    type: { display: { family: family("display") ?? "Aptos Display" }, body: { family: family("body") ?? "Aptos" }, ...(family("mono") ? { mono: { family: family("mono")! } } : {}), scale: { base: 18, ratio: 1.25 } },
    space: { unit: 8, margin: 40, gutter: 24 },
    grid: { columns: 12, rows: 6 },
    shape: { radius: 4, stroke: 0 },
  };
  return { language };
}

/** Export a ThemeSpec as a DTCG 2025.10 token document; the full language rides in `$extensions`. */
export function themeToDtcg(theme: ThemeSpec): Record<string, unknown> {
  const color = (hex: string) => ({ $type: "color", $value: { colorSpace: "srgb", hex: `#${hex}` } });
  return {
    $description: `Slide Agent theme (${theme.source}); compiler ${COMPILER_VERSION}`,
    color: {
      palette: Object.fromEntries(Object.entries(theme.palette).map(([name, hex]) => [name, color(hex)])),
      role: Object.fromEntries(Object.entries(theme.roleNames).map(([role, name]) => [role, { $type: "color", $value: `{color.palette.${name}}` }])),
      data: Object.fromEntries(theme.data.map((hex, index) => [`series${index + 1}`, color(hex)])),
    },
    font: {
      family: {
        display: { $type: "fontFamily", $value: [theme.fonts.display.spec.family] },
        body: { $type: "fontFamily", $value: [theme.fonts.body.spec.family] },
        mono: { $type: "fontFamily", $value: [theme.fonts.mono.spec.family] },
      },
      size: Object.fromEntries(Object.entries(theme.sizes).map(([role, size]) => [role, { $type: "dimension", $value: { value: size, unit: "pt" } }])),
    },
    space: {
      unit: { $type: "dimension", $value: { value: theme.space.unit, unit: "pt" } },
      margin: { $type: "dimension", $value: { value: Math.round(theme.space.margin * 72), unit: "pt" } },
      gutter: { $type: "dimension", $value: { value: Math.round(theme.space.gutter * 72), unit: "pt" } },
    },
    $extensions: { "dev.slide-agent.language": theme.language, "dev.slide-agent.hash": theme.hash },
  };
}

export function isOfficeSafeFamily(family: string): boolean {
  return isOfficeFamily(family);
}
