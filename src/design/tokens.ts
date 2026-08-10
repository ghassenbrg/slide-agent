import type { ColorsConfig, CreativeDirection, FontsConfig, SlideAgentConfig } from "../types/index.js";

/**
 * The resolved design system a deck renders with.
 *
 * `CreativeDirection` previously contributed eleven colours and three fonts and
 * nothing else: spacing, type scale, stroke weight, and corner radius were
 * literals scattered through the layouts. A model could describe its
 * `compositionPrinciples`, `shapeLanguage`, and `textureLanguage` in detail and
 * every deck still came out with the same 1.2pt borders, 0.06in radii, and
 * identical rhythm. Tokens are how those intentions reach the page.
 */

export type Density = "sparse" | "balanced" | "dense";
/**
 * `authored` means the author said nothing about shape language, so neither
 * does Slide Agent. It is the default: an omitted field is not a request for
 * the engine's taste, and the previous silent fall-through to `sharp` gave
 * every unspecified deck a corner treatment nobody asked for.
 */
export type Geometry = "sharp" | "soft" | "organic" | "authored";

export interface TypeScale {
  display: number;
  title: number;
  subheading: number;
  lead: number;
  body: number;
  caption: number;
  micro: number;
}

export interface SpaceScale {
  /** The base unit every other measure is a multiple of, in inches. */
  unit: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface DeckTokens {
  palette: ColorsConfig;
  fonts: FontsConfig;
  type: TypeScale;
  space: SpaceScale;
  stroke: { hairline: number; regular: number; bold: number };
  radius: { none: 0; soft: number; round: number };
  density: Density;
  geometry: Geometry;
  /** Honoured exclusions, lower-cased, from `creativeDirection.avoid`. */
  avoid: string[];
}

const DENSITY_WORDS: Record<Density, string[]> = {
  sparse: ["sparse", "minimal", "quiet", "airy", "restrained", "calm", "spacious", "monumental"],
  dense: ["dense", "technical", "detailed", "editorial", "archival", "reference", "operational", "data-rich"],
  balanced: [],
};

const GEOMETRY_WORDS: Record<Exclude<Geometry, "authored">, string[]> = {
  sharp: ["sharp", "hard", "precise", "brutal", "angular", "editorial", "engineered", "grid"],
  organic: ["organic", "hand", "natural", "botanical", "sketch", "irregular", "papercut", "torn"],
  soft: ["soft", "rounded", "friendly", "warm", "approachable", "gentle"],
};

function matches(haystack: string, words: string[]): boolean {
  return words.some((word) => haystack.includes(word));
}

function inferDensity(direction: CreativeDirection | undefined): Density {
  const declared = direction?.density;
  if (declared === "sparse" || declared === "balanced" || declared === "dense") return declared as Density;
  const text = [
    ...(direction?.mood ?? []),
    direction?.concept,
    direction?.visualLanguage,
    direction?.textureLanguage,
    direction?.spatialRhythm,
    direction?.materialLanguage,
    ...(direction?.compositionPrinciples ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (matches(text, DENSITY_WORDS.dense)) return "dense";
  if (matches(text, DENSITY_WORDS.sparse)) return "sparse";
  return "balanced";
}

/**
 * The author's shape language, or `authored` when they did not state one.
 *
 * The legacy `geometry` enum still wins when a 0.9 host supplies it, and the
 * prose fields are still read for a strong signal. What changed in 0.10 is the
 * end of the chain: silence now stays silence instead of becoming `sharp`.
 */
function inferGeometry(direction: CreativeDirection | undefined): Geometry {
  const declared = direction?.geometry;
  if (declared === "sharp" || declared === "soft" || declared === "organic") return declared as Geometry;
  const text = [
    ...(direction?.mood ?? []),
    direction?.geometryLanguage,
    direction?.shapeLanguage,
    direction?.visualLanguage,
    direction?.concept,
  ].filter(Boolean).join(" ").toLowerCase();
  if (matches(text, GEOMETRY_WORDS.organic)) return "organic";
  if (matches(text, GEOMETRY_WORDS.sharp)) return "sharp";
  if (matches(text, GEOMETRY_WORDS.soft)) return "soft";
  return "authored";
}

/** A modular scale anchored on the configured legibility minimums. */
function typeScale(fonts: FontsConfig, density: Density, shortestEdge: number): TypeScale {
  // Type has to grow with the slide: 32pt on a 7.5in-tall stage reads as a
  // title, the same 32pt on a 13.3in-tall vertical stage reads as body copy.
  const scale = Math.max(0.8, Math.min(1.35, shortestEdge / 7.5));
  const ratio = density === "dense" ? 1.2 : density === "sparse" ? 1.42 : 1.28;
  const body = Math.round(fonts.minimums.body * scale);
  const round = (value: number) => Math.round(value);
  return {
    micro: Math.max(9, round(body / ratio / 1.1)),
    caption: Math.max(fonts.minimums.caption, round(body / ratio)),
    body,
    lead: round(body * ratio * 0.86),
    subheading: Math.max(fonts.minimums.subheading, round(body * ratio)),
    title: Math.max(fonts.minimums.slideTitle, round(body * ratio ** 2)),
    display: Math.max(fonts.minimums.deckTitle, round(body * ratio ** 3)),
  };
}

function spaceScale(density: Density, shortestEdge: number): SpaceScale {
  const unit = Number(((density === "dense" ? 0.09 : density === "sparse" ? 0.16 : 0.12) * (shortestEdge / 7.5)).toFixed(4));
  return {
    unit,
    xs: Number((unit * 0.5).toFixed(4)),
    sm: unit,
    md: Number((unit * 2).toFixed(4)),
    lg: Number((unit * 3.5).toFixed(4)),
    xl: Number((unit * 5.5).toFixed(4)),
  };
}

function normalizedAvoid(direction: CreativeDirection | undefined): string[] {
  return (direction?.avoid ?? []).map((entry) => String(entry).toLowerCase().trim()).filter(Boolean);
}

function avoids(avoid: string[], ...terms: string[]): boolean {
  return avoid.some((entry) => terms.some((term) => entry.includes(term)));
}

/**
 * Resolves the design tokens for one deck. `avoid` is honoured literally: a
 * model that rules out rounded corners gets square ones, which is the whole
 * point of asking it to state exclusions.
 */
export function resolveTokens(config: SlideAgentConfig, direction?: CreativeDirection): DeckTokens {
  const density = inferDensity(direction);
  const geometry = inferGeometry(direction);
  const avoid = normalizedAvoid(direction);
  const shortestEdge = Math.min(config.dimensions.width, config.dimensions.height);
  const space = spaceScale(density, shortestEdge);

  // `authored` contributes no radius at all: the deck did not ask for a corner
  // language, so the fallback layouts do not invent one.
  const softRadius = geometry === "soft" ? 0.14 : geometry === "organic" ? 0.1 : geometry === "sharp" ? 0.04 : 0;
  const suppressRadius = (geometry === "sharp" || geometry === "authored")
    && avoids(avoid, "round", "radius", "soft corner");
  const radius = {
    none: 0 as const,
    soft: suppressRadius || avoids(avoid, "rounded corner", "round corner") ? 0 : softRadius,
    round: suppressRadius || avoids(avoid, "rounded corner", "round corner") ? 0 : softRadius * 2.5,
  };

  const strokeBase = density === "dense" ? 0.75 : 1;
  return {
    palette: config.colors,
    fonts: config.fonts,
    type: typeScale(config.fonts, density, shortestEdge),
    space,
    stroke: {
      hairline: Number((strokeBase * 0.75).toFixed(2)),
      regular: Number((strokeBase * 1.25).toFixed(2)),
      bold: Number((strokeBase * 3).toFixed(2)),
    },
    radius,
    density,
    geometry,
    avoid,
  };
}

/** How many items a slide of this density should show before it feels crowded. */
export function densityBudget(tokens: DeckTokens): { bullets: number; columns: number; words: number } {
  switch (tokens.density) {
    case "sparse": return { bullets: 3, columns: 2, words: 45 };
    case "dense": return { bullets: 7, columns: 4, words: 140 };
    default: return { bullets: 5, columns: 3, words: 90 };
  }
}
