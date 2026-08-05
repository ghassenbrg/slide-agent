import { ChartBuilder } from "../charts/chart-builder.js";
import { ElementWriter } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import { renderGrammar } from "../diagrams/grammars.js";
import { Grid } from "../design/grid.js";
import { resolveTokens, type DeckTokens } from "../design/tokens.js";
import type { CanvasElementSpec, CreativeDirection, SlideAgentConfig, SlideSpec } from "../types/index.js";

function setOverlapMetadata(writer: ElementWriter, id: string, element: CanvasElementSpec): void {
  const record = writer.records.find((candidate) => candidate.id === id);
  if (!record) return;
  record.intentionalOverlap = element.intentionalOverlap ?? record.intentionalOverlap;
  record.allowOverlapWith = element.allowOverlapWith;
}

/** Renders a host-model-authored scene without consulting the layout registry. */
export class FreeformComposer {
  private readonly charts: ChartBuilder;
  private readonly tokens: DeckTokens;
  private readonly grid: Grid;

  public constructor(
    private readonly config: SlideAgentConfig,
    private readonly direction?: CreativeDirection,
  ) {
    this.tokens = resolveTokens(config, direction);
    this.grid = new Grid(config.dimensions, this.tokens);
    this.charts = new ChartBuilder(config, this.tokens);
  }

  public render(writer: ElementWriter, spec: SlideSpec): void {
    const ordered = (spec.canvas ?? [])
      .map((element, index) => ({ element, index }))
      .sort((left, right) => {
        const layer = (left.element.zIndex ?? 0) - (right.element.zIndex ?? 0);
        return layer === 0 ? left.index - right.index : layer;
      });

    for (const { element } of ordered) {
      const frame = { x: element.x, y: element.y, w: element.w, h: element.h };
      let id: string | undefined;
      switch (element.type) {
        case "text":
          id = writer.addText(element.id, element.runs ?? element.text ?? "", frame, {
            ...(element.style ?? {}),
            role: element.role ?? "body",
            intentionalOverlap: element.intentionalOverlap,
          });
          break;
        case "shape":
          id = writer.addShape(element.id, element.shape ?? Shapes.rect, frame, {
            ...(element.style ?? {}),
            role: element.role ?? "shape",
            intentionalOverlap: element.intentionalOverlap,
          });
          break;
        case "connector":
          id = writer.addConnector(element.id, { x: element.x, y: element.y }, {
            x: element.x + element.w,
            y: element.y + element.h,
          }, {
            color: element.style?.color,
            width: element.style?.width,
            arrow: element.style?.arrow,
            beginArrow: element.style?.beginArrow,
            dashed: element.style?.dashed,
            role: element.role,
            native: element.style?.options,
          });
          break;
        case "image":
          id = writer.addImage(element.id, element.path, element.alt, frame, {
            fit: element.fit,
            rotate: element.style?.rotate,
            transparency: element.style?.transparency,
            options: element.style?.options,
            role: element.role,
            intentionalOverlap: element.intentionalOverlap,
          });
          break;
        case "table":
          id = writer.addTable(element.id, element.table, frame, element.options);
          break;
        case "chart":
          this.charts.add(writer, element.id, element.chart, frame, element.style);
          id = writer.records.at(-1)?.id;
          break;
        case "native-chart":
          id = writer.addNativeChart(element.id, element.nativeType, element.data, frame, element.options, element.alt);
          break;
        case "diagram": {
          // A grammar emits many elements, so the overlap metadata below cannot
          // attach to one id; the grammar marks its own nodes instead.
          const before = writer.records.length;
          renderGrammar(element.grammar, writer, element.spec, frame, {
            tokens: this.tokens,
            grid: this.grid,
            config: this.config,
            ...(this.direction ? { direction: this.direction } : {}),
          });
          for (const record of writer.records.slice(before)) {
            record.intentionalOverlap = record.intentionalOverlap || (element.intentionalOverlap ?? false);
          }
          break;
        }
      }
      if (id) setOverlapMetadata(writer, id, element);
    }
  }
}
