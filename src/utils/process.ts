import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { SlideAgentError } from "./errors.js";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function executableSearchDirectories(options: {
  envPath?: string;
  homeDirectory?: string;
  nodeExecutable?: string;
} = {}): string[] {
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const runtimeDependencies = path.resolve(path.dirname(nodeExecutable), "../..");
  return unique([
    ...(options.envPath ?? process.env.PATH ?? "").split(path.delimiter),
    path.join(runtimeDependencies, "bin", "override"),
    path.join(runtimeDependencies, "bin", "fallback"),
    path.join("/opt/homebrew/bin"),
    path.join("/usr/local/bin"),
    path.join("/usr/bin"),
    path.join("/bin"),
  ]);
}

function platformExecutableCandidates(names: string[]): string[] {
  if (process.platform === "darwin" && names.some((name) => name === "soffice" || name === "libreoffice")) {
    return [
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      path.join(homedir(), "Applications", "LibreOffice.app", "Contents", "MacOS", "soffice"),
    ];
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local");
    return [
      ...(names.some((name) => name === "soffice" || name === "libreoffice")
        ? [path.join(process.env.ProgramFiles ?? "C:\\Program Files", "LibreOffice", "program", "soffice.exe")]
        : []),
      ...names.map((name) => path.join(localAppData, "Microsoft", "WinGet", "Links", `${name}.exe`)),
    ];
  }
  return [];
}

export async function findExecutable(
  names: string[],
  explicit?: string,
  directories: string[] = executableSearchDirectories(),
): Promise<string | undefined> {
  const candidates = [
    explicit,
    ...names.flatMap((name) => directories.flatMap((directory) => process.platform === "win32"
      ? [path.join(directory, `${name}.exe`), path.join(directory, `${name}.cmd`), path.join(directory, name)]
      : [path.join(directory, name)])),
    ...platformExecutableCandidates(names),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (await access(candidate, constants.X_OK).then(() => true).catch(() => false)) return candidate;
  }
  return undefined;
}

export async function runProcess(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => reject(new SlideAgentError("PROCESS_START_FAILED", error.message, { command, args })));
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? -1 }));
  });
}
