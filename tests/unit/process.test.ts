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
    const directories = executableSearchDirectories({
      envPath: "/usr/bin:/bin",
      homeDirectory: "/Users/example",
      nodeExecutable: "/runtime/dependencies/node/bin/node",
    });

    expect(directories).toContain("/runtime/dependencies/bin/override");
    expect(directories).toContain("/usr/local/bin");
    expect(directories).not.toContain("/Users/example/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override");
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
