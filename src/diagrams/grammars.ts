import { z } from "zod";

import type { ElementWriter, Frame } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import type { RenderContext, DiagramGrammar } from "../extensions.js";
import { ensureContrast, requiredContrast } from "../utils/color.js";

/**
 * Named diagram forms.
 *
 * A model can already draw anything with shapes and connectors, but that means
 * re-deriving routing, spacing, and label placement every time — and getting it
 * slightly wrong. These grammars take a description of the *relationship* and
 * handle the geometry, so the model spends its attention on what the diagram
 * argues rather than where the boxes go.
 */

function readable(color: string, field: string, fontSize: number, bold = false): string {
  return ensureContrast(color, field, requiredContrast(fontSize, bold));
}

function nodeShape(context: RenderContext): string {
  return context.tokens.radius.soft > 0 ? Shapes.roundRect : Shapes.rect;
}

// ---------------------------------------------------------------- layered

export const layeredSchema = z.object({
  layers: z.array(z.object({
    label: z.string(),
    items: z.array(z.string()).min(1),
    emphasis: z.boolean().optional(),
  })).min(2),
  /** Draws a downward arrow between consecutive layers. */
  flow: z.boolean().optional(),
});
export type LayeredSpec = z.infer<typeof layeredSchema>;

const layered: DiagramGrammar<LayeredSpec> = {
  id: "layered",
  description: "A stack of named layers, each holding several components. For architecture where the story is what sits on top of what.",
  render(writer, spec, frame, context) {
    const { tokens, grid } = context;
    const rows = grid.stack(frame, spec.layers.length, tokens.space.md);
    const labelWidth = Math.min(grid.columnWidth * 1.4, frame.w * 0.22);

    spec.layers.forEach((layer, layerIndex) => {
      const row = rows[layerIndex]!;
      const panel = layer.emphasis ? tokens.palette.accentSoft : tokens.palette.surface;
      writer.addText(`layer-label-${layerIndex + 1}`, layer.label, {
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
      const cells = grid.divide(track, layer.items.length, tokens.space.sm);
      layer.items.forEach((item, itemIndex) => {
        const cell = cells[itemIndex]!;
        writer.addShape(`layer-${layerIndex + 1}-item-${itemIndex + 1}`, nodeShape(context), cell, {
          fill: panel,
          lineColor: layer.emphasis ? tokens.palette.accent : tokens.palette.rule,
          lineWidth: tokens.stroke.regular,
          radius: tokens.radius.soft,
          role: "diagram-node",
          intentionalOverlap: true,
        });
        writer.addText(`layer-${layerIndex + 1}-label-${itemIndex + 1}`, item, grid.inset(cell, tokens.space.xs), {
          fontSize: tokens.type.body,
          align: "center",
          valign: "middle",
          bold: true,
          color: readable(tokens.palette.ink, panel, tokens.type.body, true),
          fill: panel,
          fit: "shrink",
          role: "diagram-label",
        });
      });

      if (spec.flow && layerIndex < rows.length - 1) {
        const next = rows[layerIndex + 1]!;
        writer.addConnector(`layer-flow-${layerIndex + 1}`, {
          x: track.x + track.w / 2,
          y: row.y + row.h,
        }, {
          x: track.x + track.w / 2,
          y: next.y,
        }, { color: tokens.palette.accentAlt, width: tokens.stroke.regular, role: "connector" });
      }
    });
  },
};

// --------------------------------------------------------------- swimlane

export const swimlaneSchema = z.object({
  lanes: z.array(z.object({
    label: z.string(),
    steps: z.array(z.object({
      label: z.string(),
      /** 0-based column, so steps can align across lanes. */
      column: z.number().int().nonnegative().optional(),
      emphasis: z.boolean().optional(),
    })).min(1),
  })).min(1),
  columns: z.number().int().positive().optional(),
});
export type SwimlaneSpec = z.infer<typeof swimlaneSchema>;

const swimlane: DiagramGrammar<SwimlaneSpec> = {
  id: "swimlane",
  description: "Steps arranged in columns across labelled lanes. For a process where who does each step matters as much as the order.",
  render(writer, spec, frame, context) {
    const { tokens, grid } = context;
    const columns = spec.columns ?? Math.max(...spec.lanes.map((lane) => lane.steps.length));
    const rows = grid.stack(frame, spec.lanes.length, tokens.space.sm);
    const labelWidth = Math.min(grid.columnWidth * 1.4, frame.w * 0.2);

    spec.lanes.forEach((lane, laneIndex) => {
      const row = rows[laneIndex]!;
      // A tinted band makes the lane readable as one unit.
      writer.addShape(`swimlane-band-${laneIndex + 1}`, Shapes.rect, row, {
        fill: laneIndex % 2 === 0 ? tokens.palette.surface : tokens.palette.background,
        lineColor: tokens.palette.rule,
        lineWidth: tokens.stroke.hairline,
        role: "lane",
        intentionalOverlap: true,
      });
      writer.addText(`swimlane-label-${laneIndex + 1}`, lane.label, {
        x: row.x + tokens.space.sm,
        y: row.y + row.h / 2 - tokens.type.caption / 72,
        w: labelWidth - tokens.space.md,
        h: tokens.type.caption / 72 * 1.8,
      }, {
        fontSize: tokens.type.caption,
        bold: true,
        color: readable(tokens.palette.muted, tokens.palette.surface, tokens.type.caption, true),
        fit: "shrink",
        role: "lane-label",
      });

      const track = { x: row.x + labelWidth, y: row.y, w: row.w - labelWidth, h: row.h };
      const cells = grid.divide(track, columns, tokens.space.sm);
      lane.steps.forEach((step, stepIndex) => {
        const cell = cells[Math.min(step.column ?? stepIndex, columns - 1)]!;
        const box = grid.inset(cell, tokens.space.xs);
        const panel = step.emphasis ? tokens.palette.accentSoft : tokens.palette.surface;
        writer.addShape(`swimlane-step-${laneIndex + 1}-${stepIndex + 1}`, nodeShape(context), box, {
          fill: panel,
          lineColor: step.emphasis ? tokens.palette.accent : tokens.palette.rule,
          lineWidth: tokens.stroke.regular,
          radius: tokens.radius.soft,
          role: "diagram-node",
          intentionalOverlap: true,
        });
        writer.addText(`swimlane-step-label-${laneIndex + 1}-${stepIndex + 1}`, step.label, grid.inset(box, tokens.space.xs), {
          fontSize: tokens.type.caption,
          align: "center",
          valign: "middle",
          bold: true,
          color: readable(tokens.palette.ink, panel, tokens.type.caption, true),
          fill: panel,
          fit: "shrink",
          role: "diagram-label",
        });
      });
    });
  },
};

// --------------------------------------------------------------- sequence

export const sequenceSchema = z.object({
  actors: z.array(z.string()).min(2),
  messages: z.array(z.object({
    from: z.string(),
    to: z.string(),
    label: z.string(),
    /** A dashed line reads as a response or an async reply. */
    dashed: z.boolean().optional(),
  })).min(1),
});
export type SequenceSpec = z.infer<typeof sequenceSchema>;

const sequence: DiagramGrammar<SequenceSpec> = {
  id: "sequence",
  description: "Actors with lifelines and ordered messages between them. For protocols, handoffs, and call flows.",
  render(writer, spec, frame, context) {
    const { tokens, grid } = context;
    const headerHeight = tokens.type.caption / 72 * 3;
    const columns = grid.divide({ ...frame, h: headerHeight }, spec.actors.length, tokens.space.sm);
    const centre = new Map(spec.actors.map((actor, index) => [actor, columns[index]!.x + columns[index]!.w / 2]));

    // Lifelines first so message arrows sit on top of them.
    spec.actors.forEach((actor, index) => {
      const x = centre.get(actor)!;
      writer.addConnector(`sequence-lifeline-${index + 1}`, {
        x,
        y: frame.y + headerHeight,
      }, {
        x,
        y: frame.y + frame.h,
      }, { color: tokens.palette.rule, width: tokens.stroke.hairline, arrow: false, dashed: true, role: "rule" });
    });

    spec.actors.forEach((actor, index) => {
      const cell = columns[index]!;
      writer.addShape(`sequence-actor-${index + 1}`, nodeShape(context), cell, {
        fill: tokens.palette.surface,
        lineColor: tokens.palette.rule,
        lineWidth: tokens.stroke.regular,
        radius: tokens.radius.soft,
        role: "diagram-node",
        intentionalOverlap: true,
      });
      writer.addText(`sequence-actor-label-${index + 1}`, actor, grid.inset(cell, tokens.space.xs), {
        fontSize: tokens.type.caption,
        align: "center",
        valign: "middle",
        bold: true,
        color: readable(tokens.palette.ink, tokens.palette.surface, tokens.type.caption, true),
        fill: tokens.palette.surface,
        fit: "shrink",
        role: "diagram-label",
      });
    });

    const messageTop = frame.y + headerHeight + tokens.space.lg;
    const messageRows = grid.stack(
      { ...frame, y: messageTop, h: Math.max(tokens.space.lg, frame.y + frame.h - messageTop - tokens.space.md) },
      spec.messages.length,
      tokens.space.xs,
    );

    spec.messages.forEach((message, index) => {
      const from = centre.get(message.from);
      const to = centre.get(message.to);
      if (from === undefined || to === undefined) return;
      const row = messageRows[index]!;
      const y = row.y + row.h / 2;
      writer.addConnector(`sequence-message-${index + 1}`, { x: from, y }, { x: to, y }, {
        color: tokens.palette.accentAlt,
        width: tokens.stroke.regular,
        arrow: true,
        ...(message.dashed ? { dashed: true } : {}),
        role: "connector",
      });
      const left = Math.min(from, to);
      const width = Math.max(Math.abs(to - from), tokens.space.xl);
      writer.addText(`sequence-message-label-${index + 1}`, message.label, {
        x: left,
        y: y - tokens.type.micro / 72 * 1.9,
        w: width,
        h: tokens.type.micro / 72 * 1.7,
      }, {
        fontSize: tokens.type.micro,
        align: "center",
        color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.micro),
        fit: "shrink",
        role: "diagram-label",
      });
    });
  },
};

// -------------------------------------------------------------- hierarchy

export const hierarchySchema = z.object({
  root: z.string(),
  children: z.array(z.object({
    label: z.string(),
    children: z.array(z.string()).optional(),
  })).min(1),
});
export type HierarchySpec = z.infer<typeof hierarchySchema>;

const hierarchy: DiagramGrammar<HierarchySpec> = {
  id: "hierarchy",
  description: "A root with one or two levels beneath it. For org structures, taxonomies, and decompositions.",
  render(writer, spec, frame, context) {
    const { tokens, grid } = context;
    const hasGrandchildren = spec.children.some((child) => (child.children?.length ?? 0) > 0);
    const levels = hasGrandchildren ? 3 : 2;
    const rows = grid.stack(frame, levels, tokens.space.lg);

    const rootWidth = Math.min(frame.w * 0.34, grid.columnWidth * 3);
    const rootBox = { x: frame.x + (frame.w - rootWidth) / 2, y: rows[0]!.y, w: rootWidth, h: rows[0]!.h };
    const childCells = grid.divide(rows[1]!, spec.children.length, tokens.space.sm);

    // Edges before nodes.
    childCells.forEach((cell, index) => {
      writer.addConnector(`hierarchy-edge-${index + 1}`, {
        x: rootBox.x + rootBox.w / 2,
        y: rootBox.y + rootBox.h,
      }, {
        x: cell.x + cell.w / 2,
        y: cell.y,
      }, { color: tokens.palette.rule, width: tokens.stroke.regular, arrow: false, role: "connector" });
    });

    writer.addShape("hierarchy-root", nodeShape(context), rootBox, {
      fill: tokens.palette.accentSoft,
      lineColor: tokens.palette.accent,
      lineWidth: tokens.stroke.regular,
      radius: tokens.radius.soft,
      role: "diagram-node",
      intentionalOverlap: true,
    });
    writer.addText("hierarchy-root-label", spec.root, grid.inset(rootBox, tokens.space.sm), {
      fontSize: tokens.type.subheading,
      align: "center",
      valign: "middle",
      bold: true,
      color: readable(tokens.palette.ink, tokens.palette.accentSoft, tokens.type.subheading, true),
      fill: tokens.palette.accentSoft,
      fit: "shrink",
      role: "diagram-label",
    });

    spec.children.forEach((child, index) => {
      const cell = childCells[index]!;
      writer.addShape(`hierarchy-child-${index + 1}`, nodeShape(context), cell, {
        fill: tokens.palette.surface,
        lineColor: tokens.palette.rule,
        lineWidth: tokens.stroke.regular,
        radius: tokens.radius.soft,
        role: "diagram-node",
        intentionalOverlap: true,
      });
      writer.addText(`hierarchy-child-label-${index + 1}`, child.label, grid.inset(cell, tokens.space.xs), {
        fontSize: tokens.type.body,
        align: "center",
        valign: "middle",
        bold: true,
        color: readable(tokens.palette.ink, tokens.palette.surface, tokens.type.body, true),
        fill: tokens.palette.surface,
        fit: "shrink",
        role: "diagram-label",
      });

      const grandchildren = child.children ?? [];
      if (grandchildren.length === 0 || !rows[2]) return;
      const leafCells = grid.divide({ ...rows[2], x: cell.x, w: cell.w }, grandchildren.length, tokens.space.xs);
      grandchildren.forEach((leaf, leafIndex) => {
        const leafCell = leafCells[leafIndex]!;
        writer.addConnector(`hierarchy-leaf-edge-${index + 1}-${leafIndex + 1}`, {
          x: cell.x + cell.w / 2,
          y: cell.y + cell.h,
        }, {
          x: leafCell.x + leafCell.w / 2,
          y: leafCell.y,
        }, { color: tokens.palette.rule, width: tokens.stroke.hairline, arrow: false, role: "connector" });
        writer.addText(`hierarchy-leaf-${index + 1}-${leafIndex + 1}`, leaf, leafCell, {
          fontSize: tokens.type.caption,
          align: "center",
          valign: "middle",
          color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.caption),
          fit: "shrink",
          role: "diagram-label",
        });
      });
    });
  },
};

// --------------------------------------------------------------- quadrant

export const quadrantSchema = z.object({
  xAxis: z.object({ label: z.string(), low: z.string().optional(), high: z.string().optional() }),
  yAxis: z.object({ label: z.string(), low: z.string().optional(), high: z.string().optional() }),
  items: z.array(z.object({
    label: z.string(),
    /** 0–1 along each axis. */
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    emphasis: z.boolean().optional(),
  })).min(1),
  quadrantLabels: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional()
    .describe("Clockwise from top-left."),
});
export type QuadrantSpec = z.infer<typeof quadrantSchema>;

const quadrant: DiagramGrammar<QuadrantSpec> = {
  id: "quadrant",
  description: "Items positioned against two axes. For prioritisation, positioning, and trade-off arguments.",
  render(writer, spec, frame, context) {
    const { tokens, grid } = context;
    // The y-axis label sits rotated-flat in the left gutter, so the gutter has
    // to be wide enough to hold the word rather than break it mid-syllable.
    const axisGutter = Math.min(frame.w * 0.18, Math.max(grid.columnWidth, tokens.type.caption / 72 * 6));
    const plot = {
      x: frame.x + axisGutter,
      y: frame.y,
      w: frame.w - axisGutter,
      h: frame.h - tokens.type.caption / 72 * 2.6,
    };

    writer.addShape("quadrant-field", Shapes.rect, plot, {
      fill: tokens.palette.surface,
      lineColor: tokens.palette.rule,
      lineWidth: tokens.stroke.hairline,
      role: "panel",
      intentionalOverlap: true,
    });
    writer.addConnector("quadrant-divider-vertical", {
      x: plot.x + plot.w / 2,
      y: plot.y,
    }, {
      x: plot.x + plot.w / 2,
      y: plot.y + plot.h,
    }, { color: tokens.palette.rule, width: tokens.stroke.regular, arrow: false, role: "rule" });
    writer.addConnector("quadrant-divider-horizontal", {
      x: plot.x,
      y: plot.y + plot.h / 2,
    }, {
      x: plot.x + plot.w,
      y: plot.y + plot.h / 2,
    }, { color: tokens.palette.rule, width: tokens.stroke.regular, arrow: false, role: "rule" });

    (spec.quadrantLabels ?? []).forEach((label, index) => {
      const top = index < 2;
      const left = index === 0 || index === 3;
      writer.addText(`quadrant-label-${index + 1}`, label, {
        x: left ? plot.x + tokens.space.sm : plot.x + plot.w / 2 + tokens.space.sm,
        y: top ? plot.y + tokens.space.sm : plot.y + plot.h - tokens.space.sm - tokens.type.micro / 72 * 1.7,
        w: plot.w / 2 - tokens.space.md,
        h: tokens.type.micro / 72 * 1.7,
      }, {
        fontSize: tokens.type.micro,
        bold: true,
        align: left ? "left" : "right",
        color: readable(tokens.palette.muted, tokens.palette.surface, tokens.type.micro, true),
        fill: tokens.palette.surface,
        role: "eyebrow",
      });
    });

    const dot = tokens.space.sm;
    spec.items.forEach((item, index) => {
      // y is inverted: 1 means "high", which is the top of the plot.
      const cx = plot.x + item.x * plot.w;
      const cy = plot.y + (1 - item.y) * plot.h;
      writer.addShape(`quadrant-point-${index + 1}`, Shapes.ellipse, {
        x: cx - dot / 2,
        y: cy - dot / 2,
        w: dot,
        h: dot,
      }, {
        fill: item.emphasis ? tokens.palette.accent : tokens.palette.accentAlt,
        lineWidth: 0,
        role: "diagram-node",
        intentionalOverlap: true,
      });
      const labelWidth = Math.min(grid.columnWidth * 2, plot.w * 0.32);
      writer.addText(`quadrant-point-label-${index + 1}`, item.label, {
        // Flip the label inboard near the right edge so it cannot overflow.
        x: cx + labelWidth + dot > plot.x + plot.w ? cx - labelWidth - dot : cx + dot,
        y: cy - tokens.type.micro / 72 * 0.9,
        w: labelWidth,
        h: tokens.type.micro / 72 * 1.7,
      }, {
        fontSize: tokens.type.micro,
        bold: item.emphasis === true,
        align: cx + labelWidth + dot > plot.x + plot.w ? "right" : "left",
        color: readable(tokens.palette.ink, tokens.palette.surface, tokens.type.micro, item.emphasis === true),
        fill: tokens.palette.surface,
        fit: "shrink",
        role: "diagram-label",
      });
    });

    writer.addText("quadrant-x-axis", spec.xAxis.label, {
      x: plot.x,
      y: plot.y + plot.h + tokens.space.xs,
      w: plot.w,
      h: tokens.type.caption / 72 * 1.7,
    }, {
      fontSize: tokens.type.caption,
      bold: true,
      align: "center",
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.caption, true),
      role: "axis-label",
    });
    writer.addText("quadrant-y-axis", spec.yAxis.label, {
      x: frame.x,
      y: plot.y + plot.h / 2 - tokens.type.caption / 72,
      w: axisGutter - tokens.space.sm,
      h: tokens.type.caption / 72 * 1.7,
    }, {
      fontSize: tokens.type.caption,
      bold: true,
      align: "left",
      color: readable(tokens.palette.muted, tokens.palette.background, tokens.type.caption, true),
      fit: "shrink",
      role: "axis-label",
    });
  },
};

export const BUILT_IN_GRAMMARS: DiagramGrammar<never>[] = [
  layered as DiagramGrammar<never>,
  swimlane as DiagramGrammar<never>,
  sequence as DiagramGrammar<never>,
  hierarchy as DiagramGrammar<never>,
  quadrant as DiagramGrammar<never>,
];

export const GRAMMAR_SCHEMAS = {
  layered: layeredSchema,
  swimlane: swimlaneSchema,
  sequence: sequenceSchema,
  hierarchy: hierarchySchema,
  quadrant: quadrantSchema,
} as const;

export type GrammarId = keyof typeof GRAMMAR_SCHEMAS;

/** Validates a grammar payload and renders it, or throws with the field at fault. */
export function renderGrammar(
  id: string,
  writer: ElementWriter,
  spec: unknown,
  frame: Frame,
  context: RenderContext,
): void {
  const schema = (GRAMMAR_SCHEMAS as Record<string, z.ZodType | undefined>)[id];
  const grammar = BUILT_IN_GRAMMARS.find((candidate) => candidate.id === id);
  if (!schema || !grammar) {
    throw new Error(`Unknown diagram grammar: ${id}. Available: ${Object.keys(GRAMMAR_SCHEMAS).join(", ")}.`);
  }
  const parsed = schema.safeParse(spec);
  if (!parsed.success) {
    throw new Error(`Diagram grammar "${id}" received an invalid spec:\n${parsed.error.issues.map((issue) => `  ${issue.path.join(".") || "<root>"}: ${issue.message}`).join("\n")}`);
  }
  grammar.render(writer, parsed.data as never, frame, context);
}
