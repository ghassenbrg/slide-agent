import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Files shipped in the package's `assets/` directory, found from wherever this
 * module ended up: `src/v2` under tsx, `dist` after bundling.
 */
export function assetPath(...segments: string[]): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [0, 1, 2, 3, 4].map((depth) => path.resolve(moduleDir, ...Array<string>(depth).fill(".."), "assets", ...segments));
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[1]!;
}
