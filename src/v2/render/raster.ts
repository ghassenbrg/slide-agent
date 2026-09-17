import { createRequire } from "node:module";

import type { SceneGraph, SceneSlide } from "../ir/scene.js";
import type { TextEngine } from "../text/measure.js";
import { esc } from "../ooxml/xml.js";
import { SvgRenderer } from "./svg.js";

/**
 * SVG → PNG in-process with resvg, loading exactly the font files the text
 * engine measured with. Previews for a deck take milliseconds, which is what
 * makes looking at the deck — and exploring alternatives — a normal step.
 */

interface ResvgModule {
  Resvg: new (svg: string, options: Record<string, unknown>) => { render(): { asPng(): Buffer; width: number; height: number } };
}

let resvg: ResvgModule | null | undefined;

function loadResvg(): ResvgModule | null {
  if (resvg !== undefined) return resvg;
  try {
    resvg = createRequire(import.meta.url)("@resvg/resvg-js") as ResvgModule;
  } catch {
    resvg = null;
  }
  return resvg;
}

export function rasterAvailable(): boolean {
  return loadResvg() !== null;
}

export interface RasterOptions {
  /** Output width in pixels. */
  width: number;
  text: TextEngine;
}

function fontFiles(text: TextEngine): string[] {
  return [...new Set(text.loadedFaces().map((face) => face.file).filter((file): file is string => Boolean(file)))];
}

export function svgToPng(svg: string, options: RasterOptions): Buffer | undefined {
  const module = loadResvg();
  if (!module) return undefined;
  const renderer = new module.Resvg(svg, {
    fitTo: { mode: "width", value: Math.round(options.width) },
    font: { fontFiles: fontFiles(options.text), loadSystemFonts: process.env.SLIDE_AGENT_SYSTEM_FONTS !== "0", defaultFontFamily: "Arial" },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
  });
  return renderer.render().asPng();
}

export function slidePng(slide: SceneSlide, scene: SceneGraph, options: RasterOptions & { highlight?: string[]; crop?: { x: number; y: number; w: number; h: number } }): { png?: Buffer; svg: string } {
  const renderer = new SvgRenderer({ text: options.text, ...(options.highlight ? { highlight: options.highlight } : {}) });
  const svg = renderer.slide(slide, scene, options.crop);
  const png = svgToPng(svg, options);
  return { svg, ...(png ? { png } : {}) };
}

export interface SheetCell {
  label: string;
  svg: string;
}

/**
 * A grid of slide SVGs in one image: the contact sheet, or — with one row per
 * design and one column per slide — the exploration sheet.
 */
export function sheetSvg(cells: SheetCell[], layout: { columns: number; cellWidth: number; aspect: number; title?: string; rowLabels?: string[] }): string {
  const gap = 12;
  const labelHeight = 16;
  const titleHeight = layout.title ? 26 : 0;
  const rowLabelWidth = layout.rowLabels ? 120 : 0;
  const cellHeight = layout.cellWidth / layout.aspect;
  const rows = Math.ceil(cells.length / layout.columns);
  const width = rowLabelWidth + layout.columns * layout.cellWidth + (layout.columns + 1) * gap;
  const height = titleHeight + rows * (cellHeight + labelHeight + gap) + gap;
  const body = cells.map((cell, index) => {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    const x = rowLabelWidth + gap + column * (layout.cellWidth + gap);
    const y = titleHeight + gap + row * (cellHeight + labelHeight + gap);
    const inner = cell.svg.replace(/^<svg([^>]*)width="[^"]*" height="[^"]*"/, `<svg$1x="${x}" y="${y + labelHeight}" width="${layout.cellWidth}" height="${cellHeight}"`);
    return `<text x="${x}" y="${y + 12}" font-family="Arial, sans-serif" font-size="11" fill="#444">${esc(cell.label)}</text><rect x="${x - 0.5}" y="${y + labelHeight - 0.5}" width="${layout.cellWidth + 1}" height="${cellHeight + 1}" fill="none" stroke="#CCCCCC"/>${inner}`;
  }).join("");
  const rowLabels = (layout.rowLabels ?? []).map((label, row) => `<text x="${gap}" y="${titleHeight + gap + row * (cellHeight + labelHeight + gap) + labelHeight + cellHeight / 2}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#222">${esc(label)}</text>`).join("");
  const title = layout.title ? `<text x="${gap}" y="18" font-family="Arial, sans-serif" font-size="13" fill="#222">${esc(layout.title)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#F7F7F7"/>${title}${rowLabels}${body}</svg>`;
}
