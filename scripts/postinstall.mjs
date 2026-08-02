#!/usr/bin/env node
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const setup = path.join(packageRoot, "scripts", "setup.mjs");

async function exists(filePath) {
  return access(filePath).then(() => true).catch(() => false);
}

const explicitlyDisabled = process.env.SLIDE_AGENT_SKIP_AUTO_INSTALL === "1";
const npxBootstrap = process.env.npm_command === "exec";
const sourceCheckout = path.resolve(process.env.INIT_CWD ?? "") === packageRoot
  && await exists(path.join(packageRoot, ".git"));

if (explicitlyDisabled || npxBootstrap || sourceCheckout) {
  const reason = explicitlyDisabled ? "disabled by environment" : npxBootstrap ? "deferred to the npx installer" : "source checkout";
  process.stdout.write(`Slide Agent automatic skill registration skipped (${reason}).\n`);
} else {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [setup, "--target", "all", "--skip-build", "--skip-cli", "--skip-path-update"], {
      cwd: packageRoot,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Slide Agent skill registration exited with code ${code ?? "unknown"}.`)));
  });
}
