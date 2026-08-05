#!/usr/bin/env node
import { gunzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import { containsSensitiveDigest, secretPatterns } from "./audit-public-content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");
const blockedExtensions = new Set([".ppt", ".pptx", ".pptm", ".pdf", ".key", ".pem", ".p12", ".pfx"]);
const problems = [];

function inspectEntry(archive, name, content) {
  const normalizedName = name.split(path.sep).join("/");
  if (blockedExtensions.has(path.extname(normalizedName).toLowerCase())) problems.push(`${archive}:${normalizedName}: blocked document or secret file`);
  if (containsSensitiveDigest(normalizedName)) problems.push(`${archive}:${normalizedName}: confidential identifier in path`);
  if (content.length > 5_000_000) return;
  const text = content.toString("utf8");
  if (containsSensitiveDigest(text)) problems.push(`${archive}:${normalizedName}: confidential or source-provenance identifier in content`);
  if (secretPatterns.some((pattern) => pattern.test(text))) problems.push(`${archive}:${normalizedName}: possible credential or local absolute path`);
}

function inspectTarGz(archive, compressed) {
  const tar = gunzipSync(compressed);
  const entries = new Map();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const string = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/, "");
    const name = [string(345, 155), string(0, 100)].filter(Boolean).join("/");
    const size = Number.parseInt(string(124, 12).trim() || "0", 8);
    const mode = Number.parseInt(string(100, 8).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    offset += 512;
    const content = tar.subarray(offset, offset + size);
    if (type === "0" || type === "\0") {
      inspectEntry(archive, name, content);
      entries.set(name, { content, mode });
    }
    offset += Math.ceil(size / 512) * 512;
  }
  const metadataEntry = entries.get("package/package.json");
  if (!metadataEntry) {
    problems.push(`${archive}: missing package/package.json`);
    return;
  }
  try {
    const metadata = JSON.parse(metadataEntry.content.toString("utf8"));
    const expectedBins = {
      "slide-agent": "dist/cli.js",
      "slide-agent-mcp": "dist/mcp-server.js",
    };
    if (JSON.stringify(metadata.bin) !== JSON.stringify(expectedBins)) {
      problems.push(`${archive}: npm package does not expose both expected CLI binaries`);
    }
    if (metadata.scripts?.postinstall) {
      problems.push(`${archive}: npm package must not run a postinstall lifecycle script`);
    }

    for (const target of Object.values(expectedBins)) {
      const entry = entries.get(`package/${target}`);
      if (!entry) problems.push(`${archive}: missing npm binary target package/${target}`);
      else if ((entry.mode & 0o111) === 0) problems.push(`${archive}: npm binary target package/${target} is not executable`);
    }
  } catch (error) {
    problems.push(`${archive}: invalid package/package.json (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function inspectZip(archive, data) {
  const zip = await JSZip.loadAsync(data);
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) inspectEntry(archive, name, await entry.async("nodebuffer"));
  }
}

const artifacts = await readdir(release);
for (const name of artifacts) {
  const data = await readFile(path.join(release, name));
  if (name.endsWith(".tgz")) inspectTarGz(name, data);
  else if (name.endsWith(".zip") || name.endsWith(".vsix")) await inspectZip(name, data);
}
if (problems.length) {
  process.stderr.write(`Release-artifact audit failed:\n${problems.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Release-artifact audit passed (${artifacts.length} archives).\n`);
}
