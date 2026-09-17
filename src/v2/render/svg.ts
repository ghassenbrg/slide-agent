import { readFileSync } from "node:fs";
import path from "node:path";

import { chartSvg } from "../charts/preview.js";
import { boldWeightFor } from "../layout/style.js";
import type { ColorRef, ImageElement, SceneElement, SceneGraph, SceneSlide, ShapeStyle, TableElement, TextElement, TextParagraph, TextStyle } from "../ir/scene.js";
import { esc } from "../ooxml/xml.js";
import type { TextEngine } from "../text/measure.js";
import type { RichParagraph } from "../text/rich.js";
import { applyCase } from "../text/rich.js";

/**
 * SceneGraph → SVG, for previews.
 *
 * Text is laid out by the same engine that fitted it, so the preview shows the
 * lines the fit engine counted. Units are points. This is a preview, not a
 * PowerPoint render, and every surface that returns it says so.
 */

const PPI = 72;

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

function fill(color: ColorRef | undefined, opacity?: number): string {
  if (!color) return 'fill="none"';
  const alpha = (opacity ?? 1) * (color.alpha ?? 1);
  return `fill="#${color.hex}"${alpha < 1 ? ` fill-opacity="${alpha.toFixed(3)}"` : ""}`;
}

function presetPath(preset: string, x: number, y: number, w: number, h: number, radius = 0): string {
  const r = Math.min(radius, w / 2, h / 2);
  switch (preset) {
    case "ellipse": return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"`;
    case "roundRect": return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r || Math.min(w, h) * 0.1667}"`;
    case "triangle": return `<path d="M${x + w / 2},${y} L${x + w},${y + h} L${x},${y + h} Z"`;
    case "rtTriangle": return `<path d="M${x},${y} L${x + w},${y + h} L${x},${y + h} Z"`;
    case "diamond": return `<path d="M${x + w / 2},${y} L${x + w},${y + h / 2} L${x + w / 2},${y + h} L${x},${y + h / 2} Z"`;
    case "chevron": {
      const notch = Math.min(w, h) * 0.5;
      return `<path d="M${x},${y} L${x + w - notch},${y} L${x + w},${y + h / 2} L${x + w - notch},${y + h} L${x},${y + h} L${x + notch},${y + h / 2} Z"`;
    }
    case "homePlate": {
      const tip = Math.min(w, h) * 0.5;
      return `<path d="M${x},${y} L${x + w - tip},${y} L${x + w},${y + h / 2} L${x + w - tip},${y + h} L${x},${y + h} Z"`;
    }
    case "rightArrow": return `<path d="M${x},${y + h * 0.25} L${x + w * 0.6},${y + h * 0.25} L${x + w * 0.6},${y} L${x + w},${y + h / 2} L${x + w * 0.6},${y + h} L${x + w * 0.6},${y + h * 0.75} L${x},${y + h * 0.75} Z"`;
    case "hexagon": {
      const inset = w * 0.25;
      return `<path d="M${x + inset},${y} L${x + w - inset},${y} L${x + w},${y + h / 2} L${x + w - inset},${y + h} L${x + inset},${y + h} L${x},${y + h / 2} Z"`;
    }
    default: return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${r ? ` rx="${r}"` : ""}`;
  }
}

export interface SvgOptions {
  text: TextEngine;
  /** Draw element outlines for findings (issue crops). */
  highlight?: string[];
}

export class SvgRenderer {
  private gradients = 0;
  private readonly imageCache = new Map<string, string>();

  public constructor(private readonly options: SvgOptions) {}

  public slide(slide: SceneSlide, scene: SceneGraph, viewBox?: { x: number; y: number; w: number; h: number }): string {
    const width = scene.size.width * PPI;
    const height = scene.size.height * PPI;
    const defs: string[] = [];
    const body = [...slide.elements].sort((left, right) => left.z - right.z).map((element) => this.element(element, defs, slide.background.hex)).join("");
    const highlights = (this.options.highlight ?? []).map((id) => slide.elements.find((element) => element.id === id)).filter((element): element is SceneElement => Boolean(element))
      .map((element) => `<rect x="${element.frame.x * PPI - 2}" y="${element.frame.y * PPI - 2}" width="${element.frame.w * PPI + 4}" height="${element.frame.h * PPI + 4}" fill="none" stroke="#E5007E" stroke-width="2" stroke-dasharray="6 3"/>`).join("");
    const box = viewBox ? `${viewBox.x * PPI} ${viewBox.y * PPI} ${viewBox.w * PPI} ${viewBox.h * PPI}` : `0 0 ${width} ${height}`;
    const size = viewBox ? `width="${viewBox.w * PPI}" height="${viewBox.h * PPI}"` : `width="${width}" height="${height}"`;
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${size} viewBox="${box}"><defs>${defs.join("")}</defs><rect x="0" y="0" width="${width}" height="${height}" fill="#${slide.background.hex}"/>${body}${highlights}</svg>`;
  }

  private element(element: SceneElement, defs: string[], groundHex: string): string {
    const x = element.frame.x * PPI;
    const y = element.frame.y * PPI;
    const w = element.frame.w * PPI;
    const h = element.frame.h * PPI;
    const rotate = element.rotate ? ` transform="rotate(${element.rotate} ${x + w / 2} ${y + h / 2})"` : "";
    switch (element.kind) {
      case "text":
        return `<g data-id="${esc(element.id)}"${rotate}>${this.text(element.paragraphs, element.style, element.frame)}</g>`;
      case "shape": {
        const shape = this.shape(element.style, x, y, w, h, defs);
        const label = element.text ? this.text(element.text.paragraphs, element.text.style, element.frame) : "";
        return `<g data-id="${esc(element.id)}"${rotate}>${shape}${label}</g>`;
      }
      case "connector": {
        const points = element.points.map((point) => `${(point.x * PPI).toFixed(1)},${(point.y * PPI).toFixed(1)}`).join(" ");
        const stroke = element.style.stroke?.hex ?? "808080";
        let marker = "";
        if (element.style.arrowEnd && element.points.length >= 2) {
          const end = element.points.at(-1)!;
          const before = element.points.at(-2)!;
          const angle = Math.atan2(end.y - before.y, end.x - before.x);
          const size = 7;
          const ex = end.x * PPI;
          const ey = end.y * PPI;
          marker = `<path d="M${ex},${ey} L${ex - size * Math.cos(angle - 0.45)},${ey - size * Math.sin(angle - 0.45)} L${ex - size * Math.cos(angle + 0.45)},${ey - size * Math.sin(angle + 0.45)} Z" fill="#${stroke}"/>`;
        }
        return `<g data-id="${esc(element.id)}"><polyline points="${points}" fill="none" stroke="#${stroke}" stroke-width="${element.style.strokeWidth ?? 1}" stroke-linejoin="round" stroke-linecap="round"/>${marker}</g>`;
      }
      case "image":
        return this.image(element, x, y, w, h, defs);
      case "icon": {
        const scale = Math.min(w, h) / 24;
        const paths = element.paths.map((entry) => `<path d="${esc(entry.d)}" fill="${entry.fill ? `#${element.color.hex}` : "none"}" stroke="#${element.color.hex}" stroke-width="${element.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
        return `<g data-id="${esc(element.id)}" transform="translate(${x} ${y}) scale(${scale})">${paths}</g>`;
      }
      case "chart":
        return chartSvg(element, groundHex);
      case "table":
        return this.table(element);
      default:
        return "";
    }
  }

  private shape(style: ShapeStyle, x: number, y: number, w: number, h: number, defs: string[]): string {
    let paint = fill(style.fill, style.opacity);
    if (style.gradient) {
      this.gradients += 1;
      const id = `g${this.gradients}`;
      const angle = style.gradient.angle;
      const radians = (angle * Math.PI) / 180;
      defs.push(`<linearGradient id="${id}" x1="${0.5 - Math.cos(radians) / 2}" y1="${0.5 - Math.sin(radians) / 2}" x2="${0.5 + Math.cos(radians) / 2}" y2="${0.5 + Math.sin(radians) / 2}"><stop offset="0" stop-color="#${style.gradient.from.hex}"/><stop offset="1" stop-color="#${style.gradient.to.hex}" stop-opacity="${style.gradient.toAlpha ?? 1}"/></linearGradient>`);
      paint = `fill="url(#${id})"`;
    }
    const stroke = style.stroke ? ` stroke="#${style.stroke.hex}" stroke-width="${style.strokeWidth ?? 1}"` : "";
    if (style.path) {
      return `<g transform="translate(${x} ${y}) scale(${w} ${h})"><path d="${esc(style.path)}" ${paint}${stroke ? ` stroke="#${style.stroke!.hex}" stroke-width="${(style.strokeWidth ?? 1) / Math.max(1, Math.min(w, h))}"` : ""}/></g>`;
    }
    if (style.preset === "line") return `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}"${stroke || ` stroke="#${style.fill?.hex ?? "808080"}"`}/>`;
    return `${presetPath(style.preset, x, y, w, h, style.radius)} ${paint}${stroke}/>`;
  }

  private image(element: ImageElement, x: number, y: number, w: number, h: number, defs: string[]): string {
    let href = this.imageCache.get(element.asset);
    if (!href) {
      try {
        const bytes = readFileSync(element.asset);
        href = `data:${MIME[path.extname(element.asset).toLowerCase()] ?? "image/png"};base64,${bytes.toString("base64")}`;
      } catch {
        href = "";
      }
      this.imageCache.set(element.asset, href);
    }
    if (!href) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#DDDDDD"/>`;
    const crop = element.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const visibleW = 1 - crop.left - crop.right;
    const visibleH = 1 - crop.top - crop.bottom;
    const fullW = w / Math.max(0.01, visibleW);
    const fullH = h / Math.max(0.01, visibleH);
    this.gradients += 1;
    const clip = `c${this.gradients}`;
    const radius = element.radius ?? 0;
    defs.push(`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/></clipPath>`);
    let filter = "";
    if (element.treatment === "grayscale" || element.treatment === "duotone" || element.treatment === "tint") {
      const filterId = `f${this.gradients}`;
      const tintHex = element.tint?.hex ?? "000000";
      const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(tintHex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
      const matrix = element.treatment === "grayscale"
        ? "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"
        : `${0.2126 * r} ${0.7152 * r} ${0.0722 * r} 0 0 ${0.2126 * g} ${0.7152 * g} ${0.0722 * g} 0 0 ${0.2126 * b} ${0.7152 * b} ${0.0722 * b} 0 0 0 0 0 1 0`;
      defs.push(`<filter id="${filterId}"><feColorMatrix type="matrix" values="${matrix}"/></filter>`);
      filter = ` filter="url(#${filterId})"`;
    }
    return `<g data-id="${esc(element.id)}" clip-path="url(#${clip})"><image x="${x - crop.left * fullW}" y="${y - crop.top * fullH}" width="${fullW}" height="${fullH}" preserveAspectRatio="none" href="${href}"${filter}/></g>`;
  }

  private table(element: TableElement): string {
    const { style } = element;
    const parts: string[] = [];
    let top = element.frame.y;
    const rows = element.header ? [element.columns, ...element.rows] : element.rows;
    rows.forEach((row, rowIndex) => {
      const height = element.rowHeights[rowIndex] ?? 0.4;
      let left = element.frame.x;
      const header = element.header && rowIndex === 0;
      const dataRow = element.header ? rowIndex - 1 : rowIndex;
      if (header && style.headerFill) parts.push(`<rect x="${left * PPI}" y="${top * PPI}" width="${element.frame.w * PPI}" height="${height * PPI}" fill="#${style.headerFill.hex}"/>`);
      if (!header && element.highlight?.row === dataRow) parts.push(`<rect x="${left * PPI}" y="${top * PPI}" width="${element.frame.w * PPI}" height="${height * PPI}" fill="#${style.highlightFill.hex}"/>`);
      row.forEach((cell, columnIndex) => {
        const width = element.columnWidths[columnIndex] ?? 1;
        const cellStyle: TextStyle = { font: style.font, size: style.size, bold: header || element.highlight?.row === dataRow, italic: false, color: header ? style.headerText : style.text, align: style.align[columnIndex] ?? "left", valign: "middle", leading: 1.15, inset: [0.04, 0.08, 0.04, 0.08] };
        parts.push(this.text([{ runs: [{ text: cell }] }], cellStyle, { x: left, y: top, w: width, h: height }));
        left += width;
      });
      top += height;
      parts.push(`<line x1="${element.frame.x * PPI}" y1="${top * PPI}" x2="${(element.frame.x + element.frame.w) * PPI}" y2="${top * PPI}" stroke="#${style.rule.hex}" stroke-width="0.75"/>`);
    });
    return `<g data-id="${esc(element.id)}">${parts.join("")}</g>`;
  }

  private text(paragraphs: TextParagraph[], style: TextStyle, frame: { x: number; y: number; w: number; h: number }): string {
    const family = style.family ?? style.font;
    const weight = style.weight ?? (style.bold ? 700 : 400);
    const face = (bold: boolean, italic: boolean, mono: boolean) => mono
      ? this.options.text.face({ family: style.font, weight: 400, italic: false })
      : this.options.text.face({ family, weight: bold && !style.bold ? boldWeightFor(weight) : weight, italic });
    const rich: RichParagraph[] = paragraphs.map((paragraph) => ({
      runs: paragraph.runs.map((run) => ({ text: run.text, ...(run.bold ? { bold: true } : {}), ...(run.italic ? { italic: true } : {}), ...(run.mono ? { mono: true } : {}) })),
      level: paragraph.level ?? 0,
      ...(paragraph.bullet ? { bullet: paragraph.bullet } : {}),
    }));
    const [top, right, bottom, left] = style.inset;
    const width = frame.w - left - right;
    const layout = this.options.text.layout({
      paragraphs: rich,
      size: style.size,
      leading: style.leading,
      width,
      ...(style.tracking !== undefined ? { tracking: style.tracking } : {}),
      ...(style.case ? { textCase: style.case } : {}),
      paragraphSpacing: rich.length > 1 ? 0.35 : 0,
      faceFor: (run) => face(Boolean(run.bold), Boolean(run.italic), Boolean(run.mono)),
    });
    const available = frame.h - top - bottom;
    const offset = style.valign === "middle" ? (available - layout.height) / 2 : style.valign === "bottom" ? available - layout.height : 0;
    const lineHeight = layout.lineHeight * PPI;
    const regular = face(false, Boolean(style.italic), false);
    const ascent = Math.min(0.95, regular.ascent) * style.size;
    const baselineShift = (lineHeight - regular.lineHeight * style.size) / 2 + ascent;
    const output: string[] = [];
    let cursorY = (frame.y + top) * PPI + offset * PPI;
    let previousParagraph = -1;
    let number = 0;
    for (const line of layout.lines) {
      if (line.paragraph !== previousParagraph) {
        if (previousParagraph >= 0) cursorY += (rich.length > 1 ? 0.35 : 0) * style.size;
        previousParagraph = line.paragraph;
        if (paragraphs[line.paragraph]?.bullet === "number") number += 1;
      }
      const lineWidth = line.width * PPI;
      const boxX = (frame.x + left) * PPI + line.indent * PPI;
      const boxW = (width - line.indent) * PPI;
      const startX = style.align === "center" ? boxX + (boxW - lineWidth) / 2 : style.align === "right" ? boxX + boxW - lineWidth : boxX;
      const baseline = cursorY + baselineShift;
      if (line.bullet && line.first) {
        const marker = line.bullet === "number" ? `${number}.` : "•";
        output.push(`<text x="${(boxX - style.size * 1.1).toFixed(1)}" y="${baseline.toFixed(1)}" font-family="${esc(family)}" font-size="${style.size}" fill="#${style.color.hex}">${marker}</text>`);
      }
      let x = startX;
      const spans = line.segments.map((segment) => {
        const run = rich[line.paragraph]!.runs[segment.run]!;
        const runFace = face(Boolean(run.bold), Boolean(run.italic), Boolean(run.mono));
        const span = `<tspan x="${x.toFixed(1)}" font-family="'${esc(runFace.requested.family)}', '${esc(runFace.typeface)}', sans-serif" font-weight="${runFace.requested.weight}" font-style="${run.italic || style.italic ? "italic" : "normal"}"${style.tracking ? ` letter-spacing="${(style.tracking * style.size).toFixed(2)}"` : ""}>${esc(applyCase(segment.text, style.case))}</tspan>`;
        x += segment.width * PPI;
        return span;
      }).join("");
      output.push(`<text y="${baseline.toFixed(1)}" font-size="${style.size}" fill="#${style.color.hex}"${style.color.alpha !== undefined ? ` fill-opacity="${style.color.alpha}"` : ""} xml:space="preserve">${spans}</text>`);
      cursorY += lineHeight;
    }
    return output.join("");
  }
}

/** The whole deck's slides as SVG strings. */
export function sceneToSvgs(scene: SceneGraph, text: TextEngine): string[] {
  const renderer = new SvgRenderer({ text });
  return scene.slides.map((slide) => renderer.slide(slide, scene));
}

export function textOfElement(element: TextElement): string {
  return element.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n");
}
