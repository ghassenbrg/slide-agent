import { execFile } from "node:child_process";
import { lstat, mkdtemp, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const root = path.resolve(import.meta.dirname, "../..");
const scripts = path.join(root, "scripts");
let workspace: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-installers-"));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function installerEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(workspace, "codex"),
    SLIDE_AGENT_COPILOT_SKILLS_DIR: path.join(workspace, "copilot"),
    SLIDE_AGENT_CLAUDE_SKILLS_DIR: path.join(workspace, "claude"),
    SLIDE_AGENT_GEMINI_SKILLS_DIR: path.join(workspace, "gemini"),
  };
}

describe("agent skill installers", () => {
  it.runIf(process.platform !== "win32")("provides a one-command installer for all agents", async () => {
    const result = await execute("/bin/sh", [path.join(root, "install.sh"), "--skip-cli"], {
      env: installerEnvironment(),
    });
    expect(result.stdout).toContain("Slide Agent is ready.");
    expect(result.stdout).toContain("GitHub Copilot: /slide-agent");
  });

  it("uses the portable setup engine on every platform", async () => {
    const portable = await mkdtemp(path.join(tmpdir(), "slide-agent-portable-installer-"));
    try {
      const environment = {
        ...installerEnvironment(),
        SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(portable, "codex"),
        SLIDE_AGENT_COPILOT_SKILLS_DIR: path.join(portable, "copilot"),
        SLIDE_AGENT_CLAUDE_SKILLS_DIR: path.join(portable, "claude"),
        SLIDE_AGENT_GEMINI_SKILLS_DIR: path.join(portable, "gemini"),
      };
      const result = await execute(process.execPath, [path.join(scripts, "setup.mjs"), "--target", "all", "--skip-cli"], { env: environment });
      expect(result.stdout).toContain("installation complete for: all");
      for (const agent of ["codex", "copilot", "claude", "gemini"]) {
        expect(await lstat(path.join(portable, agent, "slide-agent"))).toBeDefined();
      }
    } finally {
      await rm(portable, { recursive: true, force: true });
    }
  });

  it("registers skills automatically after an npm package install", async () => {
    const automatic = await mkdtemp(path.join(tmpdir(), "slide-agent-postinstall-"));
    try {
      const environment = {
        ...process.env,
        INIT_CWD: automatic,
        npm_command: "install",
        npm_lifecycle_event: "postinstall",
        SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(automatic, "codex"),
        SLIDE_AGENT_COPILOT_SKILLS_DIR: path.join(automatic, "copilot"),
        SLIDE_AGENT_CLAUDE_SKILLS_DIR: path.join(automatic, "claude"),
        SLIDE_AGENT_GEMINI_SKILLS_DIR: path.join(automatic, "gemini"),
        SLIDE_AGENT_SKIP_AUTO_INSTALL: "0",
      };
      const result = await execute(process.execPath, [path.join(scripts, "postinstall.mjs")], { env: environment });
      expect(result.stdout).toContain("installation complete for: all");
      for (const agent of ["codex", "copilot", "claude", "gemini"]) {
        expect(await lstat(path.join(automatic, agent, "slide-agent"))).toBeDefined();
      }
    } finally {
      await rm(automatic, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== "win32")("installs links for every supported agent and is idempotent", async () => {
    const installer = path.join(scripts, "install-all-agents.sh");
    const first = await execute("/bin/sh", [installer, "--skip-cli"], { env: installerEnvironment() });
    expect(first.stdout).toContain("installation complete for: all");

    for (const agent of ["codex", "copilot", "claude", "gemini"]) {
      const link = path.join(workspace, agent, "slide-agent");
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(await readlink(link)).toBe(root);
    }

    const second = await execute("/bin/sh", [installer, "--skip-cli"], { env: installerEnvironment() });
    expect(second.stdout.match(/Already installed for/g)).toHaveLength(4);
  });

  it.runIf(process.platform !== "win32")("installs one agent without touching the others", async () => {
    const separate = await mkdtemp(path.join(tmpdir(), "slide-agent-codex-installer-"));
    try {
      const environment = {
        ...installerEnvironment(),
        SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(separate, "codex"),
      };
      await execute("/bin/sh", [path.join(scripts, "install-codex.sh"), "--skip-cli"], { env: environment });
      expect((await lstat(path.join(separate, "codex", "slide-agent"))).isSymbolicLink()).toBe(true);
    } finally {
      await rm(separate, { recursive: true, force: true });
    }
  });
});
