#!/usr/bin/env node
// Render-dependent tests skip themselves when LibreOffice and Poppler are
// missing. On a runner that installs them, a skip means the discovery logic
// broke — which is exactly the regression a skipped test cannot report.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

async function main() {
  const { findExecutable } = await import(pathToFileURL(path.join(root, "dist", "index.js")).href);
  const soffice = await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE);
  const pdftoppm = await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM);
  if (!soffice || !pdftoppm) {
    throw new Error(
      `Preview tools are installed on this runner but Slide Agent did not discover them `
      + `(soffice=${soffice ?? "not found"}, pdftoppm=${pdftoppm ?? "not found"}). `
      + `Executable discovery has regressed.`,
    );
  }

  const { stdout, stderr } = await execute(
    "npx",
    ["vitest", "run", "tests/integration/render.test.ts", "--reporter=json"],
    { cwd: root, shell: process.platform === "win32", maxBuffer: 32 * 1024 * 1024 },
  );
  const report = JSON.parse(stdout.slice(stdout.indexOf("{")));
  const assertions = report.testResults?.flatMap((file) => file.assertionResults ?? []) ?? [];
  // The suite has two mutually exclusive blocks; only the rendering one is
  // expected to run here. The fallback block is correctly skipped.
  const rendering = assertions.filter((assertion) => (assertion.ancestorTitles ?? []).includes("preview rendering"));
  const skipped = rendering.filter((assertion) => assertion.status === "pending" || assertion.status === "skipped");
  if (rendering.length === 0) {
    throw new Error(`The "preview rendering" block did not run on a runner with preview tools installed.\n${stderr}`);
  }
  if (skipped.length > 0) {
    throw new Error(`${skipped.length} render assertion(s) skipped despite preview tools being installed:\n`
      + skipped.map((assertion) => `  - ${assertion.fullName}`).join("\n"));
  }
  const failed = rendering.filter((assertion) => assertion.status === "failed");
  if (failed.length > 0) {
    throw new Error(`${failed.length} render assertion(s) failed:\n` + failed.map((assertion) => `  - ${assertion.fullName}`).join("\n"));
  }
  process.stdout.write(`Render path verified: ${rendering.length} assertion(s) ran with ${soffice} and ${pdftoppm}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
