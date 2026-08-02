import { describe, expect, it } from "vitest";

import { resolveManagedCliPath } from "../../extensions/vscode/src/managed-paths.js";

describe("VS Code managed CLI path", () => {
  it.each([
    ["darwin", "/Users/example", "/Users/example/.local/bin/slide-agent"],
    ["linux", "/home/example", "/home/example/.local/bin/slide-agent"],
    ["win32", "C:\\Users\\Example", "C:\\Users\\Example\\.local\\bin\\slide-agent.cmd"],
  ] as const)("uses the managed launcher on %s", (platform, home, expected) => {
    expect(resolveManagedCliPath({ home, platform })).toBe(expected);
  });

  it("honors a managed-prefix override using target-platform path rules", () => {
    expect(resolveManagedCliPath({
      home: "C:\\Users\\Example",
      platform: "win32",
      prefix: "D:\\Slide Agent",
    })).toBe("D:\\Slide Agent\\bin\\slide-agent.cmd");
  });

  it("preserves an explicitly configured CLI path", () => {
    expect(resolveManagedCliPath({
      configured: "  /opt/slide-agent/bin/slide-agent  ",
      home: "/home/example",
      platform: "linux",
    })).toBe("/opt/slide-agent/bin/slide-agent");
  });
});
