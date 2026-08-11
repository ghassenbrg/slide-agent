import path from "node:path";
import type {
  CanvasTextRun,
  CanvasVectorArtwork,
  ChartSpec,
  ElementRecord,
  ImageProvenance,
  ImageTreatment,
  SlideAgentConfig,
  TableSpec,
} from "../types/index.js";
import { emphasisField, foregroundOn } from "../utils/color.js";
import { checkLink, sanitizeNativeOptions, toNativeHyperlink, type DeckLink } from "../utils/links.js";
import type { ShapePostProcess } from "../export/pptx-postprocess.js";
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
  /** Declares that this element runs past the slide edge on purpose. */
  allowBleed?: boolean;
  fontSize?: number;
  fontFace?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
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
  layer?: string;
  groupId?: string;
  intentionalOverlap?: boolean;
  rotate?: number;
  lineSpacing?: number;
  lineSpacingMultiple?: number;
  charSpacing?: number;
  /** Paragraph indent in inches, applied as a left inset on the frame. */
  indent?: number;
  columns?: number;
  noBreak?: boolean;
  bullet?: boolean | Record<string, unknown>;
  /** A URL, `{url}`, or `{slide}`. Checked against the scheme allowlist. */
  link?: unknown;
  options?: Record<string, unknown>;
}

/** U+00A0. A phrase written with these never breaks across lines. */
const NO_BREAK_SPACE = "\u00a0";

export interface ShapeStyle {
  /** Declares that this element runs past the slide edge on purpose. */
  allowBleed?: boolean;
  fill?: string;
  transparency?: number;
  lineColor?: string;
  lineWidth?: number;
  radius?: number;
  role?: string;
  layer?: string;
  groupId?: string;
  intentionalOverlap?: boolean;
  rotate?: number;
  link?: unknown;
  options?: Record<string, unknown>;
}

export interface ImageStyle {
  /** Declares that this element runs past the slide edge on purpose. */
  allowBleed?: boolean;
  fit?: "cover" | "contain" | "stretch";
  /** What the author wrote before the resolver turned it into a local file. */
  source?: string;
  provenance?: ImageProvenance;
  vector?: CanvasVectorArtwork;
  treatment?: ImageTreatment;
  rotate?: number;
  transparency?: number;
  role?: string;
  layer?: string;
  groupId?: string;
  intentionalOverlap?: boolean;
  link?: unknown;
  options?: Record<string, unknown>;
}

export interface ConnectorStyle {
  color?: string;
  width?: number;
  arrow?: boolean;
  beginArrow?: boolean;
  dashed?: boolean;
  role?: string;
  layer?: string;
  groupId?: string;
  allowBleed?: boolean;
  intentionalOverlap?: boolean;
  /** Ids of the elements this connector joins, exempt from overlap reporting. */
  joins?: string[];
  native?: Record<string, unknown>;
}

export class ElementWriter {
  private sequence = 0;

  /** Links refused by the scheme allowlist, surfaced as build warnings. */
  public readonly rejectedLinks: string[] = [];

  /**
   * Authored properties OOXML supports and PptxGenJS does not emit, collected
   * for the export pass: text columns, source crops, masks, and blip effects.
   */
  public readonly postProcess: ShapePostProcess[] = [];

  public constructor(
    public readonly slide: NativeSlide,
    public readonly records: ElementRecord[],
    private readonly config: SlideAgentConfig,
    /** 1-based slide number, so post-processing can be targeted per slide. */
    private readonly slideNumber: number = 1,
  ) {}

  /** Layer, bleed, and group provenance shared by every record type. */
  private context(style: { layer?: string; groupId?: string; allowBleed?: boolean }): Partial<ElementRecord> {
    return {
      ...(style.layer ? { layer: style.layer } : {}),
      ...(style.groupId ? { groupId: style.groupId } : {}),
      ...(style.allowBleed ? { allowBleed: true } : {}),
    };
  }

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
    // An authored indent is a left inset: the paragraph starts further in and
    // the text still ends where the author put the right edge.
    const indent = Math.max(0, style.indent ?? 0);
    const frame = normalizeFrame(rawFrame);
    const laidOut = indent > 0 && indent < frame.w
      ? { ...frame, x: frame.x + indent, w: frame.w - indent }
      : frame;
    const fontSize = style.fontSize ?? this.config.fonts.minimums.body;
    const fontFace = style.fontFace ?? this.config.fonts.body;
    const color = style.color ?? this.config.colors.ink;
    const bind = (value: string) => style.noBreak ? value.replace(/ /g, NO_BREAK_SPACE) : value;
    const nativeText = typeof text === "string"
      ? bind(text)
      : text.map((run) => ({ text: bind(run.text), options: this.native(run.options) }));
    const link = this.link(style.link);
    const recordText = typeof text === "string" ? text : text.map((run) => run.text).join("");
    const fit = style.fit ?? "shrink";
    this.slide.addText(nativeText, {
      ...this.native(style.options),
      ...(link ? { hyperlink: toNativeHyperlink(link) } : {}),
      ...laidOut,
      objectName: name,
      fontFace,
      fontSize,
      color,
      bold: style.bold,
      italic: style.italic,
      ...(style.underline ? { underline: { style: "sng" } } : {}),
      align: style.align ?? "left",
      valign: style.valign ?? "top",
      margin: style.margin ?? 0,
      fit,
      breakLine: style.breakLine,
      rotate: style.rotate,
      ...(style.lineSpacing !== undefined ? { lineSpacing: style.lineSpacing } : {}),
      ...(style.lineSpacing === undefined && style.lineSpacingMultiple !== undefined
        ? { lineSpacingMultiple: style.lineSpacingMultiple }
        : {}),
      ...(style.charSpacing !== undefined ? { charSpacing: style.charSpacing } : {}),
      ...(style.bullet !== undefined ? { bullet: style.bullet } : {}),
      ...(style.fill ? { fill: { color: style.fill, transparency: style.transparency ?? 0 } } : {}),
      ...(style.lineColor ? { line: { color: style.lineColor, width: style.lineWidth ?? 1 } } : {}),
      ...(style.radius !== undefined ? { rectRadius: style.radius } : {}),
    });
    if (style.columns && style.columns > 1) {
      this.postProcess.push({ slide: this.slideNumber, name, columns: { count: style.columns } });
    }
    this.records.push({
      id,
      name,
      type: "text",
      role: style.role ?? "body",
      ...laidOut,
      text: recordText,
      fontSize,
      fontFace,
      textColor: color,
      fit,
      editability: "native",
      ...this.context(style),
      ...(style.bold === undefined ? {} : { bold: style.bold }),
      ...(style.fill ? { fillColor: style.fill } : {}),
      ...(style.fill && style.transparency ? { fillTransparency: style.transparency } : {}),
      ...(link ? { link: link.url ?? `slide:${link.slide}` } : {}),
      ...(style.columns && style.columns > 1 ? { metadata: { columns: style.columns } } : {}),
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
      ...(style.transparency ? { fillTransparency: style.transparency } : {}),
      editability: "native",
      ...this.context(style),
      ...(shape !== Shapes.rect ? { shape } : {}),
      ...(style.radius !== undefined ? { radius: style.radius } : {}),
      ...(link ? { link: link.url ?? `slide:${link.slide}` } : {}),
      intentionalOverlap: style.intentionalOverlap ?? false,
    });
    return id;
  }

  public addConnector(
    name: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    options: ConnectorStyle = {},
  ): string {
    return this.addRoutedConnector(name, [from, to], options);
  }

  /**
   * Writes a connector along an explicit path.
   *
   * Two points stay a `line`, which is the shape PowerPoint users expect and
   * the one every viewer draws identically. Anything with a bend becomes a
   * custom-geometry polyline: still one native, selectable, restylable shape —
   * and still one manifest record, so a later patch addresses the whole route
   * by its id rather than a handful of anonymous segments.
   *
   * The path is kept on the record. A connector's bounding box says almost
   * nothing about where it actually runs, so overlap checking needs the real
   * geometry; without it the only options were to report every diagonal as
   * colliding with everything near it, or to exempt connectors entirely.
   */
  public addRoutedConnector(name: string, path: Array<{ x: number; y: number }>, options: ConnectorStyle = {}): string {
    const id = this.nextId(name);
    const points = path.length >= 2 ? path : [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const frame = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
    const line = {
      color: options.color ?? this.config.colors.rule,
      width: options.width ?? 1.5,
      dashType: options.dashed ? "dash" : "solid",
      beginArrowType: options.beginArrow ? "triangle" : "none",
      endArrowType: options.arrow === false ? "none" : "triangle",
    };

    if (points.length === 2) {
      const start = points[0]!;
      const end = points[1]!;
      this.slide.addShape(Shapes.line, {
        ...this.native(options.native),
        ...frame,
        flipH: end.x - start.x < 0,
        flipV: end.y - start.y < 0,
        objectName: name,
        line,
      });
    } else {
      // A zero-extent axis would give the custom path a zero-width coordinate
      // space to draw in, so the box is floored to a hairline it can round to.
      const drawn = { ...frame, w: Math.max(frame.w, 0.01), h: Math.max(frame.h, 0.01) };
      this.slide.addShape(Shapes.custGeom, {
        ...this.native(options.native),
        ...drawn,
        objectName: name,
        points: points.map((point, index) => ({
          x: point.x - drawn.x,
          y: point.y - drawn.y,
          ...(index === 0 ? { moveTo: true } : {}),
        })),
        line,
      });
    }

    this.records.push({
      id,
      name,
      type: "connector",
      role: options.role ?? "connector",
      ...frame,
      editability: "native",
      ...this.context(options),
      // A connector legitimately meets the two elements it joins; everything
      // else it touches is a defect until the author says otherwise.
      intentionalOverlap: options.intentionalOverlap ?? false,
      ...(options.joins?.length ? { allowOverlapWith: options.joins } : {}),
      metadata: { path: points.map((point) => ({ x: point.x, y: point.y })) },
    });
    return id;
  }

  public addImage(name: string, imagePath: string, alt: string, rawFrame: Frame, style: ImageStyle = {}): string {
    const id = this.nextId(name);
    const frame = normalizeFrame(rawFrame);
    const link = this.link(style.link);
    const treatment = style.treatment;
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
    if (treatment?.crop || treatment?.maskShape || treatment?.duotone || treatment?.grayscale) {
      this.postProcess.push({
        slide: this.slideNumber,
        name,
        picture: {
          ...(treatment.crop ? { crop: treatment.crop } : {}),
          ...(treatment.maskShape ? { maskShape: treatment.maskShape } : {}),
          ...(treatment.duotone ? { duotone: treatment.duotone } : {}),
          ...(treatment.grayscale ? { grayscale: true } : {}),
        },
      });
    }
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
      // Pixels stay pixels. Vector artwork is scalable but not shape-editable
      // unless the author says otherwise, and saying so here is the difference
      // between an honest manifest and a promise PowerPoint will not keep.
      editability: style.vector
        ? (style.vector.editable === true ? "grouped-native" : "embedded-vector")
        : "embedded-raster",
      ...this.context(style),
      ...(treatment?.maskShape ? { maskShape: treatment.maskShape } : {}),
      ...(link ? { link: link.url ?? `slide:${link.slide}` } : {}),
      ...(style.vector || treatment
        ? { metadata: { ...(style.vector ? { vector: style.vector } : {}), ...(treatment ? { treatment } : {}) } }
        : {}),
      intentionalOverlap: style.intentionalOverlap ?? false,
    });
    // A tint is drawn as a real, editable shape rather than baked into the
    // pixels: the picture on the slide stays the picture the author supplied,
    // and anyone can change or remove the wash in PowerPoint.
    if (treatment?.tint) {
      const amount = Math.max(0, Math.min(1, treatment.tint.amount ?? 0.35));
      this.addShape(`${name}-tint`, Shapes.rect, frame, {
        fill: treatment.tint.color,
        transparency: Math.round((1 - amount) * 100),
        lineWidth: 0,
        role: "decorative",
        intentionalOverlap: true,
        ...this.context(style),
      });
    }
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
      editability: "native",
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
      editability: "native",
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
      editability: "native",
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
