/**
 * Quotes a command or argument for spawning with `shell: true` on Windows.
 * Node passes `.cmd` launchers through cmd.exe (mandatory since the
 * CVE-2024-27980 hardening) but joins arguments without quoting, so paths
 * containing spaces would otherwise split into separate arguments. Windows
 * file names cannot contain double quotes, so wrapping is sufficient.
 */
export function quoteForCmdShell(value: string): string {
  if (value === "" || /[\s&|<>()^]/.test(value)) return `"${value}"`;
  return value;
}

export function prepareSpawn(command: string, args: string[], platform: NodeJS.Platform = process.platform): {
  command: string;
  args: string[];
  shell: boolean;
} {
  if (platform !== "win32") return { command, args, shell: false };
  return { command: quoteForCmdShell(command), args: args.map(quoteForCmdShell), shell: true };
}
