import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { findExecutable } from "./utils/process.js";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warning" | "error";
  detail: string;
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

export async function runDoctor(): Promise<DoctorCheck[]> {
  const home = homedir();
  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split(".").map(Number);
  const nodeSupported = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 12);
  const checks: DoctorCheck[] = [{
    name: "Node.js",
    status: nodeSupported ? "ok" : "error",
    detail: `${process.versions.node} (${process.execPath})${nodeSupported ? "" : "; version 22.12 or newer is required"}`,
  }];
  const soffice = await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE);
  const pdftoppm = await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM);
  checks.push({ name: "LibreOffice", status: soffice ? "ok" : "warning", detail: soffice ?? "not found; rendering is unavailable" });
  checks.push({ name: "Poppler", status: pdftoppm ? "ok" : "warning", detail: pdftoppm ?? "not found; rendering is unavailable" });

  const agentPaths = [
    ["Codex / universal", process.env.SLIDE_AGENT_CODEX_SKILLS_DIR ?? path.join(home, ".agents", "skills", "slide-agent")],
    ["GitHub Copilot", process.env.SLIDE_AGENT_COPILOT_SKILLS_DIR ?? path.join(home, ".copilot", "skills", "slide-agent")],
    ["Claude Code", process.env.SLIDE_AGENT_CLAUDE_SKILLS_DIR ?? path.join(home, ".claude", "skills", "slide-agent")],
    ["Gemini CLI", process.env.SLIDE_AGENT_GEMINI_SKILLS_DIR ?? path.join(home, ".gemini", "skills", "slide-agent")],
  ] as const;
  for (const [name, configuredPath] of agentPaths) {
    const skillPath = configuredPath.endsWith("slide-agent") ? configuredPath : path.join(configuredPath, "slide-agent");
    checks.push({ name, status: await exists(path.join(skillPath, "SKILL.md")) ? "ok" : "warning", detail: skillPath });
  }
  return checks;
}

export function formatDoctor(checks: DoctorCheck[]): string {
  return [
    "Slide Agent doctor",
    ...checks.map((check) => `${check.status === "ok" ? "✓" : check.status === "warning" ? "!" : "✗"} ${check.name}: ${check.detail}`),
  ].join("\n");
}
