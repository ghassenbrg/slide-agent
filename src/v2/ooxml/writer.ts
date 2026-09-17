import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

import { checkLink } from "../../utils/links.js";
import { buildTimestamp } from "../../utils/reproducible.js";
import type {
  ChartElement,
  ColorRef,
  ConnectorElement,
  IconElement,
  ImageElement,
  SceneElement,
  SceneGraph,
  SceneSlide,
  ShapeElement,
  ShapeStyle,
  TableElement,
  TextElement,
  TextParagraph,
  TextStyle,
} from "../ir/scene.js";
import type { ThemeSpec, ThemeSlot } from "../tokens/compile.js";
import { writeChart } from "./chart.js";
import { pathsToCustGeom } from "./custgeom.js";
import { subsetTrueType, toEot } from "./fonts.js";
import { EMU_PER_POINT, NS, REL, Relationships, XML_HEADER, attrs, emu, esc } from "./xml.js";

/**
 * SceneGraph → a native PowerPoint package.
 *
 * Titles are real title placeholders; colours are theme references wherever
 * the design language's roles map onto theme slots; display and body faces are
 * the theme's major and minor fonts; the faces the model chose are embedded;
 * decorative shapes carry the decorative flag; shape order is reading order.
 * Output is deterministic: stable part names, entry order, ids, and timestamps.
 */

export const WRITER_VERSION = "2.0.0";

export interface WriteOptions {
  theme: ThemeSpec;
  embedFonts: boolean;
}

export interface WriteResult {
  bytes: Buffer;
  parts: number;
  embeddedFonts: Array<{ typeface: string; style: string; bytes: number }>;
  rejectedLinks: string[];
  colorReferences: { theme: number; literal: number };
}

interface SlideContext {
  rels: Relationships;
  nextId: number;
  media: Map<string, string>;
  zip: JSZip;
  charts: { count: number };
  rejectedLinks: string[];
  colors: { theme: number; literal: number };
  theme: ThemeSpec;
  usedCharacters: Map<string, Set<number>>;
}

const MEDIA_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

function slotAlias(slot: string, theme: ThemeSpec): string {
  for (const [alias, target] of Object.entries(theme.clrMap)) if (target === slot) return alias;
  return slot;
}

function color(ref: ColorRef, context: Pick<SlideContext, "colors" | "theme">, alpha?: number): string {
  const modifiers = `${ref.lumMod !== undefined ? `<a:lumMod val="${Math.round(ref.lumMod * 100000)}"/>` : ""}${ref.lumOff !== undefined ? `<a:lumOff val="${Math.round(ref.lumOff * 100000)}"/>` : ""}${alpha !== undefined && alpha < 1 ? `<a:alpha val="${Math.round(Math.max(0, alpha) * 100000)}"/>` : ""}`;
  if (ref.slot) {
    context.colors.theme += 1;
    return `<a:schemeClr val="${slotAlias(ref.slot, context.theme)}">${modifiers}</a:schemeClr>`;
  }
  context.colors.literal += 1;
  return `<a:srgbClr val="${ref.hex}">${modifiers}</a:srgbClr>`;
}

function solidFill(ref: ColorRef | undefined, context: Pick<SlideContext, "colors" | "theme">, alpha?: number): string {
  return ref ? `<a:solidFill>${color(ref, context, alpha)}</a:solidFill>` : "<a:noFill/>";
}

function xfrm(element: SceneElement, flip?: { h?: boolean; v?: boolean }): string {
  const { x, y, w, h } = element.frame;
  return `<a:xfrm${attrs({ rot: element.rotate ? Math.round(element.rotate * 60000) : undefined, flipH: flip?.h, flipV: flip?.v })}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${Math.max(0, emu(w))}" cy="${Math.max(0, emu(h))}"/></a:xfrm>`;
}

function cNvPr(id: number, element: SceneElement, context: SlideContext, extra = ""): string {
  const name = element.id.split("/").slice(1).join("/") || element.id;
  const descr = element.alt ?? "";
  const decorative = element.decorative
    ? `<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="${NS.adec}" val="1"/></a:ext></a:extLst>`
    : "";
  void context;
  return `<p:cNvPr id="${id}" name="${esc(name)}"${descr ? ` descr="${esc(descr)}"` : ""}>${extra}${decorative}</p:cNvPr>`;
}

function geometry(style: ShapeStyle, frame: { w: number; h: number }): string {
  if (style.path) return pathsToCustGeom([{ d: style.path, fill: true, stroke: true }], { w: 1, h: 1 });
  const preset = style.preset === "custom" ? "rect" : style.preset;
  if (preset === "roundRect" && style.radius) {
    const shorter = Math.max(0.001, Math.min(frame.w, frame.h) * 72);
    const adjust = Math.max(0, Math.min(50000, Math.round((style.radius / shorter) * 100000)));
    return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjust}"/></a:avLst></a:prstGeom>`;
  }
  return `<a:prstGeom prst="${esc(preset)}"><a:avLst/></a:prstGeom>`;
}

function effects(style: ShapeStyle): string {
  if (!style.shadow || style.shadow === "none") return "";
  const soft = style.shadow === "soft";
  return `<a:effectLst><a:outerShdw blurRad="${soft ? 152400 : 12700}" dist="${soft ? 38100 : 25400}" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="${soft ? 16000 : 30000}"/></a:srgbClr></a:outerShdw></a:effectLst>`;
}

function shapeProperties(style: ShapeStyle, element: SceneElement, context: SlideContext): string {
  let fill: string;
  if (style.gradient) {
    const { from, to, angle, toAlpha } = style.gradient;
    fill = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${color(from, context)}</a:gs><a:gs pos="100000">${color(to, context, toAlpha)}</a:gs></a:gsLst><a:lin ang="${Math.round(angle * 60000)}" scaled="0"/></a:gradFill>`;
  } else {
    fill = solidFill(style.fill, context, style.opacity);
  }
  const line = style.stroke
    ? `<a:ln w="${Math.round((style.strokeWidth ?? 1) * EMU_PER_POINT)}">${solidFill(style.stroke, context)}${style.dash && style.dash !== "solid" ? `<a:prstDash val="${style.dash === "dot" ? "sysDot" : "dash"}"/>` : ""}</a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  return `<p:spPr>${xfrm(element)}${geometry(style, element.frame)}${fill}${line}${effects(style)}</p:spPr>`;
}

function track(context: SlideContext, font: string, text: string): void {
  let set = context.usedCharacters.get(font);
  if (!set) {
    set = new Set();
    context.usedCharacters.set(font, set);
  }
  for (const character of text) set.add(character.codePointAt(0)!);
}

function fontReference(style: TextStyle, theme: ThemeSpec): string {
  if (style.fontRole === "display" && style.font === theme.fonts.display.regular.typeface) return "+mj-lt";
  if (style.fontRole === "body" && style.font === theme.fonts.body.regular.typeface) return "+mn-lt";
  return style.font;
}

function runProperties(style: TextStyle, run: { bold?: boolean; italic?: boolean; mono?: boolean; font?: string; link?: string; color?: ColorRef }, context: SlideContext, language: string, linkId?: string): string {
  const typeface = run.mono ? (run.font ?? context.theme.fonts.mono.regular.typeface) : fontReference(style, context.theme);
  const bold = run.bold ? true : style.bold;
  const tracking = style.tracking ? Math.round(style.tracking * style.size * 100) : undefined;
  const cap = style.case === "upper" ? "all" : style.case === "small-caps" ? "small" : undefined;
  return `<a:rPr${attrs({ lang: language, sz: Math.round(style.size * 100), b: bold ? 1 : 0, i: run.italic || style.italic ? 1 : 0, spc: tracking, cap, dirty: 0 })}>${solidFill(run.color ?? style.color, context)}<a:latin typeface="${esc(typeface)}"/><a:ea typeface="${esc(typeface)}"/><a:cs typeface="${esc(typeface)}"/>${linkId ? `<a:hlinkClick r:id="${linkId}"/>` : ""}</a:rPr>`;
}

function paragraphsXml(paragraphs: TextParagraph[], style: TextStyle, context: SlideContext, language: string): string {
  const align = style.align === "center" ? "ctr" : style.align === "right" ? "r" : style.align === "justify" ? "just" : "l";
  const spacing = `<a:lnSpc><a:spcPts val="${Math.round(style.size * style.leading * 100)}"/></a:lnSpc>`;
  return paragraphs.map((paragraph, index) => {
    const level = paragraph.level ?? 0;
    const indent = paragraph.bullet ? Math.round((style.size * 1.1 * (1 + level) / 72) * 914400) : 0;
    const bullet = paragraph.bullet === "bullet"
      ? `<a:buFontTx/><a:buChar char="•"/>`
      : paragraph.bullet === "number" ? `<a:buFontTx/><a:buAutoNum type="arabicPeriod"/>` : "<a:buNone/>";
    const before = index > 0 && paragraphs.length > 1 ? `<a:spcBef><a:spcPts val="${Math.round(style.size * 0.35 * 100)}"/></a:spcBef>` : "<a:spcBef><a:spcPts val=\"0\"/></a:spcBef>";
    const pPr = `<a:pPr${attrs({ algn: align, marL: indent || undefined, indent: indent ? -Math.round(indent * 0.9 / (1 + level)) : undefined, lvl: level || undefined })}>${spacing}${before}${bullet}</a:pPr>`;
    const runs = paragraph.runs.filter((run) => run.text.length > 0).map((run) => {
      let linkId: string | undefined;
      if (run.link) {
        const checked = checkLink(run.link);
        if (checked.link?.url) linkId = context.rels.add(REL.hyperlink, checked.link.url, true);
        else context.rejectedLinks.push(`${run.link}: ${checked.rejected ?? "not an external URL"}`);
      }
      track(context, run.mono ? context.theme.fonts.mono.regular.typeface : style.font, run.text);
      return `<a:r>${runProperties(style, run, context, language, linkId)}<a:t>${esc(run.text)}</a:t></a:r>`;
    }).join("");
    return `<a:p>${pPr}${runs}<a:endParaRPr${attrs({ lang: language, sz: Math.round(style.size * 100), dirty: 0 })}/></a:p>`;
  }).join("");
}

function bodyProperties(style: TextStyle, wrap = true): string {
  const anchor = style.valign === "middle" ? "ctr" : style.valign === "bottom" ? "b" : "t";
  const [top, right, bottom, left] = style.inset.map((inches) => emu(inches));
  return `<a:bodyPr${attrs({ wrap: wrap ? "square" : "none", lIns: left, tIns: top, rIns: right, bIns: bottom, anchor, rtlCol: 0 })}><a:noAutofit/></a:bodyPr>`;
}

function textShape(element: TextElement, id: number, context: SlideContext, language: string): string {
  const placeholder = element.placeholder
    ? `<p:nvPr><p:ph${attrs({ type: element.placeholder.type === "body" ? undefined : element.placeholder.type, idx: element.placeholder.idx })}/></p:nvPr>`
    : "<p:nvPr/>";
  const spPr = element.shape
    ? shapeProperties(element.shape, element, context)
    : `<p:spPr>${xfrm(element)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>`;
  return `<p:sp><p:nvSpPr>${cNvPr(id, element, context)}<p:cNvSpPr${element.placeholder ? '><a:spLocks noGrp="1"/></p:cNvSpPr>' : ' txBox="1"/>'}${placeholder}</p:nvSpPr>${spPr}<p:txBody>${bodyProperties(element.style)}<a:lstStyle/>${paragraphsXml(element.paragraphs, element.style, context, language)}</p:txBody></p:sp>`;
}

function shape(element: ShapeElement, id: number, context: SlideContext, language: string): string {
  const text = element.text
    ? `<p:txBody>${bodyProperties(element.text.style)}<a:lstStyle/>${paragraphsXml(element.text.paragraphs, element.text.style, context, language)}</p:txBody>`
    : "";
  return `<p:sp><p:nvSpPr>${cNvPr(id, element, context)}<p:cNvSpPr/><p:nvPr/></p:nvSpPr>${shapeProperties(element.style, element, context)}${text}</p:sp>`;
}

function connector(element: ConnectorElement, id: number, context: SlideContext): string {
  const points = element.points;
  const stroke = element.style.stroke ?? { hex: "808080" };
  const line = `<a:ln w="${Math.round((element.style.strokeWidth ?? 1) * EMU_PER_POINT)}" cap="rnd">${solidFill(stroke, context)}<a:round/>${element.style.arrowEnd ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ""}</a:ln>`;
  if (points.length === 2) {
    const [a, b] = points as [{ x: number; y: number }, { x: number; y: number }];
    const frame = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    const temp = { ...element, frame };
    return `<p:cxnSp><p:nvCxnSpPr>${cNvPr(id, element, context)}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(temp, { h: b.x < a.x, v: b.y < a.y })}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${line}</p:spPr></p:cxnSp>`;
  }
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const w = Math.max(0.001, Math.max(...points.map((point) => point.x)) - minX);
  const h = Math.max(0.001, Math.max(...points.map((point) => point.y)) - minY);
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x - minX} ${point.y - minY}`).join(" ");
  const temp = { ...element, frame: { x: minX, y: minY, w, h } };
  return `<p:sp><p:nvSpPr>${cNvPr(id, element, context)}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(temp)}${pathsToCustGeom([{ d, fill: false, stroke: true }], { w, h })}<a:noFill/>${line}</p:spPr></p:sp>`;
}

async function picture(element: ImageElement, id: number, context: SlideContext): Promise<string> {
  const bytes = await readFile(element.asset);
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 20);
  const extension = path.extname(element.asset).toLowerCase() === ".jpeg" ? ".jpg" : path.extname(element.asset).toLowerCase();
  let target = context.media.get(digest);
  if (!target) {
    target = `media/image-${digest}${extension}`;
    context.media.set(digest, target);
    context.zip.file(`ppt/${target}`, bytes, { date: buildTimestamp() });
  }
  const relId = context.rels.add(REL.image, `../${target}`);
  const crop = element.crop;
  const source = crop ? `<a:srcRect${attrs({ l: Math.round(crop.left * 100000) || undefined, t: Math.round(crop.top * 100000) || undefined, r: Math.round(crop.right * 100000) || undefined, b: Math.round(crop.bottom * 100000) || undefined })}/>` : "";
  const treatment = element.treatment === "grayscale"
    ? "<a:grayscl/>"
    : (element.treatment === "duotone" || element.treatment === "tint") && element.tint
      ? `<a:duotone><a:srgbClr val="000000"/><a:srgbClr val="${element.tint.hex}"/></a:duotone>`
      : "";
  const geometryXml = element.radius
    ? geometry({ preset: "roundRect", radius: element.radius }, element.frame)
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return `<p:pic><p:nvPicPr>${cNvPr(id, element, context)}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}">${treatment}</a:blip>${source}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(element)}${geometryXml}</p:spPr></p:pic>`;
}

function icon(element: IconElement, id: number, context: SlideContext): string {
  const size = Math.min(element.frame.w, element.frame.h);
  const strokePt = (element.strokeWidth / 24) * size * 72;
  const line = `<a:ln w="${Math.round(strokePt * EMU_PER_POINT)}" cap="rnd">${solidFill(element.color, context)}<a:round/></a:ln>`;
  const geometryXml = pathsToCustGeom(element.paths.map((entry) => ({ d: entry.d, fill: entry.fill, stroke: true })), { w: 24, h: 24 });
  return `<p:sp><p:nvSpPr>${cNvPr(id, element, context)}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(element)}${geometryXml}<a:noFill/>${line}</p:spPr></p:sp>`;
}

function table(element: TableElement, id: number, context: SlideContext, language: string): string {
  const { style } = element;
  const border = (side: string, visible: boolean) => visible
    ? `<a:${side} w="${Math.round(0.75 * EMU_PER_POINT)}">${solidFill(style.rule, context)}</a:${side}>`
    : `<a:${side} w="0"><a:noFill/></a:${side}>`;
  const rows = element.header ? [element.columns, ...element.rows] : element.rows;
  const cellStyle = (header: boolean, highlighted: boolean): TextStyle => ({
    font: style.font, fontRole: "body", size: style.size, bold: header || highlighted, italic: false,
    color: header ? style.headerText : style.text, align: "left", valign: "middle", leading: 1.15, inset: [0.04, 0.08, 0.04, 0.08],
  });
  const rowsXml = rows.map((row, rowIndex) => {
    const header = element.header && rowIndex === 0;
    const dataRow = element.header ? rowIndex - 1 : rowIndex;
    const highlighted = !header && element.highlight?.row === dataRow;
    const cells = row.map((cell, columnIndex) => {
      const cellText = cellStyle(header, highlighted);
      cellText.align = style.align[columnIndex] ?? "left";
      const fill = header && style.headerFill ? solidFill(style.headerFill, context) : highlighted || element.highlight?.column === columnIndex ? solidFill(style.highlightFill, context) : "<a:noFill/>";
      const lastRow = rowIndex === rows.length - 1;
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paragraphsXml([{ runs: [{ text: cell }] }], cellText, context, language)}</a:txBody><a:tcPr marL="${emu(0.08)}" marR="${emu(0.08)}" marT="${emu(0.04)}" marB="${emu(0.04)}" anchor="ctr">${border("lnL", false)}${border("lnR", false)}${border("lnT", header)}${border("lnB", header || !lastRow || true)}${fill}</a:tcPr></a:tc>`;
    }).join("");
    return `<a:tr h="${emu(element.rowHeights[rowIndex] ?? 0.4)}">${cells}</a:tr>`;
  }).join("");
  const grid = element.columnWidths.map((width) => `<a:gridCol w="${emu(width)}"/>`).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr(id, element, context)}<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(element.frame.x)}" y="${emu(element.frame.y)}"/><a:ext cx="${emu(element.frame.w)}" cy="${emu(element.frame.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${element.header ? ' firstRow="1"' : ""}/><a:tblGrid>${grid}</a:tblGrid>${rowsXml}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

async function chart(element: ChartElement, id: number, context: SlideContext): Promise<string> {
  context.charts.count += 1;
  const number = context.charts.count;
  const part = await writeChart(element);
  const date = buildTimestamp();
  context.zip.file(`ppt/charts/chart${number}.xml`, part.xml, { date });
  context.zip.file(`ppt/embeddings/Microsoft_Excel_Worksheet${number}.xlsx`, part.workbook, { date });
  const rels = new Relationships();
  rels.add(REL.package, `../embeddings/Microsoft_Excel_Worksheet${number}.xlsx`);
  context.zip.file(`ppt/charts/_rels/chart${number}.xml.rels`, rels.xml(), { date });
  const relId = context.rels.add(REL.chart, `../charts/chart${number}.xml`);
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr(id, element, context)}<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(element.frame.x)}" y="${emu(element.frame.y)}"/><a:ext cx="${emu(element.frame.w)}" cy="${emu(element.frame.h)}"/></p:xfrm><a:graphic><a:graphicData uri="${NS.c}"><c:chart xmlns:c="${NS.c}" r:id="${relId}"/></a:graphicData></a:graphic></p:graphicFrame>`;
}

/** Shapes in reading order; decorative and container shapes keep their paint order behind content. */
function orderedElements(slide: SceneSlide): SceneElement[] {
  return [...slide.elements].sort((left, right) => left.z - right.z);
}

async function slideXml(slide: SceneSlide, scene: SceneGraph, context: SlideContext): Promise<string> {
  const parts: string[] = [];
  let id = 2;
  for (const element of orderedElements(slide)) {
    if (element.kind === "group") continue;
    switch (element.kind) {
      case "text": parts.push(textShape(element, id, context, scene.language)); break;
      case "shape": parts.push(shape(element, id, context, scene.language)); break;
      case "connector": parts.push(connector(element, id, context)); break;
      case "image": parts.push(await picture(element, id, context)); break;
      case "icon": parts.push(icon(element, id, context)); break;
      case "table": parts.push(table(element, id, context, scene.language)); break;
      case "chart": parts.push(await chart(element, id, context)); break;
    }
    id += 1;
  }
  const background = `<p:bg><p:bgPr>${solidFill(slide.background, context)}<a:effectLst/></p:bgPr></p:bg>`;
  return `${XML_HEADER}<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"${slide.hidden ? ' show="0"' : ""}><p:cSld name="${esc(slide.id)}">${background}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${parts.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

// ----------------------------------------------------------------- package parts

function themeXml(theme: ThemeSpec, name: string): string {
  const slot = (key: ThemeSlot) => {
    const hex = theme.slots[key];
    return key === "dk1" || key === "lt1" ? `<a:${key}><a:srgbClr val="${hex}"/></a:${key}>` : `<a:${key}><a:srgbClr val="${hex}"/></a:${key}>`;
  };
  const colors = (["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as ThemeSlot[]).map(slot).join("");
  const custom = Object.entries(theme.custom).map(([colorName, hex]) => `<a:custClr name="${esc(colorName)}"><a:srgbClr val="${hex}"/></a:custClr>`).join("");
  const major = theme.fonts.display.regular.typeface;
  const minor = theme.fonts.body.regular.typeface;
  const line = (width: number) => `<a:ln w="${width}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return `${XML_HEADER}<a:theme xmlns:a="${NS.a}" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(name)}">${colors}</a:clrScheme><a:fontScheme name="${esc(name)}"><a:majorFont><a:latin typeface="${esc(major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="${esc(name)}"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="60000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill></a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/>${custom ? `<a:custClrLst>${custom}</a:custClrLst>` : ""}</a:theme>`;
}

function levelStyles(size: number, color: string, font: string, bullets: boolean): string {
  return Array.from({ length: 9 }, (_, level) => `<a:lvl${level + 1}pPr marL="${bullets ? 228600 * (level + 1) : 0}" indent="${bullets ? -228600 : 0}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef>${bullets ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : "<a:buNone/>"}<a:defRPr sz="${Math.round(size * 100)}" kern="1200"><a:solidFill><a:schemeClr val="${color}"/></a:solidFill><a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/></a:defRPr></a:lvl${level + 1}pPr>`).join("");
}

function placeholderShape(id: number, name: string, type: string | undefined, idx: number | undefined, frame: { x: number; y: number; w: number; h: number }, body = ""): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${attrs({ type, idx })}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(frame.x)}" y="${emu(frame.y)}"/><a:ext cx="${emu(frame.w)}" cy="${emu(frame.h)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${body || '<a:p><a:endParaRPr lang="en-US"/></a:p>'}</p:txBody></p:sp>`;
}

function masterXml(scene: SceneGraph, theme: ThemeSpec): string {
  const { width, height } = scene.size;
  const margin = theme.space.margin;
  const titleFrame = { x: margin, y: margin, w: width - margin * 2, h: 1.1 };
  const bodyFrame = { x: margin, y: margin + 1.3, w: width - margin * 2, h: height - margin * 2 - 1.3 };
  const chromeHeight = 0.3;
  const chromeY = height - margin / 2 - chromeHeight / 2;
  const clr = theme.clrMap;
  const shapes = [
    placeholderShape(2, "Title Placeholder", "title", undefined, titleFrame),
    placeholderShape(3, "Text Placeholder", "body", 1, bodyFrame),
    placeholderShape(4, "Footer Placeholder", "ftr", 11, { x: margin, y: chromeY, w: (width - margin * 2) * 0.6, h: chromeHeight }),
    placeholderShape(5, "Slide Number Placeholder", "sldNum", 12, { x: width - margin - 0.8, y: chromeY, w: 0.8, h: chromeHeight }, '<a:p><a:pPr algn="r"/><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>'),
  ].join("");
  return `${XML_HEADER}<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMap bg1="${clr.bg1}" tx1="${clr.tx1}" bg2="${clr.bg2}" tx2="${clr.tx2}" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${levelStyles(theme.sizes.title, "tx1", "+mj-lt", false)}</p:titleStyle><p:bodyStyle>${levelStyles(theme.sizes.body, "tx1", "+mn-lt", true)}</p:bodyStyle><p:otherStyle>${levelStyles(theme.sizes.body, "tx1", "+mn-lt", false)}</p:otherStyle></p:txStyles></p:sldMaster>`;
}

function layoutXml(type: "titleOnly" | "blank", name: string, scene: SceneGraph, theme: ThemeSpec): string {
  const margin = theme.space.margin;
  const title = type === "titleOnly" ? placeholderShape(2, "Title 1", "title", undefined, { x: margin, y: margin, w: scene.size.width - margin * 2, h: 1.1 }) : "";
  return `${XML_HEADER}<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" type="${type}" preserve="1"><p:cSld name="${esc(name)}"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${title}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function notesMasterXml(): string {
  return `${XML_HEADER}<p:notesMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${placeholderShape(2, "Slide Image Placeholder", "sldImg", 2, { x: 1.14, y: 0.75, w: 5.22, h: 2.94 })}${placeholderShape(3, "Notes Placeholder", "body", 3, { x: 0.75, y: 4.0, w: 6.0, h: 4.7 })}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle>${levelStyles(12, "tx1", "+mn-lt", false)}</p:notesStyle></p:notesMaster>`;
}

function notesSlideXml(text: string, language: string): string {
  const paragraphs = text.split(/\r?\n/).map((line) => `<a:p><a:r><a:rPr lang="${language}" dirty="0"/><a:t>${esc(line)}</a:t></a:r></a:p>`).join("");
  return `${XML_HEADER}<p:notes xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

export async function writePackage(scene: SceneGraph, options: WriteOptions): Promise<WriteResult> {
  const { theme } = options;
  const zip = new JSZip();
  const date = buildTimestamp();
  const media = new Map<string, string>();
  const charts = { count: 0 };
  const rejectedLinks: string[] = [];
  const colors = { theme: 0, literal: 0 };
  const usedCharacters = new Map<string, Set<number>>();
  const contentOverrides: Array<[string, string]> = [];
  const defaults = new Map<string, string>([["rels", "application/vnd.openxmlformats-package.relationships+xml"], ["xml", "application/xml"]]);

  const presentationRels = new Relationships();
  presentationRels.add(REL.slideMaster, "slideMasters/slideMaster1.xml");
  const hasNotes = scene.slides.some((slide) => slide.notes);

  const slideEntries: Array<{ id: number; rel: string }> = [];
  for (const [index, slide] of scene.slides.entries()) {
    const number = index + 1;
    const rels = new Relationships();
    rels.add(REL.slideLayout, `../slideLayouts/slideLayout${slide.layout === "title-only" ? 1 : 2}.xml`);
    const context: SlideContext = { rels, nextId: 2, media, zip, charts, rejectedLinks, colors, theme, usedCharacters };
    const xml = await slideXml(slide, scene, context);
    if (slide.notes) {
      rels.add(REL.notesSlide, `../notesSlides/notesSlide${number}.xml`);
      const notesRels = new Relationships();
      notesRels.add(REL.notesMaster, "../notesMasters/notesMaster1.xml");
      notesRels.add(REL.slide, `../slides/slide${number}.xml`);
      zip.file(`ppt/notesSlides/notesSlide${number}.xml`, notesSlideXml(slide.notes, scene.language), { date });
      zip.file(`ppt/notesSlides/_rels/notesSlide${number}.xml.rels`, notesRels.xml(), { date });
      contentOverrides.push([`/ppt/notesSlides/notesSlide${number}.xml`, "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"]);
    }
    zip.file(`ppt/slides/slide${number}.xml`, xml, { date });
    zip.file(`ppt/slides/_rels/slide${number}.xml.rels`, rels.xml(), { date });
    contentOverrides.push([`/ppt/slides/slide${number}.xml`, "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"]);
    slideEntries.push({ id: 256 + index, rel: presentationRels.add(REL.slide, `slides/slide${number}.xml`) });
  }
  for (let chartNumber = 1; chartNumber <= charts.count; chartNumber += 1) {
    contentOverrides.push([`/ppt/charts/chart${chartNumber}.xml`, "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"]);
  }
  if (charts.count > 0) defaults.set("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  for (const target of media.values()) {
    const extension = path.extname(target);
    defaults.set(extension.slice(1), MEDIA_TYPES[extension] ?? "application/octet-stream");
  }

  let notesMasterRel: string | undefined;
  if (hasNotes) {
    notesMasterRel = presentationRels.add(REL.notesMaster, "notesMasters/notesMaster1.xml");
    const notesMasterRels = new Relationships();
    notesMasterRels.add(REL.theme, "../theme/theme2.xml");
    zip.file("ppt/notesMasters/notesMaster1.xml", notesMasterXml(), { date });
    zip.file("ppt/notesMasters/_rels/notesMaster1.xml.rels", notesMasterRels.xml(), { date });
    zip.file("ppt/theme/theme2.xml", themeXml(theme, "Notes"), { date });
    contentOverrides.push(["/ppt/notesMasters/notesMaster1.xml", "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"]);
    contentOverrides.push(["/ppt/theme/theme2.xml", "application/vnd.openxmlformats-officedocument.theme+xml"]);
  }

  presentationRels.add(REL.theme, "theme/theme1.xml");
  presentationRels.add(REL.presProps, "presProps.xml");
  presentationRels.add(REL.viewProps, "viewProps.xml");
  presentationRels.add(REL.tableStyles, "tableStyles.xml");

  // Embedded fonts: every theme face with a file, embeddable, and not supplied by Office.
  const embeddedFonts: WriteResult["embeddedFonts"] = [];
  const embedEntries: string[] = [];
  if (options.embedFonts) {
    const byTypeface = new Map<string, Array<{ style: "regular" | "bold" | "italic" | "boldItalic"; file: string; faceIndex: number }>>();
    for (const role of ["display", "body", "mono"] as const) {
      const font = theme.fonts[role];
      const sceneFont = scene.fonts.find((entry) => entry.role === role);
      if (!sceneFont?.embed) continue;
      for (const [styleName, face] of [["regular", font.regular], ["bold", font.bold], ["italic", font.italic], ["boldItalic", font.boldItalic]] as const) {
        if (face.source !== "font-file" || !face.file || !face.embeddable || face.office) continue;
        const style = face.bold && face.italic ? "boldItalic" : face.bold ? "bold" : face.italic ? "italic" : "regular";
        if (styleName !== "regular" && style === "regular" && face.typeface === font.regular.typeface && face.file === font.regular.file) continue;
        const list = byTypeface.get(face.typeface) ?? [];
        if (!list.some((entry) => entry.style === style)) list.push({ style, file: face.file, faceIndex: face.faceIndex ?? 0 });
        byTypeface.set(face.typeface, list);
      }
    }
    let fontNumber = 0;
    for (const [typeface, styles] of [...byTypeface.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const refs: string[] = [];
      for (const entry of styles.sort((left, right) => left.style.localeCompare(right.style))) {
        fontNumber += 1;
        const source = new Uint8Array(await readFile(entry.file));
        const used = usedCharacters.get(typeface) ?? new Set<number>();
        const data = toEot(subsetTrueType(source, used, entry.faceIndex));
        zip.file(`ppt/fonts/font${fontNumber}.fntdata`, data, { date });
        const relId = presentationRels.add(REL.font, `fonts/font${fontNumber}.fntdata`);
        refs.push(`<p:${entry.style} r:id="${relId}"/>`);
        embeddedFonts.push({ typeface, style: entry.style, bytes: data.length });
      }
      const order = ["regular", "bold", "italic", "boldItalic"];
      refs.sort((left, right) => order.indexOf(left.slice(3, left.indexOf(" "))) - order.indexOf(right.slice(3, right.indexOf(" "))));
      embedEntries.push(`<p:embeddedFont><p:font typeface="${esc(typeface)}"/>${refs.join("")}</p:embeddedFont>`);
    }
    if (fontNumber > 0) defaults.set("fntdata", "application/x-fontdata");
  }

  const cx = emu(scene.size.width);
  const cy = emu(scene.size.height);
  const presentation = `${XML_HEADER}<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" saveSubsetFonts="1"${embedEntries.length ? ' embedTrueTypeFonts="1"' : ""}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${notesMasterRel ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRel}"/></p:notesMasterIdLst>` : ""}<p:sldIdLst>${slideEntries.map((entry) => `<p:sldId id="${entry.id}" r:id="${entry.rel}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/>${embedEntries.length ? `<p:embeddedFontLst>${embedEntries.join("")}</p:embeddedFontLst>` : ""}<p:defaultTextStyle>${levelStyles(theme.sizes.body, "tx1", "+mn-lt", false)}</p:defaultTextStyle></p:presentation>`;

  const masterRels = new Relationships();
  masterRels.add(REL.slideLayout, "../slideLayouts/slideLayout1.xml");
  masterRels.add(REL.slideLayout, "../slideLayouts/slideLayout2.xml");
  masterRels.add(REL.theme, "../theme/theme1.xml");
  const layoutRels = new Relationships();
  layoutRels.add(REL.slideMaster, "../slideMasters/slideMaster1.xml");

  const rootRels = new Relationships();
  rootRels.add(REL.officeDocument, "ppt/presentation.xml");
  rootRels.add(REL.coreProperties, "docProps/core.xml");
  rootRels.add(REL.extendedProperties, "docProps/app.xml");

  const iso = date.toISOString().replace(/\.\d{3}Z$/, "Z");
  const core = `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(scene.title)}</dc:title>${scene.author ? `<dc:creator>${esc(scene.author)}</dc:creator>` : ""}<dc:language>${esc(scene.language)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
  const app = `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Slide Agent</Application><Slides>${scene.slides.length}</Slides><Notes>${scene.slides.filter((slide) => slide.notes).length}</Notes><HiddenSlides>${scene.slides.filter((slide) => slide.hidden).length}</HiddenSlides><AppVersion>${WRITER_VERSION.split(".").slice(0, 2).join(".")}</AppVersion></Properties>`;

  const fixed: Array<[string, string]> = [
    ["_rels/.rels", rootRels.xml()],
    ["docProps/core.xml", core],
    ["docProps/app.xml", app],
    ["ppt/presentation.xml", presentation],
    ["ppt/_rels/presentation.xml.rels", presentationRels.xml()],
    ["ppt/presProps.xml", `${XML_HEADER}<p:presentationPr xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"/>`],
    ["ppt/viewProps.xml", `${XML_HEADER}<p:viewPr xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`],
    ["ppt/tableStyles.xml", `${XML_HEADER}<a:tblStyleLst xmlns:a="${NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`],
    ["ppt/theme/theme1.xml", themeXml(theme, scene.title.slice(0, 60) || "Slide Agent")],
    ["ppt/slideMasters/slideMaster1.xml", masterXml(scene, theme)],
    ["ppt/slideMasters/_rels/slideMaster1.xml.rels", masterRels.xml()],
    ["ppt/slideLayouts/slideLayout1.xml", layoutXml("titleOnly", "Title Only", scene, theme)],
    ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", layoutRels.xml()],
    ["ppt/slideLayouts/slideLayout2.xml", layoutXml("blank", "Blank", scene, theme)],
    ["ppt/slideLayouts/_rels/slideLayout2.xml.rels", layoutRels.xml()],
  ];
  for (const [name, content] of fixed) zip.file(name, content, { date });
  contentOverrides.push(
    ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"],
    ["/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"],
    ["/ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"],
    ["/ppt/presProps.xml", "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"],
    ["/ppt/viewProps.xml", "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"],
    ["/ppt/tableStyles.xml", "application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"],
    ["/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
    ["/ppt/slideMasters/slideMaster1.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"],
    ["/ppt/slideLayouts/slideLayout1.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"],
    ["/ppt/slideLayouts/slideLayout2.xml", "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"],
  );
  const types = `${XML_HEADER}<Types xmlns="${NS.ct}">${[...defaults.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([extension, type]) => `<Default Extension="${extension}" ContentType="${type}"/>`).join("")}${contentOverrides.sort(([left], [right]) => left.localeCompare(right)).map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join("")}</Types>`;
  zip.file("[Content_Types].xml", types, { date });

  // Deterministic entry order: content types first, then everything by name.
  const ordered = new JSZip();
  const names = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir).sort((left, right) => left === "[Content_Types].xml" ? -1 : right === "[Content_Types].xml" ? 1 : left.localeCompare(right));
  for (const name of names) ordered.file(name, await zip.file(name)!.async("uint8array"), { date, createFolders: false });
  const bytes = await ordered.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 }, platform: "UNIX" });
  return { bytes, parts: names.length, embeddedFonts, rejectedLinks, colorReferences: colors };
}
