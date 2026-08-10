#!/usr/bin/env node
// The suite as the least-equipped runner sees it.
//
// CI installs LibreOffice and Poppler on Linux only, so the macOS and Windows
// jobs render nothing: previews fall back to schematic drawings, readiness caps
// at `review`, and every code path behind a real render goes uncovered. A
// developer machine with Homebrew has none of those constraints, which is why
// that class of failure is only ever discovered after a push.
//
// Pinning both tools to a path that cannot resolve reproduces it locally. The
// pin is honoured over discovery by design — see `findExecutable`.
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const unresolvable = path.join(root, "does-not-exist", "no-such-binary");
const args = process.argv.slice(2);

const child = spawn(
  "npx",
  ["vitest", "run", ...(args.length > 0 ? args : ["--coverage"])],
  {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      SLIDE_AGENT_SOFFICE: unresolvable,
      SLIDE_AGENT_PDFTOPPM: unresolvable,
      SLIDE_AGENT_PDFTOTEXT: unresolvable,
    },
  },
);

child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1;
});
