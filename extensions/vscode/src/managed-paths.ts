import path from "node:path";

export interface ManagedCliPathOptions {
  configured?: string;
  prefix?: string;
  home: string;
  platform?: NodeJS.Platform;
}

export function resolveManagedCliPath(options: ManagedCliPathOptions): string {
  const configured = options.configured?.trim();
  if (configured) return configured;

  const platform = options.platform ?? process.platform;
  const paths = platform === "win32" ? path.win32 : path.posix;
  const prefix = paths.resolve(options.prefix ?? paths.join(options.home, ".local"));
  return paths.join(prefix, "bin", platform === "win32" ? "slide-agent.cmd" : "slide-agent");
}
