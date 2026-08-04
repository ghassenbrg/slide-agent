import { randomUUID } from "node:crypto";
import path from "node:path";

import { loadConfig } from "./config/load-config.js";
import { PptxEditor } from "./editing/pptx-editor.js";
import { DeckBuilder, type BuiltDeck } from "./export/deck-builder.js";
import { PptxExporter } from "./export/pptx-exporter.js";
import { JsonLogger, type Logger } from "./logging/logger.js";
import { OutlinePlanner } from "./planner/outline-planner.js";
import { outputLayout } from "./output/output-layout.js";
import { RequestAnalyzer } from "./planner/request-analyzer.js";
import { PresentationRenderer } from "./rendering/renderer.js";
import { parseSceneNdjson, readSceneNdjson, writeSceneNdjson } from "./serialization/scene-ndjson.js";
import type {
  AgentResult,
  CreateRequest,
  EditRequest,
  ExecutionMetadata,
  PresentationOutline,
  RenderRequest,
  StructuredAgentRequest,
  ValidateRequest,
  ValidationReport,
} from "./types/index.js";
import { errorDetails } from "./utils/errors.js";
import { fileSha256, writeJson } from "./utils/files.js";
import { AutoFixer, type UnfixedIssue } from "./validation/auto-fixer.js";
import { PresentationValidator } from "./validation/validator.js";
import { VERSION } from "./version.js";

function metadata(command: ExecutionMetadata["command"], requestId: string, startedAt: Date, retries: number): ExecutionMetadata {
  const completed = new Date();
  return {
    requestId,
    command,
    startedAt: startedAt.toISOString(),
    completedAt: completed.toISOString(),
    durationMs: completed.getTime() - startedAt.getTime(),
    retries,
    version: VERSION,
  };
}

function resultStatus(report: ValidationReport | undefined, warnings: string[]): AgentResult["status"] {
  if (report?.status === "fail") return "error";
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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => path.resolve(value)))];
}

export class SlideAgent {
  public constructor(private readonly logger: Logger = new JsonLogger()) {}

  public async execute(request: StructuredAgentRequest): Promise<AgentResult> {
    switch (request.command) {
      case "create": return this.create(request);
      case "edit": return this.edit(request);
      case "render": return this.render(request);
      case "validate": return this.validate(request);
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
      let outline: PresentationOutline = request.outline
        ?? (request.sceneNdjson ? parseSceneNdjson(request.sceneNdjson) : undefined)
        ?? (request.scene ? await readSceneNdjson(request.scene) : undefined)
        ?? new OutlinePlanner().plan(new RequestAnalyzer(config).analyze(request.prompt ?? "", request.brief ?? {}));
      if (request.creativeDirection) outline = { ...outline, creativeDirection: request.creativeDirection };
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
      const shouldFix = request.autoFix ?? true;
      let report: ValidationReport | undefined;

      const appliedFixes: string[] = [];
      let effectiveConfig = config;
      let retriesExhausted = false;

      for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
        this.logger.info("create.iteration", "Building presentation", { requestId, attempt: attempt + 1 });
        const built = await new DeckBuilder(config).build(outline);
        finalBuilt = built;
        outline = built.outline;
        effectiveConfig = built.config;
        await new PptxExporter().export(built.presentation, output);
        built.manifest.packageSha256 = await fileSha256(output);
        await writeJson(manifestPath, built.manifest);
        if (shouldValidate) {
          report = await new PresentationValidator(built.config, this.logger).validate(output, {
            manifest: built.manifest,
            render: shouldRender,
            previewsDir,
            pdfPath: layout.pdf,
            iterations: attempt + 1,
          });
        } else if (shouldRender) {
          const rendered = await new PresentationRenderer(this.logger).render(output, previewsDir, {
            width: config.generation.renderWidth,
            height: config.generation.renderHeight,
            pdfPath: layout.pdf,
          });
          generatedFiles.push(...rendered.previewFiles, rendered.pdfPath);
        }
        if (!report || !shouldFix) break;
        // Repair anything the validator marked fixable, not only hard failures:
        // duplicate titles and contrast defects are warnings, and leaving them
        // in a deck the fixer can repair is a worse result than one more pass.
        if (!report.issues.some((issue) => issue.fixable)) break;
        if (attempt >= maximumRetries) {
          retriesExhausted = true;
          break;
        }
        const fixed = new AutoFixer(effectiveConfig).fix(outline, report);
        // Converged: the fixer has nothing left to change, so another rebuild
        // would produce an identical deck and an identical report.
        if (fixed.outcomes.length === 0) {
          this.logger.info("create.converged", "Repair loop converged", { requestId, unfixed: fixed.unfixed.length });
          break;
        }
        outline = fixed.outline;
        appliedFixes.push(...fixed.changes);
        retries += 1;
      }

      if (report && shouldFix) {
        const classification = new AutoFixer(effectiveConfig).fix(outline, report);
        report = reconcileReport(report, classification.unfixed, retriesExhausted);
      }
      if (report && shouldValidate) await writeJson(reportPath, report);
      const repairs = [...new Set(appliedFixes)];

      generatedFiles.push(output, manifestPath);
      if (shouldValidate) generatedFiles.push(reportPath);
      if (report?.render?.previewFiles) generatedFiles.push(...report.render.previewFiles);
      if (report?.render?.pdfPath) generatedFiles.push(report.render.pdfPath);
      const execution = metadata("create", requestId, startedAt, retries);
      await writeSceneNdjson(inspectPath, outline, finalBuilt?.manifest);
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
      generatedFiles.push(inspectPath, metadataPath);
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
        generatedFiles.push(...before.previewFiles, before.pdfPath);
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
      const rendered = await new PresentationRenderer(this.logger).render(request.input, request.output, { width: request.width, height: request.height });
      return {
        status: "success",
        generatedFiles: [...rendered.previewFiles, rendered.pdfPath],
        slideCount: rendered.previewFiles.length,
        warnings: [],
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
      const report = await new PresentationValidator(config, this.logger).validate(request.input, {
        reportPath,
        manifest: request.manifest,
        render: request.render ?? false,
        previewsDir: request.previewsDir,
      });
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
