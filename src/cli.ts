#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";

import { parseEditPrompt } from "./editing/parse-edit-prompt.js";
import { SlideAgent } from "./pipeline.js";
import type { CreateRequest, StructuredAgentRequest } from "./types/index.js";
import { parseStructuredRequest } from "./types/schemas.js";
import { formatDoctorReport, runDeepCheck, runDoctorReport } from "./doctor.js";
import { installManaged } from "./installer.js";
import { PptxInspector } from "./editing/pptx-inspector.js";
import { diffDecks, formatDiff } from "./serialization/diff.js";
import { chartFromData, loadDataTable, provenanceNote, tableFromData } from "./data/connectors.js";
import { brandKitFromTemplate, normalizeKitColors } from "./design/template.js";
import { writeUtf8 } from "./utils/files.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { VERSION } from "./version.js";
import {
  allContractJsonSchemas,
  authoringGuide,
  contractDescriptor,
  contractJsonSchema,
  guideAsMarkdown,
  guideAsPrompt,
  editPrompt,
  type ContractSchemaName,
  type GuideSectionId,
} from "./contract/index.js";

async function text(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

async function printResult(request: StructuredAgentRequest): Promise<void> {
  const result = await new SlideAgent().execute(request);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "error") process.exitCode = 1;
}

const program = new Command()
  .name("slide-agent")
  .description("Create, edit, render, and validate editable PowerPoint presentations.")
  .version(VERSION);

program.command("doctor")
  .description("Check installation, agent registration, MCP wiring, and optional preview tools")
  .option("--json", "Print machine-readable JSON")
  .option("--deep", "Also build a deck end to end to prove generation works")
  .action(async (options) => {
    const report = await runDoctorReport();
    const deep = options.deep ? await runDeepCheck() : undefined;
    if (deep) {
      report.checks.push(deep);
      if (deep.status === "error") report.status = "error";
    }
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatDoctorReport(report)}\n`);
    if (report.status === "error") process.exitCode = 1;
  });

program.command("install")
  .description("Install Slide Agent persistently without cloning the repository")
  .option("--target <agent>", "all, codex, copilot, claude, or gemini", "all")
  .option("--prefix <directory>", "User-writable CLI prefix")
  .option("--managed-root <directory>", "Persistent package installation root")
  .option("--package <specifier>", "Package/version or local .tgz used for installation")
  .option("--with-render-deps", "Also install optional LibreOffice and Poppler preview tools")
  .action(async (options) => {
    const allowed = new Set(["all", "codex", "copilot", "claude", "gemini"]);
    if (!allowed.has(options.target)) throw new Error(`Unsupported agent target: ${options.target}`);
    const result = await installManaged({
      target: options.target,
      prefix: options.prefix,
      managedRoot: options.managedRoot,
      packageSpecifier: options.package,
      installRenderDependencies: Boolean(options.withRenderDeps),
    });
    process.stdout.write(`${JSON.stringify({ status: "success", ...result }, null, 2)}\n`);
  });

program.command("uninstall")
  .description("Remove Slide Agent launchers, agent registrations, and managed package files")
  .action(async () => {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const script = path.join(packageRoot, "scripts", "uninstall.mjs");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [script], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Uninstaller exited with code ${code}`)));
    });
  });

program.command("create")
  .option("--prompt <file>", "Prompt Markdown/text file or structured create request JSON")
  .option("--scene <file>", "Model-authored .inspect.ndjson scene blueprint")
  .requiredOption("--output <file>", "Output .pptx path")
  .option("--previews <directory>", "Rendered preview directory")
  .option("--report <file>", "Validation report JSON path")
  .option("--metadata <file>", "Generation metadata JSON path")
  .option("--inspect <file>", "Round-trippable NDJSON blueprint output path")
  .option("--config <directory>", "Configuration directory")
  .option("--brand <file>", "Brand kit JSON, or a .potx/.pptx template whose theme becomes the kit")
  .option("--bilingual <mode>", "Render secondaryLanguage as parallel, stacked, or notes")
  .option("--max-retries <count>", "Maximum automatic repair retries", Number)
  .option("--render", "Also generate PDF and PNG previews (requires LibreOffice and Poppler)")
  .option("--no-validate", "Skip validation")
  .option("--no-auto-fix", "Disable automatic repair")
  .action(async (options) => {
    if (!options.prompt && !options.scene) throw new Error("create requires --prompt or --scene.");
    const prompt = options.prompt ? await text(options.prompt) : "";
    const parsed = options.prompt?.endsWith(".json")
      ? JSON.parse(prompt) as Partial<CreateRequest>
      : undefined;
    if (parsed) {
      process.stderr.write(
        "slide-agent create --prompt <file>.json is deprecated and will be removed in the next major version. "
        + "Use `slide-agent run --request <file>.json` for structured requests.\n",
      );
    }
    const base = parsed?.command === "create" ? parsed : {};
    // Explicit flags win, then the structured file, then the defaults. Assigning
    // the flags unconditionally would overwrite every field the file supplied
    // with `undefined`, silently dropping render, paths, and retry settings.
    await printResult({
      ...base,
      command: "create",
      prompt: parsed ? parsed.prompt : prompt,
      scene: options.scene ?? base.scene,
      output: options.output,
      previewsDir: options.previews ?? base.previewsDir,
      reportPath: options.report ?? base.reportPath,
      metadataPath: options.metadata ?? base.metadataPath,
      inspectPath: options.inspect ?? base.inspectPath,
      configDir: options.config ?? base.configDir,
      brand: options.brand ?? base.brand,
      bilingual: options.bilingual ?? base.bilingual,
      render: options.render ?? base.render,
      // Commander defaults `--no-*` options to true, so only an explicit
      // negation should override the file.
      validate: options.validate === false ? false : base.validate ?? options.validate,
      autoFix: options.autoFix === false ? false : base.autoFix ?? options.autoFix,
      maxRetries: options.maxRetries ?? base.maxRetries,
    });
  });

program.command("edit")
  .requiredOption("--input <file>", "Existing .pptx path")
  .requiredOption("--prompt <file>", "Edit prompt or structured edit request JSON")
  .requiredOption("--output <file>", "Output .pptx path; must differ from input")
  .option("--previews <directory>", "After-edit preview directory")
  .option("--before-previews <directory>", "Before-edit preview directory")
  .option("--report <file>", "Validation report JSON path")
  .option("--config <directory>", "Configuration directory")
  .option("--render", "Also render before/after previews (requires LibreOffice and Poppler)")
  .option("--no-validate", "Skip validation")
  .action(async (options) => {
    const prompt = await text(options.prompt);
    await printResult({
      command: "edit",
      input: options.input,
      output: options.output,
      operations: parseEditPrompt(prompt),
      previewsDir: options.previews,
      beforePreviewsDir: options.beforePreviews,
      reportPath: options.report,
      configDir: options.config,
      render: options.render,
      validate: options.validate,
    });
  });

program.command("revise")
  .description("Replace one slide from the deck's scene blueprint, leaving every other slide unchanged")
  .requiredOption("--input <file>", "Existing .pptx path")
  .requiredOption("--output <file>", "Output .pptx path; must differ from input")
  .requiredOption("--slide <number>", "1-based slide number to replace", Number)
  .requiredOption("--records <file>", "NDJSON file holding the replacement records for that slide")
  .option("--scene <file>", "Scene blueprint path when it does not sit beside the deck")
  .option("--config <directory>", "Configuration directory")
  .option("--render", "Also render previews (requires LibreOffice and Poppler)")
  .option("--no-validate", "Skip validation")
  .action(async (options) => printResult({
    command: "revise",
    input: options.input,
    output: options.output,
    slide: options.slide,
    sceneNdjson: await text(options.records),
    scene: options.scene,
    configDir: options.config,
    render: options.render,
    validate: options.validate,
  }));

program.command("render")
  .requiredOption("--input <file>", "Input .pptx path")
  .requiredOption("--output <directory>", "Preview output directory")
  .option("--width <pixels>", "Preview width", Number)
  .option("--height <pixels>", "Preview height", Number)
  .action(async (options) => printResult({ command: "render", input: options.input, output: options.output, width: options.width, height: options.height }));

program.command("validate")
  .requiredOption("--input <file>", "Input .pptx path")
  .option("--report <file>", "Validation report JSON path (default: artifacts/logs next to the deck)")
  .option("--manifest <file>", "Generation manifest JSON path")
  .option("--previews <directory>", "Preview output directory")
  .option("--config <directory>", "Configuration directory")
  .option("--render", "Also generate preview images (requires LibreOffice and Poppler)")
  .action(async (options) => printResult({ command: "validate", input: options.input, report: options.report, manifest: options.manifest, previewsDir: options.previews, configDir: options.config, render: options.render }));

program.command("contract")
  .description("Print the authoring contract: schemas, the guide, or a ready-to-use system prompt")
  .option("--format <format>", "json, prompt, or markdown", "json")
  .option("--for <task>", "Which prompt to emit with --format prompt: author (default) or edit", "author")
  .option("--schema <name>", "outline, brief, slide, canvasElement, creativeDirection, chart, table, or sceneRecord")
  .option("--section <id>", "Limit the guide to one section")
  .action((options) => {
    if (options.schema) {
      const names = contractDescriptor().schemas;
      if (!names.includes(options.schema as ContractSchemaName)) {
        throw new Error(`Unknown contract schema: ${options.schema}. Available: ${names.join(", ")}.`);
      }
      process.stdout.write(`${JSON.stringify(contractJsonSchema(options.schema as ContractSchemaName), null, 2)}\n`);
      return;
    }
    if (options.format === "prompt") {
      if (options.for === "edit") { process.stdout.write(editPrompt()); return; }
      if (options.for !== "author") throw new Error(`Unsupported prompt task: ${options.for}. Use author or edit.`);
      process.stdout.write(guideAsPrompt());
      return;
    }
    if (options.format === "markdown") {
      process.stdout.write(guideAsMarkdown(options.section as GuideSectionId | undefined));
      return;
    }
    if (options.format !== "json") throw new Error(`Unsupported format: ${options.format}. Use json, prompt, or markdown.`);
    process.stdout.write(`${JSON.stringify({
      ...contractDescriptor(),
      guide: authoringGuide(options.section as GuideSectionId | undefined),
      jsonSchemas: allContractJsonSchemas(),
    }, null, 2)}\n`);
  });

program.command("diff")
  .description("Compare two decks semantically: which slides and elements changed")
  .requiredOption("--before <file>", "Baseline .pptx")
  .requiredOption("--after <file>", "Revised .pptx")
  .option("--json", "Print machine-readable JSON")
  .action(async (options) => {
    const [before, after] = await Promise.all([
      new PptxInspector().inspect(options.before),
      new PptxInspector().inspect(options.after),
    ]);
    const result = diffDecks(before.manifest, after.manifest);
    process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatDiff(result)}\n`);
  });

program.command("data")
  .description("Inspect a CSV, TSV, or JSON file and emit a chart or table spec for a slide canvas")
  .requiredOption("--input <file>", "CSV, TSV, or JSON data file")
  .option("--as <shape>", "chart or table", "chart")
  .option("--kind <kind>", "bar, line, pie, area, or waterfall", "bar")
  .option("--label-column <name>", "Column holding the category labels")
  .option("--value-columns <names>", "Comma-separated columns to plot")
  .action(async (options) => {
    const table = await loadDataTable(options.input);
    const payload = options.as === "table"
      ? { type: "table", table: tableFromData(table) }
      : {
        type: "chart",
        chart: chartFromData(table, {
          kind: options.kind,
          ...(options.labelColumn ? { labelColumn: options.labelColumn } : {}),
          ...(options.valueColumns ? { valueColumns: String(options.valueColumns).split(",").map((name: string) => name.trim()) } : {}),
        }),
      };
    process.stdout.write(`${JSON.stringify({
      ...payload,
      source: table.source,
      speakerNote: provenanceNote(table),
      rows: table.rows.length,
    }, null, 2)}\n`);
  });

program.command("template")
  .description("Read an organisation's .potx or .pptx and emit the brand kit its theme implies")
  .requiredOption("--input <file>", "Template .potx or .pptx")
  .option("--output <file>", "Write the kit to this path instead of stdout")
  .option("--name <name>", "Override the theme's own name")
  .option("--unlock <aspects>", "Comma-separated aspects the model may still override: palette, typography")
  .action(async (options) => {
    const unlocked = new Set(String(options.unlock ?? "").split(",").map((value: string) => value.trim()).filter(Boolean));
    for (const aspect of unlocked) {
      if (aspect !== "palette" && aspect !== "typography") throw new Error(`Unknown aspect: ${aspect}. Use palette or typography.`);
    }
    const locked = (["palette", "typography"] as const).filter((aspect) => !unlocked.has(aspect));
    const kit = normalizeKitColors(await brandKitFromTemplate(options.input, {
      ...(options.name ? { name: options.name } : {}),
      locked: [...locked],
    }));
    const json = `${JSON.stringify(kit, null, 2)}\n`;
    if (options.output) {
      await writeUtf8(options.output, json);
      process.stdout.write(`${JSON.stringify({ output: path.resolve(options.output), brand: kit.name, locked: kit.locked }, null, 2)}\n`);
      return;
    }
    process.stdout.write(json);
  });

program.command("run")
  .description("Execute a structured JSON request from any VS Code AI agent")
  .requiredOption("--request <file>", "Structured request JSON file")
  .action(async (options) => printResult(parseStructuredRequest(JSON.parse(await text(options.request)))));

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
