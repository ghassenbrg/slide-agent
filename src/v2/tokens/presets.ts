import type { DesignLanguage, PresetParams } from "../ir/design.js";
import { hexToOklch, normalizeHex, oklchToHex, parseColor } from "./color.js";

/**
 * Deterministic themes for draft mode and template-fill.
 *
 * A preset is labelled in every verdict (`design: preset`) and is never chosen
 * on a directed deck's behalf. The same name and parameters always produce the
 * same design language.
 */

type Mood = NonNullable<PresetParams["mood"]>;

const MOOD_TYPE: Record<Mood, { display: string; body: string; mono: string; displayWeight: number; ratio: number; base: number }> = {
  calm: { display: "Source Serif 4", body: "Source Sans 3", mono: "IBM Plex Mono", displayWeight: 600, ratio: 1.25, base: 18 },
  confident: { display: "Inter Tight", body: "Inter", mono: "JetBrains Mono", displayWeight: 700, ratio: 1.333, base: 18 },
  editorial: { display: "Newsreader", body: "Public Sans", mono: "IBM Plex Mono", displayWeight: 500, ratio: 1.414, base: 17 },
  technical: { display: "IBM Plex Sans", body: "IBM Plex Sans", mono: "IBM Plex Mono", displayWeight: 600, ratio: 1.25, base: 16 },
  warm: { display: "Fraunces", body: "Figtree", mono: "DM Mono", displayWeight: 600, ratio: 1.333, base: 18 },
  bold: { display: "Archivo", body: "Archivo", mono: "Space Mono", displayWeight: 800, ratio: 1.5, base: 18 },
  minimal: { display: "Manrope", body: "Manrope", mono: "JetBrains Mono", displayWeight: 600, ratio: 1.25, base: 17 },
};

const MOOD_HUE: Record<Mood, number> = { calm: 220, confident: 255, editorial: 25, technical: 200, warm: 45, bold: 350, minimal: 240 };

const PRESET_NAMES: Record<string, PresetParams> = {
  "draft/calm": { mood: "calm" },
  "draft/confident": { mood: "confident" },
  "draft/editorial": { mood: "editorial" },
  "draft/technical": { mood: "technical", mode: "dark" },
  "draft/warm": { mood: "warm" },
  "draft/bold": { mood: "bold", contrast: "high" },
  "draft/minimal": { mood: "minimal" },
  "office/safe": { mood: "confident" },
};

export function presetNames(): string[] {
  return Object.keys(PRESET_NAMES);
}

export function presetLanguage(name: string, params: PresetParams = {}): DesignLanguage | undefined {
  const base = PRESET_NAMES[name];
  if (!base) return undefined;
  const merged: PresetParams = { ...base, ...params };
  const mood: Mood = merged.mood ?? "confident";
  const dark = merged.mode === "dark";
  const high = merged.contrast === "high";
  const seedHex = merged.seed ? parseColor(merged.seed) : undefined;
  const seed = seedHex ? hexToOklch(seedHex) : { l: 0.58, c: 0.13, h: MOOD_HUE[mood] };
  const hue = seed.h;
  const neutral = (l: number, c = 0.012) => oklchToHex({ l, c, h: hue });
  const accent = oklchToHex({ l: dark ? 0.74 : Math.min(0.6, seed.l), c: Math.max(0.1, seed.c), h: hue });
  const accentAlt = oklchToHex({ l: dark ? 0.8 : 0.66, c: Math.max(0.08, seed.c * 0.8), h: (hue + 150) % 360 });
  const data = [0, 60, 150, 210, 280].map((offset, index) => oklchToHex({ l: dark ? 0.72 : 0.56 + (index % 2) * 0.08, c: 0.12, h: (hue + offset) % 360 }));
  const type = MOOD_TYPE[mood];
  const office = name === "office/safe";
  const density = merged.density ?? "balanced";
  return {
    concept: `Preset ${name} (${mood}${dark ? ", dark" : ""}) — a generated draft theme, not an authored design language.`,
    color: {
      palette: {
        ground: normalizeHex(dark ? neutral(0.18) : neutral(0.985, 0.004))!,
        panel: normalizeHex(dark ? neutral(0.24) : neutral(0.95, 0.008))!,
        ink: normalizeHex(dark ? neutral(high ? 0.98 : 0.94) : neutral(high ? 0.12 : 0.2))!,
        quiet: normalizeHex(dark ? neutral(0.74) : neutral(0.46))!,
        signal: normalizeHex(accent)!,
        counter: normalizeHex(accentAlt)!,
        line: normalizeHex(dark ? neutral(0.34) : neutral(0.86))!,
        ...Object.fromEntries(data.map((hex, index) => [`series${index + 1}`, normalizeHex(hex)!])),
      },
      roles: { background: "ground", surface: "panel", text: "ink", muted: "quiet", accent: "signal", accentAlt: "counter", rule: "line" },
      data: ["signal", "series2", "series3", "series4", "series5"],
    },
    type: {
      display: { family: office ? "Aptos Display" : type.display, weight: type.displayWeight },
      body: { family: office ? "Aptos" : type.body, weight: 400 },
      mono: { family: office ? "Consolas" : type.mono, weight: 400 },
      scale: { base: density === "dense" ? type.base - 2 : density === "sparse" ? type.base + 2 : type.base, ratio: type.ratio },
    },
    space: { unit: 8, margin: density === "sparse" ? 48 : 40, gutter: 24 },
    grid: { columns: 12, rows: 6 },
    shape: { radius: mood === "minimal" || mood === "technical" ? 2 : 8, stroke: 0, shadow: "none" },
    surfaces: {
      card: { fill: "surface", radius: mood === "minimal" ? 2 : 8, pad: "space.3" },
      band: { fill: "accent" },
      quiet: { stroke: "rule", strokeWidth: 0.75 },
    },
  };
}
