import type { ElementWriter, Frame } from "./components/element-writer.js";
import type { Grid } from "./design/grid.js";
import type { DeckTokens } from "./design/tokens.js";
import { remoteAssetPolicy, SUPPORTED_IMAGE_EXTENSIONS, type ImageResolver } from "./images/image-manager.js";
import { BUILT_IN_LAYOUTS, type LayoutRenderer } from "./layouts/layout-registry.js";
import { BUILT_IN_GRAMMARS } from "./diagrams/grammars.js";
import type {
  ChartSpec,
  CreativeDirection,
  DeckManifest,
  DimensionsConfig,
  RenderResult,
  SlideAgentConfig,
  ValidationIssue,
} from "./types/index.js";

/**
 * The public extension surface.
 *
 * Previously the only thing a host could replace was the layout registry and
 * the image resolver, so anything else — a house diagram grammar, a different
 * chart renderer, an organisation's own review rules — meant forking. These
 * interfaces are the supported alternative. They are deliberately narrow: each
 * one takes the resolved design system and returns work through `ElementWriter`
 * so extensions get the same manifest tracking and validation as built-ins.
 */

/** Chart kinds the built-in renderer draws natively. */
export const BUILT_IN_CHART_KINDS = [
  "bar", "bar-stacked", "bar-horizontal", "line", "area",
  "pie", "doughnut", "scatter", "radar", "waterfall",
] as const;

export interface Capabilities {
  diagrams: Array<{ id: string; description: string }>;
  charts: Array<{ id: string; kinds: string[] }>;
  checks: Array<{ id: string; description?: string }>;
  layouts: string[];
  /** How, and whether, this installation can put a picture on a slide. */
  images: {
    localPaths: boolean;
    /** `allowRemoteAssets` or SLIDE_AGENT_ALLOW_REMOTE_IMAGES. */
    remoteUrls: boolean;
    /** A host-installed resolver — stock search, an image generator. */
    provider: string | null;
    formats: string[];
  };
  renderBackend?: string;
  tokenizer?: string;
}

/** Context handed to every visual extension. */
export interface RenderContext {
  tokens: DeckTokens;
  grid: Grid;
  config: SlideAgentConfig;
  direction?: CreativeDirection;
}

/** A named diagram form, e.g. a swimlane or a layered architecture. */
export interface DiagramGrammar<Spec = unknown> {
  id: string;
  /** Human-readable description, published through the contract. */
  description: string;
  render(writer: ElementWriter, spec: Spec, frame: Frame, context: RenderContext): void;
}

/** An alternative renderer for one or more chart kinds. */
export interface ChartRenderer {
  id: string;
  kinds: string[];
  render(writer: ElementWriter, name: string, chart: ChartSpec, frame: Frame, context: RenderContext): void;
}

/** A host-supplied validation rule, e.g. a brand or legal requirement. */
export interface QualityCheck {
  id: string;
  description?: string;
  run(manifest: DeckManifest, config: SlideAgentConfig): ValidationIssue[] | Promise<ValidationIssue[]>;
}

/** An alternative preview backend, e.g. one that does not need LibreOffice. */
export interface RenderBackend {
  id: string;
  render(input: string, outputDir: string, options: { width?: number; height?: number; pdfPath?: string }): Promise<RenderResult>;
}

/** Replaces how `creativeDirection` becomes a concrete design system. */
export interface DesignTokenizer {
  id: string;
  derive(config: SlideAgentConfig, direction: CreativeDirection | undefined, dimensions: DimensionsConfig): DeckTokens;
}

export interface Extensions {
  layouts?: Record<string, LayoutRenderer>;
  diagrams?: DiagramGrammar[];
  charts?: ChartRenderer[];
  checks?: QualityCheck[];
  assets?: ImageResolver;
  render?: RenderBackend;
  tokenizer?: DesignTokenizer;
}

/**
 * A mutable registry of everything a host has contributed. Built-ins register
 * through the same registry the API exposes, so an extension is never a
 * second-class citizen.
 */
export class ExtensionRegistry {
  private readonly diagramGrammars = new Map<string, DiagramGrammar>();
  private readonly chartRenderers = new Map<string, ChartRenderer>();
  private readonly qualityChecks = new Map<string, QualityCheck>();
  private readonly layoutRenderers = new Map<string, LayoutRenderer>();
  public assets?: ImageResolver;
  public renderBackend?: RenderBackend;
  public tokenizer?: DesignTokenizer;

  public constructor(extensions: Extensions = {}) {
    this.add(extensions);
  }

  public add(extensions: Extensions): this {
    for (const [id, renderer] of Object.entries(extensions.layouts ?? {})) this.layoutRenderers.set(id, renderer);
    for (const grammar of extensions.diagrams ?? []) this.diagramGrammars.set(grammar.id, grammar);
    for (const renderer of extensions.charts ?? []) this.chartRenderers.set(renderer.id, renderer);
    for (const check of extensions.checks ?? []) this.qualityChecks.set(check.id, check);
    if (extensions.assets) this.assets = extensions.assets;
    if (extensions.render) this.renderBackend = extensions.render;
    if (extensions.tokenizer) this.tokenizer = extensions.tokenizer;
    return this;
  }

  public diagram(id: string): DiagramGrammar | undefined {
    return this.diagramGrammars.get(id);
  }

  /** The renderer registered for a chart kind, if a host replaced it. */
  public chartFor(kind: string): ChartRenderer | undefined {
    for (const renderer of this.chartRenderers.values()) {
      if (renderer.kinds.includes(kind)) return renderer;
    }
    return undefined;
  }

  public get checks(): QualityCheck[] {
    return [...this.qualityChecks.values()];
  }

  public get layouts(): Record<string, LayoutRenderer> {
    return Object.fromEntries(this.layoutRenderers);
  }

  /**
   * What this installation can actually do. A model should plan within the
   * capabilities that are present rather than guessing, so this is published
   * through the CLI and MCP.
   */
  public capabilities(): Capabilities {
    // Built-ins are listed alongside host contributions. A model asking what
    // this installation can do wants the whole answer, not the extensions.
    const diagrams = new Map(BUILT_IN_GRAMMARS.map(({ id, description }) => [id, { id, description }]));
    for (const { id, description } of this.diagramGrammars.values()) diagrams.set(id, { id, description });
    const layouts = new Set<string>([...BUILT_IN_LAYOUTS, ...this.layoutRenderers.keys()]);

    return {
      diagrams: [...diagrams.values()],
      charts: [
        { id: "built-in", kinds: [...BUILT_IN_CHART_KINDS] },
        ...[...this.chartRenderers.values()].map(({ id, kinds }) => ({ id, kinds })),
      ],
      checks: [...this.qualityChecks.values()].map(({ id, description }) => ({ id, ...(description ? { description } : {}) })),
      layouts: [...layouts],
      images: {
        // The three ways a picture can reach a slide, stated plainly so a
        // model plans within them instead of designing a photo-led deck it
        // then cannot source a single image for.
        localPaths: true,
        remoteUrls: remoteAssetPolicy().allow,
        provider: this.assets?.id ?? null,
        formats: [...SUPPORTED_IMAGE_EXTENSIONS],
      },
      ...(this.renderBackend ? { renderBackend: this.renderBackend.id } : {}),
      ...(this.tokenizer ? { tokenizer: this.tokenizer.id } : {}),
    };
  }
}
