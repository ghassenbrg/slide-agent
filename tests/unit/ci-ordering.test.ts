import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

/**
 * CI runs several checks before `npm run build`. Any of them that reads
 * `dist/` fails on a clean checkout — and, worse, passes locally against a
 * stale bundle, which is how a real mismatch reached CI unnoticed.
 */
async function verifyJobSteps(): Promise<string[]> {
  const workflow = await readFile(path.join(root, ".github/workflows/slide-agent-ci.yml"), "utf8");
  // The verify job runs until the consumer-install job's header.
  const verifyJob = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  consumer-install:"));
  return [...verifyJob.matchAll(/^\s+(?:- )?run: (.+)$/gm)].map((match) => match[1]!.trim());
}

/** The files a workflow step ultimately executes, as far as one hop. */
async function scriptFilesFor(step: string): Promise<string[]> {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const command = step.startsWith("npm run ")
    ? packageJson.scripts[step.slice("npm run ".length).trim()] ?? ""
    : step;
  return [...command.matchAll(/(?:node|tsx)\s+(scripts\/[\w./-]+)/g)].map((match) => match[1]!);
}

describe("CI step ordering", () => {
  it("runs no dist-dependent script before the build", async () => {
    const steps = await verifyJobSteps();
    const buildIndex = steps.findIndex((step) => step === "npm run build");
    expect(buildIndex, "the verify job must run `npm run build`").toBeGreaterThan(0);

    const problems: string[] = [];
    for (const step of steps.slice(0, buildIndex)) {
      for (const file of await scriptFilesFor(step)) {
        const source = await readFile(path.join(root, file), "utf8").catch(() => "");
        if (/["'`].*\bdist\/(?:index|cli|mcp-server)\.js/.test(source)) {
          problems.push(`${step} → ${file} reads dist/ but runs before \`npm run build\``);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps the documentation check independent of the build output", async () => {
    // Reading dist/ here would let the drift check pass against a stale bundle,
    // which defeats the point of having the check at all.
    const source = await readFile(path.join(root, "scripts/generate-docs.ts"), "utf8");
    expect(source).not.toMatch(/dist\/index\.js/);
    expect(source).toContain('from "../src/contract/index.js"');
  });
});
