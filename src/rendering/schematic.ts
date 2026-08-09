import path from "node:path";

import { resolveFont, wrapLineCount } from "../design/font-metrics.js";
import type { DeckManifest, ElementRecord, SlideManifest } from "../types/index.js";
import { normalizeHex } from "../utils/color.js";
import { ensureDir, writeUtf8 } from "../utils/files.js";
import { escapeXml } from "../utils/text.js";

/**
 * Draw a deck's own geometry, without LibreOffice.
 *
 * The preview pipeline needs LibreOffice and Poppler, which most people do not
 * have on first install — so the one thing that lets a model check its own
 * work was unavailable exactly when it was most needed. This draws each slide
 * from the manifest instead: every element in its real position, at its real
 * size, in its real colour, with its real text wrapped where the same
 * measurement says it wraps.
 *
 * It is a schematic, not a render, and it says so on every slide it draws.
 * A true render is LibreOffice's job: kerning, autofit, chart drawing, and
 * anything PowerPoint does that the manifest does not describe are not here.
 * What a schematic does show is the class of problem that actually gets
 * shipped — a title colliding with a rule, a body block running off the stage,
 * a slide that is nine-tenths empty, text with no contrast against its fill.
 *
 * SVG rather than PNG, deliberately: it needs no rasteriser and therefore no
 * dependency, it carries the text as text so a reader can search it, and it
 * opens in any browser.
 */

const NOTE = "Schematic preview: geometry and colour from the deck manifest, not a rendered slide.";

function color(value: string | undefined, fallback: string): string {
  const normalized = normalizeHex(value);
  return normalized ? `#${normalized.replace(/^#/, "")}` : fallback;
}

/** Points per inch, so the SVG's user units are readable as points. */
const PPI = 72;

function textElement(element: ElementRecord, index: number): string {
  const font = resolveFont(element.fontFace, element.bold ?? false);
  const size = element.fontSize ?? 12;
  const lineHeight = size * font.lineHeight;
  const lines = Math.max(1, wrapLineCount(element.text ?? "", element.w, size, font));
  // Text is drawn as one line per wrapped line so a block that overflows its
  // box visibly overflows it, rather than being silently clipped by the SVG.
  const rows: string[] = [];
  const available = Math.max(1, Math.floor((element.h * PPI) / lineHeight));
  const shown = Math.min(lines, Math.max(available, 1));
  const words = (element.text ?? "").split(/\s+/).filter(Boolean);
  const perLine = Math.max(1, Math.ceil(words.length / lines));

  for (let line = 0; line < shown; line += 1) {
    const slice = words.slice(line * perLine, (line + 1) * perLine).join(" ");
    if (!slice) break;
    rows.push(`<text x="${(element.x * PPI).toFixed(1)}" y="${(element.y * PPI + lineHeight * (line + 0.8)).toFixed(1)}" font-family="${escapeXml(element.fontFace ?? "sans-serif")}" font-size="${size}" font-weight="${element.bold ? "700" : "400"}" fill="${color(element.textColor, "#111111")}">${escapeXml(slice)}</text>`);
  }

  const overflowing = lines > available;
  const marker = overflowing
    ? `<rect x="${(element.x * PPI).toFixed(1)}" y="${(element.y * PPI).toFixed(1)}" width="${(element.w * PPI).toFixed(1)}" height="${(element.h * PPI).toFixed(1)}" fill="none" stroke="#D12D3E" stroke-width="1" stroke-dasharray="4 3"/>`
    : "";

  return `<g data-element="${escapeXml(element.id)}" data-index="${index}">${marker}${rows.join("")}</g>`;
}

function shapeElement(element: ElementRecord): string {
  const x = (element.x * PPI).toFixed(1);
  const y = (element.y * PPI).toFixed(1);
  const w = (element.w * PPI).toFixed(1);
  const h = (element.h * PPI).toFixed(1);

  if (element.type === "connector") {
    return `<line x1="${x}" y1="${y}" x2="${(element.x * PPI + element.w * PPI).toFixed(1)}" y2="${(element.y * PPI + element.h * PPI).toFixed(1)}" stroke="${color(element.fillColor, "#888888")}" stroke-width="1.5"/>`;
  }

  if (element.type === "image") {
    // The image itself is not embedded: a schematic shows where a picture
    // sits and what it is meant to show, which is what a composition check
    // needs, without inlining megabytes per slide.
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#E8E8EC" stroke="#B4B4C0" stroke-width="1"/>`
      + `<line x1="${x}" y1="${y}" x2="${(element.x * PPI + element.w * PPI).toFixed(1)}" y2="${(element.y * PPI + element.h * PPI).toFixed(1)}" stroke="#B4B4C0"/>`
      + `<line x1="${x}" y1="${(element.y * PPI + element.h * PPI).toFixed(1)}" x2="${(element.x * PPI + element.w * PPI).toFixed(1)}" y2="${y}" stroke="#B4B4C0"/>`
      + `<text x="${(element.x * PPI + 6).toFixed(1)}" y="${(element.y * PPI + 14).toFixed(1)}" font-family="sans-serif" font-size="9" fill="#5A5A66">${escapeXml(element.altText ?? path.basename(element.imagePath ?? "image"))}</text></g>`;
  }

  if (element.type === "chart" || element.type === "table") {
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#F2F2F6" stroke="#B4B4C0" stroke-width="1" stroke-dasharray="6 4"/>`
      + `<text x="${(element.x * PPI + 6).toFixed(1)}" y="${(element.y * PPI + 14).toFixed(1)}" font-family="sans-serif" font-size="9" fill="#5A5A66">${escapeXml(element.type)}: ${escapeXml(element.altText ?? element.name)}</text></g>`;
  }

  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color(element.fillColor, "none")}"/>`;
}

export function slideToSvg(slide: SlideManifest, manifest: DeckManifest): string {
  const width = manifest.width * PPI;
  const height = manifest.height * PPI;
  const background = color(slide.backgroundColor, "#FFFFFF");

  const body = slide.elements
    .map((element, index) => element.type === "text" && element.text?.trim()
      ? textElement(element, index)
      : shapeElement(element))
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}" width="${width.toFixed(0)}" height="${height.toFixed(0)}" role="img" aria-label="${escapeXml(`Slide ${slide.number}: ${slide.title}`)}">
  <title>${escapeXml(`Slide ${slide.number}: ${slide.title}`)}</title>
  <desc>${escapeXml(NOTE)}</desc>
  <rect width="100%" height="100%" fill="${background}"/>
  ${body}
  <g opacity="0.55">
    <rect x="0" y="${(height - 14).toFixed(1)}" width="${width.toFixed(1)}" height="14" fill="#111118"/>
    <text x="6" y="${(height - 4).toFixed(1)}" font-family="monospace" font-size="9" fill="#FFFFFF">${escapeXml(`slide ${slide.number}/${manifest.slides.length} · ${NOTE}`)}</text>
  </g>
</svg>
`;
}

export interface SchematicResult {
  previewFiles: string[];
  width: number;
  height: number;
}

/** Write one schematic SVG per slide into `outputDir`. */
export async function renderSchematic(manifest: DeckManifest, outputDir: string): Promise<SchematicResult> {
  const output = await ensureDir(outputDir);
  const previewFiles: string[] = [];
  for (const slide of manifest.slides) {
    const file = path.join(output, `slide-${slide.number}.svg`);
    await writeUtf8(file, slideToSvg(slide, manifest));
    previewFiles.push(file);
  }
  return {
    previewFiles,
    width: Math.round(manifest.width * PPI),
    height: Math.round(manifest.height * PPI),
  };
}
