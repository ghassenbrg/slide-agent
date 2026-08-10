#!/usr/bin/env node
// Installs the packed tarball into a throwaway project and proves the install
// is inert: no lifecycle scripts, and nothing written into the agent skill
// directories or anywhere else outside the project.
import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const packDirectory = path.resolve(process.argv[2] ?? tmpdir());

async function exists(target) {
  return access(target).then(() => true).catch(() => false);
}

async function main() {
  const tarballs = (await readdir(packDirectory)).filter((name) => name.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one packed tarball in ${packDirectory}, found ${tarballs.length}.`);
  }
  const tarball = path.join(packDirectory, tarballs[0]);

  const workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-consumer-"));
  const home = path.join(workspace, "home");
  const skills = path.join(workspace, "skills");
  await mkdir(home, { recursive: true });
  const project = path.join(workspace, "project");
  await mkdir(project, { recursive: true });
  await writeFile(
    path.join(project, "package.json"),
    `${JSON.stringify({ name: "consumer", version: "1.0.0", private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );

  try {
    await execute("npm", ["install", tarball, "--no-audit", "--no-fund"], {
      cwd: project,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(skills, "codex"),
        SLIDE_AGENT_COPILOT_SKILLS_DIR: path.join(skills, "copilot"),
        SLIDE_AGENT_CLAUDE_SKILLS_DIR: path.join(skills, "claude"),
        SLIDE_AGENT_GEMINI_PLUGIN_DIR: path.join(skills, "gemini", "slide-agent-plugin"),
      },
      shell: process.platform === "win32",
    });

    const problems = [];
    if (await exists(skills)) problems.push(`install wrote into the agent skill directory: ${skills}`);
    for (const agent of ["codex", "copilot", "claude", "gemini"]) {
      for (const root of [skills, home]) {
        const candidate = path.join(root, agent, "skills", "slide-agent");
        if (await exists(candidate)) problems.push(`install registered a skill at ${candidate}`);
      }
    }
    for (const directory of [".agents", ".copilot", ".claude", ".gemini", ".local"]) {
      if (await exists(path.join(home, directory))) problems.push(`install wrote into the home directory: ~/${directory}`);
    }

    // The library itself must still work after an inert install.
    const { stdout } = await execute(
      process.execPath,
      ["--input-type=module", "-e", "import { VERSION } from '@slide-agent/core'; process.stdout.write(VERSION);"],
      { cwd: project, shell: process.platform === "win32" },
    );
    if (!/^\d+\.\d+\.\d+/.test(stdout.trim())) problems.push(`library import did not expose a version: ${stdout.trim()}`);

    if (problems.length) throw new Error(`Consumer install is not inert:\n${problems.map((entry) => `  - ${entry}`).join("\n")}`);
    process.stdout.write(`Consumer install is inert (${path.basename(tarball)}, library reports ${stdout.trim()}).\n`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
