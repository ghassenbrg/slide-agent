import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

export async function ensureDir(directory: string): Promise<string> {
  const resolved = path.resolve(directory);
  await mkdir(resolved, { recursive: true });
  return resolved;
}

export async function readUtf8(filePath: string): Promise<string> {
  return readFile(path.resolve(filePath), "utf8");
}

/**
 * How many spaces written JSON is indented by. None, by default.
 *
 * Measured on a real deck: indentation was 27% of `report.json` and 34% of the
 * review packet, and the reader of both is normally a model, for which it is
 * pure cost. The MCP server has serialised compactly since 0.13 for exactly
 * this reason; this brings the files on disk into line with it.
 * `slide-agent --pretty` sets it back to 2 for a person at a terminal.
 */
let jsonIndent: number | undefined;

export function setJsonIndent(spaces: number | undefined): void {
  jsonIndent = spaces;
}

export async function writeJson(filePath: string, value: unknown): Promise<string> {
  const resolved = path.resolve(filePath);
  await ensureDir(path.dirname(resolved));
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, jsonIndent)}\n`, "utf8");
  await rename(temporary, resolved);
  return resolved;
}

export async function writeUtf8(filePath: string, value: string): Promise<string> {
  const resolved = path.resolve(filePath);
  await ensureDir(path.dirname(resolved));
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, resolved);
  return resolved;
}

export async function writeBinary(filePath: string, bytes: Buffer | Uint8Array): Promise<string> {
  const resolved = path.resolve(filePath);
  await ensureDir(path.dirname(resolved));
  const temporary = `${resolved}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, resolved);
  return resolved;
}

export function absolute(filePath: string, base = process.cwd()): string {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(base, filePath);
}

export async function fileSha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(path.resolve(filePath))).digest("hex");
}
