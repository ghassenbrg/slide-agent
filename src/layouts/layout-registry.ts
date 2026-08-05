import { ChartBuilder } from "../charts/chart-builder.js";
import { ElementWriter } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import { DiagramBuilder } from "../diagrams/diagram-builder.js";
import { Grid, type Rect } from "../design/grid.js";
import { densityBudget, resolveTokens, type DeckTokens } from "../design/tokens.js";
import type { LayoutContext, SlideAgentConfig, SlideSpec } from "../types/index.js";
import { accentForegroundOn, emphasisField, ensureContrast, foregroundOn, requiredContrast, secondaryForegroundOn } from "../utils/color.js";
import { estimatedLineCount } from "../validation/manifest-validator.js";

export type LayoutRenderer = (writer: ElementWriter, spec: SlideSpec, context: LayoutContext) => void;

export interface LayoutFallback {
  slide: number;
  requested: string;
  used: string;
}

/** Everything a built-in layout needs, derived once per deck. */
interface LayoutSystem {
  grid: Grid;
  tokens: DeckTokens;
  config: SlideAgentConfig;
}

/** Two lines of title still clear the content band on every supported format. */
const MAXIMUM_TITLE_LINES = 2;

function readable(color: string, field: string, fontSize: number, bold = false): string {
  return ensureContrast(color, field, requiredContrast(fontSize, bold));
}

/**
 * Sizes the title band to the title. A fixed box held exactly one line at the
 * legibility minimum, so any longer title reported an overflow that no repair
 * pass could resolve and collided with the rule beneath it.
 */
function addHeader(writer: ElementWriter, spec: SlideSpec, system: LayoutSystem): Rect {
  const { grid, tokens } = system;
  const fontSize = tokens.type.title;
  const lines = Math.min(MAXIMUM_TITLE_LINES, estimatedLineCount(spec.title, grid.safe.w, fontSize));
  const band = grid.titleBand(lines, fontSize);
  writer.addText("slide-title", spec.title, band, {
    fontSize,
    fontFace: tokens.fonts.heading,
    bold: true,
    color: readable(tokens.palette.ink, tokens.palette.background, fontSize, true),
    role: "title",
    fit: "shrink",
  });
  writer.addShape("title-rule", Shapes.line, {
    x: band.x,
    y: band.y + band.h + tokens.space.xs,
    w: grid.columnWidth * 0.6,
    h: 0,
  }, {
    fill: readable(tokens.palette.accent, tokens.palette.background, tokens.type.body),
    lineColor: readable(tokens.palette.accent, tokens.palette.background, tokens.type.body),
    lineWidth: tokens.stroke.bold,
    role: "rule",
  });
  return grid.contentBelow({ ...band, h: band.h + tokens.space.xs });
}

function addFooter(writer: ElementWriter, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens, config } = system;
  if (!config.generation.includeSlideNumbers) return;
  const footer = grid.footer;
  writer.addText("slide-number", String(context.slideNumber).padStart(2, "0"), {
    x: footer.x + footer.w - grid.columnWidth * 0.5,
    y: footer.y,
    w: grid.columnWidth * 0.5,
    h: footer.h,
  }, {
    fontSize: tokens.type.caption,
    color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.caption),
    align: "right",
    role: "footer",
  });
}

/**
 * A generated stand-in when a slide wants a visual and none was supplied. It
 * follows the deck's geometry token so a sharp deck does not get soft circles.
 */
function addAbstractVisual(writer: ElementWriter, frame: Rect, system: LayoutSystem): void {
  const { tokens } = system;
  const field = emphasisField(system.config);
  const foreground = foregroundOn(field, system.config);
  writer.addShape("visual-field", tokens.geometry === "sharp" ? Shapes.rect : Shapes.roundRect, frame, {
    fill: field,
    lineWidth: 0,
    radius: tokens.radius.soft,
    role: "visual-background",
    intentionalOverlap: true,
  });
  const motif = tokens.geometry === "sharp" ? Shapes.rect : Shapes.ellipse;
  const size = Math.min(frame.w, frame.h) * 0.62;
  writer.addShape("visual-motif-large", motif, {
    x: frame.x + frame.w * 0.12,
    y: frame.y + frame.h * 0.1,
    w: size,
    h: size,
  }, { fill: tokens.palette.accentAlt, transparency: 20, lineWidth: 0, role: "decorative", intentionalOverlap: true });
  writer.addShape("visual-motif-small", motif, {
    x: frame.x + frame.w * 0.46,
    y: frame.y + frame.h * 0.44,
    w: size * 0.55,
    h: size * 0.55,
  }, { fill: tokens.palette.accent, transparency: 8, lineWidth: 0, role: "decorative", intentionalOverlap: true });
  writer.addConnector("visual-axis", {
    x: frame.x + frame.w * 0.15,
    y: frame.y + frame.h * 0.8,
  }, {
    x: frame.x + frame.w * 0.85,
    y: frame.y + frame.h * 0.24,
  }, { color: foreground, width: tokens.stroke.regular, arrow: false, role: "decorative" });
}

function renderTitle(writer: ElementWriter, spec: SlideSpec, _context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens } = system;
  const safe = grid.safe;
  writer.addShape("title-accent", Shapes.rect, {
    x: 0,
    y: 0,
    w: tokens.space.md,
    h: grid.height,
  }, { fill: tokens.palette.accent, lineWidth: 0, role: "accent" });

  const { primary, secondary } = grid.split(safe, grid.columns >= 12 ? 0.66 : 0.72, "left");
  let cursor = primary.y + tokens.space.md;

  writer.addText("deck-label", spec.sectionLabel ?? "PRESENTATION", {
    x: primary.x,
    y: cursor,
    w: primary.w,
    h: tokens.type.caption / 72 * 1.6,
  }, {
    fontSize: tokens.type.caption,
    bold: true,
    color: readable(tokens.palette.accent, tokens.palette.background, tokens.type.caption, true),
    role: "eyebrow",
  });
  cursor += tokens.type.caption / 72 * 1.6 + tokens.space.lg;

  const titleLines = Math.min(4, estimatedLineCount(spec.title, primary.w, tokens.type.display));
  const titleHeight = titleLines * (tokens.type.display / 72) * 1.15;
  writer.addText("deck-title", spec.title, { x: primary.x, y: cursor, w: primary.w, h: titleHeight }, {
    fontSize: tokens.type.display,
    fontFace: tokens.fonts.heading,
    bold: true,
    color: readable(tokens.palette.ink, tokens.palette.background, tokens.type.display, true),
    valign: "top",
    role: "title",
  });
  cursor += titleHeight + tokens.space.lg;

  if (spec.subtitle) {
    writer.addText("deck-subtitle", spec.subtitle, {
      x: primary.x,
      y: cursor,
      w: primary.w * 0.86,
      h: Math.min(safe.y + safe.h - cursor, tokens.type.lead / 72 * 3),
    }, {
      fontSize: tokens.type.lead,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.lead),
      role: "subtitle",
    });
  }

  // Motifs live in the secondary column so they can never sit under the title.
  const motif = tokens.geometry === "sharp" ? Shapes.rect : Shapes.ellipse;
  const motifSize = Math.min(secondary.w, safe.h * 0.34);
  writer.addShape("title-motif-one", motif, {
    x: secondary.x + secondary.w - motifSize,
    y: safe.y + safe.h * 0.08,
    w: motifSize,
    h: motifSize,
  }, { fill: tokens.palette.accentAlt, transparency: 10, lineWidth: 0, role: "decorative" });
  writer.addShape("title-motif-two", motif, {
    x: secondary.x + secondary.w - motifSize * 1.25,
    y: safe.y + safe.h * 0.34,
    w: motifSize * 1.2,
    h: motifSize * 1.2,
  }, { fill: tokens.palette.accentSoft, lineWidth: 0, role: "decorative", intentionalOverlap: true });
}

function renderSection(writer: ElementWriter, spec: SlideSpec, _context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens, config } = system;
  const field = emphasisField(config);
  const foreground = foregroundOn(field, config);
  const secondary = secondaryForegroundOn(field, config);
  const accent = accentForegroundOn(field, config);
  writer.slide.background = { color: field };
  const safe = grid.safe;

  writer.addText("section-label", spec.sectionLabel ?? "SECTION", {
    x: safe.x,
    y: safe.y + tokens.space.md,
    w: safe.w * 0.4,
    h: tokens.type.caption / 72 * 1.6,
  }, { fontSize: tokens.type.caption, bold: true, color: readable(accent, field, tokens.type.caption, true), fill: field, role: "eyebrow" });

  const titleHeight = Math.min(3, estimatedLineCount(spec.title, safe.w * 0.86, tokens.type.display)) * (tokens.type.display / 72) * 1.15;
  writer.addText("section-title", spec.title, {
    x: safe.x,
    y: safe.y + safe.h * 0.32,
    w: safe.w * 0.86,
    h: titleHeight,
  }, {
    fontSize: tokens.type.display,
    fontFace: tokens.fonts.heading,
    bold: true,
    color: readable(foreground, field, tokens.type.display, true),
    fill: field,
    role: "title",
  });

  const supporting = spec.subtitle ?? spec.body;
  if (supporting) {
    writer.addText("section-subtitle", supporting, {
      x: safe.x,
      y: safe.y + safe.h * 0.32 + titleHeight + tokens.space.md,
      w: safe.w * 0.62,
      h: tokens.type.lead / 72 * 2.4,
    }, { fontSize: tokens.type.lead, color: readable(secondary, field, tokens.type.lead), fill: field, role: "subtitle" });
  }
}

function renderSummary(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens } = system;
  const content = addHeader(writer, spec, system);
  const { primary, secondary } = grid.split(content, 0.34, "left");

  if (spec.body) {
    writer.addText("summary-lead", spec.body, { ...primary, h: Math.min(primary.h, tokens.type.subheading / 72 * 6) }, {
      fontSize: tokens.type.subheading,
      fontFace: tokens.fonts.heading,
      bold: true,
      color: readable(tokens.palette.ink, tokens.palette.background, tokens.type.subheading, true),
      role: "lead",
    });
  }

  const bullets = (spec.bullets ?? []).slice(0, densityBudget(tokens).bullets);
  const indexWidth = grid.columnWidth * 0.4;
  const rows = grid.packRows(
    secondary,
    bullets.map((bullet) => {
      const lines = estimatedLineCount(bullet, secondary.w - indexWidth - tokens.space.sm, tokens.type.body);
      return lines * (tokens.type.body / 72) * 1.35 + tokens.space.md;
    }),
    tokens.space.md,
  );
  bullets.forEach((bullet, index) => {
    const row = rows[index]!;
    writer.addText(`summary-index-${index + 1}`, String(index + 1).padStart(2, "0"), {
      x: row.x,
      y: row.y,
      w: indexWidth,
      h: tokens.type.caption / 72 * 1.6,
    }, {
      fontSize: tokens.type.caption,
      bold: true,
      color: readable(tokens.palette.accent, tokens.palette.background, tokens.type.caption, true),
      role: "index",
    });
    writer.addText(`summary-point-${index + 1}`, bullet, {
      x: row.x + indexWidth + tokens.space.sm,
      y: row.y,
      w: row.w - indexWidth - tokens.space.sm,
      h: row.h - tokens.space.sm,
    }, {
      fontSize: tokens.type.body,
      bold: true,
      color: readable(tokens.palette.ink, tokens.palette.background, tokens.type.body, true),
      role: "body",
    });
    writer.addShape(`summary-rule-${index + 1}`, Shapes.line, {
      x: row.x,
      y: row.y + row.h - tokens.space.xs,
      w: row.w,
      h: 0,
    }, { fill: tokens.palette.rule, lineColor: tokens.palette.rule, lineWidth: tokens.stroke.hairline, role: "rule" });
  });
  addFooter(writer, context, system);
}

function renderTextImage(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens } = system;
  const content = addHeader(writer, spec, system);
  const textOnLeft = spec.visual?.position !== "left";
  const { primary: textRegion, secondary: visualRegion } = grid.split(content, 0.48, textOnLeft ? "left" : "right");

  let cursor = textRegion.y;
  if (spec.body) {
    const height = Math.min(textRegion.h * 0.4, tokens.type.lead / 72 * 4);
    writer.addText("body-copy", spec.body, { x: textRegion.x, y: cursor, w: textRegion.w, h: height }, {
      fontSize: tokens.type.lead,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.lead),
      role: "body",
    });
    cursor += height + tokens.space.md;
  }
  const bullets = (spec.bullets ?? []).slice(0, densityBudget(tokens).bullets);
  if (bullets.length > 0) {
    writer.addBullets("body-bullet", bullets, {
      x: textRegion.x,
      y: cursor,
      w: textRegion.w,
      h: Math.max(tokens.space.xl, textRegion.y + textRegion.h - cursor),
    }, tokens.type.body);
  }

  const captionHeight = spec.visual?.caption ? tokens.type.caption / 72 * 1.8 : 0;
  const visualFrame = { ...visualRegion, h: visualRegion.h - captionHeight };
  if (spec.visual?.path) writer.addImage("hero-image", spec.visual.path, spec.visual.alt, visualFrame);
  else addAbstractVisual(writer, visualFrame, system);
  if (spec.visual?.caption) {
    writer.addText("image-caption", spec.visual.caption, {
      x: visualRegion.x,
      y: visualFrame.y + visualFrame.h + tokens.space.xs,
      w: visualRegion.w,
      h: captionHeight,
    }, {
      fontSize: tokens.type.caption,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.caption),
      role: "caption",
    });
  }
  addFooter(writer, context, system);
}

function renderComparison(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens, config } = system;
  const content = addHeader(writer, spec, system);
  const columns = (spec.comparison ?? []).slice(0, densityBudget(tokens).columns);
  const cells = grid.flow(content, Math.max(1, columns.length));

  columns.forEach((column, index) => {
    const cell = cells[index]!;
    const emphasized = column.emphasis === true;
    const field = emphasisField(config);
    const panel = emphasized ? field : tokens.palette.surface;
    writer.addShape(`comparison-panel-${index + 1}`, tokens.radius.soft > 0 ? Shapes.roundRect : Shapes.rect, cell, {
      fill: panel,
      lineColor: emphasized ? field : tokens.palette.rule,
      lineWidth: tokens.stroke.regular,
      radius: tokens.radius.soft,
      role: "panel",
      intentionalOverlap: true,
    });
    const inner = grid.inset(cell, tokens.space.md);
    writer.addText(`comparison-heading-${index + 1}`, column.heading, {
      x: inner.x,
      y: inner.y,
      w: inner.w,
      h: tokens.type.subheading / 72 * 1.6,
    }, {
      fontSize: tokens.type.subheading,
      bold: true,
      color: readable(emphasized ? foregroundOn(field, config) : tokens.palette.ink, panel, tokens.type.subheading, true),
      fill: panel,
      role: "subheading",
    });

    const points = column.points.slice(0, densityBudget(tokens).bullets);
    const listTop = inner.y + tokens.type.subheading / 72 * 1.6 + tokens.space.md;
    const rows = grid.stack({ ...inner, y: listTop, h: Math.max(tokens.space.md, inner.y + inner.h - listTop) }, Math.max(1, points.length), tokens.space.xs);
    points.forEach((point, pointIndex) => {
      const row = rows[pointIndex]!;
      writer.addText(`comparison-point-${index + 1}-${pointIndex + 1}`, point, row, {
        fontSize: tokens.type.body,
        color: readable(emphasized ? secondaryForegroundOn(field, config) : tokens.palette.muted, panel, tokens.type.body),
        fill: panel,
        role: "body",
      });
    });
  });
  addFooter(writer, context, system);
}

function renderTimeline(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem, diagrams: DiagramBuilder): void {
  const content = addHeader(writer, spec, system);
  diagrams.addTimeline(writer, spec.timeline ?? [], content);
  addFooter(writer, context, system);
}

function renderProcess(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem, diagrams: DiagramBuilder): void {
  const { tokens } = system;
  let content = addHeader(writer, spec, system);
  if (spec.body) {
    const height = tokens.type.lead / 72 * 1.8;
    writer.addText("process-lead", spec.body, { ...content, h: height }, {
      fontSize: tokens.type.lead,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.lead),
      role: "lead",
    });
    content = { ...content, y: content.y + height + tokens.space.md, h: content.h - height - tokens.space.md };
  }
  diagrams.addProcess(writer, (spec.process ?? []).slice(0, densityBudget(tokens).columns + 1), content);
  addFooter(writer, context, system);
}

function renderArchitecture(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem, diagrams: DiagramBuilder): void {
  const { tokens } = system;
  let content = addHeader(writer, spec, system);
  if (spec.body) {
    const height = tokens.type.body / 72 * 1.8;
    writer.addText("architecture-lead", spec.body, { ...content, h: height }, {
      fontSize: tokens.type.body,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.body),
      role: "body",
    });
    content = { ...content, y: content.y + height + tokens.space.md, h: content.h - height - tokens.space.md };
  }
  diagrams.addArchitecture(writer, spec.architecture ?? { nodes: [], edges: [] }, content);
  addFooter(writer, context, system);
}

function renderTable(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { tokens } = system;
  let content = addHeader(writer, spec, system);
  if (spec.body) {
    const height = tokens.type.body / 72 * 1.8;
    writer.addText("table-lead", spec.body, { ...content, h: height }, {
      fontSize: tokens.type.body,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.body),
      role: "body",
    });
    content = { ...content, y: content.y + height + tokens.space.md, h: content.h - height - tokens.space.md };
  }
  if (spec.table) writer.addTable("data-table", spec.table, content);
  addFooter(writer, context, system);
}

function renderChart(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem, charts: ChartBuilder): void {
  const { grid, tokens } = system;
  const content = addHeader(writer, spec, system);
  const hasCommentary = Boolean(spec.body || spec.bullets?.length);
  const region = hasCommentary ? grid.split(content, 0.64, "left") : undefined;
  const chartFrame = region?.primary ?? content;

  if (spec.chart) charts.add(writer, "data-chart", spec.chart, chartFrame);

  if (region) {
    let cursor = region.secondary.y;
    if (spec.body) {
      const height = tokens.type.subheading / 72 * 3;
      writer.addText("chart-insight", spec.body, { ...region.secondary, y: cursor, h: height }, {
        fontSize: tokens.type.subheading,
        bold: true,
        color: readable(tokens.palette.ink, tokens.palette.background, tokens.type.subheading, true),
        role: "insight",
      });
      cursor += height + tokens.space.md;
    }
    const bullets = (spec.bullets ?? []).slice(0, 3);
    if (bullets.length > 0) {
      writer.addBullets("chart-bullet", bullets, {
        x: region.secondary.x,
        y: cursor,
        w: region.secondary.w,
        h: Math.max(tokens.space.lg, region.secondary.y + region.secondary.h - cursor),
      }, tokens.type.body);
    }
  }
  addFooter(writer, context, system);
}

function renderKpi(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens } = system;
  const content = addHeader(writer, spec, system);
  const kpis = (spec.kpis ?? []).slice(0, densityBudget(tokens).columns + 1);
  const cells = grid.flow(content, Math.max(1, kpis.length));

  kpis.forEach((kpi, index) => {
    const cell = cells[index]!;
    const panel = index === 0 ? tokens.palette.accentSoft : tokens.palette.surface;
    writer.addShape(`kpi-panel-${index + 1}`, tokens.radius.soft > 0 ? Shapes.roundRect : Shapes.rect, cell, {
      fill: panel,
      lineColor: index === 0 ? tokens.palette.accent : tokens.palette.rule,
      lineWidth: tokens.stroke.regular,
      radius: tokens.radius.soft,
      role: "panel",
      intentionalOverlap: true,
    });
    const inner = grid.inset(cell, tokens.space.md);
    const labelHeight = tokens.type.caption / 72 * 1.7;
    writer.addText(`kpi-label-${index + 1}`, kpi.label.toUpperCase(), { ...inner, h: labelHeight }, {
      fontSize: tokens.type.caption,
      bold: true,
      color: readable(tokens.palette.muted, panel, tokens.type.caption, true),
      fill: panel,
      role: "eyebrow",
    });
    const valueHeight = tokens.type.display / 72 * 1.2;
    writer.addText(`kpi-value-${index + 1}`, kpi.value, {
      ...inner,
      y: inner.y + labelHeight + tokens.space.sm,
      h: Math.min(valueHeight, inner.h - labelHeight - tokens.space.sm),
    }, {
      fontSize: tokens.type.display,
      fontFace: tokens.fonts.heading,
      bold: true,
      color: readable(tokens.palette.ink, panel, tokens.type.display, true),
      fill: panel,
      fit: "shrink",
      role: "kpi-value",
    });
    if (kpi.detail) {
      const detailHeight = Math.min(tokens.type.body / 72 * 3, inner.h * 0.3);
      writer.addText(`kpi-detail-${index + 1}`, kpi.detail, {
        ...inner,
        y: inner.y + inner.h - detailHeight,
        h: detailHeight,
      }, {
        fontSize: tokens.type.body,
        color: readable(tokens.palette.muted, panel, tokens.type.body),
        fill: panel,
        role: "body",
      });
    }
  });
  addFooter(writer, context, system);
}

function renderQuote(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens } = system;
  const safe = grid.safe;
  writer.addText("quote-mark", "“", {
    x: safe.x,
    y: safe.y,
    w: tokens.type.display / 72 * 1.6,
    h: tokens.type.display / 72 * 1.6,
  }, {
    fontSize: Math.round(tokens.type.display * 1.4),
    color: tokens.palette.accent,
    fontFace: tokens.fonts.heading,
    role: "decorative",
  });

  const quoteText = spec.quote?.text ?? spec.title;
  const quoteWidth = safe.w * 0.84;
  const quoteHeight = Math.min(safe.h * 0.5, estimatedLineCount(quoteText, quoteWidth, tokens.type.subheading) * (tokens.type.subheading / 72) * 1.35);
  writer.addText("quote-text", quoteText, {
    x: safe.x + safe.w * 0.08,
    y: safe.y + safe.h * 0.28,
    w: quoteWidth,
    h: quoteHeight,
  }, {
    fontSize: Math.round(tokens.type.subheading * 1.25),
    fontFace: tokens.fonts.heading,
    bold: true,
    color: readable(tokens.palette.ink, tokens.palette.background, tokens.type.subheading, true),
    valign: "middle",
    align: "center",
    fit: "shrink",
    role: "quote",
  });
  if (spec.quote?.attribution) {
    writer.addText("quote-attribution", spec.quote.attribution, {
      x: safe.x + safe.w * 0.2,
      y: safe.y + safe.h * 0.28 + quoteHeight + tokens.space.md,
      w: safe.w * 0.6,
      h: tokens.type.caption / 72 * 1.8,
    }, {
      fontSize: tokens.type.caption,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.caption),
      align: "center",
      role: "attribution",
    });
  }
  addFooter(writer, context, system);
}

function renderRoadmap(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens } = system;
  const content = addHeader(writer, spec, system);
  const lanes = (spec.roadmap ?? []).slice(0, densityBudget(tokens).columns + 2);
  const rows = grid.stack(content, Math.max(1, lanes.length), tokens.space.sm);
  const labelWidth = grid.columnWidth * 1.2;

  lanes.forEach((lane, laneIndex) => {
    const row = rows[laneIndex]!;
    const panel = laneIndex === 0 ? tokens.palette.accentSoft : tokens.palette.surface;
    writer.addText(`roadmap-label-${laneIndex + 1}`, lane.label, {
      x: row.x,
      y: row.y + row.h / 2 - tokens.type.body / 72,
      w: labelWidth - tokens.space.sm,
      h: tokens.type.body / 72 * 1.8,
    }, {
      fontSize: tokens.type.body,
      bold: true,
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.body, true),
      role: "lane-label",
    });

    const track = { x: row.x + labelWidth, y: row.y, w: row.w - labelWidth, h: row.h };
    const items = grid.divide(track, Math.max(1, lane.items.length), tokens.space.xs);
    lane.items.forEach((item, itemIndex) => {
      const cell = items[itemIndex]!;
      writer.addShape(`roadmap-item-${laneIndex + 1}-${itemIndex + 1}`, tokens.radius.soft > 0 ? Shapes.roundRect : Shapes.rect, cell, {
        fill: panel,
        lineColor: laneIndex === 0 ? tokens.palette.accent : tokens.palette.rule,
        lineWidth: tokens.stroke.regular,
        radius: tokens.radius.soft,
        role: "roadmap-item",
        intentionalOverlap: true,
      });
      writer.addText(`roadmap-text-${laneIndex + 1}-${itemIndex + 1}`, item, grid.inset(cell, tokens.space.xs), {
        fontSize: tokens.type.body,
        bold: true,
        valign: "middle",
        color: readable(tokens.palette.ink, panel, tokens.type.body, true),
        fill: panel,
        fit: "shrink",
        role: "roadmap-label",
      });
    });
  });
  addFooter(writer, context, system);
}

function renderClosing(writer: ElementWriter, spec: SlideSpec, _context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens, config } = system;
  const field = emphasisField(config);
  const foreground = foregroundOn(field, config);
  const secondary = secondaryForegroundOn(field, config);
  const accent = accentForegroundOn(field, config);
  writer.slide.background = { color: field };
  const safe = grid.safe;
  const { primary, secondary: sidebar } = grid.split(safe, 0.6, "left");

  writer.addText("closing-label", "NEXT MOVE", {
    x: primary.x,
    y: safe.y + tokens.space.md,
    w: primary.w * 0.5,
    h: tokens.type.caption / 72 * 1.6,
  }, { fontSize: tokens.type.caption, bold: true, color: readable(accent, field, tokens.type.caption, true), fill: field, role: "eyebrow" });

  const titleHeight = Math.min(3, estimatedLineCount(spec.title, primary.w, tokens.type.title)) * (tokens.type.title / 72) * 1.2;
  writer.addText("closing-title", spec.title, {
    x: primary.x,
    y: safe.y + safe.h * 0.28,
    w: primary.w,
    h: titleHeight,
  }, {
    fontSize: tokens.type.title,
    fontFace: tokens.fonts.heading,
    bold: true,
    color: readable(foreground, field, tokens.type.title, true),
    fill: field,
    role: "title",
  });

  if (spec.subtitle) {
    writer.addText("closing-subtitle", spec.subtitle, {
      x: primary.x,
      y: safe.y + safe.h * 0.28 + titleHeight + tokens.space.md,
      w: primary.w * 0.9,
      h: tokens.type.lead / 72 * 2.2,
    }, { fontSize: tokens.type.lead, color: readable(secondary, field, tokens.type.lead), fill: field, role: "subtitle" });
  }

  const bullets = (spec.bullets ?? []).slice(0, 3);
  const rows = grid.stack({ ...sidebar, y: safe.y + safe.h * 0.32, h: safe.h * 0.5 }, Math.max(1, bullets.length), tokens.space.sm);
  bullets.forEach((bullet, index) => {
    writer.addText(`closing-action-${index + 1}`, `${String(index + 1).padStart(2, "0")}  ${bullet}`, rows[index]!, {
      fontSize: tokens.type.body,
      bold: true,
      color: readable(foreground, field, tokens.type.body, true),
      fill: field,
      role: "action",
    });
  });
}

function renderCustom(writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem): void {
  const { grid, tokens } = system;
  addHeader(writer, spec, system);
  for (const region of spec.custom ?? []) {
    const frame = grid.clamp({ x: region.x, y: region.y, w: region.w, h: region.h });
    if (region.type === "text") {
      writer.addText(region.id, region.text ?? "", frame, {
        fontSize: region.fontSize ?? tokens.type.body,
        ...(region.fill ? { fill: region.fill } : {}),
        role: "custom",
      });
    } else if (region.type === "shape") {
      writer.addShape(region.id, tokens.radius.soft > 0 ? Shapes.roundRect : Shapes.rect, frame, {
        ...(region.fill ? { fill: region.fill } : {}),
        radius: tokens.radius.soft,
        role: "custom",
      });
    } else if (region.imagePath) {
      writer.addImage(region.id, region.imagePath, region.text ?? region.id, frame);
    }
  }
  addFooter(writer, context, system);
}

export class LayoutRegistry {
  private readonly layouts = new Map<string, LayoutRenderer>();
  private diagrams: DiagramBuilder;
  private charts: ChartBuilder;
  private system: LayoutSystem;
  /** When true, an unregistered layout id throws instead of falling back. */
  public strict = false;

  public constructor(config: SlideAgentConfig) {
    this.system = LayoutRegistry.systemFor(config);
    this.diagrams = new DiagramBuilder(config, this.system.tokens, this.system.grid);
    this.charts = new ChartBuilder(config, this.system.tokens);
    this.registerDefaults();
  }

  private static systemFor(config: SlideAgentConfig, direction?: SlideSpec extends never ? never : Parameters<typeof resolveTokens>[1]): LayoutSystem {
    const tokens = resolveTokens(config, direction);
    return { tokens, grid: new Grid(config.dimensions, tokens), config };
  }

  public register(id: string, renderer: LayoutRenderer): this {
    if (!id.trim()) throw new Error("Layout id cannot be empty.");
    this.layouts.set(id, renderer);
    return this;
  }

  /** Refreshes the design system while retaining every registered renderer. */
  public configure(config: SlideAgentConfig, direction?: Parameters<typeof resolveTokens>[1]): this {
    this.system = LayoutRegistry.systemFor(config, direction);
    this.diagrams = new DiagramBuilder(config, this.system.tokens, this.system.grid);
    this.charts = new ChartBuilder(config, this.system.tokens);
    return this;
  }

  public get tokens(): DeckTokens {
    return this.system.tokens;
  }

  public get grid(): Grid {
    return this.system.grid;
  }

  /**
   * Picks the closest built-in renderer for an unregistered kind. The docs tell
   * models that `kind` is free-form metadata, which is only true when a canvas
   * is present; without this, an invented kind with no canvas threw
   * `Unknown layout` and failed the whole build.
   */
  private fallbackId(spec: SlideSpec): string {
    if (spec.chart) return "chart";
    if (spec.table) return "table";
    if (spec.kpis?.length) return "kpi";
    if (spec.comparison?.length) return "comparison";
    if (spec.timeline?.length) return "timeline";
    if (spec.process?.length) return "process";
    if (spec.architecture?.nodes.length) return "architecture";
    if (spec.roadmap?.length) return "roadmap";
    if (spec.quote) return "quote";
    if (spec.custom?.length) return "custom";
    if (spec.bullets?.length || spec.body || spec.visual) return "text-image";
    return "section";
  }

  public render(writer: ElementWriter, spec: SlideSpec, context: LayoutContext): LayoutFallback | undefined {
    const id = spec.layout ?? spec.kind;
    const renderer = this.layouts.get(id);
    if (renderer) {
      renderer(writer, spec, context);
      return undefined;
    }
    if (this.strict) throw new Error(`Unknown layout: ${id}`);
    const used = this.fallbackId(spec);
    this.layouts.get(used)!(writer, spec, context);
    return { slide: context.slideNumber, requested: id, used };
  }

  public ids(): string[] {
    return [...this.layouts.keys()];
  }

  private registerDefaults(): void {
    const withSystem = (renderer: (writer: ElementWriter, spec: SlideSpec, context: LayoutContext, system: LayoutSystem) => void): LayoutRenderer =>
      (writer, spec, context) => renderer(writer, spec, context, this.system);

    this.register("title", withSystem(renderTitle))
      .register("section", withSystem(renderSection))
      .register("executive-summary", withSystem(renderSummary))
      .register("text-image", withSystem(renderTextImage))
      .register("comparison", withSystem(renderComparison))
      .register("timeline", (writer, spec, context) => renderTimeline(writer, spec, context, this.system, this.diagrams))
      .register("process", (writer, spec, context) => renderProcess(writer, spec, context, this.system, this.diagrams))
      .register("architecture", (writer, spec, context) => renderArchitecture(writer, spec, context, this.system, this.diagrams))
      .register("table", withSystem(renderTable))
      .register("chart", (writer, spec, context) => renderChart(writer, spec, context, this.system, this.charts))
      .register("kpi", withSystem(renderKpi))
      .register("quote", withSystem(renderQuote))
      .register("roadmap", withSystem(renderRoadmap))
      .register("closing", withSystem(renderClosing))
      .register("custom", withSystem(renderCustom));
  }
}
