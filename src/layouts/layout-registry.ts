import { ChartBuilder } from "../charts/chart-builder.js";
import { ElementWriter } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import { DiagramBuilder } from "../diagrams/diagram-builder.js";
import type { LayoutContext, SlideAgentConfig, SlideSpec } from "../types/index.js";
import { accentForegroundOn, emphasisField, ensureContrast, foregroundOn, readableAccentOn, requiredContrast, secondaryForegroundOn } from "../utils/color.js";
import { estimatedLineCount } from "../validation/manifest-validator.js";

export type LayoutRenderer = (writer: ElementWriter, spec: SlideSpec, context: LayoutContext) => void;

/** Two lines of title, plus the rule, still clear the content band below. */
const MAXIMUM_TITLE_LINES = 2;

/**
 * Sizes the title band to the title. A fixed 0.72in box held exactly one line
 * at the 32pt legibility minimum, so any title longer than roughly one line
 * reported an unfixable overflow and collided with the accent rule beneath it.
 */
function addHeader(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  const fontSize = config.fonts.minimums.slideTitle;
  const width = config.dimensions.width - config.dimensions.margin * 2;
  const lines = Math.min(MAXIMUM_TITLE_LINES, estimatedLineCount(spec.title, width, fontSize));
  const height = Math.max(0.72, lines * (fontSize / 72) * 1.18);
  writer.addText("slide-title", spec.title, {
    x: config.dimensions.margin,
    y: 0.42,
    w: width,
    h: height,
  }, {
    fontSize,
    fontFace: config.fonts.heading,
    bold: true,
    role: "title",
    fit: "shrink",
  });
  writer.addShape("title-rule", Shapes.line, {
    x: config.dimensions.margin,
    y: 0.42 + height + 0.13,
    w: 0.7,
    h: 0,
  }, { fill: config.colors.accent, lineColor: config.colors.accent, lineWidth: 3, role: "rule" });
}

function addFooter(writer: ElementWriter, context: LayoutContext): void {
  const { config } = context;
  if (!config.generation.includeSlideNumbers) return;
  writer.addText("slide-number", String(context.slideNumber).padStart(2, "0"), {
    x: config.dimensions.width - config.dimensions.margin - 0.45,
    y: config.dimensions.height - 0.45,
    w: 0.45,
    h: 0.2,
  }, { fontSize: 11, color: config.colors.muted, align: "right", role: "footer" });
}

function addAbstractVisual(writer: ElementWriter, frame: { x: number; y: number; w: number; h: number }, config: SlideAgentConfig): void {
  const field = emphasisField(config);
  const foreground = foregroundOn(field, config);
  writer.addShape("visual-field", Shapes.roundRect, frame, {
    fill: field,
    lineWidth: 0,
    radius: 0.08,
    role: "visual-background",
    intentionalOverlap: true,
  });
  writer.addShape("visual-orbit-large", Shapes.ellipse, {
    x: frame.x + frame.w * 0.12,
    y: frame.y + frame.h * 0.08,
    w: frame.w * 0.72,
    h: frame.w * 0.72,
  }, { fill: config.colors.accentAlt, transparency: 20, lineWidth: 0, role: "decorative", intentionalOverlap: true });
  writer.addShape("visual-orbit-small", Shapes.ellipse, {
    x: frame.x + frame.w * 0.47,
    y: frame.y + frame.h * 0.42,
    w: frame.w * 0.38,
    h: frame.w * 0.38,
  }, { fill: config.colors.accent, transparency: 8, lineWidth: 0, role: "decorative", intentionalOverlap: true });
  writer.addShape("visual-axis", Shapes.line, {
    x: frame.x + frame.w * 0.15,
    y: frame.y + frame.h * 0.78,
    w: frame.w * 0.7,
    h: -frame.h * 0.55,
  }, { fill: foreground, lineColor: foreground, lineWidth: 2, role: "decorative", intentionalOverlap: true });
}

function renderTitle(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  writer.addShape("title-accent", Shapes.rect, {
    x: 0,
    y: 0,
    w: 0.22,
    h: config.dimensions.height,
  }, { fill: config.colors.accent, lineWidth: 0, role: "accent" });
  writer.addText("deck-label", spec.sectionLabel ?? "PRESENTATION", {
    x: 0.74,
    y: 0.65,
    w: 4.5,
    h: 0.32,
  }, { fontSize: 12, bold: true, color: readableAccentOn(config.colors.background, config, 12, true), role: "eyebrow" });
  writer.addText("deck-title", spec.title, {
    x: 0.72,
    y: 1.38,
    w: 8.7,
    h: 2.25,
  }, { fontSize: Math.max(config.fonts.minimums.deckTitle, 54), fontFace: config.fonts.heading, bold: true, valign: "bottom", role: "title" });
  writer.addText("deck-subtitle", spec.subtitle ?? "", {
    x: 0.76,
    y: 4.08,
    w: 6.7,
    h: 1.1,
  }, { fontSize: 22, color: config.colors.muted, role: "subtitle" });
  writer.addShape("title-motif-one", Shapes.ellipse, {
    x: 10.0,
    y: 0.8,
    w: 2.55,
    h: 2.55,
  }, { fill: config.colors.accentAlt, transparency: 10, lineWidth: 0, role: "decorative" });
  writer.addShape("title-motif-two", Shapes.ellipse, {
    x: 9.1,
    y: 3.0,
    w: 3.1,
    h: 3.1,
  }, { fill: config.colors.accentSoft, lineWidth: 0, role: "decorative", intentionalOverlap: true });
}

function renderSection(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  const field = emphasisField(config);
  const foreground = foregroundOn(field, config);
  const secondary = secondaryForegroundOn(field, config);
  const accent = accentForegroundOn(field, config);
  writer.slide.background = { color: field };
  writer.addText("section-label", spec.sectionLabel ?? "SECTION", {
    x: 0.72,
    y: 0.76,
    w: 3,
    h: 0.32,
  }, { fontSize: 12, bold: true, color: accent, role: "eyebrow", fill: field });
  writer.addText("section-title", spec.title, {
    x: 0.72,
    y: 2.2,
    w: 10.8,
    h: 1.8,
  }, { fontSize: 48, fontFace: config.fonts.heading, bold: true, color: foreground, role: "title", fill: field });
  writer.addText("section-subtitle", spec.subtitle ?? spec.body ?? "", {
    x: 0.76,
    y: 4.35,
    w: 7.4,
    h: 0.8,
  }, { fontSize: 20, color: secondary, role: "subtitle", fill: field });
}

function renderSummary(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  addHeader(writer, spec, context);
  writer.addText("summary-lead", spec.body ?? "", { x: 0.6, y: 1.65, w: 4.25, h: 1.5 }, {
    fontSize: 26,
    fontFace: config.fonts.heading,
    bold: true,
    role: "lead",
  });
  const bullets = spec.bullets ?? [];
  bullets.slice(0, 4).forEach((bullet, index) => {
    const y = 1.56 + index * 1.25;
    writer.addText(`summary-index-${index + 1}`, String(index + 1).padStart(2, "0"), {
      x: 5.45,
      y: y + 0.08,
      w: 0.48,
      h: 0.3,
    }, { fontSize: 12, bold: true, color: readableAccentOn(config.colors.background, config, 12, true), role: "index" });
    writer.addText(`summary-point-${index + 1}`, bullet, {
      x: 6.05,
      y,
      w: 6.4,
      h: 0.7,
    }, { fontSize: 19, bold: true, role: "body" });
    writer.addShape(`summary-rule-${index + 1}`, Shapes.line, {
      x: 5.45,
      y: y + 0.86,
      w: 7.0,
      h: 0,
    }, { fill: config.colors.rule, lineColor: config.colors.rule, lineWidth: 1, role: "rule" });
  });
  addFooter(writer, context);
}

function renderTextImage(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  addHeader(writer, spec, context);
  const textOnLeft = spec.visual?.position !== "left";
  const textX = textOnLeft ? 0.62 : 7.15;
  const visualX = textOnLeft ? 7.05 : 0.6;
  writer.addText("body-copy", spec.body ?? "", { x: textX, y: 1.65, w: 5.45, h: 1.0 }, {
    fontSize: 20,
    color: config.colors.muted,
    role: "body",
  });
  writer.addBullets("body-bullet", (spec.bullets ?? []).slice(0, 5), { x: textX, y: 2.82, w: 5.35, h: 3.65 }, 17);
  const visualFrame = { x: visualX, y: 1.56, w: 5.65, h: 4.95 };
  if (spec.visual?.path) writer.addImage("hero-image", spec.visual.path, spec.visual.alt, visualFrame);
  else addAbstractVisual(writer, visualFrame, config);
  if (spec.visual?.caption) {
    writer.addText("image-caption", spec.visual.caption, { x: visualX, y: 6.58, w: 5.65, h: 0.26 }, {
      fontSize: 11,
      color: config.colors.muted,
      role: "caption",
    });
  }
  addFooter(writer, context);
}

function renderComparison(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  addHeader(writer, spec, context);
  const columns = (spec.comparison ?? []).slice(0, 3);
  const gap = 0.28;
  const frame = { x: 0.62, y: 1.62, w: 12.1, h: 4.95 };
  const width = (frame.w - gap * Math.max(0, columns.length - 1)) / Math.max(1, columns.length);
  columns.forEach((column, index) => {
    const x = frame.x + index * (width + gap);
    const emphasized = column.emphasis === true;
    const field = emphasisField(config);
    const emphasizedText = foregroundOn(field, config);
    const emphasizedSecondary = secondaryForegroundOn(field, config);
    writer.addShape(`comparison-panel-${index + 1}`, Shapes.roundRect, { x, y: frame.y, w: width, h: frame.h }, {
      fill: emphasized ? field : config.colors.surface,
      lineColor: emphasized ? field : config.colors.rule,
      lineWidth: 1,
      radius: 0.06,
      role: "panel",
      intentionalOverlap: true,
    });
    const panel = emphasized ? field : config.colors.surface;
    writer.addText(`comparison-heading-${index + 1}`, column.heading, { x: x + 0.3, y: 1.95, w: width - 0.6, h: 0.55 }, {
      fontSize: 23,
      bold: true,
      color: ensureContrast(emphasized ? emphasizedText : config.colors.ink, panel, requiredContrast(23, true)),
      fill: panel,
      role: "subheading",
    });
    column.points.slice(0, 5).forEach((point, pointIndex) => {
      writer.addText(`comparison-point-${index + 1}-${pointIndex + 1}`, point, {
        x: x + 0.3,
        y: 2.78 + pointIndex * 0.7,
        w: width - 0.6,
        h: 0.48,
      }, { fontSize: 16, color: ensureContrast(emphasized ? emphasizedSecondary : config.colors.muted, panel, requiredContrast(16)), fill: panel, role: "body" });
    });
  });
  addFooter(writer, context);
}

function renderTimeline(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, diagrams: DiagramBuilder): void {
  addHeader(writer, spec, context);
  diagrams.addTimeline(writer, spec.timeline ?? [], { x: 0.7, y: 1.55, w: 11.95, h: 4.85 });
  addFooter(writer, context);
}

function renderProcess(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, diagrams: DiagramBuilder): void {
  addHeader(writer, spec, context);
  if (spec.body) writer.addText("process-lead", spec.body, { x: 0.62, y: 1.55, w: 11.8, h: 0.65 }, {
    fontSize: 22,
    color: context.config.colors.muted,
    role: "lead",
  });
  diagrams.addProcess(writer, (spec.process ?? []).slice(0, 5), { x: 0.62, y: 2.25, w: 12.1, h: 3.75 });
  addFooter(writer, context);
}

function renderArchitecture(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, diagrams: DiagramBuilder): void {
  addHeader(writer, spec, context);
  if (spec.body) writer.addText("architecture-lead", spec.body, { x: 0.62, y: 1.52, w: 11.8, h: 0.62 }, {
    fontSize: 18,
    color: context.config.colors.muted,
    role: "body",
  });
  diagrams.addArchitecture(writer, spec.architecture ?? { nodes: [], edges: [] }, { x: 0.72, y: 2.22, w: 11.85, h: 3.8 });
  addFooter(writer, context);
}

function renderTable(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  addHeader(writer, spec, context);
  if (spec.body) writer.addText("table-lead", spec.body, { x: 0.62, y: 1.45, w: 12.0, h: 0.52 }, {
    fontSize: 17,
    color: context.config.colors.muted,
    role: "body",
  });
  if (spec.table) writer.addTable("data-table", spec.table, { x: 0.62, y: 2.08, w: 12.1, h: 4.45 });
  addFooter(writer, context);
}

function renderChart(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, charts: ChartBuilder): void {
  addHeader(writer, spec, context);
  if (spec.body) writer.addText("chart-insight", spec.body, { x: 8.85, y: 1.65, w: 3.75, h: 1.35 }, {
    fontSize: 22,
    bold: true,
    role: "insight",
  });
  if (spec.bullets?.length) writer.addBullets("chart-bullet", spec.bullets.slice(0, 3), { x: 8.85, y: 3.25, w: 3.7, h: 2.5 }, 16);
  if (spec.chart) charts.add(writer, "data-chart", spec.chart, { x: 0.62, y: 1.55, w: 7.8, h: 4.95 });
  addFooter(writer, context);
}

function renderKpi(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  addHeader(writer, spec, context);
  const kpis = (spec.kpis ?? []).slice(0, 4);
  const gap = 0.25;
  const width = (12.1 - gap * Math.max(0, kpis.length - 1)) / Math.max(1, kpis.length);
  kpis.forEach((kpi, index) => {
    const x = 0.62 + index * (width + gap);
    const panel = index === 0 ? config.colors.accentSoft : config.colors.surface;
    writer.addShape(`kpi-panel-${index + 1}`, Shapes.roundRect, { x, y: 1.65, w: width, h: 4.6 }, {
      fill: panel,
      lineColor: index === 0 ? config.colors.accent : config.colors.rule,
      lineWidth: 1,
      radius: 0.06,
      role: "panel",
      intentionalOverlap: true,
    });
    writer.addText(`kpi-label-${index + 1}`, kpi.label.toUpperCase(), { x: x + 0.28, y: 2.05, w: width - 0.56, h: 0.35 }, {
      fontSize: 11,
      bold: true,
      color: ensureContrast(index === 0 ? config.colors.ink : config.colors.muted, panel, requiredContrast(11, true)),
      fill: panel,
      role: "eyebrow",
    });
    writer.addText(`kpi-value-${index + 1}`, kpi.value, { x: x + 0.28, y: 2.6, w: width - 0.56, h: 1.1 }, {
      fontSize: 40,
      fontFace: config.fonts.heading,
      bold: true,
      color: ensureContrast(config.colors.ink, panel, requiredContrast(40)),
      fill: panel,
      role: "kpi-value",
    });
    writer.addText(`kpi-detail-${index + 1}`, kpi.detail ?? "", { x: x + 0.28, y: 4.3, w: width - 0.56, h: 0.9 }, {
      fontSize: 16,
      color: ensureContrast(index === 0 ? config.colors.ink : config.colors.muted, panel, requiredContrast(16)),
      fill: panel,
      role: "body",
    });
  });
  addFooter(writer, context);
}

function renderQuote(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  writer.addText("quote-mark", "“", { x: 0.65, y: 0.65, w: 1.0, h: 1.0 }, {
    fontSize: 72,
    color: config.colors.accent,
    fontFace: config.fonts.heading,
    role: "decorative",
  });
  writer.addText("quote-text", spec.quote?.text ?? spec.title, { x: 1.2, y: 1.7, w: 10.9, h: 2.9 }, {
    fontSize: 34,
    fontFace: config.fonts.heading,
    bold: true,
    valign: "middle",
    align: "center",
    role: "quote",
  });
  writer.addText("quote-attribution", spec.quote?.attribution ?? "", { x: 3.3, y: 5.12, w: 6.7, h: 0.38 }, {
    fontSize: 14,
    color: config.colors.muted,
    align: "center",
    role: "attribution",
  });
  addFooter(writer, context);
}

function renderRoadmap(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  addHeader(writer, spec, context);
  const lanes = (spec.roadmap ?? []).slice(0, 5);
  const rowHeight = 4.65 / Math.max(1, lanes.length);
  lanes.forEach((lane, laneIndex) => {
    const y = 1.65 + laneIndex * rowHeight;
    writer.addText(`roadmap-label-${laneIndex + 1}`, lane.label, { x: 0.62, y: y + 0.18, w: 1.35, h: 0.38 }, {
      fontSize: 14,
      bold: true,
      color: config.colors.muted,
      role: "lane-label",
    });
    const itemWidth = 10.4 / Math.max(1, lane.items.length);
    const panel = laneIndex === 0 ? config.colors.accentSoft : config.colors.surface;
    lane.items.forEach((item, itemIndex) => {
      const x = 2.15 + itemIndex * itemWidth;
      writer.addShape(`roadmap-item-${laneIndex + 1}-${itemIndex + 1}`, Shapes.roundRect, {
        x,
        y,
        w: itemWidth - 0.18,
        h: rowHeight - 0.18,
      }, {
        fill: panel,
        lineColor: laneIndex === 0 ? config.colors.accent : config.colors.rule,
        lineWidth: 1,
        radius: 0.04,
        role: "roadmap-item",
        intentionalOverlap: true,
      });
      writer.addText(`roadmap-text-${laneIndex + 1}-${itemIndex + 1}`, item, {
        x: x + 0.15,
        y: y + 0.13,
        w: itemWidth - 0.48,
        h: rowHeight - 0.44,
      }, { fontSize: 16, bold: true, valign: "middle", color: ensureContrast(config.colors.ink, panel, requiredContrast(16, true)), fill: panel, role: "roadmap-label" });
    });
  });
  addFooter(writer, context);
}

function renderClosing(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  const { config } = context;
  const field = emphasisField(config);
  const foreground = foregroundOn(field, config);
  const secondary = secondaryForegroundOn(field, config);
  const accent = accentForegroundOn(field, config);
  writer.slide.background = { color: field };
  writer.addText("closing-label", "NEXT MOVE", { x: 0.72, y: 0.72, w: 2.2, h: 0.3 }, {
    fontSize: 12,
    bold: true,
    color: accent,
    fill: field,
    role: "eyebrow",
  });
  writer.addText("closing-title", spec.title, { x: 0.72, y: 1.7, w: 10.8, h: 1.75 }, {
    fontSize: 44,
    fontFace: config.fonts.heading,
    bold: true,
    color: foreground,
    fill: field,
    role: "title",
  });
  writer.addText("closing-subtitle", spec.subtitle ?? "", { x: 0.75, y: 3.72, w: 7.4, h: 0.75 }, {
    fontSize: 20,
    color: secondary,
    fill: field,
    role: "subtitle",
  });
  const bullets = spec.bullets ?? [];
  bullets.slice(0, 3).forEach((bullet, index) => {
    writer.addText(`closing-action-${index + 1}`, `${String(index + 1).padStart(2, "0")}  ${bullet}`, {
      x: 8.8,
      y: 3.45 + index * 0.78,
      w: 3.7,
      h: 0.48,
    }, { fontSize: 16, bold: true, color: foreground, fill: field, role: "action" });
  });
}

function renderCustom(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): void {
  addHeader(writer, spec, context);
  for (const region of spec.custom ?? []) {
    const frame = { x: region.x, y: region.y, w: region.w, h: region.h };
    if (region.type === "text") {
      writer.addText(region.id, region.text ?? "", frame, { fontSize: region.fontSize ?? 18, fill: region.fill, role: "custom" });
    } else if (region.type === "shape") {
      writer.addShape(region.id, Shapes.roundRect, frame, { fill: region.fill, role: "custom" });
    } else if (region.imagePath) {
      writer.addImage(region.id, region.imagePath, region.text ?? region.id, frame);
    }
  }
  addFooter(writer, context);
}

export interface LayoutFallback {
  slide: number;
  requested: string;
  used: string;
}

export class LayoutRegistry {
  private readonly layouts = new Map<string, LayoutRenderer>();
  private diagrams: DiagramBuilder;
  private charts: ChartBuilder;
  /** When true, an unregistered layout id throws instead of falling back. */
  public strict = false;

  public constructor(private config: SlideAgentConfig) {
    this.diagrams = new DiagramBuilder(config);
    this.charts = new ChartBuilder(config);
    this.registerDefaults();
  }

  public register(id: string, renderer: LayoutRenderer): this {
    if (!id.trim()) throw new Error("Layout id cannot be empty.");
    this.layouts.set(id, renderer);
    return this;
  }

  /** Refresh primitive defaults while retaining every registered custom renderer. */
  public configure(config: SlideAgentConfig): this {
    this.config = config;
    this.diagrams = new DiagramBuilder(config);
    this.charts = new ChartBuilder(config);
    return this;
  }

  /**
   * Picks the closest built-in renderer for an unregistered kind. The docs tell
   * models that `kind` is free-form metadata, which is only true when a canvas
   * is present; without this, an invented kind and no canvas threw
   * `Unknown layout` and failed the whole build.
   */
  private fallbackFor(spec: SlideSpec): LayoutRenderer {
    if (spec.canvas?.length) return this.layouts.get("custom")!;
    if (spec.chart) return this.layouts.get("chart")!;
    if (spec.table) return this.layouts.get("table")!;
    if (spec.kpis?.length) return this.layouts.get("kpi")!;
    if (spec.comparison?.length) return this.layouts.get("comparison")!;
    if (spec.timeline?.length) return this.layouts.get("timeline")!;
    if (spec.process?.length) return this.layouts.get("process")!;
    if (spec.architecture?.nodes.length) return this.layouts.get("architecture")!;
    if (spec.roadmap?.length) return this.layouts.get("roadmap")!;
    if (spec.quote) return this.layouts.get("quote")!;
    if (spec.custom?.length) return this.layouts.get("custom")!;
    if (spec.bullets?.length || spec.body || spec.visual) return this.layouts.get("text-image")!;
    return this.layouts.get("section")!;
  }

  public render(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): LayoutFallback | undefined {
    const id = spec.layout ?? spec.kind;
    const renderer = this.layouts.get(id);
    if (renderer) {
      renderer(writer, spec, context);
      return undefined;
    }
    if (this.strict) throw new Error(`Unknown layout: ${id}`);
    const fallback = this.fallbackFor(spec);
    fallback(writer, spec, context);
    return {
      slide: context.slideNumber,
      requested: id,
      used: [...this.layouts.entries()].find(([, candidate]) => candidate === fallback)?.[0] ?? "section",
    };
  }

  public ids(): string[] {
    return [...this.layouts.keys()];
  }

  private registerDefaults(): void {
    this.register("title", renderTitle)
      .register("section", renderSection)
      .register("executive-summary", renderSummary)
      .register("text-image", renderTextImage)
      .register("comparison", renderComparison)
      .register("timeline", (writer, spec, context) => renderTimeline(writer, spec, context, this.diagrams))
      .register("process", (writer, spec, context) => renderProcess(writer, spec, context, this.diagrams))
      .register("architecture", (writer, spec, context) => renderArchitecture(writer, spec, context, this.diagrams))
      .register("table", renderTable)
      .register("chart", (writer, spec, context) => renderChart(writer, spec, context, this.charts))
      .register("kpi", renderKpi)
      .register("quote", renderQuote)
      .register("roadmap", renderRoadmap)
      .register("closing", renderClosing)
      .register("custom", renderCustom);
  }
}
