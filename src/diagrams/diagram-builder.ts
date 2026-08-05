import type { ArchitectureSpec, ProcessStep, SlideAgentConfig, TimelineItem } from "../types/index.js";
import type { Frame } from "../components/element-writer.js";
import { ElementWriter } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import { Grid } from "../design/grid.js";
import { resolveTokens, type DeckTokens } from "../design/tokens.js";
import { emphasisField, ensureContrast, foregroundOn, requiredContrast } from "../utils/color.js";

function readable(color: string, field: string, fontSize: number, bold = false): string {
  return ensureContrast(color, field, requiredContrast(fontSize, bold));
}

export class DiagramBuilder {
  private readonly tokens: DeckTokens;
  private readonly grid: Grid;

  public constructor(private readonly config: SlideAgentConfig, tokens?: DeckTokens, grid?: Grid) {
    this.tokens = tokens ?? resolveTokens(config);
    this.grid = grid ?? new Grid(config.dimensions, this.tokens);
  }

  private get nodeShape(): string {
    return this.tokens.radius.soft > 0 ? Shapes.roundRect : Shapes.rect;
  }

  public addProcess(writer: ElementWriter, steps: ProcessStep[], frame: Frame): void {
    const { tokens, grid } = this;
    const cells = grid.flow(frame, Math.max(steps.length, 1), tokens.space.md);
    const nodeHeight = Math.min(frame.h, tokens.type.body / 72 * 8);
    const nodeY = frame.y + Math.max(0, (frame.h - nodeHeight) / 2);

    // Connectors first so nodes paint over them, matching the guidance the
    // authoring contract gives models.
    for (let index = 0; index < cells.length - 1; index += 1) {
      const from = cells[index]!;
      const to = cells[index + 1]!;
      writer.addConnector(`process-connector-${index + 1}`, {
        x: from.x + from.w,
        y: nodeY + nodeHeight / 2,
      }, {
        x: to.x,
        y: nodeY + nodeHeight / 2,
      }, { color: tokens.palette.accentAlt, width: tokens.stroke.regular, role: "connector" });
    }

    steps.forEach((step, index) => {
      const cell = cells[index]!;
      const panel = index === 0 ? tokens.palette.accentSoft : tokens.palette.surface;
      writer.addShape(`process-step-${index + 1}`, this.nodeShape, { x: cell.x, y: nodeY, w: cell.w, h: nodeHeight }, {
        fill: panel,
        lineColor: index === 0 ? tokens.palette.accent : tokens.palette.rule,
        lineWidth: tokens.stroke.regular,
        radius: tokens.radius.soft,
        role: "diagram-node",
        intentionalOverlap: true,
      });
      const inner = grid.inset({ x: cell.x, y: nodeY, w: cell.w, h: nodeHeight }, tokens.space.sm);
      const indexHeight = tokens.type.micro / 72 * 1.7;
      writer.addText(`process-number-${index + 1}`, String(index + 1).padStart(2, "0"), {
        ...inner,
        h: indexHeight,
      }, {
        fontSize: tokens.type.micro,
        bold: true,
        color: readable(tokens.palette.accent, panel, tokens.type.micro, true),
        role: "index",
      });
      const titleHeight = tokens.type.subheading / 72 * 1.5;
      writer.addText(`process-title-${index + 1}`, step.title, {
        ...inner,
        y: inner.y + indexHeight + tokens.space.xs,
        h: titleHeight,
      }, {
        fontSize: tokens.type.subheading,
        bold: true,
        color: readable(tokens.palette.ink, panel, tokens.type.subheading, true),
        fit: "shrink",
        role: "diagram-label",
      });
      const detail = step.detail ?? step.owner;
      if (detail) {
        const detailTop = inner.y + indexHeight + titleHeight + tokens.space.sm;
        writer.addText(`process-detail-${index + 1}`, detail, {
          ...inner,
          y: detailTop,
          h: Math.max(tokens.space.md, inner.y + inner.h - detailTop),
        }, {
          fontSize: tokens.type.body,
          color: readable(tokens.palette.muted, panel, tokens.type.body),
          role: "diagram-label",
        });
      }
    });
  }

  public addTimeline(writer: ElementWriter, items: TimelineItem[], frame: Frame): void {
    const { tokens, grid } = this;
    const cells = grid.divide(frame, Math.max(items.length, 1), 0);
    const lineY = frame.y + frame.h * 0.32;
    const dot = tokens.space.sm;

    writer.addConnector("timeline-rule", { x: frame.x, y: lineY }, { x: frame.x + frame.w, y: lineY }, {
      arrow: false,
      color: tokens.palette.rule,
      width: tokens.stroke.regular,
      role: "rule",
    });

    items.forEach((item, index) => {
      const cell = cells[index]!;
      const centre = cell.x + cell.w / 2;
      writer.addText(`timeline-label-${index + 1}`, item.label, {
        x: cell.x,
        y: lineY - tokens.space.md - tokens.type.micro / 72 * 1.7,
        w: cell.w,
        h: tokens.type.micro / 72 * 1.7,
      }, {
        fontSize: tokens.type.micro,
        bold: true,
        color: readable(tokens.palette.accent, tokens.palette.background, tokens.type.micro, true),
        align: "center",
        role: "eyebrow",
      });
      writer.addShape(`timeline-node-${index + 1}`, Shapes.ellipse, {
        x: centre - dot / 2,
        y: lineY - dot / 2,
        w: dot,
        h: dot,
      }, { fill: tokens.palette.accent, lineWidth: 0, role: "diagram-node" });

      const titleTop = lineY + tokens.space.md;
      const titleHeight = tokens.type.subheading / 72 * 1.5;
      writer.addText(`timeline-title-${index + 1}`, item.title, {
        x: cell.x,
        y: titleTop,
        w: cell.w,
        h: titleHeight,
      }, {
        fontSize: tokens.type.subheading,
        bold: true,
        align: "center",
        color: readable(tokens.palette.ink, tokens.palette.background, tokens.type.subheading, true),
        fit: "shrink",
        role: "diagram-label",
      });
      if (item.detail) {
        const detailTop = titleTop + titleHeight + tokens.space.xs;
        writer.addText(`timeline-detail-${index + 1}`, item.detail, {
          x: cell.x,
          y: detailTop,
          w: cell.w,
          h: Math.max(tokens.space.md, frame.y + frame.h - detailTop),
        }, {
          fontSize: tokens.type.body,
          color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.body),
          align: "center",
          role: "diagram-label",
        });
      }
    });
  }

  public addArchitecture(writer: ElementWriter, architecture: ArchitectureSpec, frame: Frame): void {
    const { tokens, grid } = this;
    const nodes = architecture.nodes.slice(0, 9);
    if (nodes.length === 0) return;
    const horizontal = architecture.direction !== "vertical";
    const columns = horizontal ? nodes.length : Math.min(3, nodes.length);
    const rows = horizontal ? 1 : Math.ceil(nodes.length / columns);

    const columnCells = grid.flow(frame, columns, tokens.space.md);
    const rowHeight = (frame.h - tokens.space.lg * Math.max(0, rows - 1)) / rows;
    const nodeHeight = Math.min(rowHeight, tokens.type.body / 72 * 6);

    const positions = new Map<string, Frame>();
    nodes.forEach((node, index) => {
      const column = horizontal ? index : index % columns;
      const row = horizontal ? 0 : Math.floor(index / columns);
      const cell = columnCells[column]!;
      positions.set(node.id, {
        x: cell.x,
        y: frame.y + row * (rowHeight + tokens.space.lg) + (rowHeight - nodeHeight) / 2,
        w: cell.w,
        h: nodeHeight,
      });
    });

    architecture.edges.forEach((edge, index) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return;
      writer.addConnector(`architecture-edge-${index + 1}`, {
        x: horizontal ? from.x + from.w : from.x + from.w / 2,
        y: horizontal ? from.y + from.h / 2 : from.y + from.h,
      }, {
        x: horizontal ? to.x : to.x + to.w / 2,
        y: horizontal ? to.y + to.h / 2 : to.y,
      }, { color: tokens.palette.accentAlt, width: tokens.stroke.regular, role: "connector" });
    });

    nodes.forEach((node, index) => {
      const position = positions.get(node.id)!;
      const field = emphasisField(this.config);
      const panel = node.emphasis ? field : tokens.palette.surface;
      writer.addShape(`architecture-node-${index + 1}`, this.nodeShape, position, {
        fill: panel,
        lineColor: node.emphasis ? field : tokens.palette.rule,
        lineWidth: tokens.stroke.regular,
        radius: tokens.radius.soft,
        role: "diagram-node",
        intentionalOverlap: true,
      });
      writer.addText(`architecture-label-${index + 1}`, node.label, grid.inset(position, tokens.space.sm), {
        fontSize: tokens.type.body,
        bold: true,
        align: "center",
        valign: "middle",
        color: readable(node.emphasis ? foregroundOn(field, this.config) : tokens.palette.ink, panel, tokens.type.body, true),
        fill: panel,
        fit: "shrink",
        role: "diagram-label",
      });
    });
  }
}
