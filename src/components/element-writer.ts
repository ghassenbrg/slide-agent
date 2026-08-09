import path from "node:path";
import type { CanvasTextRun, ChartSpec, ElementRecord, ImageProvenance, SlideAgentConfig, TableSpec } from "../types/index.js";
import { emphasisField, foregroundOn } from "../utils/color.js";
import { checkLink, sanitizeNativeOptions, toNativeHyperlink, type DeckLink } from "../utils/links.js";
import { Shapes, type NativeSlide } from "./pptx-values.js";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rewrites a frame with negative extents as an equivalent positive-extent box. */
export function normalizeFrame(frame: Frame): Frame {
  return {
    x: frame.w < 0 ? frame.x + frame.w : frame.x,
    y: frame.h < 0 ? frame.y + frame.h : frame.y,
    w: Math.abs(frame.w),
    h: Math.abs(frame.h),
  };
}

export interface TextStyle {
  fontSize?: number;
  fontFace?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right" | "justify";
  valign?: "top" | "middle" | "bottom";
  margin?: number | [number, number, number, number];
  breakLine?: boolean;
  fit?: "none" | "shrink" | "resize";
  fill?: string;
  lineColor?: string;
  lineWidth?: number;
  radius?: number;
  transparency?: number;
  role?: string;
  intentionalOverlap?: boolean;
  rotate?: number;
  /** A URL, `{url}`, or `{slide}`. Checked against the scheme allowlist. */
  link?: unknown;
  options?: Record<string, unknown>;
}

export interface ShapeStyle {
  fill?: string;
  transparency?: number;
  lineColor?: string;
  lineWidth?: number;
  radius?: number;
  role?: string;
  intentionalOverlap?: boolean;
  rotate?: number;
  link?: unknown;
  options?: Record<string, unknown>;
}

export interface ImageStyle {
  fit?: "cover" | "contain" | "stretch";
  /** What the author wrote before the resolver turned it into a local file. */
  source?: string;
  provenance?: ImageProvenance;
  rotate?: number;
  transparency?: number;
  role?: string;
  intentionalOverlap?: boolean;
  link?: unknown;
  options?: Record<string, unknown>;
}

export class ElementWriter {
  private sequence = 0;

  /** Links refused by the scheme allowlist, surfaced as build warnings. */
  public readonly rejectedLinks: string[] = [];

  public constructor(
    public readonly slide: NativeSlide,
    public readonly records: ElementRecord[],
    private readonly config: SlideAgentConfig,
  ) {}

  /** A checked link, or nothing, recording any refusal for the caller. */
  private link(value: unknown): DeckLink | undefined {
    const { link, rejected } = checkLink(value);
    if (rejected) this.rejectedLinks.push(rejected);
    return link;
  }

  /** Passthrough options with any smuggled hyperlink checked or removed. */
  private native(options: Record<string, unknown> | undefined): Record<string, unknown> {
    return sanitizeNativeOptions(options, (reason) => this.rejectedLinks.push(reason)) ?? {};
  }

  public addText(name: string, text: string | CanvasTextRun[], rawFrame: Frame, style: TextStyle = {}): string {
    const id = this.nextId(name);
    const frame = normalizeFrame(rawFrame);
    const fontSize = style.fontSize ?? this.config.fonts.minimums.body;
    const fontFace = style.fontFace ?? this.config.fonts.body;
    const color = style.color ?? this.config.colors.ink;
    const nativeText = typeof text === "string" ? text : text.map((run) => ({ text: run.text, options: this.native(run.options) }));
    const link = this.link(style.link);
    const recordText = typeof text === "string" ? text : text.map((run) => run.text).join("");
    const fit = style.fit ?? "shrink";
    this.slide.addText(nativeText, {
      ...this.native(style.options),
      ...(link ? { hyperlink: toNativeHyperlink(link) } : {}),
      ...frame,
      objectName: name,
      fontFace,
      fontSize,
      color,
      bold: style.bold,
      italic: style.italic,
      align: style.align ?? "left",
      valign: style.valign ?? "top",
      margin: style.margin ?? 0,
      fit,
      breakLine: style.breakLine,
      rotate: style.rotate,
      ...(style.fill ? { fill: { color: style.fill, transparency: style.transparency ?? 0 } } : {}),
      ...(style.lineColor ? { line: { color: style.lineColor, width: style.lineWidth ?? 1 } } : {}),
      ...(style.radius !== undefined ? { rectRadius: style.radius } : {}),
    });
    this.records.push({
      id,
      name,
      type: "text",
      role: style.role ?? "body",
      ...frame,
      text: recordText,
      fontSize,
      fontFace,
      textColor: color,
      fit,
      ...(style.bold === undefined ? {} : { bold: style.bold }),
      ...(style.fill ? { fillColor: style.fill } : {}),
      ...(link ? { link: link.url ?? `slide:${link.slide}` } : {}),
      intentionalOverlap: style.intentionalOverlap ?? false,
    });
    return id;
  }

  public addShape(
    name: string,
    shape: string,
    rawFrame: Frame,
    style: ShapeStyle = {},
  ): string {
    const id = this.nextId(name);
    // A negative extent is not expressible in OOXML: normalize it to a positive
    // box plus a flip so the shape draws in the same place and the recorded
    // geometry can be validated against the slide bounds.
    const frame = normalizeFrame(rawFrame);
    const flip = {
      ...(rawFrame.w < 0 ? { flipH: true } : {}),
      ...(rawFrame.h < 0 ? { flipV: true } : {}),
    };
    const link = this.link(style.link);
    this.slide.addShape(shape, {
      ...this.native(style.options),
      ...(link ? { hyperlink: toNativeHyperlink(link) } : {}),
      ...frame,
      ...flip,
      objectName: name,
      fill: { color: style.fill ?? this.config.colors.surface, transparency: style.transparency ?? 0 },
      line: { color: style.lineColor ?? style.fill ?? this.config.colors.rule, width: style.lineWidth ?? 0 },
      rotate: style.rotate,
      ...(style.radius !== undefined ? { rectRadius: style.radius } : {}),
    });
    this.records.push({
      id,
      name,
      type: "shape",
      role: style.role ?? "shape",
      ...frame,
      fillColor: style.fill ?? this.config.colors.surface,
      ...(link ? { link: link.url ?? `slide:${link.slide}` } : {}),
      intentionalOverlap: style.intentionalOverlap ?? false,
    });
    return id;
  }

  public addConnector(
    name: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    options: {
      color?: string;
      width?: number;
      arrow?: boolean;
      beginArrow?: boolean;
      dashed?: boolean;
      role?: string;
      native?: Record<string, unknown>;
    } = {},
  ): string {
    const id = this.nextId(name);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const frame = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(dx), h: Math.abs(dy) };
    this.slide.addShape(Shapes.line, {
      ...this.native(options.native),
      ...frame,
      flipH: dx < 0,
      flipV: dy < 0,
      objectName: name,
      line: {
        color: options.color ?? this.config.colors.rule,
        width: options.width ?? 1.5,
        dashType: options.dashed ? "dash" : "solid",
        beginArrowType: options.beginArrow ? "triangle" : "none",
        endArrowType: options.arrow === false ? "none" : "triangle",
      },
    });
    this.records.push({
      id,
      name,
      type: "connector",
      role: options.role ?? "connector",
      ...frame,
      intentionalOverlap: true,
    });
    return id;
  }

  public addImage(name: string, imagePath: string, alt: string, rawFrame: Frame, style: ImageStyle = {}): string {
    const id = this.nextId(name);
    const frame = normalizeFrame(rawFrame);
    const link = this.link(style.link);
    this.slide.addImage({
      ...this.native(style.options),
      ...(link ? { hyperlink: toNativeHyperlink(link) } : {}),
      path: imagePath,
      ...frame,
      sizing: { type: style.fit ?? "cover", ...frame },
      objectName: name,
      altText: alt,
      rotate: style.rotate,
      transparency: style.transparency,
    });
    this.records.push({
      id,
      name,
      type: "image",
      role: style.role ?? "image",
      ...frame,
      imagePath: path.resolve(imagePath),
      ...(style.source ? { imageSource: style.source } : {}),
      ...(style.provenance ? { provenance: style.provenance } : {}),
      altText: alt,
      ...(link ? { link: link.url ?? `slide:${link.slide}` } : {}),
      intentionalOverlap: style.intentionalOverlap ?? false,
    });
    return id;
  }

  public addTable(name: string, table: TableSpec, frame: Frame, nativeOptions: Record<string, unknown> = {}): string {
    const id = this.nextId(name);
    const headerFill = emphasisField(this.config);
    const headerText = foregroundOn(headerFill, this.config);
    const header = table.headers.map((text) => ({
      text,
      options: {
        bold: true,
        color: headerText,
        fill: { color: headerFill },
        margin: 0.08,
      },
    }));
    const rows = table.rows.map((row, rowIndex) => row.map((value) => ({
      text: String(value),
      options: {
        color: this.config.colors.ink,
        fill: { color: table.highlightRows?.includes(rowIndex) ? this.config.colors.accentSoft : this.config.colors.surface },
        margin: 0.08,
      },
    })));
    this.slide.addTable([header, ...rows], {
      border: { color: this.config.colors.rule, width: 1 },
      color: this.config.colors.ink,
      fontFace: this.config.fonts.body,
      fontSize: Math.max(this.config.fonts.minimums.caption, 12),
      margin: 0.06,
      ...(table.columnWidths ? { colW: table.columnWidths } : {}),
      autoPage: false,
      valign: "middle",
      ...nativeOptions,
      ...frame,
      objectName: name,
    });
    this.records.push({
      id,
      name,
      type: "table",
      role: "table",
      ...frame,
      text: [table.headers, ...table.rows].flat().join(" | "),
      fontSize: Math.max(this.config.fonts.minimums.caption, 12),
      fontFace: this.config.fonts.body,
      textColor: this.config.colors.ink,
      fillColor: this.config.colors.surface,
      metadata: { rows: table.rows.length + 1, columns: table.headers.length },
    });
    return id;
  }

  public recordChart(name: string, chart: ChartSpec, frame: Frame, alt?: string): string {
    const id = this.nextId(name);
    this.records.push({
      id,
      name,
      type: "chart",
      role: "chart",
      ...frame,
      altText: alt ?? `${chart.kind} chart: ${chart.series.map((series) => series.name).join(", ")}`,
      intentionalOverlap: true,
      metadata: { chart },
    });
    return id;
  }

  public addNativeChart(
    name: string,
    nativeType: string,
    data: Array<Record<string, unknown>>,
    frame: Frame,
    options: Record<string, unknown> = {},
    alt?: string,
  ): string {
    const id = this.nextId(name);
    this.slide.addChart(nativeType, data, {
      ...options,
      ...frame,
      objectName: name,
      altText: alt ?? `${nativeType} chart`,
    });
    this.records.push({
      id,
      name,
      type: "chart",
      role: "chart",
      ...frame,
      altText: alt ?? `${nativeType} chart`,
      intentionalOverlap: true,
      metadata: { nativeChart: { nativeType, data } },
    });
    return id;
  }

  public addBullets(name: string, bullets: string[], frame: Frame, fontSize?: number): void {
    const gap = 0.18;
    const itemHeight = Math.max(0.62, (frame.h - gap * Math.max(0, bullets.length - 1)) / Math.max(1, bullets.length));
    bullets.forEach((bullet, index) => {
      const y = frame.y + index * (itemHeight + gap);
      this.addShape(`${name}-marker-${index + 1}`, Shapes.ellipse, {
        x: frame.x,
        y: y + 0.13,
        w: 0.12,
        h: 0.12,
      }, { fill: this.config.colors.accent, lineWidth: 0, role: "bullet-marker" });
      this.addText(`${name}-${index + 1}`, bullet, {
        x: frame.x + 0.28,
        y,
        w: frame.w - 0.28,
        h: itemHeight,
      }, { fontSize: fontSize ?? this.config.fonts.minimums.body, valign: "top", role: "body" });
    });
  }

  private nextId(name: string): string {
    this.sequence += 1;
    return `${this.sequence.toString().padStart(3, "0")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  }
}
