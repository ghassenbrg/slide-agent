import { TYPE_ROLE_STEPS, type TypeRole } from "../ir/design.js";
import type { TextNode } from "../ir/compose.js";
import type { Adjustment, ColorRef, TextStyle } from "../ir/scene.js";
import { fontWeight, resolveColor, roleColor, type ResolvedFontRole, type ThemeSpec } from "../tokens/compile.js";
import { contrastRatio, nearestPassing, requiredContrast } from "../tokens/color.js";
import type { LoadedFace } from "../text/measure.js";
import type { RichRun } from "../text/rich.js";

/** Type roles set in the display face unless the node says otherwise. */
const DISPLAY_ROLES = new Set<TypeRole>(["display", "title", "subtitle", "h2", "quote"]);
const MUTED_ROLES = new Set<TypeRole>(["caption", "label"]);

export function parseStep(value: number | string | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Point size for a role, shifted by `steps` on the deck's modular scale. */
export function sizeForRole(role: TypeRole, steps: number, theme: ThemeSpec): number {
  const base = theme.sizes[role];
  if (steps === 0) return base;
  const scale = theme.language.type.scale;
  const ratio = "ratio" in scale ? scale.ratio as number : 1.25;
  return Math.round(base * ratio ** steps * 2) / 2;
}

export function fontRoleFor(node: Pick<TextNode, "font" | "role">): "display" | "body" | "mono" | { family: string } {
  if (node.font === "display" || node.font === "body" || node.font === "mono") return node.font;
  if (node.font) return { family: node.font };
  return DISPLAY_ROLES.has(node.role) ? "display" : "body";
}

export interface FaceSet {
  role?: "display" | "body" | "mono";
  family: string;
  regular: LoadedFace;
  bold: LoadedFace;
  italic: LoadedFace;
  boldItalic: LoadedFace;
  mono: LoadedFace;
}

export function faceSet(theme: ThemeSpec, choice: ReturnType<typeof fontRoleFor>, weight: number | undefined, load: (family: string, weight: number, italic: boolean) => LoadedFace): FaceSet {
  if (typeof choice === "string") {
    const fonts: ResolvedFontRole = theme.fonts[choice];
    const regular = weight !== undefined && weight !== fonts.weight ? load(fonts.spec.family, weight, false) : fonts.regular;
    return { role: choice, family: fonts.spec.family, regular, bold: fonts.bold, italic: fonts.italic, boldItalic: fonts.boldItalic, mono: theme.fonts.mono.regular };
  }
  const base = weight ?? 400;
  return {
    family: choice.family,
    regular: load(choice.family, base, false),
    bold: load(choice.family, Math.max(700, base + 300), false),
    italic: load(choice.family, base, true),
    boldItalic: load(choice.family, Math.max(700, base + 300), true),
    mono: theme.fonts.mono.regular,
  };
}

export function faceForRun(faces: FaceSet, run: RichRun, bold: boolean): LoadedFace {
  if (run.mono) return faces.mono;
  const isBold = bold || Boolean(run.bold);
  if (isBold && run.italic) return faces.boldItalic;
  if (isBold) return faces.bold;
  if (run.italic) return faces.italic;
  return faces.regular;
}

export interface Ground {
  hex: string;
  token: string;
}

/**
 * The colour a text node is set in, verified against the ground it sits on.
 * An unspecified tone on a filled surface takes whichever of the text and
 * background roles reads better there — the right answer, not a taste call.
 * A failing explicit tone is moved to the nearest passing lightness and
 * reported, unless a pin refuses it, which makes it a blocking finding.
 */
export function textColor(
  node: TextNode,
  inheritedTone: string | undefined,
  ground: Ground,
  size: number,
  bold: boolean,
  theme: ThemeSpec,
  refused: boolean,
): { color: ColorRef; adjustment?: Adjustment; failure?: { ratio: number; required: number }; unknown?: string } {
  const reference = node.color ?? node.tone ?? inheritedTone;
  let color: ColorRef | undefined;
  let unknown: string | undefined;
  if (reference) {
    color = resolveColor(reference, theme);
    if (!color) unknown = reference;
  }
  if (!color) {
    const preferred = MUTED_ROLES.has(node.role) ? roleColor("muted", theme) : roleColor("text", theme);
    const onGround = ground.token === "background" ? preferred : bestOn(ground.hex, theme, preferred);
    color = onGround;
  }
  const required = requiredContrast(size, bold);
  const ratio = contrastRatio(color.hex, ground.hex);
  if (ratio >= required - 1e-6) return { color, ...(unknown ? { unknown } : {}) };
  if (refused) return { color, failure: { ratio, required }, ...(unknown ? { unknown } : {}) };
  const repaired = nearestPassing(color.hex, ground.hex, required);
  return {
    color: { hex: repaired.hex, ...(color.token ? { token: color.token } : {}) },
    adjustment: {
      kind: "contrast",
      from: `#${color.hex}`,
      to: `#${repaired.hex}`,
      reason: `${color.token ?? "text"} on ${ground.token} ${ratio.toFixed(2)}:1 → ${contrastRatio(repaired.hex, ground.hex).toFixed(2)}:1`,
      path: `${node.ptr}/${node.color ? "color" : "tone"}`,
    },
    ...(unknown ? { unknown } : {}),
  };
}

function bestOn(groundHex: string, theme: ThemeSpec, preferred: ColorRef): ColorRef {
  const candidates = [preferred, roleColor("text", theme), roleColor("background", theme)];
  return candidates.sort((left, right) => contrastRatio(right.hex, groundHex) - contrastRatio(left.hex, groundHex))[0]!;
}

export function textStyle(
  node: TextNode,
  theme: ThemeSpec,
  faces: FaceSet,
  size: number,
  color: ColorRef,
  weight: number | undefined,
): TextStyle {
  const spec = faces.role ? theme.fonts[faces.role].spec : undefined;
  void weight;
  const bold = faces.regular.bold;
  return {
    font: faces.regular.typeface,
    ...(faces.role ? { fontRole: faces.role } : {}),
    size,
    bold,
    italic: Boolean(node.italic ?? spec?.italic) || faces.regular.italic,
    color,
    align: node.align ?? "left",
    valign: node.valign ?? "top",
    ...(node.tracking ?? spec?.tracking ? { tracking: node.tracking ?? spec?.tracking } : {}),
    leading: node.leading ?? theme.leading[node.role],
    ...(node.case ?? spec?.case ? { case: node.case ?? spec?.case } : {}),
    inset: [0, 0, 0, 0],
  };
}

export function weightFor(node: TextNode, theme: ThemeSpec, choice: ReturnType<typeof fontRoleFor>): number | undefined {
  if (node.weight !== undefined) return fontWeight(node.weight);
  if (typeof choice === "string") return theme.fonts[choice].weight;
  return undefined;
}

export function stepOfRole(role: TypeRole): number {
  return TYPE_ROLE_STEPS[role];
}
