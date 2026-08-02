import type { ArchitectureSpec, ProcessStep, SlideAgentConfig, TimelineItem } from "../types/index.js";
import type { Frame } from "../components/element-writer.js";
import { ElementWriter } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import { emphasisField, foregroundOn } from "../utils/color.js";

export class DiagramBuilder {
  public constructor(private readonly config: SlideAgentConfig) {}

  public addProcess(writer: ElementWriter, steps: ProcessStep[], frame: Frame): void {
    const count = Math.max(steps.length, 1);
    const gap = 0.22;
    const width = (frame.w - gap * (count - 1)) / count;
    const centers = steps.map((_, index) => ({
      x: frame.x + index * (width + gap) + width / 2,
      y: frame.y + 1.1,
    }));
    for (let index = 0; index < centers.length - 1; index += 1) {
      writer.addConnector(`process-connector-${index + 1}`, {
        x: centers[index]!.x + width / 2 - 0.08,
        y: centers[index]!.y,
      }, {
        x: centers[index + 1]!.x - width / 2 + 0.08,
        y: centers[index + 1]!.y,
      }, { color: this.config.colors.accentAlt, width: 2 });
    }
    steps.forEach((step, index) => {
      const x = frame.x + index * (width + gap);
      writer.addShape(`process-step-${index + 1}`, Shapes.roundRect, {
        x,
        y: frame.y + 0.28,
        w: width,
        h: 1.72,
      }, {
        fill: index === 0 ? this.config.colors.accentSoft : this.config.colors.surface,
        lineColor: index === 0 ? this.config.colors.accent : this.config.colors.rule,
        lineWidth: 1.2,
        radius: 0.1,
        role: "diagram-node",
        intentionalOverlap: true,
      });
      writer.addText(`process-number-${index + 1}`, String(index + 1).padStart(2, "0"), {
        x: x + 0.2,
        y: frame.y + 0.48,
        w: width - 0.4,
        h: 0.28,
      }, { fontSize: 11, bold: true, color: this.config.colors.accent, role: "index" });
      writer.addText(`process-title-${index + 1}`, step.title, {
        x: x + 0.2,
        y: frame.y + 0.82,
        w: width - 0.4,
        h: 0.42,
      }, { fontSize: 19, bold: true, role: "diagram-label" });
      writer.addText(`process-detail-${index + 1}`, step.detail ?? step.owner ?? "", {
        x: x + 0.2,
        y: frame.y + 1.28,
        w: width - 0.4,
        h: 0.48,
      }, { fontSize: 16, color: this.config.colors.muted, role: "diagram-label" });
    });
  }

  public addTimeline(writer: ElementWriter, items: TimelineItem[], frame: Frame): void {
    const count = Math.max(items.length, 1);
    const step = frame.w / count;
    const lineY = frame.y + 1.35;
    writer.addConnector("timeline-rule", { x: frame.x, y: lineY }, { x: frame.x + frame.w, y: lineY }, {
      arrow: false,
      color: this.config.colors.rule,
      width: 2,
    });
    items.forEach((item, index) => {
      const x = frame.x + step * index + step / 2;
      writer.addShape(`timeline-node-${index + 1}`, Shapes.ellipse, {
        x: x - 0.09,
        y: lineY - 0.09,
        w: 0.18,
        h: 0.18,
      }, { fill: this.config.colors.accent, lineWidth: 0, role: "diagram-node" });
      writer.addText(`timeline-label-${index + 1}`, item.label, {
        x: x - step * 0.42,
        y: frame.y + 0.66,
        w: step * 0.84,
        h: 0.32,
      }, { fontSize: 11, bold: true, color: this.config.colors.accent, align: "center", role: "eyebrow" });
      writer.addText(`timeline-title-${index + 1}`, item.title, {
        x: x - step * 0.42,
        y: lineY + 0.35,
        w: step * 0.84,
        h: 0.38,
      }, { fontSize: 19, bold: true, align: "center", role: "diagram-label" });
      writer.addText(`timeline-detail-${index + 1}`, item.detail ?? "", {
        x: x - step * 0.42,
        y: lineY + 0.82,
        w: step * 0.84,
        h: 0.72,
      }, { fontSize: 16, color: this.config.colors.muted, align: "center", role: "diagram-label" });
    });
  }

  public addArchitecture(writer: ElementWriter, architecture: ArchitectureSpec, frame: Frame): void {
    const nodes = architecture.nodes.slice(0, 8);
    const horizontal = architecture.direction !== "vertical";
    const columns = horizontal ? nodes.length : Math.min(3, nodes.length);
    const rows = horizontal ? 1 : Math.ceil(nodes.length / columns);
    const gapX = 0.34;
    const gapY = 0.4;
    const nodeW = (frame.w - gapX * Math.max(0, columns - 1)) / Math.max(1, columns);
    const nodeH = Math.min(1.35, (frame.h - gapY * Math.max(0, rows - 1)) / Math.max(1, rows));
    const positions = new Map<string, Frame>();
    nodes.forEach((node, index) => {
      const column = horizontal ? index : index % columns;
      const row = horizontal ? 0 : Math.floor(index / columns);
      positions.set(node.id, {
        x: frame.x + column * (nodeW + gapX),
        y: frame.y + row * (nodeH + gapY) + (horizontal ? 0.8 : 0.15),
        w: nodeW,
        h: nodeH,
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
      }, { color: this.config.colors.accentAlt, width: 1.8 });
    });

    nodes.forEach((node, index) => {
      const position = positions.get(node.id)!;
      const field = emphasisField(this.config);
      const emphasizedText = foregroundOn(field, this.config);
      writer.addShape(`architecture-node-${index + 1}`, Shapes.roundRect, position, {
        fill: node.emphasis ? field : this.config.colors.surface,
        lineColor: node.emphasis ? field : this.config.colors.rule,
        lineWidth: 1.2,
        radius: 0.08,
        role: "diagram-node",
        intentionalOverlap: true,
      });
      writer.addText(`architecture-label-${index + 1}`, node.label, {
        x: position.x + 0.14,
        y: position.y + 0.22,
        w: position.w - 0.28,
        h: position.h - 0.44,
      }, {
        fontSize: 17,
        bold: true,
        align: "center",
        valign: "middle",
        color: node.emphasis ? emphasizedText : this.config.colors.ink,
        fill: node.emphasis ? field : this.config.colors.surface,
        role: "diagram-label",
      });
    });
  }
}
