#!/usr/bin/env node
import { access, appendFile, chmod, cp, lstat, mkdir, readFile, readlink, realpath, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createWindowsLauncher } from "./managed-launcher.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const target = option("--target", "all");
const skipCli = has("--skip-cli");
const skipBuild = has("--skip-build");
const cliOnly = has("--cli-only");
const prefix = path.resolve(process.env.SLIDE_AGENT_CLI_PREFIX ?? path.join(home, ".local"));

const agentDirectories = {
  codex: process.env.SLIDE_AGENT_CODEX_SKILLS_DIR ?? path.join(home, ".agents", "skills"),
  copilot: process.env.SLIDE_AGENT_COPILOT_SKILLS_DIR ?? path.join(home, ".copilot", "skills"),
  claude: process.env.SLIDE_AGENT_CLAUDE_SKILLS_DIR ?? path.join(home, ".claude", "skills"),
  gemini: process.env.SLIDE_AGENT_GEMINI_SKILLS_DIR ?? path.join(home, ".gemini", "skills"),
};

function targets() {
  if (target === "all") return Object.entries(agentDirectories);
  if (!(target in agentDirectories)) throw new Error(`Unsupported agent target: ${target}`);
  return [[target, agentDirectories[target]]];
}

async function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

async function run(command, commandArgs) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: packageRoot, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function sameDestination(destination) {
  const info = await lstat(destination).catch(() => undefined);
  if (!info) return false;
  if (!info.isSymbolicLink()) return false;
  const linked = await readlink(destination);
  const resolved = path.resolve(path.dirname(destination), linked);
  return await realpath(resolved).catch(() => resolved) === await realpath(packageRoot).catch(() => packageRoot);
}

async function isSlideAgentSkill(destination) {
  const skill = await readFile(path.join(destination, "SKILL.md"), "utf8").catch(() => "");
  return /^---[\s\S]*?^name:\s*["']?slide-agent["']?\s*$/m.test(skill);
}

async function installSkill(agent, skillsDirectory) {
  const destination = path.join(skillsDirectory, "slide-agent");
  await mkdir(skillsDirectory, { recursive: true });
  if (await sameDestination(destination)) {
    process.stdout.write(`Already installed for ${agent}: ${destination}\n`);
    return;
  }
  if (await lstat(destination).catch(() => undefined)) {
    if (await isSlideAgentSkill(destination)) {
      process.stdout.write(`Existing Slide Agent registration preserved for ${agent}: ${destination}\n`);
      return;
    }
    throw new Error(`Refusing to replace existing path: ${destination}`);
  }
  try {
    await symlink(packageRoot, destination, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (process.platform !== "win32") throw error;
    // Junction creation can be disabled on managed/network volumes. A compact
    // copy keeps the skill usable without administrator or Developer Mode.
    await cp(packageRoot, destination, {
      recursive: true,
      filter: (source) => {
        const normalized = source.split(path.sep).join("/");
        return !["/node_modules", "/.git", "/examples/output"].some((segment) => normalized.includes(segment));
      },
    });
    await writeFile(path.join(destination, ".slide-agent-install.json"), `${JSON.stringify({ packageRoot }, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`Installed for ${agent}: ${destination}\n`);
}

async function installLauncher(name, source) {
  if (!(await exists(source))) throw new Error(`CLI build is missing: ${source}`);
  const bin = path.join(prefix, "bin");
  await mkdir(bin, { recursive: true });
  if (process.platform === "win32") {
    const launcher = path.join(bin, `${name}.cmd`);
    const content = createWindowsLauncher(process.execPath, source);
    const current = await readFile(launcher, "utf8").catch(() => undefined);
    if (current !== undefined && current !== content) throw new Error(`Refusing to replace existing launcher: ${launcher}`);
    if (current === undefined) await writeFile(launcher, content, "utf8");
    return { launcher, bin };
  }
  await chmod(source, 0o755);
  const launcher = path.join(bin, name);
  const info = await lstat(launcher).catch(() => undefined);
  if (info) {
    if (!info.isSymbolicLink() || path.resolve(path.dirname(launcher), await readlink(launcher)) !== source) {
      throw new Error(`Refusing to replace existing launcher: ${launcher}`);
    }
  } else {
    await symlink(source, launcher, "file");
  }
  return { launcher, bin };
}

async function persistPath(bin) {
  if (has("--skip-path-update") || process.env.SLIDE_AGENT_SKIP_PATH_UPDATE === "1") return;
  if (process.platform === "win32") {
    const script = "$bin=$env:SLIDE_AGENT_PATH_ENTRY; $current=[Environment]::GetEnvironmentVariable('Path','User'); if (-not $current) {$current=''}; $parts=$current -split ';'; if ($parts -notcontains $bin) {$next=if ($current) {$current.TrimEnd(';')+';'+$bin} else {$bin}; [Environment]::SetEnvironmentVariable('Path',$next,'User')}";
    await new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        env: { ...process.env, SLIDE_AGENT_PATH_ENTRY: bin },
        stdio: "inherit",
        shell: false,
      });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`PowerShell PATH update exited with code ${code}`)));
    });
    return;
  }
  if ((process.env.PATH ?? "").split(path.delimiter).includes(bin)) return;
  const shell = path.basename(process.env.SHELL ?? "");
  const profile = path.join(home, shell === "zsh" ? ".zshrc" : shell === "bash" ? ".bashrc" : ".profile");
  const marker = "# Slide Agent CLI";
  const current = await readFile(profile, "utf8").catch(() => "");
  if (!current.includes(marker)) await appendFile(profile, `\n${marker}\nexport PATH="${bin}:$PATH"\n`, "utf8");
}

if (!skipCli) {
  if (!skipBuild) {
    await run("npm", ["install", "--no-audit", "--no-fund"]);
    await run("npm", ["run", "build"]);
  }
  const launchers = [
    ["slide-agent", path.join(packageRoot, "dist", "cli.js")],
    ["slide-agent-mcp", path.join(packageRoot, "dist", "mcp-server.js")],
  ];
  let bin;
  for (const [name, source] of launchers) {
    const installed = await installLauncher(name, source);
    bin = installed.bin;
    process.stdout.write(`CLI installed: ${installed.launcher}\n`);
  }
  await persistPath(bin);
}
if (!cliOnly) {
  for (const [agent, directory] of targets()) await installSkill(agent, directory);
  process.stdout.write(`Slide Agent installation complete for: ${target}\n`);
}
