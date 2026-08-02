import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import * as vscode from "vscode";

import { resolveManagedCliPath } from "./managed-paths.js";
import { prepareSpawn } from "./shell-quote.js";

interface AgentResult {
  status?: string;
  primaryOutput?: string;
  deliverables?: string[];
  errors?: Array<{ message?: string }>;
}

let output: vscode.OutputChannel;
const INSTALLED_VERSION_KEY = "slideAgent.installedCoreVersion";

const SCENE_AUTHORING_PROMPT = `You are the creative director, information architect, and PowerPoint craftsperson for Slide Agent.

Return ONLY newline-delimited JSON (NDJSON), with one valid JSON object per line. Do not use Markdown fences or commentary. The output must implement schema slide-agent.scene/1 for a 13.333 x 7.5 inch widescreen deck.

You own the artistic direction. Invent a visual thesis that is specific to this brief: palette, typography, spatial grammar, imagery/texture language, diagram language, chart language, pacing, and one memorable visual move. Do not choose from presets. Do not default to generic blue gradients, repeated cards, identical title positions, or a corporate template unless the subject genuinely requires that choice. Slides should have family resemblance but varied silhouettes. Prioritize truthful communication and editable native PowerPoint objects.

Record format:
1. First line: {"kind":"deck","schema":"slide-agent.scene/1","unit":"in","brief":{...},"narrative":"...","completeness":{...},"creativeDirection":{...}}. The complete brief needs title, optional subtitle, audience, objective, presentationType, tone, visualDirection, slideCount, language, outputRequirements, keyTopics, and sourcePrompt. creativeDirection is open-ended; include concrete palette hex values without # and font names, plus the reasoning and visual languages.
2. One line per slide: {"kind":"slide","slide":1,"freeform":true,"id":"...","semanticKind":"...","title":"...","background":"RRGGBB","communication":{"audienceQuestion":"...","claim":"...","evidence":[...],"artifact":"...","implication":"..."},"designIntent":"...","composition":"..."}.
3. Then any number of editable element records. Each needs kind, slide, id, and bbox:[x,y,w,h] in inches. Supported kinds:
- textbox: text or runs, role, and style such as fontFace, fontSize, color, bold, italic, align, valign, margin, fit, fill, transparency, lineColor, lineWidth, rotate, or advanced options.
- shape: shape name, role, style with fill, transparency, lineColor, lineWidth, rotate, or options.
- connector: bbox describes start plus delta; style may contain color, width, arrow, dashed, and options. Use negative w/h when needed and layer behind nodes with zIndex.
- table: table:{headers,rows,columnWidths?,highlightRows?}, plus native options.
- chart: chart:{kind,labels,series:[{name,values}],unit?,showLegend?,showValues?}, style:{colors?,options?}.
- native-chart: nativeType, data, options.
- image: path, alt, fit, style. Only use images when the brief supplies resolvable local assets; never invent a path.
4. Optional notes line per slide: {"kind":"notes","slide":1,"notes":[...],"sources":[{"label":"...","url":"..."}]}.

Geometry must stay legible and inside the slide. Add visible titles explicitly as textbox elements. Keep body text concise, use strong hierarchy, and give diagrams meaningful nodes, routing, labels, and visual semantics. Use charts only with real or explicitly illustrative data and label illustrative data honestly. Do not flatten a slide into an image. Every slide must be complete enough to stand on its own and must advance the narrative.`;

const EDIT_AUTHORING_PROMPT = `Translate the user's PowerPoint edit request into safe Slide Agent edit operations. Return ONLY one JSON object shaped as {"operations":[...]}. Supported operations are:
- {"type":"replace-text","find":"old","replace":"new","slide":1?,"replaceAll":true?}
- {"type":"remove-slide","slide":3}
- {"type":"duplicate-slide"|"add-slide","slide":2,"insertAt":5?,"replacements":[{"find":"...","replace":"..."}]?}
- {"type":"reorder-slides","order":[1,3,2]}
- {"type":"apply-theme","colors":{"background":"RRGGBB","surface":"RRGGBB","ink":"RRGGBB","muted":"RRGGBB","accent":"RRGGBB","accentAlt":"RRGGBB","accentSoft":"RRGGBB","rule":"RRGGBB","positive":"RRGGBB","negative":"RRGGBB","warning":"RRGGBB"},"headingFont":"...","bodyFont":"..."}
- {"type":"replace-image","slide":1,"imagePath":"absolute path","name":"optional"}
- {"type":"update-table","slide":1,"rows":[["...",1]],"tableIndex":0?}
- {"type":"update-chart","slide":1,"chartIndex":0?,"labels":["..."],"series":[{"name":"...","values":[1]}]}
Never invent unsupported operations. If part of the request cannot be expressed, perform only the unambiguous supported portion.`;

function configuration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("slideAgent");
}

function cliPath(): string {
  return resolveManagedCliPath({
    configured: configuration().get<string>("cliPath", ""),
    prefix: process.env.SLIDE_AGENT_CLI_PREFIX,
    home: homedir(),
  });
}

function workspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
}

function defaultOutputUri(name = "presentation.pptx"): vscode.Uri {
  const directory = configuration().get<string>("defaultOutputDirectory", "output");
  return vscode.Uri.file(path.join(workspaceRoot(), directory, name));
}

async function chooseOutput(defaultName: string): Promise<string | undefined> {
  const uri = await vscode.window.showSaveDialog({
    defaultUri: defaultOutputUri(defaultName),
    filters: { "PowerPoint presentation": ["pptx"] },
    saveLabel: "Create presentation",
  });
  return uri?.fsPath;
}

async function run(command: string, args: string[]): Promise<{ stdout: string; exitCode: number }> {
  output.show(true);
  output.appendLine(`\n> ${command} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`);
  return new Promise((resolve, reject) => {
    const spawnPlan = prepareSpawn(command, args);
    const child = spawn(spawnPlan.command, spawnPlan.args, {
      cwd: workspaceRoot(),
      env: process.env,
      shell: spawnPlan.shell,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; output.append(chunk); });
    child.stderr.on("data", (chunk: string) => output.append(chunk));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ stdout, exitCode: code ?? -1 }));
  });
}

async function runCli(args: string[]): Promise<AgentResult | undefined> {
  const cli = cliPath();
  try {
    const result = await run(cli, args);
    let parsed: AgentResult | undefined;
    try { parsed = JSON.parse(result.stdout) as AgentResult; } catch { /* doctor and installer may use human-readable output */ }
    if (result.exitCode !== 0 || parsed?.status === "error") {
      const message = parsed?.errors?.map((error) => error.message).filter(Boolean).join("; ") || "Slide Agent did not complete successfully. See the output panel.";
      void vscode.window.showErrorMessage(message);
      return parsed;
    }
    return parsed ?? { status: "success" };
  } catch (error) {
    const action = await vscode.window.showErrorMessage(
      `Slide Agent is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      "Install Slide Agent",
    );
    if (action) await vscode.commands.executeCommand("slideAgent.install");
    return undefined;
  }
}

function cleanModelOutput(value: string): string {
  const fenced = value.match(/```(?:json|ndjson)?\s*([\s\S]*?)```/i)?.[1];
  return (fenced ?? value).trim();
}

async function chooseLanguageModel(): Promise<vscode.LanguageModelChat | undefined> {
  const models = await vscode.lm.selectChatModels();
  if (models.length === 0) {
    void vscode.window.showErrorMessage("No VS Code language model is available. Sign in to Copilot or install a VS Code extension that provides a language model.");
    return undefined;
  }
  if (models.length === 1) return models[0];
  const selected = await vscode.window.showQuickPick(
    models.map((model) => ({
      label: model.name,
      description: `${model.vendor} · ${model.family}`,
      detail: model.version,
      model,
    })),
    { title: "Choose the AI model that will direct this presentation", placeHolder: "The model owns the creative direction and slide composition." },
  );
  return selected?.model;
}

async function askModel(instructions: string, request: string, progressTitle: string): Promise<string | undefined> {
  const model = await chooseLanguageModel();
  if (!model) return undefined;
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progressTitle, cancellable: true },
    async (_progress, token) => {
      output.show(true);
      output.appendLine(`\nAI model: ${model.name} (${model.vendor}/${model.family})`);
      const response = await model.sendRequest([
        vscode.LanguageModelChatMessage.User(`${instructions}\n\nUSER REQUEST:\n${request}`),
      ], {}, token);
      let result = "";
      for await (const fragment of response.text) result += fragment;
      return cleanModelOutput(result);
    },
  );
}

function validateSceneText(scene: string): void {
  const records = scene.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line) as Record<string, unknown>; }
    catch (error) { throw new Error(`The model returned invalid NDJSON on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  });
  if (records[0]?.kind !== "deck" || records[0]?.schema !== "slide-agent.scene/1") throw new Error("The model response is missing the slide-agent.scene/1 deck record.");
  if (!records.some((record) => record.kind === "slide")) throw new Error("The model response contains no slides.");
}

async function authorScene(brief: string): Promise<string | undefined> {
  const first = await askModel(SCENE_AUTHORING_PROMPT, brief, "Designing the presentation…");
  if (!first) return undefined;
  try {
    validateSceneText(first);
    return first;
  } catch (error) {
    output.appendLine(`Scene validation requested one repair: ${error instanceof Error ? error.message : String(error)}`);
    const repaired = await askModel(
      SCENE_AUTHORING_PROMPT,
      `Repair the NDJSON below. Preserve its creative direction and content while fixing this exact structural error: ${error instanceof Error ? error.message : String(error)}\n\n${first}`,
      "Repairing the model-authored scene…",
    );
    if (!repaired) return undefined;
    validateSceneText(repaired);
    return repaired;
  }
}

async function withTemporaryPrompt(prompt: string, action: (filePath: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), "slide-agent-vscode-"));
  const promptPath = path.join(directory, "brief.md");
  try {
    await writeFile(promptPath, prompt, "utf8");
    await action(promptPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function finishCreate(result: AgentResult | undefined, requestedOutput: string): Promise<void> {
  if (!result || result.status === "error") return;
  const primary = result.primaryOutput ?? requestedOutput;
  const open = "Open PowerPoint";
  const reveal = "Reveal in Folder";
  const choice = await vscode.window.showInformationMessage("Slide Agent finished the presentation.", open, reveal);
  if (choice === reveal) await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(primary));
  if (choice === open || (!choice && configuration().get<boolean>("openAfterCreate", true))) {
    await vscode.env.openExternal(vscode.Uri.file(primary));
  }
}

async function createFromText(prompt: string, suggestedName = "presentation.pptx"): Promise<void> {
  const destination = await chooseOutput(suggestedName);
  if (!destination) return;
  const scene = await authorScene(prompt);
  if (!scene) return;
  await withTemporaryPrompt(scene, async (scenePath) => {
    const result = await runCli(["create", "--scene", scenePath, "--output", destination]);
    await finishCreate(result, destination);
  });
}

async function create(): Promise<void> {
  const prompt = await vscode.window.showInputBox({
    title: "Create a presentation",
    prompt: "Describe the audience, objective, content, and any real constraints. The model owns the art direction.",
    placeHolder: "A bilingual technical migration guide for platform engineers…",
    ignoreFocusOut: true,
  });
  if (prompt?.trim()) await createFromText(prompt.trim());
}

async function createFromCurrentFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return void vscode.window.showWarningMessage("Open a brief, Markdown, JSON, or NDJSON file first.");
  const name = `${path.basename(editor.document.fileName, path.extname(editor.document.fileName)) || "presentation"}.pptx`;
  await createFromText(editor.document.getText(), name);
}

async function edit(): Promise<void> {
  const input = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "PowerPoint presentation": ["pptx"] }, openLabel: "Select presentation" });
  if (!input?.[0]) return;
  const prompt = await vscode.window.showInputBox({ title: "Edit presentation", prompt: "Describe the requested changes.", ignoreFocusOut: true });
  if (!prompt?.trim()) return;
  const base = path.basename(input[0].fsPath, ".pptx");
  const destination = await chooseOutput(`${base}-updated.pptx`);
  if (!destination) return;
  const structured = await askModel(EDIT_AUTHORING_PROMPT, prompt.trim(), "Planning the presentation edit…");
  if (!structured) return;
  try { JSON.parse(structured); } catch { return void vscode.window.showErrorMessage("The selected model did not return valid edit-operation JSON."); }
  await withTemporaryPrompt(structured, async (promptPath) => {
    const result = await runCli(["edit", "--input", input[0]!.fsPath, "--prompt", promptPath, "--output", destination]);
    await finishCreate(result, destination);
  });
}

async function install(context: vscode.ExtensionContext, automatic = false): Promise<void> {
  const version = String(context.extension.packageJSON.version);
  const packageSpecifier = `@slide-agent/core@${version}`;
  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: automatic ? "Setting up Slide Agent…" : "Installing or updating Slide Agent…",
        cancellable: false,
      },
      () => run("npx", ["--yes", "--package", packageSpecifier, "--", "slide-agent", "install", "--package", packageSpecifier]),
    );
    if (result.exitCode !== 0) throw new Error(`installer exited with code ${result.exitCode}`);
    const verification = await run(cliPath(), ["--version"]);
    if (verification.exitCode !== 0) throw new Error(`installed CLI exited with code ${verification.exitCode}`);
    await context.globalState.update(INSTALLED_VERSION_KEY, version);
    const reload = "Reload Window";
    const choice = await vscode.window.showInformationMessage(
      "Slide Agent is installed. Reload VS Code if the new skill is not visible in an existing chat.",
      reload,
    );
    if (choice === reload) await vscode.commands.executeCommand("workbench.action.reloadWindow");
  } catch (error) {
    output.show(true);
    const message = `Slide Agent setup failed: ${error instanceof Error ? error.message : String(error)}. Node.js 22.12 or newer and npm/npx must be available on PATH.`;
    const retry = "Retry";
    if (await vscode.window.showErrorMessage(message, retry) === retry) await install(context, false);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Slide Agent");
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("slideAgent.install", () => install(context, false)),
    vscode.commands.registerCommand("slideAgent.create", create),
    vscode.commands.registerCommand("slideAgent.createFromCurrentFile", createFromCurrentFile),
    vscode.commands.registerCommand("slideAgent.edit", edit),
    vscode.commands.registerCommand("slideAgent.doctor", () => runCli(["doctor"])),
  );
  const version = String(context.extension.packageJSON.version);
  if (configuration().get<boolean>("autoInstall", true) && context.globalState.get<string>(INSTALLED_VERSION_KEY) !== version) {
    void install(context, true);
  }
}

export function deactivate(): void { /* no persistent resources */ }
