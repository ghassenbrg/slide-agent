/**
 * An authoring surface you write a program against.
 *
 * The scene file was the only way in for a long time, and it quietly set a
 * price on design. Every element is a separate JSON record carrying an id, a
 * four-number frame the author worked out by hand, and a style object; a card
 * with a title, a sub-label and an accent bar costs four of them, while a bare
 * text label costs one. Authors are rational, so they bought labels. Decks came
 * out sparse, unaligned, and repetitive — not because anyone wanted that, and
 * not because the guidance asked for it, but because rhythm is arithmetic and
 * arithmetic in hand-written JSON is expensive.
 *
 * Nothing here adds a template, a component library, or a house style. It adds
 * the two things a program has that a data file does not: you can name a thing
 * and reuse it, and you can compute where it goes. A node card becomes an
 * ordinary function the deck defines for itself; six of them on an even rhythm
 * become a loop. What that function draws is still entirely the author's.
 *
 * The output is a `PresentationOutline` — the same structure the scene format
 * carries. The script is a producer of the scene, never a replacement for it,
 * so the emitted `.ndjson` stays canonical and patching, revising, and the
 * clean-directory round-trip all keep working on decks built this way.
 */
import { measureTextWidth, resolveFont, textBlockHeight, wrapLineCount } from "../design/font-metrics.js";
import { layoutGraph, type GraphEdge, type GraphLayoutSpec, type PlacedNode } from "../design/graph-layout.js";
import { SLIDE_FORMATS, type SlideFormat } from "../design/grid.js";
import type {
  CanvasChartElement,
  CanvasConnectorElement,
  CanvasDiagramElement,
  CanvasElementSpec,
  CanvasImageElement,
  CanvasNativeChartElement,
  CanvasShapeElement,
  CanvasTableElement,
  CanvasTextElement,
  CanvasTextStyle,
  ClaimLedgerItem,
  CreativeDirection,
  DeckCompletenessPlan,
  DeckSymbol,
  DesignExploration,
  HostAuthoringCapabilities,
  PresentationBrief,
  PresentationOutline,
  SequencePlanItem,
  SlideChrome,
  SlideCommunicationPlan,
  SlideKind,
  SlideSpec,
  SourceCitation,
} from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What an `add` call gives back: the element's id and where it ended up.
 *
 * Returning the frame is what makes composition without arithmetic possible —
 * the next element can be placed against this one, and a connector can name it,
 * without the author restating any coordinates.
 */
export interface Handle extends Rect {
  id: string;
  /** The right edge, and the bottom edge, so `below(card)` reads as itself. */
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
}

function handle(id: string, frame: Rect): Handle {
  return {
    id,
    ...frame,
    get right() { return frame.x + frame.w; },
    get bottom() { return frame.y + frame.h; },
    get centerX() { return frame.x + frame.w / 2; },
    get centerY() { return frame.y + frame.h / 2; },
  };
}

/**
 * The brief a script has to state, and the parts it does not.
 *
 * The scene format requires a complete brief, because a deck rebuilt from its
 * own scene has to describe itself as fully as the one that produced it —
 * otherwise a build script quietly emits a scene that will not rebuild, and the
 * clean-directory check fails on delivery day rather than here.
 *
 * What stays required is what only the author knows: who it is for, what it is
 * for, how it should sound, what language it is in. What is filled in is either
 * derivable (`slideCount` is the number of slides) or bookkeeping that an empty
 * value describes honestly — an empty `keyTopics` says nothing was recorded,
 * which is true, where a guessed one would be a claim nobody made.
 */
export type AuthoredBrief =
  & Pick<PresentationBrief, "title" | "audience" | "objective" | "presentationType" | "tone" | "language">
  & Partial<Omit<PresentationBrief, "title" | "audience" | "objective" | "presentationType" | "tone" | "language">>;

export interface DeckOptions {
  brief: AuthoredBrief;
  narrative: string;
  format?: SlideFormat;
  /** Explicit slide size in inches. Wins over `format`. */
  width?: number;
  height?: number;
  creativeDirection?: CreativeDirection;
  exploration?: DesignExploration;
  sequencePlan?: SequencePlanItem[];
  claims?: ClaimLedgerItem[];
  sourceLedger?: Array<SourceCitation & { id: string }>;
  completeness?: DeckCompletenessPlan;
  hostCapabilities?: HostAuthoringCapabilities;
  symbols?: DeckSymbol[];
  /**
   * Elements repeated on every slide, written once.
   *
   * Strings may interpolate `{{slideNumber}}`, `{{slideNumberPadded}}`,
   * `{{slideCount}}`, `{{slideTitle}}`, `{{deckTitle}}`, and anything a slide
   * supplies in its own `chrome`.
   */
  slideChrome?: SlideChrome;
}

export interface SlideOptions {
  id: string;
  title: string;
  kind?: SlideKind;
  subtitle?: string;
  background?: string;
  designIntent?: string;
  composition?: string;
  communication?: SlideCommunicationPlan;
  /** `false` suppresses the deck's chrome here; an object feeds its tokens. */
  chrome?: false | Record<string, string>;
  notes?: string[];
  sources?: SourceCitation[];
}

export interface TextOptions extends Partial<Rect> {
  style?: CanvasTextStyle;
  styleRef?: string | string[];
  role?: string;
  zIndex?: number;
  layer?: string;
  link?: CanvasTextElement["link"];
  allowBleed?: boolean;
  intentionalOverlap?: boolean;
  allowOverlapWith?: string[];
  /**
   * Grow the frame's height to whatever the text actually needs.
   *
   * The single most common defect in hand-placed decks is a box guessed too
   * short, which clips its own last line, or guessed too tall, which leaves a
   * hole nothing fills. Both are measurable before anything is drawn.
   */
  autoHeight?: boolean;
}

export interface ShapeOptions extends Partial<Rect> {
  style?: CanvasShapeElement["style"];
  styleRef?: string | string[];
  role?: string;
  zIndex?: number;
  layer?: string;
  link?: CanvasShapeElement["link"];
  allowBleed?: boolean;
  intentionalOverlap?: boolean;
  allowOverlapWith?: string[];
}

export interface ConnectOptions {
  route?: CanvasConnectorElement["route"];
  fromSide?: "top" | "right" | "bottom" | "left" | "auto";
  toSide?: "top" | "right" | "bottom" | "left" | "auto";
  clearance?: number;
  stub?: number;
  mayCross?: string[];
  style?: CanvasConnectorElement["style"];
  styleRef?: string | string[];
  role?: string;
  zIndex?: number;
  layer?: string;
}

/** Text measured against a frame, before anything is built. */
export interface TextMeasurement {
  lines: number;
  /** Height the wrapped block needs, in inches. */
  height: number;
  /** Width of the longest line as set, in inches. */
  width: number;
  /** True when the block needs more height than the frame allows. */
  overflows: boolean;
}

export interface MeasureRequest {
  text: string;
  w: number;
  h?: number;
  fontSize?: number;
  fontFace?: string;
  bold?: boolean;
  lineSpacingMultiple?: number;
}

/**
 * Measures text the same way validation does.
 *
 * The metrics behind this are the ones the overflow checker uses, so a script
 * that asks before placing gets the same answer the report would give it
 * afterwards. That is the point: the loop between "guess a box" and "discover
 * in the render that it was wrong" is the slowest one in the whole workflow,
 * and it does not need to exist.
 */
export function measureText(request: MeasureRequest): TextMeasurement {
  const fontSize = request.fontSize ?? 18;
  const font = resolveFont(request.fontFace, request.bold);
  const lines = wrapLineCount(request.text, request.w, fontSize, font);
  // `lineSpacingMultiple` overrides the font's own line height, the same way
  // the writer applies it, so a measurement matches what will be drawn.
  const height = request.lineSpacingMultiple === undefined
    ? textBlockHeight(request.text, request.w, fontSize, font)
    : lines * fontSize * request.lineSpacingMultiple / 72;
  const width = request.text.split(/\r?\n/).reduce(
    (widest, line) => Math.max(widest, measureTextWidth(line, fontSize, font)),
    0,
  );
  return {
    lines,
    height,
    width: Math.min(width, request.w),
    overflows: request.h !== undefined && height > request.h + 1e-6,
  };
}

/** Splits a rectangle into `count` columns with an even gap. */
export function columns(frame: Rect, count: number, gap = 0.24): Rect[] {
  const width = (frame.w - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: frame.x + index * (width + gap),
    y: frame.y,
    w: width,
    h: frame.h,
  }));
}

/** Splits a rectangle into `count` rows with an even gap. */
export function rows(frame: Rect, count: number, gap = 0.24): Rect[] {
  const height = (frame.h - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: frame.x,
    y: frame.y + index * (height + gap),
    w: frame.w,
    h: height,
  }));
}

/** Row-major cells of a grid. */
export function grid(frame: Rect, spec: { columns: number; rows: number; gap?: number; rowGap?: number }): Rect[] {
  const gap = spec.gap ?? 0.24;
  const rowGap = spec.rowGap ?? gap;
  return rows(frame, spec.rows, rowGap).flatMap((row) => columns(row, spec.columns, gap));
}

/** Shrinks a rectangle by an even inset, or per side. */
export function inset(frame: Rect, by: number | { top?: number; right?: number; bottom?: number; left?: number }): Rect {
  const sides = typeof by === "number" ? { top: by, right: by, bottom: by, left: by } : by;
  const top = sides.top ?? 0;
  const right = sides.right ?? 0;
  const bottom = sides.bottom ?? 0;
  const left = sides.left ?? 0;
  return { x: frame.x + left, y: frame.y + top, w: frame.w - left - right, h: frame.h - top - bottom };
}

/** Splits a rectangle in two along a ratio, with a gutter between. */
export function split(frame: Rect, ratio = 0.5, gap = 0.24, axis: "x" | "y" = "x"): [Rect, Rect] {
  if (axis === "x") {
    const first = (frame.w - gap) * ratio;
    return [
      { ...frame, w: first },
      { ...frame, x: frame.x + first + gap, w: frame.w - first - gap },
    ];
  }
  const first = (frame.h - gap) * ratio;
  return [
    { ...frame, h: first },
    { ...frame, y: frame.y + first + gap, h: frame.h - first - gap },
  ];
}

/** Lays items of known size along an axis, centred in the frame. */
export function distribute(frame: Rect, sizes: number[], axis: "x" | "y" = "x", gap?: number): Rect[] {
  const along = axis === "x" ? frame.w : frame.h;
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const spacing = gap ?? (sizes.length > 1 ? (along - total) / (sizes.length - 1) : 0);
  let cursor = axis === "x" ? frame.x : frame.y;
  return sizes.map((size) => {
    const rect = axis === "x"
      ? { x: cursor, y: frame.y, w: size, h: frame.h }
      : { x: frame.x, y: cursor, w: frame.w, h: size };
    cursor += size + spacing;
    return rect;
  });
}

export class SlideBuilder {
  public readonly canvas: CanvasElementSpec[] = [];
  private readonly ids = new Set<string>();

  public constructor(
    private readonly options: SlideOptions,
    /** The whole slide, for `page` and default frames. */
    public readonly frame: Rect,
    private readonly deckSymbols: Map<string, DeckSymbol>,
  ) {}

  /** The slide inset by an even margin: where content normally starts. */
  public page(margin = 0.72): Rect {
    return inset(this.frame, margin);
  }

  private claim(id: string): string {
    if (this.ids.has(id)) {
      throw new SlideAgentError(
        "DUPLICATE_ELEMENT_ID",
        `Slide "${this.options.id}" already has an element called "${id}". Ids address elements in a patch, so they have to be unique on the slide.`,
        { slide: this.options.id, id },
      );
    }
    this.ids.add(id);
    return id;
  }

  private frameFor(options: Partial<Rect>): Rect {
    return {
      x: options.x ?? this.frame.x,
      y: options.y ?? this.frame.y,
      w: options.w ?? this.frame.w,
      h: options.h ?? this.frame.h,
    };
  }

  /** Adds any element spec directly. The escape hatch for anything below. */
  public add(element: CanvasElementSpec): Handle {
    this.claim(element.id);
    this.canvas.push(element);
    return handle(element.id, {
      x: element.x ?? 0,
      y: element.y ?? 0,
      w: element.w ?? 0,
      h: element.h ?? 0,
    });
  }

  public text(id: string, text: string, options: TextOptions = {}): Handle {
    const frame = this.frameFor(options);
    const measured = options.autoHeight
      ? measureText({
        text,
        w: frame.w,
        fontSize: options.style?.fontSize as number | undefined,
        fontFace: options.style?.fontFace as string | undefined,
        bold: options.style?.bold as boolean | undefined,
        ...(typeof options.style?.lineSpacingMultiple === "number"
          ? { lineSpacingMultiple: options.style.lineSpacingMultiple }
          : {}),
      })
      : undefined;
    const resolved = measured ? { ...frame, h: measured.height } : frame;
    const { style, styleRef, role, zIndex, layer, link, allowBleed, intentionalOverlap, allowOverlapWith } = options;
    return this.add({
      id, type: "text", ...resolved, text,
      ...(style ? { style } : {}),
      ...(styleRef ? { styleRef } : {}),
      ...(role ? { role } : {}),
      ...(zIndex === undefined ? {} : { zIndex }),
      ...(layer ? { layer } : {}),
      ...(link === undefined ? {} : { link }),
      ...(allowBleed ? { allowBleed } : {}),
      ...(intentionalOverlap ? { intentionalOverlap } : {}),
      ...(allowOverlapWith ? { allowOverlapWith } : {}),
    });
  }

  public shape(id: string, shape: string, options: ShapeOptions = {}): Handle {
    const { style, styleRef, role, zIndex, layer, link, allowBleed, intentionalOverlap, allowOverlapWith } = options;
    return this.add({
      id, type: "shape", shape, ...this.frameFor(options),
      ...(style ? { style } : {}),
      ...(styleRef ? { styleRef } : {}),
      ...(role ? { role } : {}),
      ...(zIndex === undefined ? {} : { zIndex }),
      ...(layer ? { layer } : {}),
      ...(link === undefined ? {} : { link }),
      ...(allowBleed ? { allowBleed } : {}),
      ...(intentionalOverlap ? { intentionalOverlap } : {}),
      ...(allowOverlapWith ? { allowOverlapWith } : {}),
    });
  }

  /**
   * Joins two elements. The engine resolves the anchors and the path.
   *
   * Drawn behind everything by default, because an edge that crosses in front
   * of the node it points at is the classic hand-placed diagram defect and
   * there is no reason to make each author rediscover it.
   */
  public connect(id: string, from: string | Handle, to: string | Handle, options: ConnectOptions = {}): Handle {
    const endpoint = (value: string | Handle, side?: ConnectOptions["fromSide"]) => {
      const target = typeof value === "string" ? value : value.id;
      return side ? { id: target, side } : target;
    };
    const { style, styleRef, role, zIndex, layer, route, clearance, stub, mayCross } = options;
    return this.add({
      id,
      type: "connector",
      from: endpoint(from, options.fromSide),
      to: endpoint(to, options.toSide),
      ...(route ? { route } : {}),
      ...(clearance === undefined ? {} : { clearance }),
      ...(stub === undefined ? {} : { stub }),
      ...(mayCross ? { mayCross } : {}),
      ...(style ? { style } : {}),
      ...(styleRef ? { styleRef } : {}),
      role: role ?? "connector",
      zIndex: zIndex ?? -1,
      ...(layer ? { layer } : {}),
    });
  }

  /** A connector between two points, for a rule or a free-drawn mark. */
  public line(id: string, from: { x: number; y: number }, to: { x: number; y: number }, options: Omit<ConnectOptions, "route" | "fromSide" | "toSide"> = {}): Handle {
    const { style, styleRef, role, zIndex, layer } = options;
    return this.add({
      id, type: "connector",
      x: from.x, y: from.y, w: to.x - from.x, h: to.y - from.y,
      ...(style ? { style } : {}),
      ...(styleRef ? { styleRef } : {}),
      role: role ?? "connector",
      ...(zIndex === undefined ? {} : { zIndex }),
      ...(layer ? { layer } : {}),
    });
  }

  public image(id: string, path: string, alt: string, options: Partial<Rect> & Omit<CanvasImageElement, "id" | "type" | "x" | "y" | "w" | "h" | "path" | "alt"> = {}): Handle {
    const { x: _x, y: _y, w: _w, h: _h, ...rest } = options;
    return this.add({ id, type: "image", path, alt, ...this.frameFor(options), ...rest });
  }

  public table(id: string, table: CanvasTableElement["table"], options: Partial<Rect> & { options?: Record<string, unknown>; role?: string } = {}): Handle {
    const { x: _x, y: _y, w: _w, h: _h, ...rest } = options;
    return this.add({ id, type: "table", table, ...this.frameFor(options), ...rest });
  }

  public chart(id: string, chart: CanvasChartElement["chart"], options: Partial<Rect> & { alt?: string; style?: CanvasChartElement["style"]; role?: string } = {}): Handle {
    const { x: _x, y: _y, w: _w, h: _h, ...rest } = options;
    return this.add({ id, type: "chart", chart, ...this.frameFor(options), ...rest });
  }

  public nativeChart(id: string, nativeType: string, data: CanvasNativeChartElement["data"], options: Partial<Rect> & { alt?: string; options?: Record<string, unknown> } = {}): Handle {
    const { x: _x, y: _y, w: _w, h: _h, ...rest } = options;
    return this.add({ id, type: "native-chart", nativeType, data, ...this.frameFor(options), ...rest });
  }

  public diagram(id: string, grammar: string, spec: Record<string, unknown>, options: Partial<Rect> & { alt?: string; role?: string } = {}): Handle {
    const { x: _x, y: _y, w: _w, h: _h, ...rest } = options;
    return this.add({ id, type: "diagram", grammar, spec, ...this.frameFor(options), ...rest } as CanvasDiagramElement);
  }

  /**
   * Lays a diagram out and lets you draw it.
   *
   * The engine ranks the nodes, orders each rank to reduce crossings, places
   * them in the frame, and routes the edges between whatever you drew. You get
   * a rectangle per node and decide what goes in it — this deck's own card, a
   * circle, a line of type. Nothing here has an opinion about what a node looks
   * like, which is the difference between a layout service and a template.
   *
   * `draw` returns the id the edges should attach to. Returning nothing attaches
   * them to the first element the callback added.
   */
  public graph(
    id: string,
    spec: Omit<GraphLayoutSpec, "frame"> & { frame?: Partial<Rect> },
    draw: (node: PlacedNode, frame: Rect) => string | Handle | void,
    options: { edgeStyle?: CanvasConnectorElement["style"]; route?: CanvasConnectorElement["route"]; edgeStyleFor?: (edge: GraphEdge) => CanvasConnectorElement["style"] | undefined } = {},
  ): Map<string, Rect> {
    const layout = layoutGraph({ ...spec, frame: this.frameFor(spec.frame ?? {}) });
    const anchors = new Map<string, string>();
    const frames = new Map<string, Rect>();

    for (const node of layout.nodes) {
      const frame: Rect = { x: node.x, y: node.y, w: node.w, h: node.h };
      const before = this.canvas.length;
      const drawn = draw(node, frame);
      const anchor = typeof drawn === "string"
        ? drawn
        : drawn?.id ?? this.canvas[before]?.id;
      if (!anchor) {
        throw new SlideAgentError(
          "EMPTY_GRAPH_NODE",
          `Graph "${id}" drew nothing for node "${node.id}", so its edges have nothing to attach to. Add at least one element in the draw callback, or return the id of the element the edges should meet.`,
          { graph: id, node: node.id },
        );
      }
      anchors.set(node.id, anchor);
      frames.set(node.id, frame);
    }

    layout.edges.forEach((edge, index) => {
      const from = anchors.get(edge.from);
      const to = anchors.get(edge.to);
      if (!from || !to || from === to) return;
      const style = options.edgeStyleFor?.(edge) ?? options.edgeStyle;
      this.connect(`${id}-edge-${index}`, from, to, {
        ...(options.route ? { route: options.route } : {}),
        ...(style ? { style } : {}),
      });
    });

    return frames;
  }

  /** A logical group whose children are positioned from its own origin. */
  public group(id: string, options: Partial<Rect> & { scale?: number; alt?: string; role?: string; zIndex?: number }, build: (children: CanvasElementSpec[]) => void): Handle {
    const children: CanvasElementSpec[] = [];
    build(children);
    const { x: _x, y: _y, w: _w, h: _h, ...rest } = options;
    return this.add({ id, type: "group", children, ...this.frameFor(options), ...rest });
  }

  public symbol(id: string, symbol: string, options: Partial<Rect> & { scale?: number; overrides?: Record<string, unknown>; alt?: string } = {}): Handle {
    if (!this.deckSymbols.has(symbol)) {
      throw new SlideAgentError(
        "UNKNOWN_SYMBOL",
        `Slide "${this.options.id}" places symbol "${symbol}", which the deck does not define.${this.deckSymbols.size ? ` Defined: ${[...this.deckSymbols.keys()].join(", ")}.` : " No symbols were declared."}`,
        { symbol, defined: [...this.deckSymbols.keys()] },
      );
    }
    const { x: _x, y: _y, w: _w, h: _h, ...rest } = options;
    return this.add({ id, type: "symbol-instance", symbol, ...this.frameFor(options), ...rest } as CanvasElementSpec);
  }

  public toSpec(): SlideSpec {
    const { id, title, kind, subtitle, background, designIntent, composition, communication, chrome, notes, sources } = this.options;
    return {
      id,
      kind: kind ?? "custom",
      title,
      canvas: this.canvas,
      ...(subtitle ? { subtitle } : {}),
      ...(background ? { background } : {}),
      ...(designIntent ? { designIntent } : {}),
      ...(composition ? { composition } : {}),
      ...(communication ? { communication } : {}),
      ...(chrome !== undefined ? { chrome } : {}),
      ...(notes?.length ? { speakerNotes: notes } : {}),
      ...(sources?.length ? { sources } : {}),
    };
  }
}

export class DeckBuilder {
  private readonly slides: SlideBuilder[] = [];
  private readonly symbols: Map<string, DeckSymbol>;
  public readonly width: number;
  public readonly height: number;

  public constructor(private readonly options: DeckOptions) {
    const format = SLIDE_FORMATS[options.format ?? "16:9"];
    this.width = options.width ?? format.width;
    this.height = options.height ?? format.height;
    this.symbols = new Map((options.symbols ?? []).map((symbol) => [symbol.id, symbol]));
  }

  /** The whole slide area, for a full-bleed plate or a manual layout. */
  public get frame(): Rect {
    return { x: 0, y: 0, w: this.width, h: this.height };
  }

  /** The slide inset by an even margin. */
  public page(margin = 0.72): Rect {
    return inset(this.frame, margin);
  }

  public slide(options: SlideOptions): SlideBuilder {
    const builder = new SlideBuilder(options, this.frame, this.symbols);
    this.slides.push(builder);
    return builder;
  }

  /** Declares a reusable collection of elements the deck defines itself. */
  public defineSymbol(symbol: DeckSymbol): void {
    this.symbols.set(symbol.id, symbol);
  }

  public toOutline(): PresentationOutline {
    if (this.slides.length === 0) {
      throw new SlideAgentError("EMPTY_DECK", "This build script produced no slides.", {});
    }
    const { brief, narrative, creativeDirection, exploration, sequencePlan, claims, sourceLedger, completeness, hostCapabilities, slideChrome } = this.options;
    return {
      brief: {
        ...brief,
        visualDirection: brief.visualDirection ?? creativeDirection?.concept ?? "",
        slideCount: brief.slideCount ?? this.slides.length,
        outputRequirements: brief.outputRequirements ?? [],
        keyTopics: brief.keyTopics ?? [],
        sourcePrompt: brief.sourcePrompt ?? "",
      },
      narrative,
      ...(completeness ? { completeness } : {}),
      ...(creativeDirection ? { creativeDirection } : {}),
      ...(exploration ? { exploration } : {}),
      ...(sequencePlan ? { sequencePlan } : {}),
      ...(claims ? { claims } : {}),
      ...(sourceLedger ? { sourceLedger } : {}),
      ...(hostCapabilities ? { hostCapabilities } : {}),
      ...(slideChrome ? { slideChrome } : {}),
      ...(this.symbols.size ? { symbols: [...this.symbols.values()] } : {}),
      slides: this.slides.map((slide) => slide.toSpec()),
    };
  }
}

/** Starts a deck. The return value is what a build script exports. */
export function defineDeck(options: DeckOptions): DeckBuilder {
  return new DeckBuilder(options);
}
