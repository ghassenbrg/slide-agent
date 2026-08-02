#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hasSlideAgentFrontmatter } from "./skill-frontmatter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "distribution", "codex", "plugins", "slide-agent");
const manifest = JSON.parse(await readFile(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
const required = ["name", "version", "description", "author", "interface"];
const errors = required.filter((key) => manifest[key] === undefined).map((key) => `missing manifest field: ${key}`);
if (manifest.name !== "slide-agent") errors.push("plugin name must be slide-agent");
if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.version ?? "")) errors.push("plugin version must be semver");
for (const relative of [manifest.skills, manifest.interface?.composerIcon, manifest.interface?.logo]) {
  if (typeof relative !== "string") continue;
  const target = path.resolve(plugin, relative);
  if (!target.startsWith(`${plugin}${path.sep}`) || !await access(target).then(() => true).catch(() => false)) errors.push(`missing or unsafe plugin path: ${relative}`);
}
const skill = await readFile(path.join(plugin, "skills", "slide-agent", "SKILL.md"), "utf8").catch(() => "");
if (!hasSlideAgentFrontmatter(skill)) errors.push("plugin skill is missing valid slide-agent frontmatter");
if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Codex plugin is valid: ${plugin}\n`);
}
