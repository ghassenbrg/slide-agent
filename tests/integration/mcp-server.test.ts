import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
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
});
