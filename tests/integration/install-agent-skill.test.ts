import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
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

  it("does not register skills as a side effect of installing the library", async () => {
    // Adding a dependency must never write into the developer's home
    // directory, and must never point a global skill at a path inside one
    // project's node_modules.
    const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      files?: string[];
    };
    for (const lifecycle of ["preinstall", "install", "postinstall"]) {
      expect(packageJson.scripts?.[lifecycle], `${lifecycle} must not exist`).toBeUndefined();
    }
    expect(packageJson.files).not.toContain("scripts/postinstall.mjs");
    await expect(lstat(path.join(scripts, "postinstall.mjs"))).rejects.toThrow();
  });

  it("refreshes a skill copy previously created by the managed Windows fallback", async () => {
    const updateRoot = await mkdtemp(path.join(tmpdir(), "slide-agent-copy-update-"));
    try {
      const destination = path.join(updateRoot, "codex", "slide-agent");
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, "SKILL.md"), "stale skill\n", "utf8");
      await writeFile(
        path.join(destination, ".slide-agent-install.json"),
        `${JSON.stringify({ packageRoot: root }, null, 2)}\n`,
        "utf8",
      );
      await execute(process.execPath, [path.join(scripts, "setup.mjs"), "--target", "codex", "--skip-cli"], {
        env: {
          ...installerEnvironment(),
          SLIDE_AGENT_CODEX_SKILLS_DIR: path.join(updateRoot, "codex"),
        },
      });
      expect(await readFile(path.join(destination, "SKILL.md"), "utf8"))
        .toBe(await readFile(path.join(root, "SKILL.md"), "utf8"));
    } finally {
      await rm(updateRoot, { recursive: true, force: true });
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
