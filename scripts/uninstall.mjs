#!/usr/bin/env node
import { access, lstat, readFile, readlink, realpath, rm, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { deferRemovalUntilProcessExits, parseWindowsLauncherTarget } from "./managed-launcher.mjs";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
const installMetadata = JSON.parse(await readFile(path.join(sourceRoot, ".slide-agent-managed-install.json"), "utf8").catch(() => "{}"));
const prefix = path.resolve(process.env.SLIDE_AGENT_CLI_PREFIX ?? installMetadata.prefix ?? path.join(home, ".local"));
const managedRoot = path.resolve(process.env.SLIDE_AGENT_MANAGED_ROOT ?? installMetadata.managedRoot ?? path.join(prefix, "share", "slide-agent"));
const managedPackage = path.join(managedRoot, "node_modules", "@slide-agent", "core");
const removed = [];
const skipped = [];
const deferred = [];

async function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

async function canonical(filePath) {
  return realpath(filePath).catch(() => path.resolve(filePath));
}

function isWithin(root, target) {
  const normalize = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  const normalizedRoot = normalize(root);
  const normalizedTarget = normalize(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function isSamePath(left, right) {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

const allowedRoots = new Set(await Promise.all([sourceRoot, managedPackage].map(canonical)));

async function removeSkill(destination) {
  const info = await lstat(destination).catch(() => undefined);
  if (!info) return;
  if (info.isSymbolicLink()) {
    const target = await canonical(path.resolve(path.dirname(destination), await readlink(destination)));
    if (!allowedRoots.has(target)) {
      skipped.push(`${destination} -> ${target}`);
      return;
    }
    await unlink(destination);
    removed.push(destination);
    return;
  }
  const marker = path.join(destination, ".slide-agent-install.json");
  if (info.isDirectory() && await exists(marker)) {
    let source;
    try {
      const metadata = JSON.parse(await readFile(marker, "utf8"));
      source = typeof metadata.packageRoot === "string" ? await canonical(metadata.packageRoot) : undefined;
    } catch {
      // A malformed or unrelated marker never grants deletion authority.
    }
    if (source && allowedRoots.has(source)) {
      await rm(destination, { recursive: true, force: true });
      removed.push(destination);
      return;
    }
  }
  skipped.push(destination);
}

async function removeLauncher(destination) {
  const info = await lstat(destination).catch(() => undefined);
  if (!info) return;
  const activeLauncher = process.env.SLIDE_AGENT_ACTIVE_LAUNCHER;
  if (activeLauncher && isSamePath(await canonical(activeLauncher), await canonical(destination))) {
    deferRemovalUntilProcessExits(destination);
    deferred.push(destination);
    return;
  }
  if (info.isSymbolicLink()) {
    const target = await canonical(path.resolve(path.dirname(destination), await readlink(destination)));
    if (![...allowedRoots].some((root) => target.startsWith(`${root}${path.sep}`))) {
      skipped.push(`${destination} -> ${target}`);
      return;
    }
    await unlink(destination);
    removed.push(destination);
    return;
  }
  if (destination.endsWith(".cmd")) {
    const content = await readFile(destination, "utf8").catch(() => "");
    const launcherTarget = parseWindowsLauncherTarget(content);
    const target = launcherTarget ? await canonical(launcherTarget) : undefined;
    if (target && [...allowedRoots].some((root) => isWithin(root, target))) {
      await unlink(destination);
      removed.push(destination);
      return;
    }
  }
  skipped.push(destination);
}

async function removePathEntry(bin) {
  if (process.platform === "win32") {
    const script = "$bin=$env:SLIDE_AGENT_PATH_ENTRY; $current=[Environment]::GetEnvironmentVariable('Path','User'); if ($current) {$next=(($current -split ';' | Where-Object {$_ -and $_ -ne $bin}) -join ';'); [Environment]::SetEnvironmentVariable('Path',$next,'User')}";
    await new Promise((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        env: { ...process.env, SLIDE_AGENT_PATH_ENTRY: bin },
        stdio: "inherit",
        shell: false,
      });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`PowerShell PATH cleanup exited with code ${code}`)));
    });
    return;
  }
  const shell = path.basename(process.env.SHELL ?? "");
  const profile = path.join(home, shell === "zsh" ? ".zshrc" : shell === "bash" ? ".bashrc" : ".profile");
  const block = `\n# Slide Agent CLI\nexport PATH="${bin}:$PATH"\n`;
  const current = await readFile(profile, "utf8").catch(() => undefined);
  if (current?.includes(block)) {
    await writeFile(profile, current.replace(block, "\n"), "utf8");
    removed.push(`${profile} (PATH entry)`);
  }
}

const agentDirectories = [
  process.env.SLIDE_AGENT_CODEX_SKILLS_DIR ?? path.join(home, ".agents", "skills"),
  process.env.SLIDE_AGENT_COPILOT_SKILLS_DIR ?? path.join(home, ".copilot", "skills"),
  process.env.SLIDE_AGENT_CLAUDE_SKILLS_DIR ?? path.join(home, ".claude", "skills"),
  process.env.SLIDE_AGENT_GEMINI_SKILLS_DIR ?? path.join(home, ".gemini", "skills"),
];
for (const directory of agentDirectories) await removeSkill(path.join(directory, "slide-agent"));
for (const name of ["slide-agent", "slide-agent-mcp"]) {
  await removeLauncher(path.join(prefix, "bin", process.platform === "win32" ? `${name}.cmd` : name));
}
if (process.env.SLIDE_AGENT_SKIP_PATH_UPDATE !== "1") await removePathEntry(path.join(prefix, "bin"));

const managedPackageJson = path.join(managedPackage, "package.json");
if (await exists(managedPackageJson)) {
  const metadata = JSON.parse(await readFile(managedPackageJson, "utf8"));
  const safeRoot = managedRoot !== path.parse(managedRoot).root && managedRoot !== home;
  if (metadata.name === "@slide-agent/core" && safeRoot) {
    await rm(managedRoot, { recursive: true, force: true });
    removed.push(managedRoot);
  } else {
    skipped.push(managedRoot);
  }
}

process.stdout.write(`${JSON.stringify({ status: skipped.length ? "warning" : "success", removed, deferred, skipped }, null, 2)}\n`);
