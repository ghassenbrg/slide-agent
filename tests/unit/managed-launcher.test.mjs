import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createWindowsLauncher, deferRemovalUntilProcessExits, parseWindowsLauncherTarget } from "../../scripts/managed-launcher.mjs";

describe("managed Windows launchers", () => {
  it("round-trips a launcher containing Windows short paths and CRLF", () => {
    const node = "C:\\hostedtoolcache\\windows\\node\\22.23.1\\x64\\node.exe";
    const target = "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\slide-agent\\dist\\cli.js";
    const launcher = createWindowsLauncher(node, target);
    expect(parseWindowsLauncherTarget(launcher)).toBe(target);
    expect(launcher).toContain("SLIDE_AGENT_ACTIVE_LAUNCHER=%~f0");
    expect(launcher).toContain("exit /b %SLIDE_AGENT_EXIT_CODE%");
    expect(launcher).not.toContain("del \"%~f0\"");
  });

  it.each([
    "",
    "@echo off\r\ndel C:\\\\important %*\r\n",
    "@echo off\r\n\"node.exe\" \"untrusted.js\"\r\n",
    "\"node.exe\" \"untrusted.js\" %*\r\n",
    `${createWindowsLauncher("node.exe", "trusted.js")}echo malicious\r\n`,
  ])("rejects an unmanaged launcher", (content) => {
    expect(parseWindowsLauncherTarget(content)).toBeUndefined();
  });

  it("removes a deferred launcher only after its parent exits", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "slide-agent-deferred-launcher-"));
    const launcher = path.join(directory, "slide-agent.cmd");
    await writeFile(launcher, "test", "utf8");
    const parent = spawn(process.execPath, ["-e", "setTimeout(() => {}, 300)"], { stdio: "ignore" });
    deferRemovalUntilProcessExits(launcher, parent.pid, 25);

    await new Promise((resolve) => setTimeout(resolve, 150));
    await expect(access(launcher)).resolves.toBeUndefined();
    await new Promise((resolve) => parent.once("exit", resolve));

    const deadline = Date.now() + 5_000;
    while (await access(launcher).then(() => true).catch(() => false)) {
      if (Date.now() >= deadline) throw new Error("Deferred launcher cleanup timed out.");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
});
