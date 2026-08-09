import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Which of a deck's typefaces this machine can actually display.
 *
 * This is deliberately separate from measurement. `font-metrics.ts` measures
 * from embedded tables so that a deck validates identically on a laptop and in
 * CI; availability is the opposite kind of question — its answer is different
 * on every machine, and on the machine of whoever opens the deck, which is the
 * one that matters and the one we cannot see.
 *
 * So this never fails a build and never changes a validation verdict. It
 * answers a question an author asks once: "if I set this deck in Aptos, will
 * the people I send it to see Aptos?" A missing font is not an error — the
 * model was asked to choose freely — but silently substituting Times for the
 * display face is the kind of thing worth knowing before you present.
 */

export interface FontAvailability {
  family: string;
  available: boolean;
  /** The file that satisfied the family, when one did. */
  file?: string;
}

function fontDirectories(): string[] {
  const home = homedir();
  if (process.platform === "darwin") {
    return [
      "/System/Library/Fonts",
      "/System/Library/Fonts/Supplemental",
      "/Library/Fonts",
      path.join(home, "Library", "Fonts"),
    ];
  }
  if (process.platform === "win32") {
    const windows = process.env.SystemRoot ?? "C:\\Windows";
    return [
      path.join(windows, "Fonts"),
      path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Microsoft", "Windows", "Fonts"),
    ];
  }
  return [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    path.join(home, ".fonts"),
    path.join(home, ".local", "share", "fonts"),
  ];
}

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".otc", ".woff", ".woff2", ".pfb"]);

/** Recursive, but bounded: a font tree is wide and we only need file names. */
async function fontFilesIn(directory: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await fontFilesIn(full, depth + 1));
    else if (FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Style words a file name carries that a family name does not, so that
 * `Georgia Bold Italic.ttf` still answers for `Georgia`.
 */
const FILE_STYLE_WORDS = /(regular|italic|oblique|bold|semibold|demibold|light|medium|thin|black|heavy|condensed|narrow|mt|ms|web|variable|vf)$/;

function familyKeys(fileName: string): string[] {
  const stem = normalize(path.basename(fileName, path.extname(fileName)));
  const keys = new Set([stem]);
  let current = stem;
  for (let round = 0; round < 3; round += 1) {
    const stripped = current.replace(FILE_STYLE_WORDS, "");
    if (stripped === current || !stripped) break;
    current = stripped;
    keys.add(current);
  }
  return [...keys];
}

let cache: Map<string, string> | undefined;

/** Family name (normalised) to the first file that provides it. */
export async function installedFontFiles(refresh = false): Promise<Map<string, string>> {
  if (cache && !refresh) return cache;
  const found = new Map<string, string>();
  for (const directory of fontDirectories()) {
    for (const file of await fontFilesIn(directory)) {
      for (const key of familyKeys(file)) if (!found.has(key)) found.set(key, file);
    }
  }
  cache = found;
  return found;
}

/**
 * Report whether each family resolves on this machine. Matching is by file
 * name rather than by parsing every font's name table: reading a few thousand
 * font files to answer an advisory question is not a trade worth making, and a
 * file called `Georgia.ttf` is Georgia.
 */
export async function checkFontAvailability(families: string[], refresh = false): Promise<FontAvailability[]> {
  const installed = await installedFontFiles(refresh);
  const seen = new Set<string>();
  const results: FontAvailability[] = [];

  for (const family of families) {
    const trimmed = family.trim();
    if (!trimmed) continue;
    const key = normalize(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const file = installed.get(key);
    results.push({ family: trimmed, available: file !== undefined, ...(file ? { file } : {}) });
  }

  return results;
}

/** One line a human can act on, or nothing when every family resolves. */
export function fontAvailabilityAdvice(results: FontAvailability[]): string | undefined {
  const missing = results.filter((result) => !result.available).map((result) => result.family);
  if (missing.length === 0) return undefined;
  return `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not installed on this machine, so this preview substitutes another face. `
    + "The deck is unaffected — whoever opens it sees what they have installed — but embed or install the fonts if the typography matters.";
}
