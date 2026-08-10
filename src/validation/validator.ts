import { readFile } from "node:fs/promises";
import path from "node:path";

import { PptxInspector } from "../editing/pptx-inspector.js";
import type { Logger } from "../logging/logger.js";
import { silentLogger } from "../logging/logger.js";
import { outputLayout } from "../output/output-layout.js";
import { PresentationRenderer } from "../rendering/renderer.js";
import type {
  ArtifactGraph,
  DeckManifest,
  RoundTripReport,
  SlideAgentConfig,
  ValidationIssue,
  ValidationReport,
  VisualReviewFinding,
} from "../types/index.js";
import { exists, fileSha256, writeJson } from "../utils/files.js";
import type { QualityCheck } from "../extensions.js";
import { extractRenderedText } from "../rendering/text-extraction.js";
import { compareRenderedText } from "./fidelity.js";
import { verifyArtifactGraph } from "../artifacts/package.js";
import { computeVerdict } from "./readiness.js";
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
  /** Read the words back off the render and compare them with the deck. */
  fidelity?: boolean;
  /** Bind the report to the exact artifacts it describes. */
  artifacts?: ArtifactGraph;
  /** Result of rebuilding the emitted scene in a clean directory. */
  roundTrip?: RoundTripReport;
  /** Findings supplied by a host reviewer, folded into readiness. */
  visualFindings?: VisualReviewFinding[];
  /** Claim ids still marked `needs-review` in the deck's own ledger. */
  unresolvedClaims?: string[];
  /** Element ids the deck's claim ledger points at, so evidence means something. */
  claimedElementIds?: Set<string>;
  /**
   * Re-check a previously written artifact graph against the files on disk.
   * This is what makes a stale preview impossible to present as evidence on a
   * standalone `validate` run, where nothing has just been rendered.
   */
  verifyArtifacts?: boolean;
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

/** Slides still carrying an unresolved `[bracketed instruction]`. */
function placeholderSlideCount(manifest: DeckManifest): number {
  return manifest.slides.filter((slide) =>
    slide.elements.some((element) => /\[[^\]]{6,}\]/.test(element.text ?? "")),
  ).length;
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
    const layout = outputLayout(input);
    // The canonical path first, then where earlier versions wrote it: a
    // package built by 0.10 must still validate under 0.11.
    for (const manifestPath of [layout.manifest, layout.legacy.manifest]) {
      try {
        if (!(await exists(manifestPath))) continue;
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as DeckManifest;
        if (!manifest.packageSha256 || manifest.packageSha256 !== await fileSha256(input)) continue;
        return manifest;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  /**
   * The artifact graph a previous run recorded beside this deck, and only when
   * it describes *this* package: a graph whose PPTX hash has moved on belongs
   * to an earlier revision and proves nothing about this one.
   */
  private async discoverArtifactGraph(input: string): Promise<ArtifactGraph | undefined> {
    const layout = outputLayout(input);
    for (const reportPath of [layout.validation, layout.legacy.validation]) {
      try {
        if (!(await exists(reportPath))) continue;
        const previous = JSON.parse(await readFile(reportPath, "utf8")) as ValidationReport;
        const graph = previous.artifacts;
        if (!graph) continue;
        if (graph.pptx.sha256 !== await fileSha256(input)) continue;
        return graph;
      } catch {
        continue;
      }
    }
    return undefined;
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

    // A package built earlier records the hash of every artifact it produced.
    // Re-checking those hashes is the difference between "a preview exists"
    // and "this preview is of this deck".
    let carriedArtifacts: ArtifactGraph | undefined;
    if (options.verifyArtifacts !== false) {
      const previous = await this.discoverArtifactGraph(input);
      if (previous) {
        carriedArtifacts = previous;
        const problems = await verifyArtifactGraph(outputLayout(input).artifacts, previous);
        for (const problem of problems) {
          const stale = problem.problem === "changed";
          issues.push({
            code: stale ? "stale-preview" : "missing-preview",
            severity: "error",
            message: stale
              ? `${problem.path} is not the file this deck's report describes: its content no longer matches the recorded hash. Re-render before presenting it as evidence.`
              : `${problem.path} is named by this deck's report but is not on disk.`,
            details: { path: problem.path, recorded: previous.pptx.sha256 },
            fixable: false,
          });
        }
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
    // The render is the evidence. Reading the words back off it is the only
    // check that can catch a title autofit shrank until its last word fell off.
    let fidelity: ValidationReport["fidelity"];
    if (options.fidelity !== false && render.status === "pass" && render.previewFiles.length > 0) {
      const extracted = await extractRenderedText({
        ...(render.pdfPath ? { pdfPath: render.pdfPath } : {}),
        previewFiles: render.previewFiles,
      });
      const compared = compareRenderedText(manifest, extracted);
      fidelity = compared.report;
      issues.push(...compared.issues);
      this.logger.info("validation.fidelity", "Compared the render against the deck", {
        method: compared.report.method,
        status: compared.report.status,
      });
    }

    for (const finding of options.visualFindings ?? []) {
      issues.push({
        code: `visual-${finding.severity}`,
        severity: finding.severity === "blocking" ? "error" : finding.severity === "note" ? "info" : "warning",
        slide: finding.slide,
        ...(finding.elementIds ? { elementIds: finding.elementIds } : {}),
        message: `${finding.reviewer}: ${finding.observation} — ${finding.rationale} Target: ${finding.suggestedTarget}`,
        fixable: false,
      });
    }

    const counts = summary(issues);
    const heuristics = scoreDeck(manifest, deckConfig, issues, options.claimedElementIds ?? new Set());
    const verdict = computeVerdict({
      issues,
      heuristics,
      ...(fidelity ? { fidelity } : {}),
      ...(options.roundTrip ? { roundTrip: options.roundTrip } : {}),
      ...(options.visualFindings ? { visualFindings: options.visualFindings } : {}),
      render,
      ...(options.unresolvedClaims ? { unresolvedClaims: options.unresolvedClaims } : {}),
      placeholderSlides: placeholderSlideCount(manifest),
    });
    // `status` stays for contract 0.9 readers and stays package-oriented, so a
    // host that has not migrated sees the same kind of answer it always did.
    const status: ValidationReport["status"] = counts.errors > 0 ? "fail" : counts.warnings > 0 ? "warning" : "pass";
    const report: ValidationReport = {
      schemaVersion: "1.0",
      status,
      packageStatus: verdict.packageStatus,
      presentationReadiness: verdict.presentationReadiness,
      readinessReasons: verdict.readinessReasons,
      presentation: input,
      checkedAt: new Date().toISOString(),
      slideCount: manifest.slides.length,
      summary: counts,
      iterations: options.iterations ?? 1,
      issues,
      heuristics,
      quality: heuristics,
      ...(options.artifacts ?? carriedArtifacts ? { artifacts: (options.artifacts ?? carriedArtifacts)! } : {}),
      ...(fidelity ? { fidelity } : {}),
      ...(options.roundTrip ? { roundTrip: options.roundTrip } : {}),
      ...(options.visualFindings?.length ? { visualFindings: options.visualFindings } : {}),
      render,
    };
    if (options.reportPath) await writeJson(options.reportPath, report);
    this.logger.info("validation.complete", "Validated presentation", {
      status,
      packageStatus: verdict.packageStatus,
      readiness: verdict.presentationReadiness,
      ...counts,
    });
    return report;
  }
}
