import path from "node:path";
import type { CanvasTextRun, ChartSpec, ElementRecord, SlideAgentConfig, TableSpec } from "../types/index.js";
import { emphasisField, foregroundOn } from "../utils/color.js";
import { Shapes, type NativeSlide } from "./pptx-values.js";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
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
  options?: Record<string, unknown>;
}

export interface ImageStyle {
  fit?: "cover" | "contain" | "stretch";
  rotate?: number;
  transparency?: number;
  role?: string;
  intentionalOverlap?: boolean;
  options?: Record<string, unknown>;
}

export class ElementWriter {
  private sequence = 0;

  public constructor(
    public readonly slide: NativeSlide,
    public readonly records: ElementRecord[],
    private readonly config: SlideAgentConfig,
  ) {}

  public addText(name: string, text: string | CanvasTextRun[], frame: Frame, style: TextStyle = {}): string {
    const id = this.nextId(name);
    const fontSize = style.fontSize ?? this.config.fonts.minimums.body;
    const fontFace = style.fontFace ?? this.config.fonts.body;
    const color = style.color ?? this.config.colors.ink;
    const nativeText = typeof text === "string" ? text : text.map((run) => ({ text: run.text, options: run.options ?? {} }));
    const recordText = typeof text === "string" ? text : text.map((run) => run.text).join("");
    this.slide.addText(nativeText, {
      ...(style.options ?? {}),
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
      fit: style.fit ?? "shrink",
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
      ...(style.fill ? { fillColor: style.fill } : {}),
      intentionalOverlap: style.intentionalOverlap ?? false,
    });
    return id;
  }

  public addShape(
    name: string,
    shape: string,
    frame: Frame,
    style: ShapeStyle = {},
  ): string {
    const id = this.nextId(name);
    this.slide.addShape(shape, {
      ...(style.options ?? {}),
      ...frame,
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
      ...(options.native ?? {}),
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

  public addImage(name: string, imagePath: string, alt: string, frame: Frame, style: ImageStyle = {}): string {
    const id = this.nextId(name);
    this.slide.addImage({
      ...(style.options ?? {}),
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

  public recordChart(name: string, chart: ChartSpec, frame: Frame): string {
    const id = this.nextId(name);
    this.records.push({
      id,
      name,
      type: "chart",
      role: "chart",
      ...frame,
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
