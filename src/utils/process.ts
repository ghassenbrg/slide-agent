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
  const homeDirectory = options.homeDirectory ?? homedir();
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const nodeDirectory = path.dirname(nodeExecutable);
  const runtimeDependencies = path.resolve(path.dirname(nodeExecutable), "../..");
  const platformDirectories = process.platform === "win32"
    ? [
        path.join(process.env.APPDATA ?? path.join(homeDirectory, "AppData", "Roaming"), "npm"),
        path.join(process.env.LOCALAPPDATA ?? path.join(homeDirectory, "AppData", "Local"), "Microsoft", "WinGet", "Links"),
      ]
    : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
  return unique([
    // A relative PATH entry resolves against whatever directory the process
    // happens to run in, so a checked-out repository could plant its own
    // `soffice`. Only absolute entries are searched.
    ...(options.envPath ?? process.env.PATH ?? "").split(path.delimiter).filter((entry) => path.isAbsolute(entry)),
    nodeDirectory,
    path.join(runtimeDependencies, "bin", "override"),
    path.join(runtimeDependencies, "bin", "fallback"),
    path.join(homeDirectory, ".local", "bin"),
    ...platformDirectories,
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
  const usable = async (candidate: string): Promise<boolean> =>
    access(candidate, constants.X_OK).then(() => true).catch(() => false);

  // An explicit path is a pin, not a hint. Searching on past a pin that does
  // not resolve would silently run a different binary than the one the caller
  // named — which is the opposite of what pinning it is for.
  if (explicit) return await usable(explicit) ? explicit : undefined;

  const candidates = [
    ...names.flatMap((name) => directories.flatMap((directory) => process.platform === "win32"
      ? [path.join(directory, `${name}.exe`), path.join(directory, `${name}.cmd`), path.join(directory, name)]
      : [path.join(directory, name)])),
    ...platformExecutableCandidates(names),
  ];
  for (const candidate of candidates) {
    if (await usable(candidate)) return candidate;
  }
  return undefined;
}

export interface RunProcessOptions {
  cwd?: string;
  /** Added to the minimal environment; never the whole parent environment. */
  env?: NodeJS.ProcessEnv;
  /** Hard limit. The process group is sent SIGTERM, then SIGKILL after a grace period. Default 60 s. */
  timeoutMs?: number;
  /** Bytes kept from each of stdout and stderr. Default 2 MB. */
  maxOutputBytes?: number;
  /** Grace between SIGTERM and SIGKILL. Default 5 s. */
  killGraceMs?: number;
}

/**
 * Variables a child legitimately needs. Everything else — tokens, cloud
 * credentials, proxy secrets — stays in this process: a document converter has
 * no business reading `ANTHROPIC_API_KEY`.
 */
const INHERITED_ENVIRONMENT = [
  "PATH", "HOME", "USER", "LOGNAME", "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "TMPDIR", "TMP", "TEMP",
  "SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "PATHEXT", "APPDATA", "LOCALAPPDATA", "USERPROFILE",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "HOMEDRIVE", "HOMEPATH",
  "FONTCONFIG_FILE", "FONTCONFIG_PATH", "XDG_RUNTIME_DIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "SAL_USE_VCLPLUGIN",
];

export function minimalEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of INHERITED_ENVIRONMENT) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return { ...environment, ...extra };
}

export const DEFAULT_PROCESS_TIMEOUT_MS = 60_000;
export const DEFAULT_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;

export async function runProcess(command: string, args: string[], options: RunProcessOptions = {}): Promise<ProcessResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const maxOutput = options.maxOutputBytes ?? DEFAULT_PROCESS_OUTPUT_BYTES;
  const grace = options.killGraceMs ?? 5_000;
  return new Promise((resolve, reject) => {
    // Its own process group on POSIX, so a timeout kills LibreOffice's helper
    // processes too rather than orphaning them.
    const detached = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: minimalEnvironment(options.env),
      stdio: ["ignore", "pipe", "pipe"],
      detached,
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;
    const append = (current: string, chunk: string, used: number): [string, number] => {
      if (used >= maxOutput) return [current, used];
      const room = maxOutput - used;
      const bytes = Buffer.byteLength(chunk);
      if (bytes <= room) return [current + chunk, used + bytes];
      return [current + Buffer.from(chunk).subarray(0, room).toString("utf8"), maxOutput];
    };
    const signal = (name: NodeJS.Signals): void => {
      try {
        if (detached && child.pid) process.kill(-child.pid, name);
        else child.kill(name);
      } catch {
        // Already gone.
      }
    };
    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      killTimer = setTimeout(() => signal("SIGKILL"), grace);
      killTimer.unref();
    }, timeoutMs);
    timer.unref();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { [stdout, stdoutBytes] = append(stdout, chunk, stdoutBytes); });
    child.stderr.on("data", (chunk: string) => { [stderr, stderrBytes] = append(stderr, chunk, stderrBytes); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new SlideAgentError("PROCESS_START_FAILED", error.message, { command, args }));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (settled) return;
      settled = true;
      if (timedOut) {
        reject(new SlideAgentError("PROCESS_TIMEOUT", `${path.basename(command)} did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped.`, { command, args, timeoutMs }));
        return;
      }
      resolve({ stdout, stderr, exitCode: exitCode ?? -1 });
    });
  });
}
