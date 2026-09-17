import { z } from "zod";

/**
 * The design language: the model's decisions about colour, type, space, shape,
 * surfaces, and texture, written once per deck. The engine verifies and maps
 * them; it never chooses them on a directed deck's behalf.
 */

export const COLOR_ROLES = ["background", "surface", "text", "muted", "accent", "accentAlt", "rule"] as const;
export type ColorRole = typeof COLOR_ROLES[number];

export const TYPE_ROLES = ["display", "title", "subtitle", "h2", "h3", "lead", "body", "small", "caption", "label", "quote"] as const;
export type TypeRole = typeof TYPE_ROLES[number];

/** Steps on the modular scale, relative to body. */
export const TYPE_ROLE_STEPS: Record<TypeRole, number> = {
  display: 6,
  title: 3,
  subtitle: 1.5,
  h2: 2,
  h3: 1,
  lead: 1,
  quote: 2,
  body: 0,
  small: -1,
  caption: -1.5,
  label: -1.5,
};

/** Legibility floors in points at 16:9 (13.33 in wide). Scaled by format width. */
export const TYPE_ROLE_FLOORS: Record<TypeRole, number> = {
  display: 24,
  title: 20,
  subtitle: 16,
  h2: 16,
  h3: 14,
  lead: 14,
  quote: 16,
  body: 14,
  small: 12,
  caption: 10,
  label: 10,
};

const colorName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/, "Colour names are letters, digits, - and _, starting with a letter.");

export const colorValue = z.string()
  .refine((value) => /^#?[0-9a-fA-F]{6}$/.test(value.trim()) || /^#?[0-9a-fA-F]{3}$/.test(value.trim()) || /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+\s*\)$/i.test(value.trim()), {
    message: "A colour is #RRGGBB, #RGB, or oklch(L C H) with L in 0–1 or 0–100%.",
  })
  .describe("#RRGGBB, #RGB, or oklch(L C H)");

export const fontSpec = z.object({
  family: z.string().min(1).max(64),
  weight: z.union([z.number().int().min(100).max(900), z.enum(["regular", "medium", "semibold", "bold", "black", "light"])]).optional(),
  italic: z.boolean().optional(),
  tracking: z.number().min(-0.2).max(0.5).optional().describe("Letter spacing in em"),
  case: z.enum(["none", "upper", "lower", "title", "small-caps"]).optional(),
}).strict();
export type FontSpec = z.infer<typeof fontSpec>;

/** Points, a `space.N` token, or a percentage of slide width. */
export const relative = z.union([z.number().min(0).max(400), z.string().regex(/^(space\.\d+(\.\d+)?|\d+(\.\d+)?%)$/)]);

export const surfaceSpec = z.object({
  fill: z.string().optional().describe("A colour role, a palette name, `name/NN` for a tint, or `none`"),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).max(24).optional(),
  radius: z.number().min(0).max(200).optional(),
  shadow: z.enum(["none", "soft", "hard"]).optional(),
  pad: relative.optional(),
  opacity: z.number().min(0).max(1).optional(),
  image: z.string().optional(),
}).strict();
export type SurfaceSpec = z.infer<typeof surfaceSpec>;

export const TEXTURE_PRIMITIVES = [
  "hairline", "margin-rule", "corner-ticks", "band", "dot-grid", "line-grid", "bracket-frame",
  "numbered-margin", "large-numeral", "path-marks", "image-mask", "gradient-wash", "paper-tone", "frame", "underline",
] as const;
export type TexturePrimitive = typeof TEXTURE_PRIMITIVES[number];

export const textureRule = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/),
  primitive: z.enum(TEXTURE_PRIMITIVES),
  params: z.record(z.string(), z.unknown()).optional(),
  apply: z.object({
    slides: z.union([z.literal("all"), z.array(z.string())]).optional(),
    roles: z.array(z.string()).optional().describe("Apply to slides whose `role` tag matches, e.g. evidence"),
  }).optional().describe("Omit to make the rule available only where a composition places it"),
}).strict();
export type TextureRule = z.infer<typeof textureRule>;

export const designLanguage = z.object({
  concept: z.string().max(400).optional(),
  color: z.object({
    palette: z.record(colorName, colorValue).refine((palette) => Object.keys(palette).length > 0 && Object.keys(palette).length <= 24, "1–24 named colours"),
    roles: z.object({
      background: colorName,
      surface: colorName,
      text: colorName,
      muted: colorName,
      accent: colorName,
      accentAlt: colorName.optional(),
      rule: colorName.optional(),
    }).strict(),
    data: z.array(colorName).max(8).optional(),
  }).strict(),
  type: z.object({
    display: fontSpec,
    body: fontSpec,
    mono: fontSpec.optional(),
    scale: z.union([
      z.object({ base: z.number().min(12).max(32), ratio: z.number().min(1.05).max(1.8) }).strict(),
      z.record(z.enum(TYPE_ROLES), z.number().min(6).max(400)),
    ]),
    leading: z.record(z.enum(TYPE_ROLES), z.number().min(0.7).max(2.5)).optional(),
  }).strict(),
  space: z.object({
    unit: z.number().min(2).max(48).describe("Points per space step: space.3 = 3 × unit"),
    margin: relative,
    gutter: relative,
    baseline: z.number().min(2).max(48).optional(),
  }).strict(),
  grid: z.object({ columns: z.number().int().min(1).max(24), rows: z.number().int().min(1).max(24) }).strict(),
  shape: z.object({
    radius: z.number().min(0).max(200),
    stroke: z.number().min(0).max(24),
    shadow: z.enum(["none", "soft", "hard"]).optional(),
  }).strict(),
  surfaces: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), surfaceSpec).optional(),
  texture: z.array(textureRule).max(6).optional(),
  imagery: z.object({
    treatment: z.enum(["none", "grayscale", "duotone", "tint"]).optional(),
    tint: z.string().optional(),
    radius: z.number().min(0).max(200).optional(),
  }).strict().optional(),
  charts: z.object({
    axis: z.enum(["none", "hairline", "regular"]).optional(),
    gridlines: z.enum(["none", "major", "subtle"]).optional(),
    labels: z.enum(["none", "end", "inside", "outside"]).optional(),
    highlight: z.string().optional().describe("Colour used for the highlighted series or points"),
    legend: z.enum(["none", "top", "bottom", "right"]).optional(),
  }).strict().optional(),
  chrome: z.object({
    slideNumber: z.boolean().optional(),
    footer: z.string().max(80).optional(),
    tone: z.string().optional(),
    position: z.enum(["bottom-left", "bottom-right", "bottom-center", "top-right"]).optional(),
  }).strict().optional(),
}).strict();
export type DesignLanguage = z.infer<typeof designLanguage>;

export const presetParams = z.object({
  mood: z.enum(["calm", "confident", "editorial", "technical", "warm", "bold", "minimal"]).optional(),
  seed: colorValue.optional(),
  mode: z.enum(["light", "dark"]).optional(),
  contrast: z.enum(["standard", "high"]).optional(),
  density: z.enum(["sparse", "balanced", "dense"]).optional(),
}).strict();
export type PresetParams = z.infer<typeof presetParams>;

const partialLanguage = z.object({
  concept: z.string().max(400).optional(),
  color: z.object({
    palette: z.record(colorName, colorValue).optional(),
    roles: z.record(z.string(), colorName).optional(),
    data: z.array(colorName).max(8).optional(),
  }).optional(),
  type: z.record(z.string(), z.unknown()).optional(),
  space: z.record(z.string(), z.unknown()).optional(),
  grid: z.object({ columns: z.number().int().min(1).max(24), rows: z.number().int().min(1).max(24) }).optional(),
  shape: z.record(z.string(), z.unknown()).optional(),
  surfaces: z.record(z.string(), surfaceSpec).optional(),
  texture: z.array(textureRule).max(6).optional(),
  imagery: z.record(z.string(), z.unknown()).optional(),
  charts: z.record(z.string(), z.unknown()).optional(),
  chrome: z.record(z.string(), z.unknown()).optional(),
});

export const designRequest = z.union([
  z.object({ language: designLanguage }).strict(),
  z.object({ brand: z.string().min(1), language: partialLanguage.optional() }).strict(),
  z.object({ preset: z.string().min(1), params: presetParams.optional() }).strict(),
  z.object({ tokens: z.record(z.string(), z.unknown()) }).strict(),
]);
export type DesignRequest = z.infer<typeof designRequest>;
