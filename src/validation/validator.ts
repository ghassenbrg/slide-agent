import { readFile } from "node:fs/promises";
import path from "node:path";

import { PptxInspector } from "../editing/pptx-inspector.js";
import type { Logger } from "../logging/logger.js";
import { silentLogger } from "../logging/logger.js";
import { outputLayout } from "../output/output-layout.js";
import { PresentationRenderer } from "../rendering/renderer.js";
import type { DeckManifest, SlideAgentConfig, ValidationIssue, ValidationReport } from "../types/index.js";
import { exists, fileSha256, writeJson } from "../utils/files.js";
import type { QualityCheck } from "../extensions.js";
import { AccessibilityValidator, type AccessibilityOptions } from "./accessibility.js";
import { ManifestValidator } from "./manifest-validator.js";
import { scoreDeck } from "./quality.js";
import { PackageValidator } from "./package-validator.js";
import { SchemaValidator } from "./schema-validator.js";

export interface ValidationOptions {
  manifest?: DeckManifest | string;
  reportPath?: string;
  render?: boolean;
  previewsDir?: string;
  pdfPath?: string;
  iterations?: number;
  /** Contrast level for accessibility checks. Defaults to AA. */
  accessibility?: AccessibilityOptions;
  /** Extra checks contributed by a host. */
  checks?: QualityCheck[];
}



/** Adds the typefaces the deck's own creative direction chose to the known set. */
function withDeckFonts(config: SlideAgentConfig, manifest: DeckManifest): SlideAgentConfig {
  const typography = manifest.creativeDirection?.typography;
  const authored = manifest.slides.flatMap((slide) =>
    slide.elements.map((element) => element.fontFace).filter((face): face is string => Boolean(face)),
  );
  const named = [typography?.display, typography?.heading, typography?.body, typography?.mono, typography?.numeric]
    .filter((face): face is string => Boolean(face));
  const extra = [...named, ...(typography?.fallbacks ?? []), ...authored];
  if (extra.length === 0) return config;
  return {
    ...config,
    fonts: { ...config.fonts, supported: [...new Set([...config.fonts.supported, ...extra])] },
  };
}

function summary(issues: ValidationIssue[]): ValidationReport["summary"] {
  return {
    errors: issues.filter((item) => item.severity === "error").length,
    warnings: issues.filter((item) => item.severity === "warning").length,
    info: issues.filter((item) => item.severity === "info").length,
  };
}

export class PresentationValidator {
  public constructor(
    private readonly config: SlideAgentConfig,
    private readonly logger: Logger = silentLogger,
  ) {}

  /**
   * Finds the generation manifest written next to a deck by `create` and
   * returns it only when its recorded SHA-256 still matches the package, so
   * authoring metadata (for example intentional overlap) survives a later
   * `validate` run without ever trusting a stale or foreign manifest.
   */
  private async discoverManifest(input: string): Promise<DeckManifest | undefined> {
    try {
      const manifestPath = outputLayout(input).manifest;
      if (!(await exists(manifestPath))) return undefined;
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as DeckManifest;
      if (!manifest.packageSha256 || manifest.packageSha256 !== await fileSha256(input)) return undefined;
      return manifest;
    } catch {
      return undefined;
    }
  }

  public async validate(inputPath: string, options: ValidationOptions = {}): Promise<ValidationReport> {
    const input = path.resolve(inputPath);
    this.logger.info("validation.start", "Validating presentation", { input });
    const packageResult = await new PackageValidator().validate(input);
    let manifest: DeckManifest;
    const issues = [...packageResult.issues];
    if (packageResult.issues.every((item) => item.code !== "corrupt-pptx")) {
      issues.push(...await new SchemaValidator().validate(input));
    }
    if (typeof options.manifest === "string") manifest = JSON.parse(await readFile(options.manifest, "utf8")) as DeckManifest;
    else if (options.manifest) manifest = options.manifest;
    else {
      const discovered = await this.discoverManifest(input);
      if (discovered) {
        manifest = discovered;
        this.logger.info("validation.manifest", "Using the generation manifest stored next to the deck", { input });
      } else {
        const inspection = await new PptxInspector().inspect(input);
        manifest = inspection.manifest;
        inspection.warnings.forEach((message) => issues.push({ code: "inspection-warning", severity: "warning", message, fixable: false }));
        inspection.unsupportedFeatures.forEach((feature) => issues.push({
          code: "unsupported-feature-preserved",
          severity: "info",
          message: `Unsupported edit feature detected and preserved where possible: ${feature}.`,
          fixable: false,
        }));
      }
    }
    // A standalone `validate` run knows only the base config, so every font the
    // deck's own creative direction chose would report as unsupported. The
    // manifest records that direction; honour it.
    const deckConfig = withDeckFonts(this.config, manifest);
    issues.push(...new ManifestValidator(deckConfig).validate(manifest));
    issues.push(...new AccessibilityValidator(deckConfig, options.accessibility ?? {}).validate(manifest));
    for (const check of options.checks ?? []) {
      try {
        issues.push(...await check.run(manifest, deckConfig));
      } catch (error) {
        issues.push({
          code: "custom-check-failed",
          severity: "warning",
          message: `Custom check "${check.id}" threw: ${error instanceof Error ? error.message : String(error)}`,
          fixable: false,
        });
      }
    }

    let render: ValidationReport["render"] = { status: "skipped", previewFiles: [] };
    if (options.render) {
      try {
        const result = await new PresentationRenderer(this.logger).render(
          input,
          options.previewsDir ?? path.join(path.dirname(input), `${path.basename(input, ".pptx")}-previews`),
          { width: this.config.generation.renderWidth, height: this.config.generation.renderHeight, pdfPath: options.pdfPath, manifest },
        );
        render = {
          status: "pass",
          previewFiles: result.previewFiles,
          ...(result.pdfPath ? { pdfPath: result.pdfPath } : {}),
          ...(result.mode ? { mode: result.mode } : {}),
        };
        if (result.previewFiles.length !== manifest.slides.length) {
          issues.push({
            code: "render-slide-count-mismatch",
            severity: "error",
            message: `Rendered ${result.previewFiles.length} previews for ${manifest.slides.length} slides.`,
            fixable: false,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        render = { status: "fail", previewFiles: [], error: message };
        issues.push({ code: "render-failed", severity: "error", message, fixable: false });
      }
    }
    const counts = summary(issues);
    const status: ValidationReport["status"] = counts.errors > 0 ? "fail" : counts.warnings > 0 ? "warning" : "pass";
    const report: ValidationReport = {
      schemaVersion: "1.0",
      status,
      presentation: input,
      checkedAt: new Date().toISOString(),
      slideCount: manifest.slides.length,
      summary: counts,
      iterations: options.iterations ?? 1,
      issues,
      quality: scoreDeck(manifest, deckConfig, issues),
      render,
    };
    if (options.reportPath) await writeJson(options.reportPath, report);
    this.logger.info("validation.complete", "Validated presentation", { status, ...counts });
    return report;
  }
}
