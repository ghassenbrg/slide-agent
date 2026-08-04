import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { ElementWriter } from "../components/element-writer.js";
import { PptxGenJS, type NativePresentation } from "../components/pptx-values.js";
import { ImageManager, remoteAssetPolicy, type ImageResolver, type RemoteAssetPolicy } from "../images/image-manager.js";
import { FreeformComposer } from "../layouts/freeform-composer.js";
import { LayoutRegistry, type LayoutFallback } from "../layouts/layout-registry.js";
import { CreativeDirector } from "../themes/creative-director.js";
import { ThemeManager } from "../themes/theme-manager.js";
import type { DeckManifest, ElementRecord, PresentationOutline, SlideAgentConfig, SlideSpec } from "../types/index.js";

export interface BuiltDeck {
  presentation: NativePresentation;
  manifest: DeckManifest;
  outline: PresentationOutline;
  config: SlideAgentConfig;
  /** Slides whose `kind` matched no registered layout and used a substitute. */
  layoutFallbacks: LayoutFallback[];
}

function notesFor(spec: SlideSpec): string {
  const body = [...(spec.speakerNotes ?? [])];
  if (spec.sources?.length) {
    body.push("", "[Sources]");
    for (const source of spec.sources) {
      body.push(`- ${source.label ?? source.url ?? source.note ?? "Source"}${source.url ? ` — ${source.url}` : ""}`);
    }
    body.push("[/Sources]");
  }
  return body.join("\n");
}

export class DeckBuilder {
  public readonly layouts: LayoutRegistry;
  private readonly imageResolver: ImageResolver;

  public constructor(
    private readonly config: SlideAgentConfig,
    options: { layouts?: LayoutRegistry; imageResolver?: ImageResolver; remoteAssets?: RemoteAssetPolicy } = {},
  ) {
    this.layouts = options.layouts ?? new LayoutRegistry(config);
    // Per-user cache: a shared, world-readable directory under the system temp
    // path is writable by every account on the host.
    this.imageResolver = options.imageResolver ?? new ImageManager(
      path.join(tmpdir(), `slide-agent-image-cache-${userInfo().username}`),
      options.remoteAssets ?? remoteAssetPolicy(),
    );
  }

  public async build(outline: PresentationOutline): Promise<BuiltDeck> {
    const design = new CreativeDirector().resolve(outline, this.config);
    const effectiveConfig = design.config;
    const resolvedOutline: PresentationOutline = { ...outline, creativeDirection: design.direction };
    this.layouts.configure(effectiveConfig);
    const presentation = new PptxGenJS();
    new ThemeManager().apply(presentation, effectiveConfig, outline.brief.title, design.direction);
    const manifest: DeckManifest = {
      schemaVersion: "1.0",
      presentationTitle: outline.brief.title,
      width: effectiveConfig.dimensions.width,
      height: effectiveConfig.dimensions.height,
      createdAt: new Date().toISOString(),
      creativeDirection: design.direction,
      slides: [],
    };

    const layoutFallbacks: LayoutFallback[] = [];
    for (let index = 0; index < resolvedOutline.slides.length; index += 1) {
      const rawSpec = resolvedOutline.slides[index]!;
      const spec = await this.resolveAssets(rawSpec);
      const slide = presentation.addSlide();
      slide.background = { color: spec.background?.replace(/^#/, "") ?? effectiveConfig.colors.background };
      const records: ElementRecord[] = [];
      const writer = new ElementWriter(slide, records, effectiveConfig);
      if (spec.canvas) {
        new FreeformComposer(effectiveConfig).render(writer, spec);
      } else {
        const fallback = this.layouts.render(writer, spec, {
          slideNumber: index + 1,
          totalSlides: resolvedOutline.slides.length,
          config: effectiveConfig,
        });
        if (fallback) layoutFallbacks.push(fallback);
      }
      const notes = notesFor(spec);
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
    return { presentation, manifest, outline: resolvedOutline, config: effectiveConfig, layoutFallbacks };
  }

  private async resolveAssets(spec: SlideSpec): Promise<SlideSpec> {
    const visual = spec.visual?.path ? {
      ...spec.visual,
      path: await this.imageResolver.resolve(spec.visual.path),
    } : spec.visual;
    const canvas = spec.canvas ? await Promise.all(spec.canvas.map(async (element) => element.type === "image" ? {
      ...element,
      path: await this.imageResolver.resolve(element.path),
    } : element)) : undefined;
    return {
      ...spec,
      ...(visual ? { visual } : {}),
      ...(canvas ? { canvas } : {}),
    };
  }
}
