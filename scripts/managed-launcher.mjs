export function createWindowsLauncher(nodeExecutable, source) {
  return [
    "@echo off",
    "set \"SLIDE_AGENT_ACTIVE_LAUNCHER=%~f0\"",
    `"${nodeExecutable}" "${source}" %*`,
    "set \"SLIDE_AGENT_EXIT_CODE=%ERRORLEVEL%\"",
    "if /I \"%~1\"==\"uninstall\" (del \"%~f0\" >nul 2>&1 & exit /b %SLIDE_AGENT_EXIT_CODE%)",
    "exit /b %SLIDE_AGENT_EXIT_CODE%",
    "",
  ].join("\r\n");
}

export function parseWindowsLauncherTarget(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (
    lines.length !== 6
    || lines[0].trim().toLowerCase() !== "@echo off"
    || lines[1] !== "set \"SLIDE_AGENT_ACTIVE_LAUNCHER=%~f0\""
    || lines[3] !== "set \"SLIDE_AGENT_EXIT_CODE=%ERRORLEVEL%\""
    || lines[4] !== "if /I \"%~1\"==\"uninstall\" (del \"%~f0\" >nul 2>&1 & exit /b %SLIDE_AGENT_EXIT_CODE%)"
    || lines[5] !== "exit /b %SLIDE_AGENT_EXIT_CODE%"
  ) return undefined;
  return lines[2].match(/^"[^"]+"\s+"([^"]+)"\s+%\*\s*$/)?.[1];
}
