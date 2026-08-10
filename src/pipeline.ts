import { randomUUID } from "node:crypto";
import path from "node:path";

import { loadConfig } from "./config/load-config.js";
import { PptxEditor } from "./editing/pptx-editor.js";
import { DeckBuilder, type BuiltDeck } from "./export/deck-builder.js";
import { PptxExporter } from "./export/pptx-exporter.js";
import { JsonLogger, type Logger } from "./logging/logger.js";
import { OutlinePlanner } from "./planner/outline-planner.js";
import { outputLayout } from "./output/output-layout.js";
import { remoteAssetPolicy } from "./images/image-manager.js";
import { applyBrandKit, loadBrandKit, type BrandKit } from "./design/brand.js";
import { RequestAnalyzer } from "./planner/request-analyzer.js";
import { PresentationRenderer } from "./rendering/renderer.js";
import { parseSceneNdjson, readSceneNdjson, serializeSceneNdjson, writeSceneNdjson } from "./serialization/scene-ndjson.js";
import { reviseScene } from "./serialization/revise-scene.js";
import { formatPatchDiff, patchOutline, type PatchOperation } from "./editing/patch-scene.js";
import { buildReviewPacket, type ReviewOptions } from "./review/packet.js";
import type { ReviewPacket } from "./review/types.js";
import { patchOperationSchema } from "./types/schemas.js";
import type {
  AgentResult,
  CreateRequest,
  EditRequest,
  ExecutionMetadata,
  DeckProvenance,
  PatchRequest,
  PresentationOutline,
  RenderRequest,
  ReviseRequest,
  RepairMode,
  StructuredAgentRequest,
  ValidateRequest,
  ValidationReport,
} from "./types/index.js";
import { SlideAgentError, errorDetails } from "./utils/errors.js";
import { CONTRACT_VERSION } from "./contract/index.js";
import { ExtensionRegistry, type Capabilities, type CapabilityReport, type Extensions } from "./extensions.js";
import { checkFontAvailability } from "./design/font-availability.js";
import { findExecutable } from "./utils/process.js";
import { exists, fileSha256, readUtf8, writeJson } from "./utils/files.js";
import { AutoFixer, type UnfixedIssue } from "./validation/auto-fixer.js";
import { defaultRepairMode, describeRepairs, detectRenderRegression, planRepairs, type RepairPlan } from "./validation/repair.js";
import { PresentationValidator } from "./validation/validator.js";
import { withPackageEvidence } from "./validation/readiness.js";
import { buildArtifactGraph, makeOutlinePortable } from "./artifacts/package.js";
import { verifyRoundTrip } from "./artifacts/round-trip.js";
import { VERSION } from "./version.js";

function metadata(
  command: ExecutionMetadata["command"],
  requestId: string,
  startedAt: Date,
  retries: number,
  provenance?: ExecutionMetadata["provenance"],
): ExecutionMetadata {
  const completed = new Date();
  return {
    requestId,
    command,
    contractVersion: CONTRACT_VERSION,
    ...(provenance ? { provenance } : {}),
    startedAt: startedAt.toISOString(),
    completedAt: completed.toISOString(),
    durationMs: completed.getTime() - startedAt.getTime(),
    retries,
    version: VERSION,
  };
}

/**
 * A build that produced a sound package is not an error, even when the deck is
 * not ready to present: those are the two different questions 0.10 separated,
 * and collapsing them back into one exit status would undo the separation.
 * `error` means the package itself is broken. `warning` means look at it.
 */
function resultStatus(report: ValidationReport | undefined, warnings: string[]): AgentResult["status"] {
  if (report?.packageStatus === "fail" || report?.status === "fail") return "error";
  if (report && report.presentationReadiness !== "ready") return "warning";
  if (report?.status === "warning" || warnings.length > 0) return "warning";
  return "success";
}

function summarize(issues: ValidationReport["issues"]): ValidationReport["summary"] {
  return {
    errors: issues.filter((item) => item.severity === "error").length,
    warnings: issues.filter((item) => item.severity === "warning").length,
    info: issues.filter((item) => item.severity === "info").length,
  };
}

function sameIssue(issue: { code: string; slide?: number; elementIds?: string[] }, unfixed: UnfixedIssue): boolean {
  if (issue.code !== unfixed.code || issue.slide !== unfixed.slide) return false;
  if (!unfixed.elementIds?.length || !issue.elementIds?.length) return true;
  return unfixed.elementIds.some((id) => issue.elementIds!.includes(id));
}

/**
 * Annotates the final report with what the repair loop actually achieved. An
 * error the fixer provably cannot repair becomes a warning carrying the reason
 * and the remedy, so callers get an actionable deck instead of a hard failure
 * they cannot act on. An error the fixer could still repair stays an error —
 * that one is genuinely a budget problem another retry would resolve.
 */
function reconcileReport(report: ValidationReport, unfixed: UnfixedIssue[], retriesExhausted: boolean): ValidationReport {
  const issues = report.issues.map((issue) => {
    if (!issue.fixable) return issue;
    const blocked = unfixed.find((candidate) => sameIssue(issue, candidate));
    if (blocked) {
      return {
        ...issue,
        severity: issue.severity === "error" ? ("warning" as const) : issue.severity,
        fixed: false,
        unfixedReason: blocked.reason,
      };
    }
    return {
      ...issue,
      fixed: false,
      unfixedReason: retriesExhausted
        ? "The repair retry budget was exhausted before this issue was reached. Raise maxRetries and rerun."
        : "This issue appeared after the final repair pass.",
    };
  });
  const summary = summarize(issues);
  return {
    ...report,
    issues,
    summary,
    status: summary.errors > 0 ? "fail" : summary.warnings > 0 ? "warning" : "pass",
  };
}

/**
 * A prompt alone cannot produce a designed deck — there is no model in this
 * process to design one. What comes out is scaffolding, and the result has to
 * say so where a caller will actually read it.
 */
const DRAFT_NOTE = "No model-authored outline or scene was supplied, so this deck is a structural draft: bracketed placeholders, no art direction. Run `slide-agent draft --prompt <file>` to get a request skeleton to fill in, or `slide-agent contract` for the authoring guide.";

/**
 * Said in the result, not only in the log: a caller that asked for previews
 * and got drawings has to be told, or it will report a deck as looked-at when
 * nothing rendered it.
 */
const SCHEMATIC_NOTE = "LibreOffice and Poppler are not installed, so the previews are schematic drawings of the deck's geometry rather than rendered slides. They show position, size, colour, and text wrapping; they do not show typography or chart drawing. Install the preview tools for a true render.";

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => path.resolve(value)))];
}

/** Claims the deck itself still flags as unverified. */
function unresolvedClaimIds(outline: PresentationOutline): string[] {
  return (outline.claims ?? [])
    .filter((claim) => claim.status === "needs-review")
    .map((claim) => claim.id);
}

export class SlideAgent {
  /**
   * Everything a host has contributed: diagram grammars, chart renderers,
   * quality checks, layouts, a preview backend, a design tokenizer, and — the
   * one most decks need — an image resolver.
   *
   * `ExtensionRegistry` and its interfaces were published and documented but
   * nothing ever read them, so a host could follow `docs/api.md` exactly and
   * have none of it take effect. This is where they take effect.
   */
  private readonly extensions: ExtensionRegistry;

  public constructor(
    private readonly logger: Logger = new JsonLogger(),
    extensions: Extensions | ExtensionRegistry = {},
  ) {
    this.extensions = extensions instanceof ExtensionRegistry ? extensions : new ExtensionRegistry(extensions);
  }

  /** What this installation can actually do, for a model to plan within. */
  public capabilities(): Capabilities {
    return this.extensions.capabilities();
  }

  /**
   * Capabilities plus the answers that require looking at this machine: which
   * typefaces it can display and whether it can produce a true render at all.
   * A model that plans a deck in a typeface nobody has, or trusts a schematic
   * drawing as if it were a render, has been told something untrue.
   */
  public async capabilityReport(): Promise<CapabilityReport> {
    const config = await loadConfig().catch(() => undefined);
    const configured = config
      ? [...new Set([config.fonts.heading, config.fonts.body, config.fonts.mono, ...config.fonts.fallbacks])]
      : [];
    const availability = await checkFontAvailability(configured).catch(() => []);
    const soffice = await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE);
    const pdftoppm = await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM);
    const backend = this.extensions.renderBackend?.id;
    const canRender = Boolean(backend) || Boolean(soffice && pdftoppm);
    return {
      ...this.extensions.capabilities(),
      fonts: {
        configured,
        installed: availability.filter((entry) => entry.available).map((entry) => entry.family),
        missing: availability.filter((entry) => !entry.available).map((entry) => entry.family),
        note: "These are the fallback config's typefaces on this machine. A deck may name any typeface it likes; what matters is whether the audience's machine has it, which nothing here can see.",
      },
      rendering: {
        backend: backend ?? "libreoffice+poppler",
        libreOffice: soffice ?? null,
        poppler: pdftoppm ?? null,
        mode: canRender ? "render" : "schematic",
        limitations: canRender
          ? [
            "LibreOffice draws the deck its own way: font substitution, autofit, and chart styling can differ from PowerPoint.",
            "Render text fidelity is read from the PDF's text layer, which is exact; without Poppler it falls back to OCR, which is not.",
          ]
          : [
            "Neither LibreOffice nor Poppler is installed, so previews are schematic drawings of the geometry — position, size, colour, and wrapping only.",
            "A schematic preview is not evidence of what the audience will see, and it holds presentationReadiness at `review`.",
          ],
      },
    };
  }

  public async execute(request: StructuredAgentRequest): Promise<AgentResult> {
    switch (request.command) {
      case "create": return this.create(request);
      case "edit": return this.edit(request);
      case "render": return this.render(request);
      case "validate": return this.validate(request);
      case "revise": return this.revise(request);
      case "patch": return this.patch(request);
    }
  }

  /**
   * The evidence a host AI needs to critique the exact deck it just built:
   * the render, the words read back off it, the geometry, the declared intent,
   * and the artifact hashes that prove all of it describes one build.
   */
  public async review(input: string, options: ReviewOptions = {}): Promise<ReviewPacket> {
    return buildReviewPacket({ input, options });
  }

  /**
   * Changes named elements on named slides and rebuilds, leaving everything
   * else byte-identical. `dryRun` reports the semantic diff and writes nothing,
   * so a model can see what a patch would do before it does it.
   */
  public async patch(request: PatchRequest): Promise<AgentResult> {
    const startedAt = new Date();
    const requestId = randomUUID();
    try {
      if (!request.dryRun && path.resolve(request.input) === path.resolve(request.output)) {
        throw new SlideAgentError("OUTPUT_MATCHES_INPUT", "A patch must be written to a different file so the original stays intact.");
      }
      const layout = outputLayout(request.input);
      const scenePath = path.resolve(
        request.scene
        ?? (await exists(layout.inspect) ? layout.inspect : layout.legacy.inspect),
      );
      if (!(await exists(scenePath))) {
        throw new SlideAgentError(
          "SCENE_NOT_FOUND",
          `No scene blueprint was found for this deck at ${scenePath}. Patching needs the artifacts/ directory that was written beside the deck, or an explicit scene path.`,
          { input: path.resolve(request.input), expected: scenePath },
        );
      }
      const operations = request.operations.map((operation) => patchOperationSchema.parse(operation)) as PatchOperation[];
      const patched = patchOutline(parseSceneNdjson(await readUtf8(scenePath)), operations);
      const diff = formatPatchDiff(patched);
      this.logger.info("patch.applied", "Applied scene patch", {
        requestId,
        operations: operations.length,
        changes: patched.changes.length,
      });

      const execution = metadata("patch", requestId, startedAt, 0, "model-authored");
      if (request.dryRun) {
        return {
          status: "success",
          generatedFiles: [],
          slideCount: patched.outline.slides.length,
          warnings: [],
          patch: { changes: patched.changes, untouched: patched.untouched, diff, applied: false },
          errors: [],
          metadata: execution,
        };
      }

      const result = await this.create({
        command: "create",
        sceneNdjson: serializeSceneNdjson(patched.outline),
        output: request.output,
        // Relative asset paths inside the scene stay relative to the scene the
        // patch was read from, so a patched package keeps its own pictures.
        assetBaseDir: path.dirname(scenePath),
        ...(request.configDir === undefined ? {} : { configDir: request.configDir }),
        ...(request.render === undefined ? {} : { render: request.render }),
        ...(request.validate === undefined ? {} : { validate: request.validate }),
        ...(request.roundTrip === undefined ? {} : { roundTrip: request.roundTrip }),
        ...(request.allowRemoteAssets === undefined ? {} : { allowRemoteAssets: request.allowRemoteAssets }),
      });
      return {
        ...result,
        patch: { changes: patched.changes, untouched: patched.untouched, diff, applied: true },
        metadata: { ...result.metadata, command: "patch", requestId, provenance: "model-authored" },
      };
    } catch (error) {
      return {
        status: "error",
        generatedFiles: [],
        slideCount: 0,
        warnings: [],
        errors: [errorDetails(error)],
        metadata: metadata("patch", requestId, startedAt, 0),
      };
    }
  }

  /**
   * Replaces one slide by splicing its records into the deck's own scene and
   * rebuilding. Regenerating a deck to change one slide discards every other
   * decision the model made; this keeps them because the scene round-trips.
   */
  public async revise(request: ReviseRequest): Promise<AgentResult> {
    const startedAt = new Date();
    const requestId = randomUUID();
    try {
      if (path.resolve(request.input) === path.resolve(request.output)) {
        throw new SlideAgentError("OUTPUT_MATCHES_INPUT", "Revision must be written to a different file so the original stays intact.");
      }
      const scenePath = path.resolve(request.scene ?? outputLayout(request.input).inspect);
      if (!(await exists(scenePath))) {
        throw new SlideAgentError(
          "SCENE_NOT_FOUND",
          `No scene blueprint was found for this deck at ${scenePath}. Revision needs the artifacts/ directory that was written beside the deck, or an explicit scene path.`,
          { input: path.resolve(request.input), expected: scenePath },
        );
      }
      const merged = reviseScene(await readUtf8(scenePath), request.slide, request.sceneNdjson);
      this.logger.info("revise.merged", "Spliced the revised slide into the deck scene", {
        requestId,
        slide: request.slide,
        replaced: merged.replaced,
        added: merged.added,
      });

      const result = await this.create({
        command: "create",
        sceneNdjson: merged.scene,
        output: request.output,
        ...(request.configDir === undefined ? {} : { configDir: request.configDir }),
        ...(request.render === undefined ? {} : { render: request.render }),
        ...(request.validate === undefined ? {} : { validate: request.validate }),
        ...(request.autoFix === undefined ? {} : { autoFix: request.autoFix }),
        ...(request.maxRetries === undefined ? {} : { maxRetries: request.maxRetries }),
        ...(request.allowRemoteAssets === undefined ? {} : { allowRemoteAssets: request.allowRemoteAssets }),
      });
      return {
        ...result,
        metadata: { ...result.metadata, command: "revise", requestId, provenance: "model-authored" },
      };
    } catch (error) {
      return {
        status: "error",
        generatedFiles: [],
        slideCount: 0,
        warnings: [],
        errors: [errorDetails(error)],
        metadata: metadata("revise", requestId, startedAt, 0),
      };
    }
  }

  public async create(request: CreateRequest): Promise<AgentResult> {
    const startedAt = new Date();
    const requestId = randomUUID();
    const generatedFiles: string[] = [];
    const warnings: string[] = [];
    let retries = 0;
    let finalBuilt: BuiltDeck | undefined;
    try {
      const config = await loadConfig(request.configDir);
      const authored = request.outline
        ?? (request.sceneNdjson ? parseSceneNdjson(request.sceneNdjson) : undefined)
        ?? (request.scene ? await readSceneNdjson(request.scene) : undefined);
      // A deck a model designed and one the planner scaffolded are different
      // products. Callers must be able to tell them apart without inspecting
      // the slides for bracketed placeholders.
      const provenance: DeckProvenance = authored ? "model-authored" : "template-draft";
      let outline: PresentationOutline = authored
        ?? new OutlinePlanner().plan(new RequestAnalyzer(config).analyze(request.prompt ?? "", request.brief ?? {}));
      if (provenance === "template-draft") {
        // Said in the result as well as the log. A caller that reads only the
        // JSON — which is every agent — would otherwise have no signal that
        // the deck it just received is scaffolding.
        warnings.push(DRAFT_NOTE);
        this.logger.warn(
          "create.draft",
          DRAFT_NOTE,
          { requestId },
        );
      }
      if (request.creativeDirection) outline = { ...outline, creativeDirection: request.creativeDirection };
      let brand: BrandKit | undefined;
      if (request.brand) {
        brand = await loadBrandKit(request.brand);
        outline = applyBrandKit(outline, brand);
        this.logger.info("create.brand", "Applied brand kit", {
          requestId,
          brand: brand.name,
          locked: brand.locked,
        });
      }
      const layout = outputLayout(request.output);
      const output = layout.pptx;
      const manifestPath = layout.manifest;
      const previewsDir = path.resolve(request.previewsDir ?? layout.images);
      const reportPath = path.resolve(request.reportPath ?? layout.validation);
      const metadataPath = path.resolve(request.metadataPath ?? layout.metadata);
      const inspectPath = path.resolve(request.inspectPath ?? layout.inspect);
      const maximumRetries = request.maxRetries ?? config.generation.maximumRetries;
      const shouldValidate = request.validate ?? true;
      const shouldRender = request.render ?? false;
      // `autoFix: false` is the old way of saying "change nothing"; it still
      // means that. Otherwise the mode is the caller's, and the default is
      // `suggest` for anything the model authored — its values are not the
      // engine's to overwrite.
      const repairMode: RepairMode = request.autoFix === false
        ? "off"
        : request.repair ?? defaultRepairMode(outline);
      // The reconciliation pass below only makes sense when something was
      // allowed to change; `suggest` still repairs scaffolded slides.
      const shouldFix = repairMode !== "off";
      let report: ValidationReport | undefined;
      let repairPlan: RepairPlan | undefined;
      let fidelityBeforeRepair: ValidationReport["fidelity"];
      let outlineBeforeRepair: PresentationOutline | undefined;

      const appliedFixes: string[] = [];
      let effectiveConfig = config;
      let retriesExhausted = false;

      for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
        this.logger.info("create.iteration", "Building presentation", { requestId, attempt: attempt + 1 });
        const builder = new DeckBuilder(config, {
          remoteAssets: remoteAssetPolicy(request.allowRemoteAssets),
          extensions: this.extensions,
          // A packaged scene references its assets relative to its own
          // directory, so that is where a relative path has to resolve from.
          // Without this a moved package would look for its own pictures in
          // whatever directory the rebuild happened to be run from.
          ...(request.assetBaseDir ?? request.scene
            ? { assetBaseDir: request.assetBaseDir ?? path.dirname(path.resolve(request.scene!)) }
            : {}),
          ...(brand ? { brand } : {}),
          ...(request.bilingual ? { bilingual: request.bilingual } : {}),
        });
        const built = await builder.build(outline);
        finalBuilt = built;
        for (const note of builder.imageWarnings) {
          if (!warnings.includes(note)) warnings.push(note);
        }
        outline = built.outline;
        effectiveConfig = built.config;
        for (const fallback of built.layoutFallbacks) {
          const note = `Slide ${fallback.slide} uses kind "${fallback.requested}", which is not a registered layout; rendered with the "${fallback.used}" layout instead. Supply a canvas to control the composition.`;
          if (!warnings.includes(note)) warnings.push(note);
        }
        for (const { slide, reason } of built.rejectedLinks) {
          const note = `Slide ${slide}: ${reason}`;
          if (!warnings.includes(note)) warnings.push(note);
        }
        await new PptxExporter().export(built.presentation, output, built.config.colors, built.postProcess);
        built.manifest.provenance = provenance;
        built.manifest.packageSha256 = await fileSha256(output);
        await writeJson(manifestPath, built.manifest);
        if (shouldValidate) {
          report = await new PresentationValidator(built.config, this.logger).validate(output, {
            manifest: built.manifest,
            checks: this.extensions.checks,
            render: shouldRender,
            previewsDir,
            pdfPath: layout.pdf,
            iterations: attempt + 1,
            // This build writes its own graph below. Re-checking the previous
            // run's would be measuring a deck that no longer exists.
            verifyArtifacts: false,
          });
        } else if (shouldRender) {
          const rendered = await new PresentationRenderer(this.logger).render(output, previewsDir, {
            width: config.generation.renderWidth,
            height: config.generation.renderHeight,
            pdfPath: layout.pdf,
            manifest: built.manifest,
          });
          generatedFiles.push(...rendered.previewFiles, ...(rendered.pdfPath ? [rendered.pdfPath] : []));
          if (rendered.mode === "schematic") warnings.push(SCHEMATIC_NOTE);
        }
        if (!report || repairMode === "off") break;
        if (!report.issues.some((issue) => issue.fixable)) break;
        if (attempt >= maximumRetries) {
          retriesExhausted = true;
          break;
        }
        // In `suggest` this repairs the scaffolded slides and only reports on
        // the ones the model composed; in `safe` it repairs both.
        const plan = planRepairs(outline, report, effectiveConfig, repairMode);
        repairPlan = {
          ...plan,
          suggestions: [...(repairPlan?.suggestions ?? []), ...plan.suggestions],
          appliedRepairs: [...(repairPlan?.appliedRepairs ?? []), ...plan.appliedRepairs],
        };
        // Converged: the fixer has nothing left it is allowed to change, so
        // another rebuild would produce an identical deck and report.
        if (!plan.applied) {
          this.logger.info("create.converged", "Repair loop converged", { requestId, unfixed: plan.unfixed.length });
          break;
        }
        if (!outlineBeforeRepair) {
          outlineBeforeRepair = outline;
          fidelityBeforeRepair = report.fidelity;
        }
        outline = plan.outline;
        appliedFixes.push(...describeRepairs(plan));
        retries += 1;
      }

      // A "safe" repair that made the render worse is not safe. Rolling back is
      // the only honest response: the deck the author wrote is preferable to a
      // deck the engine broke while satisfying a proxy metric.
      if (repairPlan?.applied && outlineBeforeRepair && detectRenderRegression(fidelityBeforeRepair, report?.fidelity)) {
        this.logger.warn("create.repair-rollback", "A safe repair degraded the render, so it was rolled back", { requestId });
        warnings.push("A safe repair made the rendered text worse, so every repair in this run was rolled back and the deck was rebuilt as authored. The proposed changes are listed under suggestedRepairs.");
        outline = outlineBeforeRepair;
        repairPlan = { ...repairPlan, applied: false, appliedRepairs: [] };
        appliedFixes.length = 0;
        const rebuilder = new DeckBuilder(config, {
          remoteAssets: remoteAssetPolicy(request.allowRemoteAssets),
          extensions: this.extensions,
          ...(request.assetBaseDir ?? request.scene
            ? { assetBaseDir: request.assetBaseDir ?? path.dirname(path.resolve(request.scene!)) }
            : {}),
          ...(brand ? { brand } : {}),
          ...(request.bilingual ? { bilingual: request.bilingual } : {}),
        });
        const rebuilt = await rebuilder.build(outline);
        finalBuilt = rebuilt;
        effectiveConfig = rebuilt.config;
        await new PptxExporter().export(rebuilt.presentation, output, rebuilt.config.colors, rebuilt.postProcess);
        rebuilt.manifest.provenance = provenance;
        rebuilt.manifest.packageSha256 = await fileSha256(output);
        await writeJson(manifestPath, rebuilt.manifest);
        if (shouldValidate) {
          report = await new PresentationValidator(rebuilt.config, this.logger).validate(output, {
            manifest: rebuilt.manifest,
            checks: this.extensions.checks,
            render: shouldRender,
            previewsDir,
            pdfPath: layout.pdf,
            iterations: retries + 1,
            verifyArtifacts: false,
          });
        }
      }

      if (report && shouldFix) {
        const classification = new AutoFixer(effectiveConfig).fix(outline, report);
        report = reconcileReport(report, classification.unfixed, retriesExhausted);
      }
      if (report && repairPlan) {
        report = {
          ...report,
          ...(repairPlan.suggestions.length ? { suggestedRepairs: repairPlan.suggestions } : {}),
          ...(repairPlan.appliedRepairs.length ? { appliedRepairs: repairPlan.appliedRepairs } : {}),
        };
      }
      const repairs = [...new Set(appliedFixes)];

      generatedFiles.push(output, manifestPath);
      if (shouldValidate) generatedFiles.push(reportPath);
      if (report?.render?.previewFiles) generatedFiles.push(...report.render.previewFiles);
      if (report?.render?.pdfPath) generatedFiles.push(report.render.pdfPath);
      const execution = metadata("create", requestId, startedAt, retries, provenance);

      // The scene is emitted from a *portable* copy of the outline: every asset
      // is content-addressed into the package and referenced relative to the
      // scene's own directory, so the whole folder can be moved to another
      // machine and still rebuild. The author's original reference survives as
      // provenance, which is what the credit line and the licence depend on.
      const portable = await makeOutlinePortable(
        layout.artifacts,
        outline,
        (element) => element.type === "image" ? finalBuilt?.resolvedAssets.get(element.path) : undefined,
      );
      for (const { source, reason } of portable.unresolved) {
        const note = `Could not package the asset ${source}: ${reason}. The emitted scene still references it by its original path, so this package will not rebuild elsewhere.`;
        if (!warnings.includes(note)) warnings.push(note);
      }
      await writeSceneNdjson(inspectPath, portable.outline, finalBuilt?.manifest);
      await writeJson(metadataPath, {
        request: {
          ...request,
          prompt: request.prompt ? "[provided]" : undefined,
          sceneNdjson: request.sceneNdjson ? "[provided]" : undefined,
        },
        outline,
        execution,
        validationStatus: report?.status,
      });
      generatedFiles.push(inspectPath, metadataPath, ...portable.assets.map((asset) => asset.absolutePath));

      if (report) {
        // Hashing binds the report to the exact files it describes, so a
        // preview left over from an earlier revision cannot pass as evidence.
        const graph = await buildArtifactGraph({
          root: layout.artifacts,
          pptx: output,
          scene: inspectPath,
          manifest: manifestPath,
          validation: reportPath,
          ...(report.render?.pdfPath ? { pdf: report.render.pdfPath } : {}),
          previews: report.render?.previewFiles ?? [],
          assets: portable.assets.map((asset) => asset.absolutePath),
          render: {
            backend: this.extensions.renderBackend?.id ?? "libreoffice+poppler",
            mode: report.render?.status === "pass" ? (report.render.mode ?? "render") : "none",
          },
        });
        const roundTrip = (request.roundTrip ?? false) && finalBuilt
          ? await verifyRoundTrip({
            root: layout.root,
            scenePath: inspectPath,
            manifest: finalBuilt.manifest,
            rebuild: async (scenePath, outputPath) => {
              const rebuilt = await this.create({
                command: "create",
                scene: scenePath,
                output: outputPath,
                validate: false,
                render: false,
                autoFix: false,
                roundTrip: false,
              });
              if (rebuilt.status === "error") throw new Error(rebuilt.errors[0]?.message ?? "the rebuild failed");
              return JSON.parse(await readUtf8(outputLayout(outputPath).manifest)) as BuiltDeck["manifest"];
            },
          })
          : undefined;
        const extraIssues = portable.unresolved.map(({ source, reason }) => ({
          code: "asset-outside-package" as const,
          severity: "error" as const,
          message: `${source} was not packaged: ${reason}`,
          fixable: false,
        }));
        report = withPackageEvidence(report, {
          artifacts: graph,
          ...(roundTrip ? { roundTrip } : {}),
          extraIssues,
          ...(unresolvedClaimIds(outline).length ? { unresolvedClaims: unresolvedClaimIds(outline) } : {}),
        });
      }
      if (report && shouldValidate) await writeJson(reportPath, report);
      const validationWarnings = report?.issues.filter((item) => item.severity !== "error").map((item) => item.message) ?? [];
      warnings.push(...validationWarnings);
      const deliverables = unique([output, ...generatedFiles.filter((file) => path.resolve(file) === path.resolve(layout.pdf))]);
      return {
        status: resultStatus(report, warnings),
        primaryOutput: output,
        deliverables,
        artifacts: unique(generatedFiles.filter((file) => !deliverables.includes(path.resolve(file)))),
        generatedFiles: unique(generatedFiles),
        slideCount: outline.slides.length,
        warnings,
        ...(repairs.length ? { repairs } : {}),
        ...(report ? { validation: report } : {}),
        ...(report ? { packageStatus: report.packageStatus, presentationReadiness: report.presentationReadiness } : {}),
        errors: report?.issues.filter((item) => item.severity === "error").map((item) => ({ code: item.code, message: item.message, ...(item.details ? { details: item.details } : {}) })) ?? [],
        metadata: execution,
      };
    } catch (error) {
      const details = errorDetails(error);
      this.logger.error("create.failed", details.message, { requestId, code: details.code });
      return { status: "error", generatedFiles, slideCount: 0, warnings, errors: [details], metadata: metadata("create", requestId, startedAt, retries) };
    }
  }

  public async edit(request: EditRequest): Promise<AgentResult> {
    const startedAt = new Date();
    const requestId = randomUUID();
    const generatedFiles: string[] = [];
    const warnings: string[] = [];
    try {
      const config = await loadConfig(request.configDir);
      const layout = outputLayout(request.output);
      const shouldRender = request.render ?? false;
      if (shouldRender) {
        const before = await new PresentationRenderer(this.logger).render(
          request.input,
          request.beforePreviewsDir ?? layout.beforeImages,
          { width: config.generation.renderWidth, height: config.generation.renderHeight, pdfPath: layout.beforePdf },
        );
        generatedFiles.push(...before.previewFiles, ...(before.pdfPath ? [before.pdfPath] : []));
      }
      const edited = await new PptxEditor().edit(request.input, request.output, request.operations);
      warnings.push(...edited.warnings);
      if (edited.unsupportedFeatures.length) {
        warnings.push(`Preserved unsupported features where package-level editing allowed: ${edited.unsupportedFeatures.join(", ")}. Verify them manually in PowerPoint.`);
      }
      generatedFiles.push(edited.output);
      let report: ValidationReport | undefined;
      if (request.validate ?? true) {
        report = await new PresentationValidator(config, this.logger).validate(edited.output, {
          reportPath: request.reportPath ?? layout.validation,
          render: shouldRender,
          previewsDir: request.previewsDir ?? layout.images,
          pdfPath: layout.pdf,
        });
        generatedFiles.push(request.reportPath ?? layout.validation, ...(report.render?.previewFiles ?? []));
        if (report.render?.pdfPath) generatedFiles.push(report.render.pdfPath);
      }
      const execution = metadata("edit", requestId, startedAt, 0);
      const deliverables = unique([edited.output, ...generatedFiles.filter((file) => path.resolve(file) === path.resolve(layout.pdf))]);
      return {
        status: resultStatus(report, warnings),
        primaryOutput: path.resolve(edited.output),
        deliverables,
        artifacts: unique(generatedFiles.filter((file) => !deliverables.includes(path.resolve(file)))),
        generatedFiles: unique(generatedFiles),
        slideCount: edited.slideCount,
        warnings,
        ...(report ? { validation: report } : {}),
        errors: report?.issues.filter((item) => item.severity === "error").map((item) => ({ code: item.code, message: item.message })) ?? [],
        metadata: execution,
      };
    } catch (error) {
      return { status: "error", generatedFiles, slideCount: 0, warnings, errors: [errorDetails(error)], metadata: metadata("edit", requestId, startedAt, 0) };
    }
  }

  public async render(request: RenderRequest): Promise<AgentResult> {
    const startedAt = new Date();
    const requestId = randomUUID();
    try {
      const backend = this.extensions.renderBackend;
      const rendered = backend
        ? await backend.render(request.input, request.output, { width: request.width, height: request.height })
        : await new PresentationRenderer(this.logger).render(request.input, request.output, { width: request.width, height: request.height });
      return {
        status: "success",
        generatedFiles: [...rendered.previewFiles, ...(rendered.pdfPath ? [rendered.pdfPath] : [])],
        slideCount: rendered.previewFiles.length,
        warnings: rendered.mode === "schematic" ? [SCHEMATIC_NOTE] : [],
        errors: [],
        metadata: metadata("render", requestId, startedAt, 0),
      };
    } catch (error) {
      return { status: "error", generatedFiles: [], slideCount: 0, warnings: [], errors: [errorDetails(error)], metadata: metadata("render", requestId, startedAt, 0) };
    }
  }

  public async validate(request: ValidateRequest): Promise<AgentResult> {
    const startedAt = new Date();
    const requestId = randomUUID();
    try {
      const config = await loadConfig(request.configDir);
      const reportPath = request.report ?? outputLayout(request.input).validation;
      let report = await new PresentationValidator(config, this.logger).validate(request.input, {
        reportPath,
        checks: this.extensions.checks,
        manifest: request.manifest,
        render: request.render ?? false,
        previewsDir: request.previewsDir,
      });
      if (request.roundTrip) {
        const layout = outputLayout(request.input);
        const scenePath = await exists(layout.inspect) ? layout.inspect : layout.legacy.inspect;
        const manifest = JSON.parse(await readUtf8(
          await exists(layout.manifest) ? layout.manifest : layout.legacy.manifest,
        )) as BuiltDeck["manifest"];
        const roundTrip = await verifyRoundTrip({
          root: layout.root,
          scenePath,
          manifest,
          rebuild: async (scene, outputPath) => {
            const rebuilt = await this.create({
              command: "create",
              scene,
              output: outputPath,
              validate: false,
              render: false,
              autoFix: false,
              roundTrip: false,
            });
            if (rebuilt.status === "error") throw new Error(rebuilt.errors[0]?.message ?? "the rebuild failed");
            return JSON.parse(await readUtf8(outputLayout(outputPath).manifest)) as BuiltDeck["manifest"];
          },
        });
        report = withPackageEvidence(report, { roundTrip });
        await writeJson(reportPath, report);
      }
      return {
        status: resultStatus(report, []),
        generatedFiles: unique([reportPath, ...(report.render?.previewFiles ?? []), ...(report.render?.pdfPath ? [report.render.pdfPath] : [])]),
        slideCount: report.slideCount,
        warnings: report.issues.filter((item) => item.severity !== "error").map((item) => item.message),
        validation: report,
        errors: report.issues.filter((item) => item.severity === "error").map((item) => ({ code: item.code, message: item.message })),
        metadata: metadata("validate", requestId, startedAt, 0),
      };
    } catch (error) {
      return { status: "error", generatedFiles: [], slideCount: 0, warnings: [], errors: [errorDetails(error)], metadata: metadata("validate", requestId, startedAt, 0) };
    }
  }
}
