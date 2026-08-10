import { ChartBuilder } from "../charts/chart-builder.js";
import { ElementWriter } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import { renderGrammar } from "../diagrams/grammars.js";
import { Grid } from "../design/grid.js";
import { resolveTokens, type DeckTokens } from "../design/tokens.js";
import { VisualSystem, applyVisualSystem } from "../design/visual-system.js";
import type {
  CanvasElementSpec,
  CanvasGroupElement,
  CanvasSymbolInstanceElement,
  CanvasTextElement,
  CreativeDirection,
  DeckSymbol,
  SlideAgentConfig,
  SlideSpec,
} from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";
import type { ExtensionRegistry } from "../extensions.js";

function setOverlapMetadata(writer: ElementWriter, id: string, element: CanvasElementSpec): void {
  const record = writer.records.find((candidate) => candidate.id === id);
  if (!record) return;
  record.intentionalOverlap = element.intentionalOverlap ?? record.intentionalOverlap;
  record.allowOverlapWith = element.allowOverlapWith;
}

/** Context that travels down into a group or symbol instance. */
interface Placement {
  /** Offset added to every child's x/y, in inches. */
  x: number;
  y: number;
  scale: number;
  /** The group or symbol instance these elements were expanded from. */
  groupId?: string;
  layer?: string;
}

const ROOT: Placement = { x: 0, y: 0, scale: 1 };

/** Applies a placement to one element's own frame. */
function place(element: CanvasElementSpec, at: Placement): { x: number; y: number; w: number; h: number } {
  return {
    x: at.x + element.x * at.scale,
    y: at.y + element.y * at.scale,
    w: element.w * at.scale,
    h: element.h * at.scale,
  };
}

/** Applies one symbol instance's overrides to a child of that symbol. */
function override(element: CanvasElementSpec, instance: CanvasSymbolInstanceElement): CanvasElementSpec {
  const overrides = instance.overrides;
  if (!overrides) return element;
  const next = { ...element } as Record<string, unknown>;
  const text = overrides.text?.[element.id];
  if (text !== undefined && element.type === "text") (next as unknown as CanvasTextElement).text = text;
  const color = overrides.color?.[element.id];
  const styleOverride = overrides.style?.[element.id];
  if (color !== undefined || styleOverride) {
    const existing = (next.style ?? {}) as Record<string, unknown>;
    next.style = {
      ...existing,
      ...(color === undefined ? {} : element.type === "text" ? { color } : { fill: color }),
      ...(styleOverride ?? {}),
    };
  }
  // The instance's own id namespaces the child so two placements of the same
  // symbol do not collide in the manifest or in a later patch operation.
  next.id = `${instance.id}.${element.id}`;
  return next as unknown as CanvasElementSpec;
}

/** Renders a host-model-authored scene without consulting the layout registry. */
export class FreeformComposer {
  private readonly charts: ChartBuilder;
  private readonly tokens: DeckTokens;
  private readonly grid: Grid;
  private readonly visualSystem: VisualSystem;
  private readonly symbols: Map<string, DeckSymbol>;

  public constructor(
    private readonly config: SlideAgentConfig,
    private readonly direction?: CreativeDirection,
    private readonly extensions?: ExtensionRegistry,
    symbols: DeckSymbol[] = [],
  ) {
    this.tokens = extensions?.tokenizer?.derive(config, direction, config.dimensions) ?? resolveTokens(config, direction);
    this.grid = new Grid(config.dimensions, this.tokens);
    this.charts = new ChartBuilder(config, this.tokens, extensions);
    this.visualSystem = new VisualSystem(direction?.visualSystem);
    this.symbols = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  }

  public render(writer: ElementWriter, spec: SlideSpec, slideNumber = 1): void {
    this.paint(writer, spec.canvas ?? [], slideNumber, ROOT);
  }

  private paint(writer: ElementWriter, canvas: CanvasElementSpec[], slideNumber: number, at: Placement): void {
    const ordered = canvas
      .map((element, index) => ({ element, index }))
      .sort((left, right) => {
        const layer = (left.element.zIndex ?? 0) - (right.element.zIndex ?? 0);
        return layer === 0 ? left.index - right.index : layer;
      });

    for (const { element: authored } of ordered) {
      // The deck's own styles and variables resolve here, at render time. The
      // authored element is never mutated, so what the scene emits later is
      // still exactly what the author wrote.
      const element = applyVisualSystem(this.visualSystem, authored, slideNumber);
      const frame = place(element, at);
      const layer = element.layer ?? at.layer;
      const shared = {
        role: element.role,
        ...(layer ? { layer } : {}),
        ...(at.groupId ? { groupId: at.groupId } : {}),
        ...(element.allowBleed ? { allowBleed: true } : {}),
        intentionalOverlap: element.intentionalOverlap,
      };
      let id: string | undefined;
      switch (element.type) {
        case "text":
          id = writer.addText(element.id, element.runs ?? element.text ?? "", frame, {
            ...(element.style ?? {}),
            ...(element.link === undefined ? {} : { link: element.link }),
            ...shared,
            role: element.role ?? "body",
            // Type scales with the placement so a symbol at half size reads as
            // one design rather than as full-size type in a small box.
            ...(element.style?.fontSize !== undefined && at.scale !== 1
              ? { fontSize: element.style.fontSize * at.scale }
              : {}),
          });
          break;
        case "shape":
          id = writer.addShape(element.id, element.shape ?? Shapes.rect, frame, {
            ...(element.style ?? {}),
            ...(element.link === undefined ? {} : { link: element.link }),
            ...shared,
            role: element.role ?? "shape",
          });
          break;
        case "connector":
          id = writer.addConnector(element.id, { x: frame.x, y: frame.y }, {
            x: frame.x + frame.w,
            y: frame.y + frame.h,
          }, {
            color: element.style?.color,
            width: element.style?.width,
            arrow: element.style?.arrow,
            beginArrow: element.style?.beginArrow,
            dashed: element.style?.dashed,
            native: element.style?.options,
            ...shared,
          });
          break;
        case "image":
          id = writer.addImage(element.id, element.path, element.alt, frame, {
            fit: element.fit,
            rotate: element.style?.rotate,
            transparency: element.style?.transparency,
            options: element.style?.options,
            ...(element.vector ? { vector: element.vector } : {}),
            ...(element.treatment ? { treatment: element.treatment } : {}),
            ...(element.provenance?.source ? { source: String(element.provenance.source) } : {}),
            ...(element.provenance ? { provenance: element.provenance } : {}),
            ...(element.link === undefined ? {} : { link: element.link }),
            ...shared,
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
        case "group": {
          this.paintChildren(writer, element, slideNumber, {
            x: frame.x,
            y: frame.y,
            scale: at.scale * (element.scale ?? 1),
            groupId: at.groupId ? `${at.groupId}/${element.id}` : element.id,
            ...(layer ? { layer } : {}),
          }, element.children);
          break;
        }
        case "symbol-instance": {
          const symbol = this.symbols.get(element.symbol);
          if (!symbol) {
            throw new SlideAgentError(
              "UNKNOWN_SYMBOL",
              `Slide ${slideNumber} element "${element.id}" places symbol "${element.symbol}", which this scene does not define.${this.symbols.size ? ` Defined: ${[...this.symbols.keys()].join(", ")}.` : " No symbol records are present."}`,
              { symbol: element.symbol, defined: [...this.symbols.keys()] },
            );
          }
          // An instance declares the box it occupies; the symbol declares the
          // box it was drawn in. The ratio between them is the scale, so one
          // symbol serves every size without the author restating coordinates.
          const fit = Math.min(frame.w / symbol.w, frame.h / symbol.h);
          this.paintChildren(writer, element, slideNumber, {
            x: frame.x,
            y: frame.y,
            scale: fit * (element.scale ?? 1),
            groupId: at.groupId ? `${at.groupId}/${element.id}` : element.id,
            ...(layer ? { layer } : {}),
          }, symbol.elements.map((child) => override(child, element)));
          break;
        }
        case "diagram": {
          // A grammar emits many elements, so the overlap metadata below cannot
          // attach to one id; the grammar marks its own nodes instead.
          const before = writer.records.length;
          const context = {
            tokens: this.tokens,
            grid: this.grid,
            config: this.config,
            ...(this.direction ? { direction: this.direction } : {}),
          };
          // A host grammar wins over a built-in of the same id, so an
          // organisation can replace the swimlane notation without forking.
          const custom = this.extensions?.diagram(element.grammar);
          if (custom) custom.render(writer, element.spec, frame, context);
          else renderGrammar(element.grammar, writer, element.spec, frame, context);
          for (const record of writer.records.slice(before)) {
            record.intentionalOverlap = record.intentionalOverlap || (element.intentionalOverlap ?? false);
            // A grammar builds editable primitives from a relationship, which
            // is a different provenance from an element the author placed.
            record.editability = "generated-native";
            if (layer) record.layer = layer;
            if (at.groupId) record.groupId = at.groupId;
          }
          break;
        }
      }
      if (id) setOverlapMetadata(writer, id, element);
    }
  }

  /**
   * Expands one group or symbol instance. Children become ordinary native
   * elements: individually selectable in PowerPoint, individually addressable
   * by a patch, and marked `grouped-native` so the manifest says where they
   * came from without claiming a native OOXML group that other viewers would
   * flatten differently.
   */
  private paintChildren(
    writer: ElementWriter,
    container: CanvasGroupElement | CanvasSymbolInstanceElement,
    slideNumber: number,
    at: Placement,
    children: CanvasElementSpec[],
  ): void {
    const before = writer.records.length;
    this.paint(writer, children, slideNumber, at);
    for (const record of writer.records.slice(before)) {
      record.editability = "grouped-native";
      record.intentionalOverlap = record.intentionalOverlap || (container.intentionalOverlap ?? false);
    }
  }
}
