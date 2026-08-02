import { describe, expect, it } from "vitest";

import { prepareSpawn, quoteForCmdShell } from "../../extensions/vscode/src/shell-quote.js";

describe("VS Code Windows shell quoting", () => {
  it("wraps values containing spaces or cmd metacharacters", () => {
    expect(quoteForCmdShell("C:\\Users\\John Doe\\deck.pptx")).toBe("\"C:\\Users\\John Doe\\deck.pptx\"");
    expect(quoteForCmdShell("a&b")).toBe("\"a&b\"");
    expect(quoteForCmdShell("")).toBe("\"\"");
  });

  it("leaves simple values untouched", () => {
    expect(quoteForCmdShell("doctor")).toBe("doctor");
    expect(quoteForCmdShell("C:\\Users\\dev\\.local\\bin\\slide-agent.cmd")).toBe("C:\\Users\\dev\\.local\\bin\\slide-agent.cmd");
  });

  it("quotes and enables the shell only on Windows", () => {
    const windows = prepareSpawn("C:\\Program Files\\nodejs\\npx.cmd", ["create", "--output", "C:\\out dir\\deck.pptx"], "win32");
    expect(windows.shell).toBe(true);
    expect(windows.command).toBe("\"C:\\Program Files\\nodejs\\npx.cmd\"");
    expect(windows.args).toEqual(["create", "--output", "\"C:\\out dir\\deck.pptx\""]);

    const posix = prepareSpawn("/usr/local/bin/slide-agent", ["create", "--output", "/tmp/out dir/deck.pptx"], "darwin");
    expect(posix.shell).toBe(false);
    expect(posix.args).toEqual(["create", "--output", "/tmp/out dir/deck.pptx"]);
  });
});
