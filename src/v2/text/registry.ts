import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { closest } from "../ir/issues.js";
import { OFFICE_FAMILIES, OPEN_FAMILIES, officeSubstitute } from "./catalog.js";
import { embeddingAllowed, GlyphMetrics, parseFaces, type FontFace } from "./sfnt.js";

/**
 * Where font files live, and which file a (family, weight, italic) request means.
 *
 * Search order: directories the operator configured (`SLIDE_AGENT_FONT_DIRS`),
 * the project's `.slide-agent/fonts`, the download cache, then the system's
 * font directories. The first face found for a family wins, so a project can
 * pin the exact files it was designed with.
 */

export interface FontFileEntry {
  file: string;
  faceIndex: number;
  family: string;
  subfamily: string;
  typographicFamily: string;
  typographicSubfamily: string;
  weight: number;
  italic: boolean;
  fsType: number;
  outlines: "truetype" | "cff";
  variable: boolean;
  monospace: boolean;
  size: number;
  mtimeMs: number;
}

export interface ResolvedFace {
  entry: FontFileEntry;
  metrics: GlyphMetrics;
  face: FontFace;
  sha256: string;
  embeddable: boolean;
  editable: boolean;
  /** When the requested family was not found and a metric-compatible substitute was used. */
  substituteFor?: string;
}

export function fontCacheDirectory(): string {
  const base = process.env.SLIDE_AGENT_CACHE_DIR
    ?? (process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"), "slide-agent")
      : path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), ".cache"), "slide-agent"));
  return path.join(base, "fonts");
}

export function systemFontDirectories(): string[] {
  const home = homedir();
  if (process.platform === "darwin") return ["/System/Library/Fonts", "/Library/Fonts", path.join(home, "Library", "Fonts"), "/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts"];
  if (process.platform === "win32") return [path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts"), path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Microsoft", "Windows", "Fonts")];
  return ["/usr/share/fonts", "/usr/local/share/fonts", path.join(home, ".fonts"), path.join(home, ".local", "share", "fonts")];
}

export interface RegistryOptions {
  directories?: string[];
  includeSystem?: boolean;
  projectDirectory?: string;
}

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".otc"]);
const MAX_FONT_BYTES = 64 * 1024 * 1024;

export function normalizeFamily(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export class FontRegistry {
  private entries: FontFileEntry[] | undefined;
  private indexing: Promise<FontFileEntry[]> | undefined;
  private readonly loaded = new Map<string, ResolvedFace>();
  private readonly directories: string[];

  public constructor(options: RegistryOptions = {}) {
    const configured = (process.env.SLIDE_AGENT_FONT_DIRS ?? "").split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
    const includeSystem = options.includeSystem ?? process.env.SLIDE_AGENT_SYSTEM_FONTS !== "0";
    this.directories = [
      ...(options.directories ?? []),
      ...configured,
      ...(options.projectDirectory ? [path.join(options.projectDirectory, ".slide-agent", "fonts")] : []),
      fontCacheDirectory(),
      ...(includeSystem ? systemFontDirectories() : []),
    ].map((directory) => path.resolve(directory));
  }

  public searchDirectories(): string[] {
    return [...this.directories];
  }

  public async index(): Promise<FontFileEntry[]> {
    if (this.entries) return this.entries;
    this.indexing ??= this.scan().then((entries) => {
      this.entries = entries;
      return entries;
    });
    return this.indexing;
  }

  /** Forget the index, e.g. after a download added files. */
  public invalidate(): void {
    this.entries = undefined;
    this.indexing = undefined;
  }

  private async scan(): Promise<FontFileEntry[]> {
    const entries: FontFileEntry[] = [];
    const seen = new Set<string>();
    for (const directory of this.directories) {
      for (const file of await listFontFiles(directory, 4)) {
        if (seen.has(file)) continue;
        seen.add(file);
        const info = await stat(file).catch(() => undefined);
        if (!info || info.size > MAX_FONT_BYTES) continue;
        try {
          const bytes = new Uint8Array(await readFile(file));
          parseFaces(bytes).forEach((face, faceIndex) => {
            entries.push({
              file,
              faceIndex,
              family: face.family,
              subfamily: face.subfamily,
              typographicFamily: face.typographicFamily,
              typographicSubfamily: face.typographicSubfamily,
              weight: face.weight,
              italic: face.italic,
              fsType: face.fsType,
              outlines: face.outlines,
              variable: face.variable,
              monospace: face.monospace,
              size: info.size,
              mtimeMs: info.mtimeMs,
            });
          });
        } catch {
          // Unreadable or unsupported files are skipped; the index lists what can be used.
        }
      }
    }
    return entries;
  }

  public async families(): Promise<string[]> {
    const entries = await this.index();
    return [...new Set(entries.map((entry) => entry.typographicFamily))].sort();
  }

  public async hasFamily(family: string): Promise<boolean> {
    const key = normalizeFamily(family);
    return (await this.index()).some((entry) => normalizeFamily(entry.typographicFamily) === key || normalizeFamily(entry.family) === key);
  }

  /**
   * The file for `family` closest to `weight` and `italic`. Static instances
   * are preferred to variable fonts, and TrueType outlines to CFF, because
   * only TrueType outlines embed in PowerPoint.
   */
  public async find(family: string, weight = 400, italic = false): Promise<FontFileEntry | undefined> {
    const key = normalizeFamily(family);
    const candidates = (await this.index()).filter((entry) => normalizeFamily(entry.typographicFamily) === key || normalizeFamily(entry.family) === key);
    if (candidates.length === 0) return undefined;
    const score = (entry: FontFileEntry): number =>
      Math.abs(entry.weight - weight)
      + (entry.italic === italic ? 0 : 1000)
      + (entry.variable ? 40 : 0)
      + (entry.outlines === "cff" ? 25 : 0)
      + (normalizeFamily(entry.typographicFamily) === key ? 0 : 5);
    return [...candidates].sort((left, right) => score(left) - score(right) || left.file.localeCompare(right.file))[0];
  }

  public async load(entry: FontFileEntry): Promise<ResolvedFace> {
    const key = `${entry.file}#${entry.faceIndex}`;
    const cached = this.loaded.get(key);
    if (cached) return cached;
    const bytes = new Uint8Array(await readFile(entry.file));
    const face = parseFaces(bytes)[entry.faceIndex]!;
    const permission = embeddingAllowed(face);
    const resolved: ResolvedFace = {
      entry,
      face,
      metrics: new GlyphMetrics(bytes, face),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      embeddable: permission.allowed && face.outlines === "truetype",
      editable: permission.editable,
    };
    this.loaded.set(key, resolved);
    return resolved;
  }

  /** Resolve a family for measurement: the face itself, else its metric-compatible substitute. */
  public async resolve(family: string, weight = 400, italic = false): Promise<ResolvedFace | undefined> {
    const direct = await this.find(family, weight, italic);
    if (direct) return this.load(direct);
    const substitute = officeSubstitute(family);
    if (substitute) {
      const entry = await this.find(substitute, weight, italic);
      if (entry) return { ...await this.load(entry), substituteFor: family };
    }
    return undefined;
  }

  /** Families available now, closest to `family` by name; used in "font not available" findings. */
  public async closestAvailable(family: string, limit = 3): Promise<string[]> {
    const available = new Set([...(await this.families()), ...Object.keys(OFFICE_FAMILIES)]);
    const byName = closest(family, available, limit);
    if (byName.length >= limit) return byName;
    const catalog = closest(family, OPEN_FAMILIES.map((entry) => entry.family), limit - byName.length);
    return [...byName, ...catalog.filter((name) => !byName.includes(name))];
  }
}

async function listFontFiles(directory: string, depth: number): Promise<string[]> {
  if (depth < 0) return [];
  const items = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const item of items.sort((left, right) => left.name.localeCompare(right.name))) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...await listFontFiles(full, depth - 1));
    else if ((item.isFile() || item.isSymbolicLink()) && FONT_EXTENSIONS.has(path.extname(item.name).toLowerCase())) files.push(full);
  }
  return files;
}

let shared: FontRegistry | undefined;

/** One registry per process, so the system scan happens once. */
export function sharedFontRegistry(): FontRegistry {
  shared ??= new FontRegistry();
  return shared;
}

export function setSharedFontRegistry(registry: FontRegistry | undefined): void {
  shared = registry;
}
