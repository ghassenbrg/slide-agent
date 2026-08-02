import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { SlideAgentError } from "./utils/errors.js";
import { findExecutable } from "./utils/process.js";
import { VERSION } from "./version.js";

export const PACKAGE_NAME = "@slide-agent/core";
export const PACKAGE_VERSION = VERSION;

export interface ManagedInstallOptions {
  target?: "all" | "codex" | "copilot" | "claude" | "gemini";
  prefix?: string;
  managedRoot?: string;
  packageSpecifier?: string;
  installRenderDependencies?: boolean;
}

export interface ManagedInstallResult {
  packageRoot: string;
  prefix: string;
  target: string;
  packageSpecifier: string;
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

async function runInteractive(command: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new SlideAgentError(
      "INSTALL_COMMAND_FAILED",
      `${command} exited with code ${code ?? "unknown"}.`,
      { command, args, code },
    )));
  });
}

async function packageManager(): Promise<{ command: string; args: string[] } | undefined> {
  if (process.platform === "darwin") {
    const brew = await findExecutable(["brew"]);
    return brew ? { command: brew, args: [] } : undefined;
  }
  if (process.platform === "win32") {
    const winget = await findExecutable(["winget"]);
    return winget ? { command: winget, args: [] } : undefined;
  }
  for (const name of ["apt-get", "dnf", "pacman"] as const) {
    const executable = await findExecutable([name]);
    if (executable) return { command: executable, args: [name] };
  }
  return undefined;
}

async function installRenderingTools(): Promise<void> {
  const soffice = await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE);
  const pdftoppm = await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM);
  if (soffice && pdftoppm) return;

  const manager = await packageManager();
  if (!manager) throw new SlideAgentError(
    "RENDER_INSTALLER_UNAVAILABLE",
    "Optional preview tools are missing and no supported system package manager was found. Continue without --with-render-deps or install LibreOffice and Poppler manually.",
  );

  if (process.platform === "darwin") {
    if (!soffice) await runInteractive(manager.command, ["install", "--cask", "libreoffice"]);
    if (!pdftoppm) await runInteractive(manager.command, ["install", "poppler"]);
    return;
  }
  if (process.platform === "win32") {
    const common = ["-e", "--source", "winget", "--silent", "--accept-source-agreements", "--accept-package-agreements"];
    if (!soffice) await runInteractive(manager.command, ["install", "--id", "TheDocumentFoundation.LibreOffice", ...common]);
    if (!pdftoppm) await runInteractive(manager.command, ["install", "--id", "oschwartz10612.Poppler", ...common]);
    return;
  }

  const sudo = process.getuid?.() === 0 ? undefined : await findExecutable(["sudo"]);
  const elevate = async (args: string[]) => runInteractive(sudo ?? manager.command, sudo ? [manager.command, ...args] : args);
  const name = manager.args[0];
  if (name === "apt-get") {
    await elevate(["update"]);
    await elevate(["install", "-y", "libreoffice", "poppler-utils"]);
  } else if (name === "dnf") {
    await elevate(["install", "-y", "libreoffice", "poppler-utils"]);
  } else {
    await elevate(["-Sy", "--needed", "--noconfirm", "libreoffice-fresh", "poppler"]);
  }
}

export async function installManaged(options: ManagedInstallOptions = {}): Promise<ManagedInstallResult> {
  const target = options.target ?? "all";
  const prefix = path.resolve(options.prefix ?? process.env.SLIDE_AGENT_CLI_PREFIX ?? path.join(homedir(), ".local"));
  const managedRoot = path.resolve(options.managedRoot ?? process.env.SLIDE_AGENT_MANAGED_ROOT ?? path.join(prefix, "share", "slide-agent"));
  const packageSpecifier = options.packageSpecifier ?? `${PACKAGE_NAME}@${PACKAGE_VERSION}`;
  const npm = await findExecutable(process.platform === "win32" ? ["npm", "npm.cmd"] : ["npm"]);
  if (!npm) throw new SlideAgentError("NPM_MISSING", "npm is required for the no-clone installer.");

  if (options.installRenderDependencies ?? false) await installRenderingTools();
  await mkdir(managedRoot, { recursive: true });
  await runInteractive(npm, ["install", "--prefix", managedRoot, "--omit=dev", "--no-audit", "--no-fund", packageSpecifier]);

  const packageRoot = path.join(managedRoot, "node_modules", "@slide-agent", "core");
  const setup = path.join(packageRoot, "scripts", "setup.mjs");
  if (!(await exists(setup))) throw new SlideAgentError("MANAGED_PACKAGE_INVALID", `Installed package is missing ${setup}.`);
  await writeFile(
    path.join(packageRoot, ".slide-agent-managed-install.json"),
    `${JSON.stringify({ packageRoot, prefix, managedRoot, target, packageSpecifier }, null, 2)}\n`,
    "utf8",
  );
  await runInteractive(process.execPath, [setup, "--target", target, "--skip-build"], {
    SLIDE_AGENT_CLI_PREFIX: prefix,
  });
  await runInteractive(process.execPath, [path.join(packageRoot, "dist", "cli.js"), "doctor"]);
  return { packageRoot, prefix, target, packageSpecifier };
}
