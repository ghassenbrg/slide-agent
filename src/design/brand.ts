import path from "node:path";
import { z } from "zod";

import type { CreativeDirection, PresentationOutline } from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";
import { exists, readUtf8 } from "../utils/files.js";
import { brandKitFromTemplate, isTemplateFile } from "./template.js";

/**
 * An organisation's visual constraints, supplied as a file rather than prose.
 *
 * The model still designs the deck; a brand kit narrows the space it designs
 * in. That distinction is the whole point: locking the palette should not turn
 * every deck into the same deck, so `locked` covers only what the organisation
 * genuinely cannot bend on, and everything else stays the model's decision.
 */

const hex = z.string().regex(/^#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);

export const brandKitSchema = z.object({
  name: z.string().min(1),
  palette: z.object({
    background: hex.optional(),
    surface: hex.optional(),
    ink: hex.optional(),
    muted: hex.optional(),
    accent: hex.optional(),
    accentAlt: hex.optional(),
    accentSoft: hex.optional(),
    rule: hex.optional(),
    positive: hex.optional(),
    negative: hex.optional(),
    warning: hex.optional(),
    custom: z.record(z.string(), hex).optional(),
  }).optional(),
  typography: z.object({
    display: z.string().optional(),
    heading: z.string().optional(),
    body: z.string().optional(),
    mono: z.string().optional(),
    fallbacks: z.array(z.string()).optional(),
  }).optional(),
  logo: z.object({
    path: z.string().min(1).describe("Local image path, resolved relative to the brand file."),
    placement: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).default("bottom-right"),
    widthInches: z.number().positive().max(4).default(1.1),
    /** Which slides carry the mark. A logo on every slide is usually noise. */
    slides: z.enum(["all", "title", "title-and-closing", "none"]).default("title-and-closing"),
  }).optional(),
  footer: z.object({
    text: z.string().min(1).describe("Legal line, classification, or confidentiality notice."),
    slides: z.enum(["all", "content"]).default("all"),
  }).optional(),
  /** Things the brand forbids; passed through to the design tokens. */
  avoid: z.array(z.string()).optional(),
  /**
   * Aspects the model may not override. Anything not listed stays the model's
   * choice, so a brand kit constrains a deck without flattening it.
   */
  locked: z.array(z.enum(["palette", "typography"])).default([]),
});

export type BrandKit = z.infer<typeof brandKitSchema>;

/**
 * Load a brand kit from JSON, or derive one from an organisation's PowerPoint
 * template. Accepting the template directly matters because the template is
 * what people actually have: nobody has a brand-kit JSON lying around, and the
 * step where a human retypes a colour scheme is the step that goes wrong.
 */
export async function loadBrandKit(filePath: string): Promise<BrandKit> {
  const resolved = path.resolve(filePath);
  if (isTemplateFile(resolved)) return brandKitFromTemplate(resolved);
  if (!(await exists(resolved))) {
    throw new SlideAgentError("BRAND_KIT_NOT_FOUND", `Brand kit not found: ${resolved}`, { path: resolved });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readUtf8(resolved));
  } catch (error) {
    throw new SlideAgentError("BRAND_KIT_INVALID", `Brand kit is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, { path: resolved });
  }
  const result = brandKitSchema.safeParse(parsed);
  if (!result.success) {
    throw new SlideAgentError(
      "BRAND_KIT_INVALID",
      `Brand kit does not match the expected shape:\n${result.error.issues.map((issue) => `  ${issue.path.join(".") || "<root>"}: ${issue.message}`).join("\n")}`,
      { path: resolved },
    );
  }
  const kit = result.data;
  // Logo paths are relative to the brand file, so a kit stays portable.
  if (kit.logo && !path.isAbsolute(kit.logo.path)) {
    kit.logo = { ...kit.logo, path: path.resolve(path.dirname(resolved), kit.logo.path) };
  }
  return kit;
}

/**
 * Folds a brand kit into the deck's creative direction. Locked aspects
 * overwrite the model's choices; unlocked ones only fill gaps the model left.
 */
export function applyBrandKit(outline: PresentationOutline, kit: BrandKit): PresentationOutline {
  const supplied = outline.creativeDirection ?? {};
  const lockPalette = kit.locked.includes("palette");
  const lockTypography = kit.locked.includes("typography");

  const direction: CreativeDirection = {
    ...supplied,
    ...(kit.palette
      ? { palette: lockPalette ? { ...supplied.palette, ...kit.palette } : { ...kit.palette, ...supplied.palette } }
      : {}),
    ...(kit.typography
      ? { typography: lockTypography ? { ...supplied.typography, ...kit.typography } : { ...kit.typography, ...supplied.typography } }
      : {}),
    ...(kit.avoid?.length ? { avoid: [...new Set([...(supplied.avoid ?? []), ...kit.avoid])] } : {}),
    brand: {
      name: kit.name,
      locked: kit.locked,
      ...(kit.logo ? { logo: kit.logo } : {}),
      ...(kit.footer ? { footer: kit.footer } : {}),
    },
  };

  return { ...outline, creativeDirection: direction };
}

/** True when this slide should carry the brand mark. */
export function logoAppliesTo(kit: BrandKit, slideNumber: number, totalSlides: number): boolean {
  if (!kit.logo || kit.logo.slides === "none") return false;
  switch (kit.logo.slides) {
    case "all": return true;
    case "title": return slideNumber === 1;
    case "title-and-closing": return slideNumber === 1 || slideNumber === totalSlides;
  }
}

export function footerAppliesTo(kit: BrandKit, slideNumber: number): boolean {
  if (!kit.footer) return false;
  return kit.footer.slides === "all" || slideNumber > 1;
}
