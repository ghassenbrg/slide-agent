import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
let client: Client | undefined;
let workspace: string | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
  if (workspace) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

describe("Slide Agent MCP server", () => {
  it("lists the complete tool surface and runs doctor over stdio", async () => {
    client = new Client({ name: "slide-agent-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "src", "mcp-server.ts")],
      stderr: "pipe",
    });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "slide_agent_run",
      "create_presentation",
      "edit_presentation",
      "render_presentation",
      "validate_presentation",
      "slide_agent_doctor",
    ]));

    const result = await client.callTool({ name: "slide_agent_doctor", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain("Node.js");
  });

  it("serves stdio when launched through a bin-style symlink", async () => {
    // npm and npx expose bin entries as symlinks on macOS and Linux; the
    // direct-execution guard must compare realpaths or the server exits
    // silently instead of serving.
    workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-mcp-link-"));
    const link = path.join(workspace, "slide-agent-mcp-linked.ts");
    try {
      await symlink(path.join(root, "src", "mcp-server.ts"), link);
    } catch {
      return; // Symlink creation requires privileges on some Windows setups.
    }
    client = new Client({ name: "slide-agent-symlink-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", link],
      cwd: root,
      stderr: "pipe",
    });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("slide_agent_run");
  });
});
