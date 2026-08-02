#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");

async function run(command, args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function addDirectory(zip, directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    const destination = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) await addDirectory(zip, source, destination);
    else zip.file(destination, await readFile(source));
  }
}

await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
await run("npm", ["run", "plugin:build"]);
await run("npm", ["run", "plugin:validate"]);
await run("npm", ["run", "release:verify"]);
await run("npm", ["pack", "--pack-destination", release]);
await run("npm", ["run", "package"], path.join(root, "extensions", "vscode"));

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const vsixName = `slide-agent-vscode-${packageJson.version}.vsix`;
await copyFile(path.join(root, "extensions", "vscode", vsixName), path.join(release, vsixName));

const pluginZip = new JSZip();
await addDirectory(pluginZip, path.join(root, "distribution", "codex", "plugins", "slide-agent"), "slide-agent");
await writeFile(
  path.join(release, `slide-agent-codex-plugin-${packageJson.version}.zip`),
  await pluginZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } }),
);
await run("npm", ["run", "release:audit-artifacts"]);

const artifacts = (await readdir(release)).sort();
const checksums = [];
for (const name of artifacts) {
  const digest = createHash("sha256").update(await readFile(path.join(release, name))).digest("hex");
  checksums.push(`${digest}  ${name}`);
}
await writeFile(path.join(release, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");
process.stdout.write(`${artifacts.length} release artifacts plus SHA256SUMS written to ${release}\n`);
