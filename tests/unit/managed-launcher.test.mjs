import { describe, expect, it } from "vitest";

import { createWindowsLauncher, parseWindowsLauncherTarget } from "../../scripts/managed-launcher.mjs";

describe("managed Windows launchers", () => {
  it("round-trips a launcher containing Windows short paths and CRLF", () => {
    const node = "C:\\hostedtoolcache\\windows\\node\\22.23.1\\x64\\node.exe";
    const target = "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\slide-agent\\dist\\cli.js";
    const launcher = createWindowsLauncher(node, target);
    expect(parseWindowsLauncherTarget(launcher)).toBe(target);
    expect(launcher).toContain("SLIDE_AGENT_ACTIVE_LAUNCHER=%~f0");
    expect(launcher).toContain("del \"%~f0\"");
    expect(launcher).toContain("exit /b %SLIDE_AGENT_EXIT_CODE%");
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
});
