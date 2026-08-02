export function createWindowsLauncher(nodeExecutable, source) {
  return `@echo off\r\n"${nodeExecutable}" "${source}" %*\r\n`;
}

export function parseWindowsLauncherTarget(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length !== 2 || lines[0].trim().toLowerCase() !== "@echo off") return undefined;
  return lines[1].match(/^"[^"]+"\s+"([^"]+)"\s+%\*\s*$/)?.[1];
}
