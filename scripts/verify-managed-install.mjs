#!/usr/bin/env node
import { access, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-install-test-"));
const packageDirectory = path.join(workspace, "packages");
const prefix = path.join(workspace, "prefix");
const managedRoot = path.join(workspace, "managed");
const skillRoot = path.join(workspace, "skills");
const env = {
  ...process.env,
  SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(skillRoot, "codex"),
  SLIDE_AGENT_COPILOT_SKILLS_DIR: path.join(skillRoot, "copilot"),
  SLIDE_AGENT_CLAUDE_SKILLS_DIR: path.join(skillRoot, "claude"),
  SLIDE_AGENT_GEMINI_SKILLS_DIR: path.join(skillRoot, "gemini"),
  SLIDE_AGENT_SKIP_PATH_UPDATE: "1",
};

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: options.quiet ? "ignore" : "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

async function expectLink(filePath) {
  const info = await lstat(filePath);
  if (!info.isSymbolicLink()) throw new Error(`Expected a symbolic link: ${filePath}`);
}

try {
  await mkdir(packageDirectory, { recursive: true });
  await run("npm", ["pack", "--silent", "--pack-destination", packageDirectory], { quiet: true });
  const archiveName = (await readdir(packageDirectory)).find((name) => name.endsWith(".tgz"));
  if (!archiveName) throw new Error("npm pack did not produce a .tgz archive.");
  const archive = path.join(packageDirectory, archiveName);

  await run(process.platform === "win32" ? "npx.cmd" : "npx", [
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
  } else {
    if (!await exists(cli) || !await exists(mcp)) throw new Error("Managed Windows launchers are missing.");
  }
  await run(cli, ["--version"]);
  await run(cli, ["uninstall"]);

  for (const removedPath of [managedRoot, cli, mcp, path.join(skillRoot, "codex", "slide-agent")]) {
    if (await exists(removedPath)) throw new Error(`Uninstall left a managed path behind: ${removedPath}`);
  }
  process.stdout.write("Managed no-clone install and guarded uninstall verified.\n");
} finally {
  if (workspace.startsWith(`${tmpdir()}${path.sep}slide-agent-install-test-`)) {
    await rm(workspace, { recursive: true, force: true });
  }
}
