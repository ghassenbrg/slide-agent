import { ChartBuilder } from "../charts/chart-builder.js";
import { ElementWriter } from "../components/element-writer.js";
import { Shapes } from "../components/pptx-values.js";
import { renderGrammar } from "../diagrams/grammars.js";
import { Grid } from "../design/grid.js";
import { routeConnector, type Point } from "../design/routing.js";
import { resolveTokens, type DeckTokens } from "../design/tokens.js";
import { VisualSystem, applyVisualSystem } from "../design/visual-system.js";
import type {
  CanvasConnectorElement,
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
  // The writer may already have recorded exemptions the author did not state —
  // a routed connector exempts the two elements it joins. Overwriting with an
  // absent authored value would discard them and report the route as colliding
  // with the very nodes it connects.
  if (element.allowOverlapWith) {
    record.allowOverlapWith = [...new Set([...(record.allowOverlapWith ?? []), ...element.allowOverlapWith])];
  }
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

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Applies a placement to one element's own frame. */
function place(element: CanvasElementSpec, at: Placement): Frame {
  return {
    x: at.x + (element.x ?? 0) * at.scale,
    y: at.y + (element.y ?? 0) * at.scale,
    w: (element.w ?? 0) * at.scale,
    h: (element.h ?? 0) * at.scale,
  };
}

/**
 * Prepares one child of a symbol for one placement of it.
 *
 * Namespacing is unconditional and deliberately separate from the overrides:
 * two placements of the same symbol collide in the manifest — and in any later
 * patch, which addresses elements by id — whether or not either of them
 * happened to override anything.
 */
function instantiate(element: CanvasElementSpec, instance: CanvasSymbolInstanceElement): CanvasElementSpec {
  const next = { ...element } as Record<string, unknown>;
  next.id = `${instance.id}.${element.id}`;

  const overrides = instance.overrides;
  if (!overrides) return next as unknown as CanvasElementSpec;
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
    const canvas = spec.canvas ?? [];
    // Connectors are resolved against the frames of the elements they join, so
    // every frame on the slide has to be known before anything is drawn. The
    // index is built with the same placement maths the paint pass uses, which
    // keeps an anchored connector correct inside a group or a scaled symbol.
    this.frames = new Map();
    this.indexFrames(canvas, ROOT);
    this.paint(writer, canvas, slideNumber, ROOT);
  }

  /** Absolute frames by element id, for connector anchoring. */
  private frames = new Map<string, Frame>();

  private indexFrames(canvas: CanvasElementSpec[], at: Placement, prefix = ""): void {
    for (const element of canvas) {
      const id = prefix ? `${prefix}.${element.id}` : element.id;
      if (element.type === "connector") continue;
      const frame = place(element, at);
      this.frames.set(id, frame);
      if (element.type === "group") {
        this.indexFrames(element.children, {
          ...at,
          x: frame.x,
          y: frame.y,
          scale: at.scale * (element.scale ?? 1),
        }, id);
        continue;
      }
      if (element.type === "symbol-instance") {
        const symbol = this.symbols.get(element.symbol);
        if (!symbol) continue;
        const fit = Math.min(frame.w / symbol.w, frame.h / symbol.h);
        this.indexFrames(symbol.elements, {
          ...at,
          x: frame.x,
          y: frame.y,
          scale: fit * (element.scale ?? 1),
        }, id);
      }
    }
  }

  /**
   * What a route should go around.
   *
   * Full-bleed plates and background washes are excluded: they cover the slide
   * by design, and treating them as obstacles would make every route impossible
   * and every score identical. So are other connectors, whose bounding boxes
   * describe almost nothing about where they run.
   */
  private obstaclesFor(exclude: Set<string>): Array<{ id: string; box: Frame }> {
    const slideArea = this.config.dimensions.width * this.config.dimensions.height;
    const obstacles: Array<{ id: string; box: Frame }> = [];
    for (const [id, box] of this.frames) {
      if (exclude.has(id)) continue;
      if (box.w * box.h > slideArea * 0.5) continue;
      obstacles.push({ id, box });
    }
    return obstacles;
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
      const frame = element.type === "connector" && element.from !== undefined && element.to !== undefined
        ? { x: 0, y: 0, w: 0, h: 0 }
        : place(element as Exclude<CanvasElementSpec, CanvasConnectorElement>, at);
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
        case "connector": {
          const style = {
            color: element.style?.color,
            width: element.style?.width,
            arrow: element.style?.arrow,
            beginArrow: element.style?.beginArrow,
            dashed: element.style?.dashed,
            native: element.style?.options,
            ...shared,
          };
          if (element.from !== undefined && element.to !== undefined) {
            const path = this.route(element, at, slideNumber);
            id = writer.addRoutedConnector(element.id, path.points, { ...style, joins: path.joins });
          } else {
            const start = place({ ...element, x: element.x ?? 0, y: element.y ?? 0, w: 0, h: 0 } as never, at);
            const span = { w: (element.w ?? 0) * at.scale, h: (element.h ?? 0) * at.scale };
            id = writer.addConnector(element.id, { x: start.x, y: start.y }, {
              x: start.x + span.w,
              y: start.y + span.h,
            }, style);
          }
          break;
        }
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
          }, symbol.elements.map((child) => instantiate(child, element)));
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

  /** Resolves an anchored connector into an absolute path. */
  private route(element: CanvasConnectorElement, at: Placement, slideNumber: number): { points: Point[]; joins: string[] } {
    const resolve = (endpoint: NonNullable<CanvasConnectorElement["from"]>) => {
      const id = typeof endpoint === "string" ? endpoint : endpoint.id;
      const scoped = at.groupId ? `${at.groupId}.${id}` : id;
      const box = this.frames.get(scoped) ?? this.frames.get(id);
      if (!box) {
        throw new SlideAgentError(
          "UNKNOWN_CONNECTOR_ANCHOR",
          `Slide ${slideNumber} connector "${element.id}" anchors to "${id}", which is not an element on this slide.`,
          { connector: element.id, anchor: id, available: [...this.frames.keys()] },
        );
      }
      return { id: scoped, box, side: typeof endpoint === "string" ? undefined : endpoint.side };
    };

    const from = resolve(element.from!);
    const to = resolve(element.to!);
    const exempt = new Set([from.id, to.id, ...(element.mayCross ?? [])]);
    const routed = routeConnector({
      from: from.box,
      to: to.box,
      ...(from.side ? { fromSide: from.side } : {}),
      ...(to.side ? { toSide: to.side } : {}),
      kind: element.route ?? "elbow",
      ...(element.clearance === undefined ? {} : { clearance: element.clearance }),
      ...(element.stub === undefined ? {} : { stub: element.stub }),
      obstacles: this.obstaclesFor(exempt),
      bounds: { x: 0, y: 0, w: this.config.dimensions.width, h: this.config.dimensions.height },
    });
    return { points: routed.points, joins: [...exempt] };
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
