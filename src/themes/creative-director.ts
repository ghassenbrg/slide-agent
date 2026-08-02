import type {
  ColorsConfig,
  CreativeDirection,
  CreativePalette,
  PresentationOutline,
  SlideAgentConfig,
} from "../types/index.js";

export interface ResolvedDeckDesign {
  direction: CreativeDirection;
  config: SlideAgentConfig;
}

const COLOR_KEYS: Array<keyof ColorsConfig> = [
  "background",
  "surface",
  "ink",
  "muted",
  "accent",
  "accentAlt",
  "accentSoft",
  "rule",
  "positive",
  "negative",
  "warning",
];

function hashText(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
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

function cleanHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/^#/, "");
  return /^[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : undefined;
}

function algorithmicPalette(seedText: string): ColorsConfig {
  const seed = hashText(seedText);
  const hue = seed % 360;
  const dark = /\b(dark|night|nocturn|black|neon|cinematic|space|cyber)\b/i.test(seedText) || (seed & 7) === 0;
  const accentHue = (hue + 19 + ((seed >>> 8) % 67)) % 360;
  const alternateHue = (accentHue + 118 + ((seed >>> 16) % 47)) % 360;
  if (dark) {
    return {
      background: hslToHex(hue, 30, 7),
      surface: hslToHex(hue, 22, 14),
      ink: hslToHex(hue, 12, 96),
      muted: hslToHex(hue, 15, 70),
      accent: hslToHex(accentHue, 82, 60),
      accentAlt: hslToHex(alternateHue, 78, 58),
      accentSoft: hslToHex(accentHue, 38, 23),
      rule: hslToHex(hue, 18, 28),
      positive: hslToHex(145, 62, 50),
      negative: hslToHex(2, 78, 61),
      warning: hslToHex(39, 88, 58),
    };
  }
  return {
    background: hslToHex(hue, 24, 96),
    surface: "FFFFFF",
    ink: hslToHex(hue, 35, 12),
    muted: hslToHex(hue, 14, 38),
    accent: hslToHex(accentHue, 72, 43),
    accentAlt: hslToHex(alternateHue, 67, 40),
    accentSoft: hslToHex(accentHue, 55, 88),
    rule: hslToHex(hue, 16, 81),
    positive: hslToHex(145, 58, 35),
    negative: hslToHex(2, 66, 45),
    warning: hslToHex(38, 79, 44),
  };
}

function mergePalette(generated: ColorsConfig, supplied: CreativePalette | undefined): ColorsConfig {
  const merged = { ...generated };
  for (const key of COLOR_KEYS) {
    const value = cleanHex(supplied?.[key]);
    if (value) merged[key] = value;
  }
  const freeColors = supplied?.colors?.map(cleanHex).filter((value): value is string => Boolean(value)) ?? [];
  if (!supplied?.accent && freeColors[0]) merged.accent = freeColors[0];
  if (!supplied?.accentAlt && freeColors[1]) merged.accentAlt = freeColors[1];
  if (!supplied?.accentSoft && freeColors[2]) merged.accentSoft = freeColors[2];
  return merged;
}

/**
 * Turns a model's open-ended art direction into the small set of defaults that
 * native primitives need. It never selects a named theme or rejects a visual
 * idea. Missing colors receive a prompt-derived fallback so prompt-only decks
 * do not all collapse to the same house style.
 */
export class CreativeDirector {
  public resolve(outline: PresentationOutline, baseConfig: SlideAgentConfig): ResolvedDeckDesign {
    const supplied = outline.creativeDirection;
    const seedText = [
      outline.brief.title,
      outline.brief.objective,
      outline.brief.tone,
      outline.brief.visualDirection,
      supplied?.concept,
      supplied?.visualLanguage,
      supplied?.name,
    ].filter(Boolean).join(" | ");
    const palette = mergePalette(algorithmicPalette(seedText), supplied?.palette);
    const typography = supplied?.typography;
    const heading = typography?.heading ?? typography?.display ?? baseConfig.fonts.heading;
    const body = typography?.body ?? baseConfig.fonts.body;
    const mono = typography?.mono ?? baseConfig.fonts.mono;
    const supported = [...new Set([
      ...baseConfig.fonts.supported,
      heading,
      body,
      mono,
      ...(typography?.fallbacks ?? []),
    ])];
    const direction: CreativeDirection = supplied ?? {
      name: "Prompt-derived original direction",
      concept: outline.brief.visualDirection,
      rationale: "No host-model design system was supplied, so the renderer derived a unique palette from the brief instead of applying a fixed house theme.",
      palette,
      typography: { heading, body, mono },
    };
    return {
      direction: {
        ...direction,
        palette: { ...palette, ...(direction.palette ?? {}) },
        typography: { heading, body, mono, ...(direction.typography ?? {}) },
      },
      config: {
        ...baseConfig,
        colors: palette,
        fonts: {
          ...baseConfig.fonts,
          heading,
          body,
          mono,
          fallbacks: typography?.fallbacks ?? baseConfig.fonts.fallbacks,
          supported,
        },
      },
    };
  }
}
