import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { executableSearchDirectories, findExecutable } from "../../src/utils/process.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("executable discovery", () => {
  it("includes portable runtime and common executable directories outside PATH", () => {
    const filesystemRoot = path.parse(process.cwd()).root;
    const runtimeDependencies = path.join(filesystemRoot, "runtime", "dependencies");
    const homeDirectory = path.join(filesystemRoot, "Users", "example");
    const directories = executableSearchDirectories({
      envPath: [path.join(filesystemRoot, "system-bin"), path.join(filesystemRoot, "fallback-bin")].join(path.delimiter),
      homeDirectory,
      nodeExecutable: path.join(runtimeDependencies, "node", "bin", process.platform === "win32" ? "node.exe" : "node"),
    });

    expect(directories).toContain(path.join(runtimeDependencies, "bin", "override"));
    expect(directories).toContain(path.join(homeDirectory, ".local", "bin"));
    expect(directories).not.toContain(path.join(homeDirectory, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "bin", "override"));
  });

  it("finds an executable in an additional discovery directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "slide-agent-executable-"));
    temporaryDirectories.push(directory);
    const executable = path.join(directory, "deck-renderer");
    await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(executable, 0o755);

    await expect(findExecutable(["deck-renderer"], undefined, [directory])).resolves.toBe(executable);
  });
});

describe("pinning an executable", () => {
  it("uses an explicit path when it is executable", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "slide-agent-pin-"));
    const pinned = path.join(directory, "tool");
    await writeFile(pinned, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    expect(await findExecutable(["tool"], pinned)).toBe(pinned);
    await rm(directory, { recursive: true, force: true });
  });

  it("does not search past a pin that does not resolve", async () => {
    // Falling through to PATH would silently run a different binary than the
    // one SLIDE_AGENT_SOFFICE named, which is what pinning is meant to prevent.
    const missing = path.join(tmpdir(), "slide-agent-no-such-executable");
    expect(await findExecutable(["sh", "cmd"], missing)).toBeUndefined();
  });
});
