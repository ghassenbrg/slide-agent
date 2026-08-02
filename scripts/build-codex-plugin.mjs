#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "distribution", "codex", "plugins", "slide-agent");
const skill = path.join(plugin, "skills", "slide-agent");

await rm(skill, { recursive: true, force: true });
await mkdir(skill, { recursive: true });
for (const relative of ["SKILL.md", "agents", "assets", "references"]) {
  await cp(path.join(root, relative), path.join(skill, relative), { recursive: true });
}
await mkdir(path.join(plugin, "assets"), { recursive: true });
await cp(path.join(root, "images", "icon.png"), path.join(plugin, "assets", "icon.png"));
for (const relative of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  await cp(path.join(root, relative), path.join(plugin, relative));
}
process.stdout.write(`Built Codex plugin payload: ${plugin}\n`);
