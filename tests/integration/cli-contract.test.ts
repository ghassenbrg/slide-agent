import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { outputLayout } from "../../src/output/output-layout.js";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const cli = path.join(root, "dist", "cli.js");
let workspace: string;

interface Run {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Runs the built CLI exactly as an agent would. Every command must put one
 * JSON object on stdout, structured logs on stderr, and a meaningful exit
 * code — the contract an agent depends on and that nothing tested before.
 */
async function run(args: string[]): Promise<Run> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args], { maxBuffer: 32 * 1024 * 1024 });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", code: failure.code ?? 1 };
  }
}

function singleJson(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  expect(trimmed.startsWith("{"), "stdout must be one JSON object").toBe(true);
  // JSON.parse throws on trailing content, which is the property under test.
  return JSON.parse(trimmed) as Record<string, unknown>;
}

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-cli-"));
  await execute("npm", ["run", "build"], { cwd: root, shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024 });
  await writeFile(path.join(workspace, "brief.md"), [
    "# Quarterly operations review",
    "",
    "Audience: operations leadership",
    "Objective: agree the next quarter's priorities",
    "Slides: 6",
    "",
    "## Throughput",
    "## Cost per unit",
    "## Hiring plan",
  ].join("\n"), "utf8");
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

describe("CLI contract", () => {
  it("reports its version and help without touching stdout formatting", async () => {
    const version = await run(["--version"]);
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);

    const help = await run(["--help"]);
    expect(help.code).toBe(0);
    for (const command of ["create", "draft", "edit", "revise", "render", "validate", "diff", "data", "template", "fonts", "contract", "run", "doctor"]) {
      expect(help.stdout, command).toContain(command);
    }
  });

  it("emits one JSON result on stdout and JSON lines on stderr", async () => {
    const output = path.join(workspace, "deck.pptx");
    const result = await run(["create", "--prompt", path.join(workspace, "brief.md"), "--output", output]);

    const parsed = singleJson(result.stdout);
    // A draft reports `warning`, not `success`: an agent reads the JSON and
    // never sees stderr, so "success" in the machine-readable channel is the
    // deck passing as finished when it is scaffolding.
    expect(parsed.status).toBe("warning");
    expect(parsed.warnings).toContainEqual(expect.stringContaining("structural draft"));
    expect(parsed).toHaveProperty("primaryOutput");
    expect(parsed).toHaveProperty("validation");
    expect((parsed.metadata as Record<string, unknown>).contractVersion).toBeTruthy();
    expect((parsed.metadata as Record<string, unknown>).provenance).toBe("template-draft");
    expect(result.code).toBe(0);

    // Every stderr line is a JSON log record, so a host can parse them.
    for (const line of result.stderr.split("\n").filter((entry) => entry.trim().startsWith("{"))) {
      expect(() => JSON.parse(line) as unknown).not.toThrow();
    }
    // A draft must announce itself rather than passing as a finished deck.
    expect(result.stderr).toContain("structural draft");
  });

  it("emits a runnable request skeleton instead of a placeholder deck", async () => {
    // The honest answer to "build me a deck from this brief" is a request a
    // model can finish, not a deck full of brackets that no model designed.
    const request = path.join(workspace, "request.json");
    const result = await run(["draft", "--prompt", path.join(workspace, "brief.md"), "--output", request, "--deck", path.join(workspace, "from-draft.pptx")]);
    expect(result.code).toBe(0);

    const summary = singleJson(result.stdout) as { request: string; nextStep: string; slideCount: number };
    expect(summary.request).toBe(request);
    expect(summary.nextStep).toContain("slide-agent run --request");
    expect(summary.slideCount).toBeGreaterThanOrEqual(3);

    // The skeleton has to be a valid request, or "fill this in and run it" is
    // advice that does not work.
    const built = await run(["run", "--request", request]);
    expect(built.code).toBe(0);
    expect(singleJson(built.stdout).slideCount).toBe(summary.slideCount);
  });

  it("says plainly that create --prompt builds a draft, and points at draft", async () => {
    const result = await run(["create", "--prompt", path.join(workspace, "brief.md"), "--output", path.join(workspace, "notice.pptx")]);
    expect(result.stderr).toContain("slide-agent draft --prompt");
  });

  it("exits non-zero with a structured error when a required input is missing", async () => {
    const result = await run(["validate", "--input", path.join(workspace, "does-not-exist.pptx")]);
    expect(result.code).toBe(1);
    const parsed = singleJson(result.stdout);
    expect(parsed.status).toBe("error");
    expect((parsed.errors as Array<{ code: string }>)[0]!.code).toBeTruthy();
  });

  it("fails with a usage message, not a stack trace, when arguments are wrong", async () => {
    const result = await run(["create", "--output", path.join(workspace, "x.pptx")]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--prompt, --scene, or --script");
  });

  it("publishes the authoring contract in three usable shapes", async () => {
    const json = await run(["contract"]);
    expect(json.code).toBe(0);
    const parsed = singleJson(json.stdout);
    expect(parsed.contractVersion).toBeTruthy();
    expect(parsed).toHaveProperty("jsonSchemas");

    const prompt = await run(["contract", "--format", "prompt"]);
    expect(prompt.stdout).toContain("slide-agent.scene/1");

    const markdown = await run(["contract", "--format", "markdown", "--section", "accessibility"]);
    expect(markdown.stdout).toContain("## Accessibility");

    const schema = await run(["contract", "--schema", "outline"]);
    expect(JSON.parse(schema.stdout.trim()).properties).toHaveProperty("slides");

    const unknown = await run(["contract", "--schema", "nope"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("Unknown contract schema");
  });

  it("round-trips a deck through its own scene blueprint", async () => {
    const source = path.join(workspace, "deck.pptx");
    const scene = outputLayout(path.join(workspace, "deck.pptx")).inspect;
    const rebuilt = path.join(workspace, "rebuilt.pptx");

    const result = await run(["create", "--scene", scene, "--output", rebuilt]);
    expect(result.code).toBe(0);
    const parsed = singleJson(result.stdout);
    expect(parsed.slideCount).toBe(6);

    const diff = await run(["diff", "--before", source, "--after", rebuilt, "--json"]);
    const comparison = singleJson(diff.stdout) as { summary: { slidesAdded: number; slidesRemoved: number } };
    expect(comparison.summary.slidesAdded).toBe(0);
    expect(comparison.summary.slidesRemoved).toBe(0);
  });

  it("turns a data file into a chart spec carrying its provenance", async () => {
    const data = path.join(workspace, "throughput.csv");
    await writeFile(data, "quarter,units,defects\nQ1,120,4\nQ2,148,3\n", "utf8");
    const result = await run(["data", "--input", data, "--kind", "line"]);
    expect(result.code).toBe(0);
    const parsed = singleJson(result.stdout) as {
      chart: { labels: string[]; series: Array<{ name: string }> };
      speakerNote: string;
    };
    expect(parsed.chart.labels).toEqual(["Q1", "Q2"]);
    expect(parsed.chart.series.map((series) => series.name)).toEqual(["units", "defects"]);
    expect(parsed.speakerNote).toContain("2 row(s)");
  });

  it("reports doctor findings as machine-readable JSON with an honest status", async () => {
    const result = await run(["doctor", "--json"]);
    const parsed = singleJson(result.stdout) as {
      status: string;
      agents: Array<{ target: string; registered: boolean; verified: boolean; support: string }>;
    };
    expect(["ok", "warning", "error"]).toContain(parsed.status);
    expect(parsed.agents.length).toBeGreaterThanOrEqual(4);
    for (const agent of parsed.agents) {
      expect(typeof agent.registered, agent.target).toBe("boolean");
      expect(typeof agent.verified, agent.target).toBe("boolean");
      expect(["verified", "best-effort", "experimental"]).toContain(agent.support);
    }
  });

  it("refuses a structured request that violates the contract, naming the field", async () => {
    const request = path.join(workspace, "bad.json");
    await writeFile(request, JSON.stringify({
      command: "create",
      output: path.join(workspace, "bad.pptx"),
      outline: { brief: { title: "x" }, narrative: 1, slides: [] },
    }), "utf8");
    const result = await run(["run", "--request", request]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/narrative|slides|brief/);
  });
});
