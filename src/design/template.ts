import { readFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

import { SlideAgentError } from "../utils/errors.js";
import { hexToHsl, hslToHex, normalizeHex } from "../utils/color.js";
import { decodeXml } from "../utils/text.js";
import type { BrandKit } from "./brand.js";

/**
 * Read an organisation's PowerPoint template into a brand kit.
 *
 * Most decks in a company do not start from nothing; they start from a
 * mandated `.potx` with a theme someone approved. Retyping that theme into a
 * brand kit by hand is the kind of transcription that goes wrong quietly, so
 * this reads it: the colour scheme, the major and minor typefaces, and the
 * footer text the master already carries.
 *
 * What it deliberately does not do is adopt the template's masters and
 * layouts. Slide Agent composes slides from a grid rather than filling
 * placeholders, and a deck that carried both would carry two design systems.
 * The theme is the part that makes a deck look like it belongs to the
 * organisation; that is the part that travels.
 */

const THEME_ROLES = [
  "dk1", "lt1", "dk2", "lt2",
  "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
  "hlink", "folHlink",
] as const;

type ThemeRole = (typeof THEME_ROLES)[number];

export interface TemplateTheme {
  name?: string;
  colors: Partial<Record<ThemeRole, string>>;
  majorFont?: string;
  minorFont?: string;
  footer?: string;
}

/**
 * `<a:dk1>` and friends hold one child: an explicit `srgbClr`, or a `sysClr`
 * that names a Windows system colour and carries its resolved value in
 * `lastClr`. Both forms appear in templates produced by PowerPoint itself.
 */
function colorIn(block: string): string | undefined {
  const srgb = block.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/)?.[1];
  if (srgb) return srgb.toUpperCase();
  const system = block.match(/<a:sysClr\b[^>]*\blastClr="([0-9A-Fa-f]{6})"/)?.[1];
  return system?.toUpperCase();
}

export function parseTheme(themeXml: string): TemplateTheme {
  const scheme = themeXml.match(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/)?.[0] ?? "";
  const colors: Partial<Record<ThemeRole, string>> = {};
  for (const role of THEME_ROLES) {
    const block = scheme.match(new RegExp(`<a:${role}>[\\s\\S]*?</a:${role}>`))?.[0];
    const value = block ? colorIn(block) : undefined;
    if (value) colors[role] = value;
  }

  const typeface = (which: "majorFont" | "minorFont"): string | undefined => {
    const block = themeXml.match(new RegExp(`<a:${which}>[\\s\\S]*?</a:${which}>`))?.[0];
    const latin = block?.match(/<a:latin\b[^>]*\btypeface="([^"]*)"/)?.[1];
    const name = latin ? decodeXml(latin).trim() : "";
    // A theme may declare an empty typeface to mean "inherit"; that is not a
    // font name and must not become one.
    return name && name !== "+mj-lt" && name !== "+mn-lt" ? name : undefined;
  };

  const name = themeXml.match(/<a:theme\b[^>]*\bname="([^"]*)"/)?.[1];

  return {
    ...(name ? { name: decodeXml(name) } : {}),
    colors,
    ...(typeface("majorFont") ? { majorFont: typeface("majorFont") } : {}),
    ...(typeface("minorFont") ? { minorFont: typeface("minorFont") } : {}),
  };
}

/** A lighter or darker cut of a colour, for tints the theme does not name. */
function shift(hex: string, lightnessDelta: number): string {
  const { hue, saturation, lightness } = hexToHsl(hex);
  return hslToHex(hue, saturation, Math.min(100, Math.max(0, lightness + lightnessDelta)));
}

function isLight(hex: string): boolean {
  return hexToHsl(hex).lightness >= 50;
}

/**
 * A slide master's `<p:clrMap>` says which theme role plays which part. A dark
 * template is normally expressed by swapping the map — `bg1="dk1" tx1="lt1"` —
 * rather than by putting a dark colour in `lt1`, so reading the role names
 * literally would produce a white deck from a black template.
 */
export interface ColorMap {
  bg1: ThemeRole;
  tx1: ThemeRole;
  bg2: ThemeRole;
  tx2: ThemeRole;
}

export const DEFAULT_COLOR_MAP: ColorMap = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };

export function parseColorMap(masterXml: string): ColorMap {
  const block = masterXml.match(/<p:clrMap\b[^>]*\/?>/)?.[0];
  if (!block) return DEFAULT_COLOR_MAP;
  const read = (attribute: keyof ColorMap): ThemeRole => {
    const value = block.match(new RegExp(`\\b${attribute}="([^"]+)"`))?.[1];
    return (THEME_ROLES as readonly string[]).includes(value ?? "") ? value as ThemeRole : DEFAULT_COLOR_MAP[attribute];
  };
  return { bg1: read("bg1"), tx1: read("tx1"), bg2: read("bg2"), tx2: read("tx2") };
}

/** Literal text sitting in a master's footer placeholder, if there is any. */
export function footerTextIn(masterXml: string): string | undefined {
  for (const shape of masterXml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    if (!/<p:ph\b[^>]*\btype="ftr"/.test(shape[0])) continue;
    const text = [...shape[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1]!)).join("").trim();
    // A placeholder with a prompt like "Footer" is empty, not a footer.
    if (text && !/^footer$/i.test(text)) return text;
  }
  return undefined;
}

/**
 * Turn a theme into the palette Slide Agent's tokens expect.
 *
 * Office themes name a light pair and a dark pair rather than a background and
 * an ink; the slide master's colour map says which plays which part, so it is
 * consulted rather than assumed. Semantic colours (positive, negative,
 * warning) are left unset: a theme's accent 3 is not a "success"
 * colour just because it happens to be green, and inventing that mapping would
 * put meaning on a slide that the organisation never approved.
 */
export function paletteFromTheme(theme: TemplateTheme, colorMap: ColorMap = DEFAULT_COLOR_MAP): NonNullable<BrandKit["palette"]> {
  const { accent1, accent2 } = theme.colors;
  const background = theme.colors[colorMap.bg1];
  const ink = theme.colors[colorMap.tx1];
  const surfaceCandidate = theme.colors[colorMap.bg2];
  // Tints have to move away from the background, and which way that is depends
  // on the deck, not on the role names: a dark deck needs a lighter surface
  // where a light one needs a darker.
  const darkDeck = background !== undefined && !isLight(background);

  const palette: NonNullable<BrandKit["palette"]> = {};
  if (background) palette.background = background;
  if (ink) palette.ink = ink;
  if (surfaceCandidate && surfaceCandidate !== background) palette.surface = surfaceCandidate;
  else if (background) palette.surface = shift(background, darkDeck ? 6 : -4);
  const mutedCandidate = theme.colors[colorMap.tx2];
  if (mutedCandidate && mutedCandidate !== ink) palette.muted = mutedCandidate;
  else if (ink) palette.muted = shift(ink, darkDeck ? -28 : 28);
  if (background) palette.rule = shift(background, darkDeck ? 14 : -12);
  if (accent1) palette.accent = accent1;
  if (accent2) palette.accentAlt = accent2;
  if (accent1) palette.accentSoft = shift(accent1, darkDeck ? -32 : 34);

  // The remaining theme accents are kept by name so a model can reach for them
  // deliberately without them being given a meaning they do not have.
  const custom: Record<string, string> = {};
  for (const role of ["accent3", "accent4", "accent5", "accent6"] as const) {
    const value = theme.colors[role];
    if (value) custom[role] = value;
  }
  if (theme.colors.hlink) custom.hyperlink = theme.colors.hlink;
  if (Object.keys(custom).length > 0) palette.custom = custom;

  return palette;
}

export interface TemplateImportOptions {
  /** Overrides the theme's own name. */
  name?: string;
  /** Defaults to locking both: a mandated template usually is one. */
  locked?: Array<"palette" | "typography">;
}

/** Read a `.potx` or `.pptx` and derive the brand kit it implies. */
export async function brandKitFromTemplate(filePath: string, options: TemplateImportOptions = {}): Promise<BrandKit> {
  const resolved = path.resolve(filePath);
  const bytes = await readFile(resolved).catch(() => {
    throw new SlideAgentError("TEMPLATE_NOT_FOUND", `Template not found: ${resolved}`, { path: resolved });
  });
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new SlideAgentError("TEMPLATE_INVALID", `${resolved} is not a PowerPoint package.`, { path: resolved });
  });

  const themePath = Object.keys(zip.files).filter((name) => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort()[0];
  if (!themePath) {
    throw new SlideAgentError("TEMPLATE_HAS_NO_THEME", `${resolved} carries no theme part, so there is nothing to import.`, { path: resolved });
  }
  const theme = parseTheme(await zip.file(themePath)!.async("string"));
  if (Object.keys(theme.colors).length === 0 && !theme.majorFont && !theme.minorFont) {
    throw new SlideAgentError("TEMPLATE_THEME_EMPTY", `The theme in ${resolved} declares no colours or typefaces.`, { path: resolved });
  }

  const masterPath = Object.keys(zip.files).filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name)).sort()[0];
  const masterXml = masterPath ? await zip.file(masterPath)!.async("string") : undefined;
  const footer = masterXml ? footerTextIn(masterXml) : undefined;

  const palette = paletteFromTheme(theme, masterXml ? parseColorMap(masterXml) : DEFAULT_COLOR_MAP);
  const typography = {
    ...(theme.majorFont ? { display: theme.majorFont, heading: theme.majorFont } : {}),
    ...(theme.minorFont ? { body: theme.minorFont } : {}),
  };

  return {
    name: options.name ?? theme.name ?? path.basename(resolved, path.extname(resolved)),
    ...(Object.keys(palette).length > 0 ? { palette } : {}),
    ...(Object.keys(typography).length > 0 ? { typography } : {}),
    ...(footer ? { footer: { text: footer, slides: "all" as const } } : {}),
    locked: options.locked ?? ["palette", "typography"],
  };
}

/** True when a `--brand` argument is a PowerPoint template rather than JSON. */
export function isTemplateFile(filePath: string): boolean {
  return /\.(potx|pptx|potm|pptm)$/i.test(filePath);
}

/** Normalised hex, for callers writing a kit back out as JSON. */
export function normalizeKitColors(kit: BrandKit): BrandKit {
  if (!kit.palette) return kit;
  const mapped = Object.fromEntries(
    Object.entries(kit.palette).map(([key, value]) => [
      key,
      typeof value === "string" ? normalizeHex(value) ?? value : value,
    ]),
  ) as BrandKit["palette"];
  return { ...kit, palette: mapped };
}
