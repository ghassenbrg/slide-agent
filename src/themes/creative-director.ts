import type {
  ColorsConfig,
  CreativeDirection,
  CreativePalette,
  PresentationOutline,
  SlideAgentConfig,
  SlideSpec,
} from "../types/index.js";
import { ensureContrast, hslToHex, normalizeHex, NORMAL_TEXT_CONTRAST } from "../utils/color.js";

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

const cleanHex = normalizeHex;

/**
 * Colors the fallback layouts place small text in. A generated palette must be
 * legible by construction; a model-supplied palette is never rewritten here,
 * because layouts correct at the point of use and the auto-fixer repairs
 * model-authored canvases from the validation report.
 */
const LEGIBLE_ON_BACKGROUND: Array<keyof ColorsConfig> = ["ink", "muted", "accent"];

/**
 * Makes the *generated* fallback palette legible by construction. It is never
 * applied to a supplied palette: the model owns its colors, and the built-in
 * layouts correct at the point of use instead. Without this, a prompt-derived
 * accent produced `poor-contrast` warnings that no repair pass could resolve.
 */
function legiblePalette(palette: ColorsConfig): ColorsConfig {
  const corrected = { ...palette };
  const fields = [corrected.background, corrected.surface, corrected.accentSoft];
  for (const key of LEGIBLE_ON_BACKGROUND) {
    for (const field of fields) {
      corrected[key] = ensureContrast(corrected[key], field, NORMAL_TEXT_CONTRAST);
    }
  }
  return corrected;
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

/** Every typeface a model named anywhere in an outline's slide canvases. */
function authoredFontFaces(slides: SlideSpec[]): string[] {
  const faces = new Set<string>();
  for (const slide of slides) {
    for (const element of slide.canvas ?? []) {
      if (element.type !== "text") continue;
      if (element.style?.fontFace) faces.add(element.style.fontFace);
      for (const run of element.runs ?? []) {
        const face = (run.options as { fontFace?: unknown } | undefined)?.fontFace;
        if (typeof face === "string" && face.trim()) faces.add(face);
      }
    }
  }
  return [...faces];
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
    // Correct the generated fallback before merging, so a supplied palette
    // passes through untouched and stays the design authority. Built-in layouts
    // reconcile legibility at the point of use via `ensureContrast`.
    const palette = mergePalette(legiblePalette(algorithmicPalette(seedText)), supplied?.palette);
    const authoredPalette = palette;
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
      // A model may pick a typeface per element. Those choices are intentional
      // authorship, so they join the deck's known-font set instead of being
      // reported as unsupported.
      ...authoredFontFaces(outline.slides),
    ])];
    const direction: CreativeDirection = supplied ?? {
      name: "Prompt-derived original direction",
      concept: outline.brief.visualDirection,
      rationale: "No host-model design system was supplied, so the renderer derived a unique palette from the brief instead of applying a fixed house theme.",
      palette: authoredPalette,
      typography: { heading, body, mono },
    };
    return {
      direction: {
        ...direction,
        palette: { ...authoredPalette, ...(direction.palette ?? {}) },
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
