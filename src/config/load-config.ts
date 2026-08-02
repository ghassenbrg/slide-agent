import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import type { SlideAgentConfig } from "../types/index.js";

const hex = z.string().regex(/^[0-9A-Fa-f]{6}$/);

const dimensionsSchema = z.object({
  layout: z.enum(["LAYOUT_WIDE", "LAYOUT_STANDARD"]),
  width: z.number().positive(),
  height: z.number().positive(),
  margin: z.number().nonnegative(),
  titleBandHeight: z.number().positive(),
  footerHeight: z.number().nonnegative(),
});

const colorsSchema = z.object({
  background: hex,
  surface: hex,
  ink: hex,
  muted: hex,
  accent: hex,
  accentAlt: hex,
  accentSoft: hex,
  rule: hex,
  positive: hex,
  negative: hex,
  warning: hex,
});

const fontsSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  mono: z.string().min(1),
  fallbacks: z.array(z.string().min(1)),
  supported: z.array(z.string().min(1)),
  minimums: z.object({
    deckTitle: z.number().positive(),
    slideTitle: z.number().positive(),
    subheading: z.number().positive(),
    body: z.number().positive(),
    caption: z.number().positive(),
  }),
});

const generationSchema = z.object({
  defaultSlideCount: z.number().int().positive(),
  minimumSlideCount: z.number().int().positive(),
  maximumSlideCount: z.number().int().positive(),
  maximumBulletsPerSlide: z.number().int().positive(),
  maximumWordsPerBullet: z.number().int().positive(),
  maximumBodyWords: z.number().int().positive(),
  maximumRetries: z.number().int().nonnegative(),
  renderWidth: z.number().int().positive(),
  renderHeight: z.number().int().positive(),
  failOnWarnings: z.boolean(),
  includeSpeakerNotes: z.boolean(),
  includeSlideNumbers: z.boolean(),
});

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function defaultConfigDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../config"),
    path.resolve(moduleDir, "../../config"),
    path.resolve(moduleDir, "../../../config"),
    path.resolve(process.cwd(), "config"),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, "dimensions.json"))) ?? candidates[0]!;
}

export async function loadConfig(configDir = defaultConfigDir()): Promise<SlideAgentConfig> {
  const [dimensions, colors, fonts, generation] = await Promise.all([
    readJson(path.join(configDir, "dimensions.json")),
    readJson(path.join(configDir, "colors.json")),
    readJson(path.join(configDir, "fonts.json")),
    readJson(path.join(configDir, "generation.json")),
  ]);

  const config: SlideAgentConfig = {
    dimensions: dimensionsSchema.parse(dimensions),
    colors: colorsSchema.parse(colors),
    fonts: fontsSchema.parse(fonts),
    generation: generationSchema.parse(generation),
  };
  if (config.generation.minimumSlideCount > config.generation.maximumSlideCount) {
    throw new Error("minimumSlideCount cannot exceed maximumSlideCount");
  }
  return config;
}

export const configSchemas = {
  dimensions: dimensionsSchema,
  colors: colorsSchema,
  fonts: fontsSchema,
  generation: generationSchema,
};
