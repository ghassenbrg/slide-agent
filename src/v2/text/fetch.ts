import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { SlideAgentError } from "../../utils/errors.js";
import { catalogEntry, isOfficeFamily } from "./catalog.js";
import { fontCacheDirectory } from "./registry.js";
import { parseFaces } from "./sfnt.js";

/**
 * Fetching open-licence faces on demand.
 *
 * Off unless the operator allows it (`SLIDE_AGENT_FONT_DOWNLOADS=1`, or an
 * explicit `slide-agent fonts add`). Only two hosts are contacted —
 * fonts.googleapis.com for the stylesheet that names the files, and
 * fonts.gstatic.com for the files — and every file is checked to be a real
 * font before it is kept. A manifest beside the files records each file's
 * source URL and SHA-256, and a run record carries the hashes it measured with.
 */

const CSS_HOST = "https://fonts.googleapis.com/css2";
const FILE_HOST = /^https:\/\/fonts\.gstatic\.com\//;
const MAX_FONT_BYTES = 20 * 1024 * 1024;

export function fontDownloadsAllowed(): boolean {
  return process.env.SLIDE_AGENT_FONT_DOWNLOADS === "1";
}

export interface FetchedFont {
  family: string;
  weight: number;
  italic: boolean;
  file: string;
  sha256: string;
  url: string;
}

export interface FetchOptions {
  weights?: number[];
  italic?: boolean;
  directory?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function familyDirectory(root: string, family: string): string {
  return path.join(root, family.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase());
}

async function fetchWithTimeout(fetcher: typeof fetch, url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
}

/** Download `family` in the requested weights (and italics) into the cache. */
export async function fetchFamily(family: string, options: FetchOptions = {}): Promise<FetchedFont[]> {
  if (!/^[A-Za-z0-9 ]{2,64}$/.test(family)) {
    throw new SlideAgentError("FONT_NAME_INVALID", `"${family}" is not a font family name this fetcher accepts.`, { family });
  }
  if (isOfficeFamily(family)) {
    throw new SlideAgentError("FONT_IS_OFFICE", `${family} ships with Office and is not downloadable; it is used without embedding.`, { family });
  }
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const catalog = catalogEntry(family);
  const weights = (options.weights ?? catalog?.weights ?? [400, 700]).filter((weight) => weight >= 100 && weight <= 900);
  const italic = options.italic ?? catalog?.italic ?? false;
  const axes = italic ? `ital,wght@${[...weights.map((weight) => `0,${weight}`), ...weights.map((weight) => `1,${weight}`)].join(";")}` : `wght@${weights.join(";")}`;
  const url = `${CSS_HOST}?family=${encodeURIComponent(family).replace(/%20/g, "+")}:${axes}`;

  // An old user agent makes the API answer with TrueType files rather than WOFF2.
  const response = await fetchWithTimeout(fetcher, url, timeoutMs, { headers: { "user-agent": "Mozilla/4.0 (slide-agent font fetch)" } });
  if (!response.ok) {
    throw new SlideAgentError("FONT_NOT_FOUND", `Google Fonts has no family "${family}" in those weights (HTTP ${response.status}).`, { family, status: response.status });
  }
  const css = await response.text();
  const faces = [...css.matchAll(/font-style:\s*(normal|italic);\s*font-weight:\s*(\d+);\s*src:\s*url\((https:[^)]+)\)\s*format\('truetype'\)/g)]
    .map((match) => ({ italic: match[1] === "italic", weight: Number(match[2]), url: match[3]! }));
  if (faces.length === 0) throw new SlideAgentError("FONT_NOT_FOUND", `No TrueType files were offered for "${family}".`, { family });

  const directory = familyDirectory(options.directory ?? fontCacheDirectory(), family);
  await mkdir(directory, { recursive: true, mode: 0o755 });
  const fetched: FetchedFont[] = [];
  const manifestPath = path.join(directory, "manifest.json");
  const manifest: Record<string, { url: string; sha256: string }> = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}"));

  for (const face of faces) {
    if (!FILE_HOST.test(face.url)) continue;
    const fileResponse = await fetchWithTimeout(fetcher, face.url, timeoutMs);
    if (!fileResponse.ok) continue;
    const bytes = new Uint8Array(await fileResponse.arrayBuffer());
    if (bytes.byteLength > MAX_FONT_BYTES) continue;
    try {
      parseFaces(bytes);
    } catch {
      continue;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const name = `${family.replace(/[^A-Za-z0-9]+/g, "")}-${face.weight}${face.italic ? "-italic" : ""}.ttf`;
    const target = path.join(directory, name);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o644 });
    await rename(temporary, target);
    manifest[name] = { url: face.url, sha256 };
    fetched.push({ family, weight: face.weight, italic: face.italic, file: target, sha256, url: face.url });
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return fetched;
}
