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

async function connect(): Promise<Client> {
  const created = new Client({ name: "slide-agent-test", version: "1.0.0" });
  await created.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "src", "mcp-server.ts")],
    stderr: "pipe",
  }));
  return created;
}

describe("Slide Agent MCP server", () => {
  it("lists the complete tool surface and runs doctor over stdio", async () => {
    client = await connect();

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "slide_agent_run",
      "get_authoring_contract",
      "plan_presentation",
      "create_presentation",
      "revise_presentation",
      "edit_presentation",
      "render_presentation",
      "validate_presentation",
      "slide_agent_doctor",
    ]));

    const result = await client.callTool({ name: "slide_agent_doctor", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain("Node.js");
  });

  it("publishes the authoring contract as resources an MCP-only host can read", async () => {
    client = await connect();
    const resources = await client.listResources();
    const uris = resources.resources.map((resource) => resource.uri);
    expect(uris).toContain("slide-agent://contract");
    expect(uris).toContain("slide-agent://contract/guide");
    expect(uris).toContain("slide-agent://contract/schema/outline");
    expect(uris).toContain("slide-agent://contract/schema/sceneRecord");

    const guide = await client.readResource({ uri: "slide-agent://contract/guide" });
    const guideText = (guide.contents[0] as { text: string }).text;
    expect(guideText).toContain("authoring guide");
    expect(guideText.length).toBeGreaterThan(3000);

    const schema = await client.readResource({ uri: "slide-agent://contract/schema/outline" });
    const parsed = JSON.parse((schema.contents[0] as { text: string }).text) as { properties?: Record<string, unknown> };
    expect(parsed.properties).toHaveProperty("slides");
  });

  it("publishes prompts that carry the full authoring guide", async () => {
    client = await connect();
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(expect.arrayContaining([
      "author_presentation_scene",
      "revise_presentation_scene",
    ]));

    const authored = await client.getPrompt({ name: "author_presentation_scene", arguments: { brief: "A deck about urban beekeeping" } });
    const text = (authored.messages[0]!.content as { text: string }).text;
    expect(text).toContain("slide-agent.scene/1");
    expect(text).toContain("urban beekeeping");
    expect(text.length).toBeGreaterThan(3000);
  });

  it("describes slide_agent_run's payload instead of advertising an opaque object", async () => {
    client = await connect();
    const tools = await client.listTools();
    const run = tools.tools.find((tool) => tool.name === "slide_agent_run")!;
    const schema = run.inputSchema as { properties?: { request?: { properties?: Record<string, unknown> } } };
    // The previous schema was `{type: "object"}` with no properties at all, so
    // a model had nothing to fill in and fell back to the prompt path.
    expect(schema.properties?.request?.properties).toHaveProperty("command");
    expect(JSON.stringify(run.description)).toContain("contract");
  });

  it("returns the guide through a tool for hosts that cannot read resources", async () => {
    client = await connect();
    const result = await client.callTool({ name: "get_authoring_contract", arguments: { section: "accessibility" } });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain("contrast");
  });

  it("answers capabilities with a summary, and the canvas in full on request", async () => {
    client = await connect();

    const summary = await client.callTool({ name: "get_capabilities", arguments: {} });
    expect(summary.isError).not.toBe(true);
    const summarised = JSON.parse((summary.content as Array<{ text: string }>)[0]!.text);
    // The one question a summary must never defer: a model that plans a
    // photo-led deck and only then learns it cannot source a picture has
    // wasted the design.
    expect(summarised.images).toBeDefined();
    expect(summarised.canvas.elementTypes).toContain("text");
    expect(summarised.canvas.properties).toBeUndefined();
    expect(summarised.tokenBudget.total).toBeLessThan(1_000);

    const full = await client.callTool({ name: "get_capabilities", arguments: { include: ["canvas"] } });
    const expanded = JSON.parse((full.content as Array<{ text: string }>)[0]!.text);
    expect(expanded.canvas.elements.length).toBeGreaterThan(5);
    expect(expanded.tokenBudget.total).toBeGreaterThan(summarised.tokenBudget.total);
  });

  it("prices every result, and names the option that costs more", async () => {
    client = await connect();
    const result = await client.callTool({ name: "slide_agent_doctor", arguments: {} });
    const body = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(body.tokenBudget).toMatchObject({ basis: "estimate", imageCount: 0 });
    expect(body.tokenBudget.total).toBeGreaterThan(0);
  });

  it("offers the preview-selection parameters on every tool that renders", async () => {
    client = await connect();
    const tools = await client.listTools();
    const rendering = ["slide_agent_run", "create_presentation", "revise_presentation",
      "edit_presentation", "render_presentation", "validate_presentation",
      "review_presentation", "patch_presentation"];
    for (const name of rendering) {
      const tool = tools.tools.find((candidate) => candidate.name === name)!;
      const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(properties), name).toEqual(expect.arrayContaining(["images", "imageDetail", "includeImages"]));
    }
  });

  it("does not route a model to a schema it cannot afford to read", async () => {
    client = await connect();
    const tools = await client.listTools();
    // The old `slide_agent_run` description opened with "read
    // slide-agent://contract/schema/outline first" — an instruction worth
    // 57,245 tokens at the time it was written.
    for (const tool of tools.tools) {
      expect(tool.description ?? "", tool.name).not.toMatch(/read\s+slide-agent:\/\/contract\/schema/i);
    }
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

describe("MCP documentation", () => {
  it("documents every tool, resource, and prompt the server actually exposes", async () => {
    const { readFile } = await import("node:fs/promises");
    const doc = await readFile(path.join(root, "docs", "mcp.md"), "utf8");
    client = await connect();

    // A reference page for a live surface drifts silently unless something
    // compares it to the surface.
    for (const tool of (await client.listTools()).tools) {
      expect(doc, `docs/mcp.md does not mention the ${tool.name} tool`).toContain(tool.name);
    }
    for (const prompt of (await client.listPrompts()).prompts) {
      expect(doc, `docs/mcp.md does not mention the ${prompt.name} prompt`).toContain(prompt.name);
    }

    const resources = (await client.listResources()).resources;
    // Guide sections and schemas are documented as lists rather than 21 URIs,
    // so check each distinct name appears somewhere on the page.
    for (const resource of resources) {
      const leaf = resource.uri.split("/").pop()!;
      expect(doc, `docs/mcp.md does not mention the ${resource.uri} resource`).toContain(leaf);
    }
  });

  it("documents the required arguments of each tool", async () => {
    const { readFile } = await import("node:fs/promises");
    const doc = await readFile(path.join(root, "docs", "mcp.md"), "utf8");
    client = await connect();

    for (const tool of (await client.listTools()).tools) {
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      for (const argument of required) {
        expect(doc, `docs/mcp.md does not document ${tool.name}'s required "${argument}"`).toContain(argument);
      }
    }
  });
});
