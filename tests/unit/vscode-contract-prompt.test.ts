import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const extensionSource = path.join(root, "extensions", "vscode", "src", "extension.ts");

describe("VS Code extension authoring guidance", () => {
  it("reads the contract from the engine instead of carrying its own copy", async () => {
    const source = await readFile(extensionSource, "utf8");

    // The extension used to hold a 4 KB prompt literal, so a VS Code user got
    // guidance that drifted from the contract every other host reads.
    expect(source).not.toContain("SCENE_AUTHORING_PROMPT");
    expect(source).not.toContain("EDIT_AUTHORING_PROMPT");
    expect(source).toContain('contractPrompt("author")');
    expect(source).toContain('contractPrompt("edit")');
    expect(source).toContain('["contract", "--format", "prompt", "--for", task]');
  });

  it("does no network work at activation", async () => {
    const source = await readFile(extensionSource, "utf8");
    const activate = source.slice(source.indexOf("export function activate"));
    const body = activate.slice(0, activate.indexOf("\n}"));

    // Command registrations legitimately mention install(); what must not
    // happen is activation *invoking* it, which previously spawned npx and
    // stole the output panel before the user had asked for anything.
    const withoutRegistrations = body.replace(/vscode\.commands\.registerCommand\([\s\S]*?\),\n/g, "");
    expect(withoutRegistrations).not.toMatch(/(?:void|await)\s+install\(/);
    expect(withoutRegistrations).not.toContain('run("npx"');

    // It must still make itself visible, or a first-time user sees nothing.
    expect(body).toContain("statusItem.show()");
    expect(body).toContain("openWalkthrough");
  });

  it("checks for Node.js before trying to use it", async () => {
    const source = await readFile(extensionSource, "utf8");
    expect(source).toContain("requireNode");
    expect(source).toContain("nodejs.org/en/download");
    // The preflight must gate the installer, not merely exist.
    expect(source).toMatch(/async function install[\s\S]{0,200}await requireNode\(\)/);
  });
});

describe("VS Code extension manifest", () => {
  it("activates at startup so a first-time user sees something", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(root, "extensions", "vscode", "package.json"), "utf8"),
    ) as { activationEvents: string[]; contributes: { commands: Array<{ command: string }> } };

    expect(manifest.activationEvents).toContain("onStartupFinished");
    const commands = manifest.contributes.commands.map((entry) => entry.command);
    expect(commands).toContain("slideAgent.start");
    expect(commands).toContain("slideAgent.walkthrough");
  });
});
