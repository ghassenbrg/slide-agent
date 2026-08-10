import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { ElementWriter } from "../components/element-writer.js";
import { PptxGenJS, type NativePresentation } from "../components/pptx-values.js";
import { ImageManager, remoteAssetPolicy, type ImageResolver, type RemoteAssetPolicy } from "../images/image-manager.js";
import { FreeformComposer } from "../layouts/freeform-composer.js";
import { LayoutRegistry, type LayoutFallback } from "../layouts/layout-registry.js";
import { footerAppliesTo, logoAppliesTo, type BrandKit } from "../design/brand.js";
import { withSecondaryLanguage, type BilingualMode } from "../design/bilingual.js";
import { resolveTokens } from "../design/tokens.js";
import { Grid } from "../design/grid.js";
import { CreativeDirector } from "../themes/creative-director.js";
import { ThemeManager } from "../themes/theme-manager.js";
import { readImageSize } from "../images/dimensions.js";
import { cropForFocalPoint } from "./pptx-postprocess.js";
import type {
  CanvasElementSpec,
  CanvasImageElement,
  DeckManifest,
  DeckSymbol,
  ElementRecord,
  PresentationOutline,
  SlideAgentConfig,
  SlideSpec,
} from "../types/index.js";
import { ensureContrast, requiredContrast } from "../utils/color.js";
import { buildTimestamp } from "../utils/reproducible.js";
import type { ExtensionRegistry } from "../extensions.js";
import type { ShapePostProcess } from "./pptx-postprocess.js";

export interface BuiltDeck {
  presentation: NativePresentation;
  manifest: DeckManifest;
  outline: PresentationOutline;
  config: SlideAgentConfig;
  /** Slides whose `kind` matched no registered layout and used a substitute. */
  layoutFallbacks: LayoutFallback[];
  /**
   * Hyperlinks refused by the scheme allowlist, with the slide they were on.
   * Refusals are reported rather than silently dropped: a model that authored
   * a `file://` link needs to know the deck shipped without it.
   */
  rejectedLinks: Array<{ slide: number; reason: string }>;
  /**
   * Authored properties OOXML supports and PptxGenJS cannot emit — text
   * columns, source crops, picture masks, blip effects — applied to the
   * package by `PptxExporter` after PptxGenJS has written it.
   */
  postProcess: ShapePostProcess[];
  /**
   * Where each authored image ended up on this machine, keyed by the path the
   * author wrote. The packager needs both: the local bytes to copy in, and the
   * original reference to keep as provenance.
   */
  resolvedAssets: Map<string, string>;
}

/**
 * The crop that makes `fit: "cover"` mean cover.
 *
 * PptxGenJS writes a zeroed source rectangle and stretches the picture to the
 * frame, so a 16:9 photograph in a 2:1 box came out horizontally stretched —
 * "cover" was doing the one thing it exists to avoid. Knowing the source's own
 * proportions is what turns that back into a crop, and a declared focal point
 * is what keeps the subject inside it.
 */
async function coverCrop(
  element: CanvasImageElement,
  localPath: string,
): Promise<{ treatment?: CanvasImageElement["treatment"] }> {
  const fit = element.fit ?? "cover";
  const focal = element.treatment?.focalPoint ?? { x: 0.5, y: 0.5 };
  // An explicit crop is the author's, and it wins.
  if (fit !== "cover" || element.treatment?.crop) return {};
  const size = await readImageSize(localPath);
  if (!size || element.w <= 0 || element.h <= 0) return {};
  const crop = cropForFocalPoint(focal, size.width / size.height, element.w / element.h);
  return crop ? { treatment: { ...element.treatment, crop } } : {};
}

/** The symbols one canvas places, groups included. */
function symbolsUsedBy(canvas: CanvasElementSpec[] | undefined): Set<string> {
  const used = new Set<string>();
  for (const element of canvas ?? []) {
    if (element.type === "symbol-instance") used.add(element.symbol);
    else if (element.type === "group") for (const id of symbolsUsedBy(element.children)) used.add(id);
  }
  return used;
}

/** Every image element on a slide, including those nested in groups and symbols. */
function imagesIn(canvas: CanvasElementSpec[] | undefined): CanvasElementSpec[] {
  const found: CanvasElementSpec[] = [];
  for (const element of canvas ?? []) {
    if (element.type === "image") found.push(element);
    else if (element.type === "group") found.push(...imagesIn(element.children));
  }
  return found;
}

/**
 * Attribution lines for the pictures on one slide.
 *
 * A licence that requires a credit is not satisfied by the credit sitting in
 * a JSON file on the author's laptop; it has to travel with the deck. Speaker
 * notes are where it can travel without the model having to find room for it
 * in a composition it already balanced.
 */
function creditsFor(spec: SlideSpec, symbols: Map<string, DeckSymbol>): string[] {
  const lines: string[] = [];
  // Only the symbols this slide actually places: a credit repeated on every
  // slide because a symbol exists somewhere in the deck is noise, not
  // attribution.
  const used = [...symbolsUsedBy(spec.canvas)].flatMap((id) => imagesIn(symbols.get(id)?.elements));
  for (const element of [...imagesIn(spec.canvas), ...used]) {
    if (element.type !== "image") continue;
    const { credit, license, generated, generator, source } = element.provenance ?? {};
    if (generated) {
      lines.push(`- ${element.alt} — generated image${generator ? ` (${String(generator)})` : ""}${credit ? `, ${String(credit)}` : ""}`);
      continue;
    }
    if (!credit && !license) continue;
    const origin = typeof source === "string" && /^https?:/i.test(source) ? ` — ${source}` : "";
    lines.push(`- ${element.alt} — ${[credit, license].filter(Boolean).join(", ")}${origin}`);
  }
  return lines;
}

function notesFor(spec: SlideSpec, symbols: Map<string, DeckSymbol>): string {
  const body = [...(spec.speakerNotes ?? [])];
  if (spec.sources?.length) {
    body.push("", "[Sources]");
    for (const source of spec.sources) {
      body.push(`- ${source.label ?? source.url ?? source.note ?? "Source"}${source.url ? ` — ${source.url}` : ""}`);
    }
    body.push("[/Sources]");
  }
  const credits = creditsFor(spec, symbols);
  if (credits.length > 0) {
    body.push("", "[Credits]", ...credits, "[/Credits]");
  }
  return body.join("\n");
}

export class DeckBuilder {
  public readonly layouts: LayoutRegistry;
  private readonly imageResolver: ImageResolver;
  private readonly builtInImages: ImageManager;

  public constructor(
    private readonly config: SlideAgentConfig,
    private readonly options: {
      layouts?: LayoutRegistry;
      imageResolver?: ImageResolver;
      remoteAssets?: RemoteAssetPolicy;
      brand?: BrandKit;
      bilingual?: BilingualMode;
      extensions?: ExtensionRegistry;
      /** Where a relative asset path is relative to — normally the scene's own directory. */
      assetBaseDir?: string;
    } = {},
  ) {
    this.layouts = options.layouts ?? new LayoutRegistry(config, options.extensions);
    // Per-user cache: a shared, world-readable directory under the system temp
    // path is writable by every account on the host.
    this.builtInImages = new ImageManager(
      path.join(tmpdir(), `slide-agent-image-cache-${userInfo().username}`),
      options.remoteAssets ?? remoteAssetPolicy(),
      options.assetBaseDir,
    );
    // A host resolver is the image-sourcing seam: stock search, a generation
    // service, an internal asset library. It replaces the built-in entirely,
    // so whatever it returns is what gets embedded.
    this.imageResolver = options.extensions?.assets ?? options.imageResolver ?? this.builtInImages;
  }

  /** Format and compatibility notes raised while resolving images. */
  public get imageWarnings(): string[] {
    return this.builtInImages.warnings;
  }

  public async build(outline: PresentationOutline): Promise<BuiltDeck> {
    const design = new CreativeDirector().resolve(outline, this.config);
    const effectiveConfig = design.config;
    const resolvedOutline: PresentationOutline = { ...outline, creativeDirection: design.direction };
    this.layouts.configure(effectiveConfig, design.direction);
    const presentation = new PptxGenJS();
    new ThemeManager().apply(presentation, effectiveConfig, outline.brief.title, design.direction);
    const manifest: DeckManifest = {
      schemaVersion: "1.0",
      presentationTitle: outline.brief.title,
      width: effectiveConfig.dimensions.width,
      height: effectiveConfig.dimensions.height,
      createdAt: buildTimestamp().toISOString(),
      creativeDirection: design.direction,
      slides: [],
    };

    const layoutFallbacks: LayoutFallback[] = [];
    const rejectedLinks: Array<{ slide: number; reason: string }> = [];
    const postProcess: ShapePostProcess[] = [];
    // Symbol pictures resolve once, up front: a symbol placed on nine slides
    // must not be nine downloads.
    const symbols = new Map((await this.resolveSymbols(resolvedOutline.symbols ?? [])).map((symbol) => [symbol.id, symbol]));
    for (let index = 0; index < resolvedOutline.slides.length; index += 1) {
      const rawSpec = this.options.bilingual
        ? withSecondaryLanguage(
          resolvedOutline.slides[index]!,
          this.options.bilingual,
          resolveTokens(effectiveConfig, design.direction),
          new Grid(effectiveConfig.dimensions, resolveTokens(effectiveConfig, design.direction)),
        )
        : resolvedOutline.slides[index]!;
      const spec = await this.resolveAssets(rawSpec);
      const slide = presentation.addSlide();
      slide.background = { color: spec.background?.replace(/^#/, "") ?? effectiveConfig.colors.background };
      const records: ElementRecord[] = [];
      const writer = new ElementWriter(slide, records, effectiveConfig, index + 1);
      if (spec.canvas) {
        new FreeformComposer(effectiveConfig, design.direction, this.options.extensions, [...symbols.values()])
          .render(writer, spec, index + 1);
      } else {
        const fallback = this.layouts.render(writer, spec, {
          slideNumber: index + 1,
          totalSlides: resolvedOutline.slides.length,
          config: effectiveConfig,
        });
        if (fallback) layoutFallbacks.push(fallback);
      }
      await this.stampBrand(writer, index + 1, resolvedOutline.slides.length, effectiveConfig, design.direction);
      for (const reason of writer.rejectedLinks) rejectedLinks.push({ slide: index + 1, reason });
      postProcess.push(...writer.postProcess);
      const notes = notesFor(spec, symbols);
      if (effectiveConfig.generation.includeSpeakerNotes && notes) slide.addNotes(notes);
      manifest.slides.push({
        number: index + 1,
        id: spec.id,
        title: spec.title,
        kind: spec.kind,
        backgroundColor: spec.background?.replace(/^#/, "") ?? effectiveConfig.colors.background,
        compositionMode: spec.canvas ? "model-authored" : "fallback-layout",
        ...(spec.designIntent ? { designIntent: spec.designIntent } : {}),
        elements: records,
        notes: spec.speakerNotes ?? [],
      });
    }
    return {
      presentation,
      manifest,
      // The returned outline keeps the *authored* asset paths: it is what the
      // scene is emitted from, and a scene carrying this machine's image cache
      // paths would not rebuild anywhere else.
      outline: resolvedOutline,
      config: effectiveConfig,
      layoutFallbacks,
      rejectedLinks,
      postProcess,
      resolvedAssets: this.resolvedAssets,
    };
  }

  /**
   * Adds the brand mark and legal line last, so they sit above the slide's own
   * content and are never covered by it.
   */
  private async stampBrand(
    writer: ElementWriter,
    slideNumber: number,
    totalSlides: number,
    config: SlideAgentConfig,
    direction: ReturnType<CreativeDirector["resolve"]>["direction"],
  ): Promise<void> {
    const brand = this.options.brand;
    if (!brand) return;
    const tokens = resolveTokens(config, direction);
    const grid = new Grid(config.dimensions, tokens);
    const safe = grid.safe;

    if (brand.logo && logoAppliesTo(brand, slideNumber, totalSlides)) {
      const width = Math.min(brand.logo.widthInches, safe.w * 0.25);
      const height = width * 0.32;
      const right = brand.logo.placement.endsWith("right");
      const bottom = brand.logo.placement.startsWith("bottom");
      writer.addImage("brand-logo", await this.imageResolver.resolve(brand.logo.path), `${brand.name} logo`, {
        x: right ? safe.x + safe.w - width : safe.x,
        y: bottom ? grid.height - grid.margin - height : safe.y,
        w: width,
        h: height,
      }, { fit: "contain", role: "decorative", intentionalOverlap: true });
    }

    if (brand.footer && footerAppliesTo(brand, slideNumber)) {
      const footer = grid.footer;
      writer.addText("brand-footer", brand.footer.text, {
        x: footer.x,
        y: footer.y,
        w: footer.w * 0.6,
        h: footer.h,
      }, {
        fontSize: tokens.type.micro,
        color: ensureContrast(config.colors.muted, config.colors.background, requiredContrast(tokens.type.micro)),
        role: "footer",
      });
    }
  }

  /** Resolves the pictures inside author-defined symbols once, up front. */
  private async resolveSymbols(symbols: DeckSymbol[]): Promise<DeckSymbol[]> {
    return Promise.all(symbols.map(async (symbol) => ({
      ...symbol,
      elements: await this.resolveCanvas(symbol.elements),
    })));
  }

  /**
   * Where each authored image ended up on this machine, keyed by the path the
   * author wrote. The packager needs both: the local bytes to copy, and the
   * original reference to keep as provenance.
   */
  public readonly resolvedAssets = new Map<string, string>();

  /** Turns every authored image path into a local file, groups included. */
  private async resolveCanvas(canvas: CanvasElementSpec[]): Promise<CanvasElementSpec[]> {
    return Promise.all(canvas.map(async (element) => {
      if (element.type === "group") return { ...element, children: await this.resolveCanvas(element.children) };
      if (element.type !== "image") return element;
      // Resolution replaces the authored path with a local file, so the origin
      // has to be preserved first or the manifest ends up recording a cache
      // path and nothing about where the picture came from.
      const local = await this.imageResolver.resolve(element.path);
      this.resolvedAssets.set(element.path, local);
      return {
        ...element,
        provenance: { ...element.provenance, source: element.provenance?.source ?? element.path },
        path: local,
        ...await coverCrop(element, local),
      };
    }));
  }

  private async resolveAssets(spec: SlideSpec): Promise<SlideSpec> {
    const visual = spec.visual?.path ? {
      ...spec.visual,
      path: await this.imageResolver.resolve(spec.visual.path),
    } : spec.visual;
    const canvas = spec.canvas ? await this.resolveCanvas(spec.canvas) : undefined;
    return {
      ...spec,
      ...(visual ? { visual } : {}),
      ...(canvas ? { canvas } : {}),
    };
  }
}
