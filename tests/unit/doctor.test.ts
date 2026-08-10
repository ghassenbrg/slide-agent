import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatDoctorReport, runDeepCheck, runDoctorReport } from "../../src/doctor.js";

let workspace: string;
const previous: Record<string, string | undefined> = {};
const VARIABLES = [
  "SLIDE_AGENT_CODEX_SKILLS_DIR",
  "SLIDE_AGENT_COPILOT_SKILLS_DIR",
  "SLIDE_AGENT_CLAUDE_SKILLS_DIR",
  "SLIDE_AGENT_GEMINI_PLUGIN_DIR",
];

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-doctor-test-"));
  for (const variable of VARIABLES) {
    previous[variable] = process.env[variable];
    process.env[variable] = path.join(workspace, variable.toLowerCase());
  }
  // Register only Codex, so the report has to distinguish the two states.
  const codex = path.join(process.env.SLIDE_AGENT_CODEX_SKILLS_DIR!, "slide-agent");
  await mkdir(codex, { recursive: true });
  await writeFile(path.join(codex, "SKILL.md"), "---\nname: slide-agent\n---\n", "utf8");
});

afterAll(async () => {
  for (const variable of VARIABLES) {
    if (previous[variable] === undefined) delete process.env[variable];
    else process.env[variable] = previous[variable];
  }
  await rm(workspace, { recursive: true, force: true });
});

describe("doctor", () => {
  it("separates what it registered from what it can verify", async () => {
    const report = await runDoctorReport();
    const codex = report.agents.find((agent) => agent.target === "codex")!;
    const gemini = report.agents.find((agent) => agent.target === "gemini")!;

    expect(codex.registered).toBe(true);
    expect(codex.evidence.join(" ")).toContain("skill present");
    expect(gemini.registered).toBe(false);
    expect(gemini.remedy).toContain("slide-agent install --target gemini");
  });

  it("labels how confident the project is in each integration", async () => {
    const report = await runDoctorReport();
    const support = Object.fromEntries(report.agents.map((agent) => [agent.target, agent.support]));
    expect(support.codex).toBe("verified");
    expect(support.claude).toBe("verified");
    expect(support.copilot).toBe("best-effort");
    expect(support.gemini).toBe("verified");
  });

  it("checks the MCP server rather than assuming it is wired up", async () => {
    const report = await runDoctorReport();
    const mcp = report.checks.find((check) => check.name === "MCP server")!;
    expect(mcp).toBeDefined();
    if (mcp.status !== "ok") expect(mcp.remedy).toBeTruthy();
  });

  it("reports the engine and contract versions", async () => {
    const report = await runDoctorReport();
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.contractVersion).toMatch(/^\d+\.\d+$/);
    expect(formatDoctorReport(report)).toContain("authoring contract");
  });

  it("prints a remedy for every non-ok check", async () => {
    const report = await runDoctorReport();
    for (const check of [...report.checks, ...report.agents]) {
      if (check.status === "ok") continue;
      expect(check.remedy, `${check.name} has no remedy`).toBeTruthy();
    }
  });

  it("proves generation works end to end", async () => {
    const deep = await runDeepCheck();
    expect(deep.status, deep.detail).toBe("ok");
    expect(deep.detail).toContain("slide deck");
  });
});
