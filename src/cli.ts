#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";

import { parseEditPrompt } from "./editing/parse-edit-prompt.js";
import { SlideAgent } from "./pipeline.js";
import type { StructuredAgentRequest } from "./types/index.js";
import { parseStructuredRequest } from "./types/schemas.js";
import { formatDoctor, runDoctor } from "./doctor.js";
import { installManaged } from "./installer.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { VERSION } from "./version.js";

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
  .description("Check installation, agent registration, and optional rendering dependencies")
  .option("--json", "Print machine-readable JSON")
  .action(async (options) => {
    const checks = await runDoctor();
    process.stdout.write(options.json ? `${JSON.stringify(checks, null, 2)}\n` : `${formatDoctor(checks)}\n`);
    if (checks.some((check) => check.status === "error")) process.exitCode = 1;
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
  .option("--max-retries <count>", "Maximum automatic repair retries", Number)
  .option("--render", "Also generate PDF and PNG previews (requires LibreOffice and Poppler)")
  .option("--no-validate", "Skip validation")
  .option("--no-auto-fix", "Disable automatic repair")
  .action(async (options) => {
    if (!options.prompt && !options.scene) throw new Error("create requires --prompt or --scene.");
    const prompt = options.prompt ? await text(options.prompt) : "";
    const parsed = options.prompt?.endsWith(".json") ? JSON.parse(prompt) as Partial<StructuredAgentRequest> : undefined;
    await printResult({
      ...(parsed && parsed.command === "create" ? parsed : {}),
      command: "create",
      prompt: parsed ? (parsed as { prompt?: string }).prompt : prompt,
      scene: options.scene ?? (parsed as { scene?: string } | undefined)?.scene,
      output: options.output,
      previewsDir: options.previews,
      reportPath: options.report,
      metadataPath: options.metadata,
      inspectPath: options.inspect ?? (parsed as { inspectPath?: string } | undefined)?.inspectPath,
      configDir: options.config,
      render: options.render,
      validate: options.validate,
      autoFix: options.autoFix,
      maxRetries: options.maxRetries,
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

program.command("run")
  .description("Execute a structured JSON request from any VS Code AI agent")
  .requiredOption("--request <file>", "Structured request JSON file")
  .action(async (options) => printResult(parseStructuredRequest(JSON.parse(await text(options.request)))));

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
