import type { SlideAgentConfig } from "../types/index.js";

export interface Hsl {
  hue: number;
  saturation: number;
  lightness: number;
}

/** WCAG 2.1 threshold for text at or above 18pt (or 14pt bold). */
export const LARGE_TEXT_CONTRAST = 3;
/** WCAG 2.1 AA threshold for normal-size text. */
export const NORMAL_TEXT_CONTRAST = 4.5;
/** WCAG 2.1 AAA threshold for normal-size text. */
export const ENHANCED_TEXT_CONTRAST = 7;

export function normalizeHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{3}$/.test(normalized)) {
    return normalized.split("").map((character) => character.repeat(2)).join("").toUpperCase();
  }
  return /^[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : undefined;
}

export function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex);
  if (!normalized) return 1;
  const values = [0, 2, 4]
    .map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0]! + 0.7152 * values[1]! + 0.0722 * values[2]!;
}

/**
 * `top` composited over `bottom` at `transparency` (0 = opaque, 1 = invisible).
 *
 * What a reader sees behind a piece of text is the composite, not the declared
 * fill. Measuring against the declared fill reports legible type as a defect
 * whenever an author uses a translucent band, which is a normal thing to do.
 */
export function blendHex(top: string, bottom: string, transparency: number): string {
  const a = normalizeHex(top) ?? "000000";
  const b = normalizeHex(bottom) ?? "FFFFFF";
  const alpha = Math.max(0, Math.min(1, 1 - transparency));
  const channel = (offset: number) => Math.round(
    parseInt(a.slice(offset, offset + 2), 16) * alpha
    + parseInt(b.slice(offset, offset + 2), 16) * (1 - alpha),
  );
  return [channel(0), channel(2), channel(4)]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0").toUpperCase())
    .join("");
}

export function colorContrast(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const channel = (offset: number): number => {
    const k = (offset + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function hexToHsl(hex: string): Hsl {
  const normalized = normalizeHex(hex) ?? "000000";
  const [red = 0, green = 0, blue = 0] = [0, 2, 4]
    .map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  if (delta === 0) return { hue: 0, saturation: 0, lightness: lightness * 100 };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = maximum === red
    ? 60 * (((green - blue) / delta) % 6)
    : maximum === green
      ? 60 * ((blue - red) / delta + 2)
      : 60 * ((red - green) / delta + 4);
  return { hue: (hue + 360) % 360, saturation: saturation * 100, lightness: lightness * 100 };
}

/**
 * Returns a color with the same hue and saturation as `foreground` whose
 * contrast against `background` reaches `minimumRatio`. Only lightness moves,
 * so a model's chosen hue survives the correction. Falls back to pure black or
 * white when the hue cannot reach the ratio at any lightness.
 */
export function ensureContrast(foreground: string, background: string, minimumRatio = NORMAL_TEXT_CONTRAST): string {
  const source = normalizeHex(foreground);
  const field = normalizeHex(background);
  if (!source || !field) return foreground;
  if (colorContrast(source, field) >= minimumRatio) return source;

  const { hue, saturation, lightness } = hexToHsl(source);
  // Move away from the background's luminance: darken on light fields, lighten
  // on dark ones. Search both directions so an ambiguous mid-tone still lands.
  const backgroundIsLight = relativeLuminance(field) >= 0.18;
  const directions = backgroundIsLight ? [-1, 1] : [1, -1];
  for (const direction of directions) {
    for (let step = 1; step <= 100; step += 1) {
      const candidateLightness = lightness + direction * step;
      if (candidateLightness < 0 || candidateLightness > 100) break;
      const candidate = hslToHex(hue, saturation, candidateLightness);
      if (colorContrast(candidate, field) >= minimumRatio) return candidate;
    }
  }
  return colorContrast("000000", field) >= colorContrast("FFFFFF", field) ? "000000" : "FFFFFF";
}

/** WCAG counts 18pt, or 14pt bold, as large text. */
export function isLargeText(fontSize: number, bold = false): boolean {
  return fontSize >= 18 || (bold && fontSize >= 14);
}

/**
 * Minimum contrast ratio for text at a given size. AA is 4.5:1 for normal text
 * and 3:1 for large; AAA raises those to 7:1 and 4.5:1.
 */
export function requiredContrast(fontSize: number, bold = false, level: "AA" | "AAA" = "AA"): number {
  const large = isLargeText(fontSize, bold);
  if (level === "AAA") return large ? NORMAL_TEXT_CONTRAST : ENHANCED_TEXT_CONTRAST;
  return large ? LARGE_TEXT_CONTRAST : NORMAL_TEXT_CONTRAST;
}

export function emphasisField(config: SlideAgentConfig): string {
  return relativeLuminance(config.colors.background) < 0.28 ? config.colors.surface : config.colors.ink;
}

export function foregroundOn(background: string, config: SlideAgentConfig): string {
  const candidates = [config.colors.ink, config.colors.surface, config.colors.background, "FFFFFF", "000000"];
  return candidates.reduce((best, candidate) => colorContrast(candidate, background) > colorContrast(best, background) ? candidate : best);
}

export function secondaryForegroundOn(background: string, config: SlideAgentConfig): string {
  return colorContrast(config.colors.muted, background) >= 3 ? config.colors.muted : foregroundOn(background, config);
}

export function accentForegroundOn(background: string, config: SlideAgentConfig): string {
  const candidates = [
    config.colors.accent,
    config.colors.accentAlt,
    config.colors.positive,
    config.colors.warning,
    foregroundOn(background, config),
  ];
  return candidates.reduce((best, candidate) => colorContrast(candidate, background) > colorContrast(best, background) ? candidate : best);
}

/**
 * The deck's accent hue, corrected only as far as legibility requires for the
 * given text size. Layouts use this for small accent labels so a prompt-derived
 * or model-supplied accent never produces a contrast warning it cannot fix.
 */
export function readableAccentOn(background: string, config: SlideAgentConfig, fontSize: number, bold = false): string {
  return ensureContrast(config.colors.accent, background, requiredContrast(fontSize, bold));
}
