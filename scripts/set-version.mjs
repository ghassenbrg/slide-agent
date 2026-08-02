#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  process.stderr.write("Usage: npm run version:set -- <semver>\n");
  process.exit(1);
}

async function updateJson(relative, mutate) {
  const target = path.join(root, relative);
  const data = JSON.parse(await readFile(target, "utf8"));
  mutate(data);
  await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

await updateJson("package.json", (data) => { data.version = version; });
await updateJson("package-lock.json", (data) => {
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
});
await updateJson("extensions/vscode/package.json", (data) => { data.version = version; });
await updateJson("extensions/vscode/package-lock.json", (data) => {
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
});
await updateJson("distribution/codex/plugins/slide-agent/.codex-plugin/plugin.json", (data) => { data.version = version; });
await writeFile(path.join(root, "src/version.ts"), `export const VERSION = "${version}";\n`, "utf8");
process.stdout.write(`Set Slide Agent version to ${version}. Run npm run release:verify before tagging.\n`);
