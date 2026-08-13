import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SlideAgent } from "../../src/pipeline.js";
import { silentLogger } from "../../src/logging/logger.js";
import { outputLayout } from "../../src/output/output-layout.js";
import type { AgentResult } from "../../src/types/index.js";

const root = path.resolve(import.meta.dirname, "../..");
const configDir = path.join(root, "config");
const briefsDir = path.join(root, "tests/fixtures/briefs");
let workspace: string;
let briefs: string[];

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-briefs-"));
  briefs = (await readdir(briefsDir)).filter((name) => name.endsWith(".md")).sort();
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

async function createFromBrief(name: string): Promise<AgentResult> {
  const prompt = await readFile(path.join(briefsDir, name), "utf8");
  return new SlideAgent(silentLogger).create({
    command: "create",
    prompt,
    output: path.join(workspace, `${path.basename(name, ".md")}.pptx`),
    configDir,
    validate: true,
    autoFix: true,
  });
}

describe("prompt-only creation across the brief corpus", () => {
  it("has a corpus to check", () => {
    expect(briefs.length).toBeGreaterThanOrEqual(8);
  });

  it.for([
    "01-zero-trust-bank.md",
    "02-school-lunch.md",
    "03-clinical-trial.md",
    "04-minimal.md",
    "05-technical-runbook.md",
    "06-french-bilingual.md",
    "07-long-strategy.md",
    "08-workshop.md",
  ])("produces a usable deck from %s", async (name) => {
    const result = await createFromBrief(name);
    // The headline command must never hand a user an unusable failure.
    expect(result.status, JSON.stringify(result.errors)).not.toBe("error");
    expect(result.errors).toEqual([]);
    expect(result.slideCount).toBeGreaterThanOrEqual(3);

    const issues = result.validation?.issues ?? [];
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    // Geometry defects are never acceptable: they are always our bug.
    expect(issues.filter((issue) => issue.code === "object-outside-slide")).toEqual([]);
    // Every remaining fixable issue must explain why it was not repaired.
    for (const issue of issues.filter((issue) => issue.fixable && issue.fixed !== true)) {
      expect(issue.unfixedReason ?? "", `${issue.code} on slide ${issue.slide ?? "?"}`).not.toBe("");
    }
  });

  it("converges instead of burning every retry on an unfixable deck", async () => {
    const result = await createFromBrief("07-long-strategy.md");
    expect(result.metadata.retries).toBeLessThanOrEqual(2);
    const report = JSON.parse(await readFile(outputLayout(path.join(workspace, "07-long-strategy.pptx")).validation, "utf8")) as {
      status: string;
      issueGroups: Array<{ code: string; severity: string; count: number }>;
    };
    // The report written to disk is the reconciled one the caller was handed.
    // It carries its findings grouped — one entry per code with its call sites
    // listed — so an error on disk is an error-severity group, not a row.
    expect(report.issueGroups.filter((group) => group.severity === "error")).toEqual([]);
  });

  it("derives a different deck for a different subject", async () => {
    const [bank, lunch] = await Promise.all([
      readFile(outputLayout(path.join(workspace, "01-zero-trust-bank.pptx")).manifest, "utf8"),
      readFile(outputLayout(path.join(workspace, "02-school-lunch.pptx")).manifest, "utf8"),
    ]);
    const palette = (raw: string) => JSON.stringify((JSON.parse(raw) as { creativeDirection?: { palette?: unknown } }).creativeDirection?.palette);
    expect(palette(bank)).not.toBe(palette(lunch));
  });
});
