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
let statusItem: vscode.StatusBarItem;
const INSTALLED_VERSION_KEY = "slideAgent.installedCoreVersion";
const WELCOMED_KEY = "slideAgent.welcomed";

/**
 * The authoring instructions come from the installed engine, not from this
 * extension. They used to be a 4 KB string literal here, which meant the
 * guidance a VS Code user got drifted away from the contract every other host
 * reads. `slide-agent contract` is the single source of truth.
 */
const promptCache = new Map<string, string>();

async function contractPrompt(task: "author" | "edit"): Promise<string> {
  const cached = promptCache.get(task);
  if (cached) return cached;
  const result = await run(cliPath(), ["contract", "--format", "prompt", "--for", task]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error("Could not read the authoring contract from the Slide Agent engine. Run “Slide Agent: Install or Update”.");
  }
  promptCache.set(task, result.stdout);
  return result.stdout;
}

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
  const instructions = await contractPrompt("author");
  const first = await askModel(instructions, brief, "Designing the presentation…");
  if (!first) return undefined;
  try {
    validateSceneText(first);
    return first;
  } catch (error) {
    output.appendLine(`Scene validation requested one repair: ${error instanceof Error ? error.message : String(error)}`);
    const repaired = await askModel(
      instructions,
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
  if (configuration().get<boolean>("openAfterCreate", true)) {
    await vscode.env.openExternal(vscode.Uri.file(primary));
    return;
  }
  const choice = await vscode.window.showInformationMessage("Slide Agent finished the presentation.", open, reveal);
  if (choice === reveal) await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(primary));
  if (choice === open) await vscode.env.openExternal(vscode.Uri.file(primary));
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
  const structured = await askModel(await contractPrompt("edit"), prompt.trim(), "Planning the presentation edit…");
  if (!structured) return;
  try { JSON.parse(structured); } catch { return void vscode.window.showErrorMessage("The selected model did not return valid edit-operation JSON."); }
  await withTemporaryPrompt(structured, async (promptPath) => {
    const result = await runCli(["edit", "--input", input[0]!.fsPath, "--prompt", promptPath, "--output", destination]);
    await finishCreate(result, destination);
  });
}

/**
 * Checks the one prerequisite before doing anything that needs it, so a user
 * without Node.js gets a link instead of a failed npx and a stack trace.
 */
async function nodeIsAvailable(): Promise<boolean> {
  try {
    const result = await run("node", ["--version"]);
    if (result.exitCode !== 0) return false;
    const [major = 0, minor = 0] = result.stdout.trim().replace(/^v/, "").split(".").map(Number);
    return major > 22 || (major === 22 && minor >= 12);
  } catch {
    return false;
  }
}

async function requireNode(): Promise<boolean> {
  if (await nodeIsAvailable()) return true;
  const download = "Download Node.js";
  const choice = await vscode.window.showErrorMessage(
    "Slide Agent needs Node.js 22.12 or newer. It is a one-time install, and nothing else is required.",
    download,
  );
  if (choice === download) await vscode.env.openExternal(vscode.Uri.parse("https://nodejs.org/en/download"));
  return false;
}

async function install(context: vscode.ExtensionContext, automatic = false): Promise<void> {
  if (!(await requireNode())) return;
  const version = String(context.extension.packageJSON.version);
  const packageSpecifier = `@slide-agent/core@${version}`;
  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: automatic
          ? "Setting up Slide Agent — one time, about a minute…"
          : "Installing or updating Slide Agent…",
        cancellable: false,
      },
      () => run("npx", ["--yes", "--package", packageSpecifier, "--", "slide-agent", "install", "--package", packageSpecifier]),
    );
    if (result.exitCode !== 0) throw new Error(`installer exited with code ${result.exitCode}`);
    const verification = await run(cliPath(), ["--version"]);
    if (verification.exitCode !== 0) throw new Error(`installed CLI exited with code ${verification.exitCode}`);
    await context.globalState.update(INSTALLED_VERSION_KEY, version);
    promptCache.clear();
    updateStatus("ready");
    if (automatic) return;
    const createNow = "Create a presentation";
    const choice = await vscode.window.showInformationMessage(
      "Slide Agent is ready. Your AI chats can build PowerPoint decks too — start a new chat if one is already open.",
      createNow,
    );
    if (choice === createNow) await vscode.commands.executeCommand("slideAgent.create");
  } catch (error) {
    output.show(true);
    const message = `Slide Agent setup failed: ${error instanceof Error ? error.message : String(error)}. Node.js 22.12 or newer and npm/npx must be available on PATH.`;
    const retry = "Retry";
    if (await vscode.window.showErrorMessage(message, retry) === retry) await install(context, false);
  }
}

/** A persistent, clickable entry point. Without one the extension is invisible. */
function updateStatus(state: "ready" | "setup"): void {
  statusItem.text = state === "ready" ? "$(file-media) Slide Agent" : "$(file-media) Slide Agent — set up";
  statusItem.tooltip = state === "ready"
    ? "Create or edit a PowerPoint presentation"
    : "Finish setting up Slide Agent";
  statusItem.command = "slideAgent.start";
}

/** The single entry point a first-time user is expected to find. */
async function start(context: vscode.ExtensionContext): Promise<void> {
  const installed = context.globalState.get<string>(INSTALLED_VERSION_KEY) === String(context.extension.packageJSON.version);
  const actions: Array<{ label: string; detail: string; command: string }> = installed
    ? [
      { label: "$(add) Create a presentation", detail: "Describe the deck; the AI model you choose designs it", command: "slideAgent.create" },
      { label: "$(edit) Edit an existing presentation", detail: "Describe the changes in plain language", command: "slideAgent.edit" },
      { label: "$(book) Open the getting-started guide", detail: "Four short steps", command: "slideAgent.walkthrough" },
      { label: "$(pulse) Check the installation", detail: "Diagnose the engine, agent skills, and preview tools", command: "slideAgent.doctor" },
    ]
    : [
      { label: "$(cloud-download) Set up Slide Agent", detail: "One-time, about a minute. Needs Node.js 22.12 or newer.", command: "slideAgent.install" },
      { label: "$(book) Open the getting-started guide", detail: "See what it does first", command: "slideAgent.walkthrough" },
    ];
  const choice = await vscode.window.showQuickPick(actions, {
    title: "Slide Agent",
    placeHolder: installed ? "What would you like to do?" : "Slide Agent needs a one-time setup",
  });
  if (choice) await vscode.commands.executeCommand(choice.command);
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Slide Agent");
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const installed = context.globalState.get<string>(INSTALLED_VERSION_KEY) === String(context.extension.packageJSON.version);
  updateStatus(installed ? "ready" : "setup");
  statusItem.show();

  // Activation stays local: no network, no output panel stealing focus. The
  // walkthrough is how a first-time user learns this exists, so it opens once.
  if (!context.globalState.get<boolean>(WELCOMED_KEY)) {
    void context.globalState.update(WELCOMED_KEY, true);
    void vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      `${context.extension.id}#slideAgent.gettingStarted`,
      false,
    );
  }

  context.subscriptions.push(
    output,
    statusItem,
    vscode.commands.registerCommand("slideAgent.start", () => start(context)),
    vscode.commands.registerCommand("slideAgent.walkthrough", () => vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      `${context.extension.id}#slideAgent.gettingStarted`,
      false,
    )),
    vscode.commands.registerCommand("slideAgent.install", () => install(context, false)),
    vscode.commands.registerCommand("slideAgent.create", async () => { await ensureInstalled(context); await create(); }),
    vscode.commands.registerCommand("slideAgent.createFromCurrentFile", async () => { await ensureInstalled(context); await createFromCurrentFile(); }),
    vscode.commands.registerCommand("slideAgent.edit", async () => { await ensureInstalled(context); await edit(); }),
    vscode.commands.registerCommand("slideAgent.doctor", async () => { await ensureInstalled(context); await runCli(["doctor"]); }),
  );
}

/**
 * Installs on demand rather than at activation. Spawning `npx` from
 * `onStartupFinished` performed a network fetch and focused the output panel
 * before the user had asked Slide Agent for anything.
 */
async function ensureInstalled(context: vscode.ExtensionContext): Promise<void> {
  const version = String(context.extension.packageJSON.version);
  if (!configuration().get<boolean>("autoInstall", true)) return;
  if (context.globalState.get<string>(INSTALLED_VERSION_KEY) === version) return;
  await install(context, true);
}

export function deactivate(): void { /* no persistent resources */ }
