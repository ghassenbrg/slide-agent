export function createWindowsLauncher(nodeExecutable, source) {
  return [
    "@echo off",
    "set \"SLIDE_AGENT_ACTIVE_LAUNCHER=%~f0\"",
    `"${nodeExecutable}" "${source}" %*`,
    "set \"SLIDE_AGENT_EXIT_CODE=%ERRORLEVEL%\"",
    "exit /b %SLIDE_AGENT_EXIT_CODE%",
    "",
  ].join("\r\n");
}

export function parseWindowsLauncherTarget(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (
    lines.length !== 5
    || lines[0].trim().toLowerCase() !== "@echo off"
    || lines[1] !== "set \"SLIDE_AGENT_ACTIVE_LAUNCHER=%~f0\""
    || lines[3] !== "set \"SLIDE_AGENT_EXIT_CODE=%ERRORLEVEL%\""
    || lines[4] !== "exit /b %SLIDE_AGENT_EXIT_CODE%"
  ) return undefined;
  return lines[2].match(/^"[^"]+"\s+"([^"]+)"\s+%\*\s*$/)?.[1];
}

export function deferRemovalUntilProcessExits(destination, parentPid = process.pid, delayAfterExitMs = 500) {
  const cleanup = String.raw`
const { unlink } = require("node:fs");
const parentPid = Number(process.argv[1]);
const destination = process.argv[2];
const delayAfterExitMs = Number(process.argv[3]);
function remove(attempts = 40) {
  unlink(destination, (error) => {
    if (!error || error.code === "ENOENT") return;
    if (attempts > 0) setTimeout(() => remove(attempts - 1), 100);
  });
}
function waitForParent() {
  try {
    process.kill(parentPid, 0);
    setTimeout(waitForParent, 100);
  } catch {
    setTimeout(remove, delayAfterExitMs);
  }
}
waitForParent();`;
  const child = spawn(process.execPath, ["-e", cleanup, String(parentPid), destination, String(delayAfterExitMs)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}
import { spawn } from "node:child_process";
