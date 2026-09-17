import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadZipSafely } from "../../utils/safe-zip.js";
import { parseTheme } from "../../design/template.js";
import { assertInsideWorkspace } from "../../security/policy.js";
import { SlideAgentError } from "../../utils/errors.js";
import type { DesignLanguage } from "../ir/design.js";
import { designLanguage } from "../ir/design.js";

/**
 * Brand packs: a customer template or a brand file becomes locked tokens plus
 * a layout map. The model still writes the concept, the unlocked parts of the
 * design language, and every composition.
 */

export interface BrandPack {
  name: string;
  language: DesignLanguage;
  locks: string[];
  layouts: Array<{ name: string; type?: string; placeholders: Array<{ type: string; idx?: number; frame?: { x: number; y: number; w: number; h: number } }> }>;
  logo?: string;
}

const EMU = 914400;

function layoutsFrom(xmlByName: Array<[string, string]>): BrandPack["layouts"] {
  return xmlByName.map(([, xml]) => {
    const name = /<p:cSld\b[^>]*\bname="([^"]*)"/.exec(xml)?.[1] ?? "Layout";
    const type = /<p:sldLayout\b[^>]*\btype="([^"]*)"/.exec(xml)?.[1];
    const placeholders = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)].flatMap((match) => {
      const ph = /<p:ph\b([^>]*)\/?>/.exec(match[1]!);
      if (!ph) return [];
      const kind = /\btype="([^"]*)"/.exec(ph[1]!)?.[1] ?? "body";
      const idx = /\bidx="(\d+)"/.exec(ph[1]!)?.[1];
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(match[1]!);
      const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(match[1]!);
      return [{
        type: kind,
        ...(idx ? { idx: Number(idx) } : {}),
        ...(off && ext ? { frame: { x: Number(off[1]) / EMU, y: Number(off[2]) / EMU, w: Number(ext[1]) / EMU, h: Number(ext[2]) / EMU } } : {}),
      }];
    });
    return { name, ...(type ? { type } : {}), placeholders };
  });
}

export async function importTemplate(filePath: string): Promise<BrandPack> {
  const resolved = assertInsideWorkspace(filePath, "brand");
  const zip = await loadZipSafely(await readFile(resolved).catch(() => {
    throw new SlideAgentError("BRAND_NOT_FOUND", `Brand template not found: ${resolved}`);
  }));
  const themeName = Object.keys(zip.files).filter((name) => /^ppt\/theme\/theme\d+\.xml$/.test(name)).sort()[0];
  if (!themeName) throw new SlideAgentError("BRAND_NO_THEME", `${resolved} has no theme to import.`);
  const theme = parseTheme(await zip.file(themeName)!.async("string"));
  const colors = theme.colors;
  const palette: Record<string, string> = {};
  for (const [slot, hex] of Object.entries(colors)) if (hex) palette[slot] = `#${hex}`;
  const layoutNames = Object.keys(zip.files).filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  const layouts = layoutsFrom(await Promise.all(layoutNames.map(async (name) => [name, await zip.file(name)!.async("string")] as [string, string])));
  const language: DesignLanguage = {
    concept: `Brand template ${theme.name ?? path.basename(resolved)}`,
    color: {
      palette: { lt1: "#FFFFFF", dk1: "#000000", lt2: "#EEEEEE", dk2: "#444444", accent1: "#4472C4", ...palette },
      roles: { background: "lt1", surface: "lt2", text: "dk1", muted: "dk2", accent: "accent1", accentAlt: "accent2", rule: "lt2" },
      data: ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].filter((name) => palette[name]),
    },
    type: {
      display: { family: theme.majorFont ?? "Aptos Display" },
      body: { family: theme.minorFont ?? "Aptos" },
      scale: { base: 18, ratio: 1.25 },
    },
    space: { unit: 8, margin: 40, gutter: 20 },
    grid: { columns: 12, rows: 6 },
    shape: { radius: 0, stroke: 0 },
    ...(theme.footer ? { chrome: { footer: theme.footer } } : {}),
  };
  if (!language.color.data?.length) delete language.color.data;
  return { name: theme.name ?? path.basename(resolved, path.extname(resolved)), language, locks: ["/color/palette", "/type/display/family", "/type/body/family"], layouts };
}

/** A brand reference: a .potx/.pptx template, or a JSON brand pack {name, language, locks}. */
export async function resolveBrand(reference: string, baseDir: string): Promise<BrandPack> {
  const file = path.isAbsolute(reference) ? reference : path.resolve(baseDir, reference);
  if (/\.(potx|pptx|potm)$/i.test(file)) return importTemplate(file);
  const resolved = assertInsideWorkspace(file, "brand");
  const raw = JSON.parse(await readFile(resolved, "utf8").catch(() => {
    throw new SlideAgentError("BRAND_NOT_FOUND", `Brand pack not found: ${resolved}`);
  })) as Partial<BrandPack>;
  const parsed = designLanguage.safeParse(raw.language);
  if (!parsed.success) throw new SlideAgentError("BRAND_INVALID", `${resolved} is not a brand pack: ${parsed.error.issues[0]?.message ?? "invalid language"}.`);
  return { name: raw.name ?? path.basename(resolved, ".json"), language: parsed.data, locks: raw.locks ?? [], layouts: raw.layouts ?? [] };
}
