import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
let client: Client | undefined;
let workspace: string | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
  if (workspace) await rm(workspace, { recursive: true, force: true });
  workspace = undefined;
});

async function connect(cwd: string, extra: string[] = []): Promise<Client> {
  const created = new Client({ name: "slide-agent-v2-test", version: "1.0.0" });
  await created.connect(new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "src", "mcp-server.ts"), ...extra],
    cwd,
    env: { ...process.env as Record<string, string>, SLIDE_AGENT_FONT_DIRS: path.join(root, "tests", "fixtures", "fonts"), SLIDE_AGENT_SYSTEM_FONTS: "0", SLIDE_AGENT_ROOTS: cwd },
    stderr: "pipe",
  }));
  return created;
}

function payload(result: { content: unknown }): Record<string, unknown> {
  const text = (result.content as Array<{ type: string; text?: string }>).find((block) => block.type === "text")?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

describe("MCP server v2", () => {
  it("serves exactly the seven V2 tools by default, and V1 tools only with --compat-v1", async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-mcp-v2-"));
    client = await connect(workspace);
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["slides_build", "slides_catalog", "slides_edit", "slides_finalize", "slides_generate", "slides_inspect", "slides_view"]);
    await client.close();
    client = await connect(workspace, ["--compat-v1"]);
    const compat = (await client.listTools()).tools.map((tool) => tool.name);
    expect(compat).toContain("slides_build");
    expect(compat).toContain("slide_agent_run");
  });

  it("publishes the grammar, catalog, schema, recipes, and examples", async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-mcp-v2-"));
    client = await connect(workspace);
    const uris = (await client.listResources()).resources.map((resource) => resource.uri);
    expect(uris).toEqual(expect.arrayContaining(["slide-agent://grammar", "slide-agent://catalog", "slide-agent://schema/intent"]));
    const templates = (await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate);
    expect(templates).toEqual(expect.arrayContaining(["slide-agent://recipes/{family}/{variant}", "slide-agent://examples/{name}"]));
    const grammar = await client.readResource({ uri: "slide-agent://grammar" });
    const text = (grammar.contents[0] as { text: string }).text;
    expect(text.length / 4).toBeLessThanOrEqual(2000);
    const recipe = await client.readResource({ uri: "slide-agent://recipes/metrics/row" });
    expect((recipe.contents[0] as { text: string }).text).toContain("metrics");
  });

  it("builds, views, edits, and confines paths over stdio within response budgets", async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-mcp-v2-"));
    await cp(path.join(root, "examples", "v2", "zero-trust-rollout.intent.json"), path.join(workspace, "intent.json"));
    client = await connect(workspace);

    const catalog = await client.callTool({ name: "slides_catalog", arguments: {} });
    expect(JSON.stringify(catalog.content).length / 4).toBeLessThanOrEqual(3200);

    const built = await client.callTool({ name: "slides_build", arguments: { deck: "deck", intentPath: "intent.json" } });
    expect(built.isError).not.toBe(true);
    const text = (built.content as Array<{ type: string; text?: string }>).find((block) => block.type === "text")!.text!;
    expect(text.length / 4).toBeLessThanOrEqual(800);
    const verdict = payload(built).verdict as { state: string; slides: number };
    expect(verdict.slides).toBe(4);
    expect(["ready-unrendered", "needs-attention"]).toContain(verdict.state);

    const view = await client.callTool({ name: "slides_view", arguments: { deck: "deck", what: "sheet" } });
    expect((view.content as Array<{ type: string }>).some((block) => block.type === "image")).toBe(true);

    const edited = await client.callTool({ name: "slides_edit", arguments: { deck: "deck", ops: [{ level: "intent", op: "set", path: "/slides/0/compose/items/0/column/items/1/text", value: "Zero trust, a wave at a time" }] } });
    expect(edited.isError).not.toBe(true);
    expect((payload(edited).verdict as { changed: string[] }).changed).toEqual(["cover"]);

    const escaped = await client.callTool({ name: "slides_build", arguments: { deck: "../outside", intentPath: "intent.json" } });
    expect(escaped.isError).toBe(true);
    expect(JSON.stringify(escaped.content)).toMatch(/outside the workspace/);
  });
});
