#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([".git", ".tmp", "node_modules", "dist", "release", "out", "coverage"]);
// Build output, not source. Both are gitignored; the auditor walks the working
// tree, so it has to skip them explicitly or a local build fails the audit.
const excludedRelativeDirectories = new Set(["examples/output", "examples/showcase/output"]);
const allowedPresentationFiles = new Set(["tests/fixtures/invalid-layout.pptx"]);
const blockedArtifactExtensions = new Set([".ppt", ".pptx", ".pptm", ".pdf", ".key"]);
const blockedFileNames = new Set([".env", ".env.local", ".npmrc"]);
const sensitiveDigests = [
  [5, "cdc70e65c21998c81dd352b29d04e45b1aaf4ef698e5cd3b846ebd88b7c1310e"],
  [9, "428534517de235bf590bb62a27b893e531c7c898c5b2c2850ab2578fd11ba9c2"],
  [1, "8c0b0fb70efd58545636dc76efa0ce89b59609c34cb8001c13a5a0caf5ee245b"],
  [2, "eb8176ce40391c377b6b1979ecd8432cb29ea7f27c18f70e48fe90372eb5b49b"],
  [3, "855e232b1255a397277eb9671722a7e5bdee584c8b8f579f1a5cd98571f09f88"],
  [3, "c40c2c7f6c68effb40e5aa2e1f9a2b7f462c652ea624325c979903af5dc8b6b6"],
  [3, "bb477dd27ee1ecf7ecfe2f9c46ef3520dc97c33ebf7de16fcfc1985b76ee3d39"],
];
export const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bnpm_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{32,}\b/,
  /\/Users\/ghassenbrg\//,
];

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function containsSensitiveDigest(value) {
  const words = normalize(value).split(" ").filter(Boolean);
  for (const [wordCount, expected] of sensitiveDigests) {
    for (let index = 0; index + wordCount <= words.length; index += 1) {
      const candidate = words.slice(index, index + wordCount).join(" ");
      if (createHash("sha256").update(candidate).digest("hex") === expected) return true;
    }
  }
  return false;
}

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory() && (excludedDirectories.has(entry.name) || excludedRelativeDirectories.has(relative))) continue;
    if (entry.isDirectory()) await walk(absolute, files);
    else files.push({ absolute, relative });
  }
  return files;
}

export async function auditPublicContent() {
  const problems = [];
  for (const file of await walk(root)) {
    const info = await lstat(file.absolute);
    if (info.isSymbolicLink()) {
      const target = await realpath(file.absolute).catch(() => "");
      if (!target.startsWith(`${root}${path.sep}`)) problems.push(`${file.relative}: symlink escapes the repository`);
      continue;
    }
    const extension = path.extname(file.relative).toLowerCase();
    if (blockedArtifactExtensions.has(extension) && !allowedPresentationFiles.has(file.relative)) {
      problems.push(`${file.relative}: presentation/document artifact is not approved for publication`);
    }
    if (blockedFileNames.has(path.basename(file.relative)) || [".pem", ".p12", ".pfx"].includes(extension)) {
      problems.push(`${file.relative}: secret-bearing file type is not allowed`);
    }
    if (containsSensitiveDigest(file.relative)) problems.push(`${file.relative}: confidential identifier in path`);
    if (info.size > 5_000_000) continue;
    const content = await readFile(file.absolute, "utf8").catch(() => "");
    if (containsSensitiveDigest(content)) problems.push(`${file.relative}: confidential or source-provenance identifier in content`);
    if (secretPatterns.some((pattern) => pattern.test(content))) problems.push(`${file.relative}: possible credential or local absolute path`);
  }
  if (problems.length) throw new Error(`Public-content audit failed:\n${problems.join("\n")}`);
  return { filesScanned: (await walk(root)).length };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  auditPublicContent()
    .then(({ filesScanned }) => process.stdout.write(`Public-content audit passed (${filesScanned} files).\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
