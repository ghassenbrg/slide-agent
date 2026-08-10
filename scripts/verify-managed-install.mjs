#!/usr/bin/env node
import { access, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-install-test-"));
const packageDirectory = path.join(workspace, "packages");
const consumer = path.join(workspace, "consumer");
const automaticSkillRoot = path.join(workspace, "automatic-skills");
const prefix = path.join(workspace, "prefix");
const managedRoot = path.join(workspace, "managed");
const skillRoot = path.join(workspace, "skills");
const env = {
  ...process.env,
  SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(skillRoot, "codex"),
  SLIDE_AGENT_COPILOT_SKILLS_DIR: path.join(skillRoot, "copilot"),
  SLIDE_AGENT_CLAUDE_SKILLS_DIR: path.join(skillRoot, "claude"),
  SLIDE_AGENT_GEMINI_PLUGIN_DIR: path.join(skillRoot, "gemini", "slide-agent-plugin"),
  SLIDE_AGENT_SKIP_PATH_UPDATE: "1",
};
const automaticEnv = {
  ...process.env,
  SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(automaticSkillRoot, "codex"),
  SLIDE_AGENT_COPILOT_SKILLS_DIR: path.join(automaticSkillRoot, "copilot"),
  SLIDE_AGENT_CLAUDE_SKILLS_DIR: path.join(automaticSkillRoot, "claude"),
  SLIDE_AGENT_GEMINI_PLUGIN_DIR: path.join(automaticSkillRoot, "gemini", "slide-agent-plugin"),
  SLIDE_AGENT_SKIP_PATH_UPDATE: "1",
};
const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) throw new Error("npm_execpath is unavailable; run this verifier through npm run verify:install.");

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const shell = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? env,
      stdio: options.quiet ? "ignore" : "inherit",
      shell,
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function runNpm(args, options = {}) {
  return run(process.execPath, [npmExecutable, ...args], options);
}

async function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

async function waitForRemoval(filePath, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (await exists(filePath)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for deferred cleanup: ${filePath}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function expectLink(filePath) {
  const info = await lstat(filePath);
  if (!info.isSymbolicLink()) throw new Error(`Expected a symbolic link: ${filePath}`);
}

try {
  await mkdir(packageDirectory, { recursive: true });
  await runNpm(["pack", "--silent", "--pack-destination", packageDirectory], { quiet: true });
  const archiveName = (await readdir(packageDirectory)).find((name) => name.endsWith(".tgz"));
  if (!archiveName) throw new Error("npm pack did not produce a .tgz archive.");
  const archive = path.join(packageDirectory, archiveName);

  await mkdir(consumer, { recursive: true });
  await writeFile(path.join(consumer, "package.json"), `${JSON.stringify({
    name: "slide-agent-install-verifier",
    version: "0.0.0",
    private: true,
  }, null, 2)}\n`);
  await runNpm([
    "install", "--omit=dev", "--no-audit", "--no-fund", archive,
  ], { cwd: consumer, env: automaticEnv });
  // Adding the library as a dependency must be inert. Registering a global
  // skill that points inside one project's node_modules breaks the moment that
  // project is removed or the dependency is upgraded.
  for (const agent of ["codex", "copilot", "claude", "gemini"]) {
    const skill = path.join(automaticSkillRoot, agent, "slide-agent", "SKILL.md");
    if (await exists(skill)) throw new Error(`npm package install must not register ${agent}: ${skill}`);
  }
  process.stdout.write("Library install verified inert: no skills registered.\n");

  await runNpm([
    "exec",
    "--yes",
    "--package", archive,
    "--",
    "slide-agent",
    "install",
    "--package", archive,
    "--prefix", prefix,
    "--managed-root", managedRoot,
  ]);

  const cli = path.join(prefix, "bin", process.platform === "win32" ? "slide-agent.cmd" : "slide-agent");
  const mcp = path.join(prefix, "bin", process.platform === "win32" ? "slide-agent-mcp.cmd" : "slide-agent-mcp");
  if (process.platform !== "win32") {
    await expectLink(cli);
    await expectLink(mcp);
    await expectLink(path.join(skillRoot, "codex", "slide-agent"));
    await expectLink(path.join(skillRoot, "gemini", "slide-agent-plugin", "skills", "slide-agent"));
  } else {
    if (!await exists(cli) || !await exists(mcp)) throw new Error("Managed Windows launchers are missing.");
  }
  await run(cli, ["--version"]);
  await run(cli, ["uninstall"]);
  if (process.platform === "win32") await waitForRemoval(cli);

  for (const removedPath of [
    managedRoot,
    cli,
    mcp,
    path.join(skillRoot, "codex", "slide-agent"),
    path.join(skillRoot, "gemini", "slide-agent-plugin"),
  ]) {
    if (await exists(removedPath)) throw new Error(`Uninstall left a managed path behind: ${removedPath}`);
  }
  process.stdout.write("Managed no-clone install and guarded uninstall verified.\n");
} finally {
  if (workspace.startsWith(`${tmpdir()}${path.sep}slide-agent-install-test-`)) {
    await rm(workspace, { recursive: true, force: true });
  }
}
