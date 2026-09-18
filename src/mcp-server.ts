#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { registerV1, serverRoots } from "./mcp-v1.js";
import { getWorkspaceRoots, setWorkspaceRoots } from "./security/policy.js";
import { buildV2McpServer } from "./v2/mcp/server.js";

export { buildV1McpServer, guardRequest, previewImagePaths, serverRoots, type PreviewOptions } from "./mcp-v1.js";

/**
 * The Slide Agent MCP server.
 *
 * 1.x serves the seven V2 tools. `--compat-v1` (or SLIDE_AGENT_COMPAT_V1=1)
 * also registers the 0.x tools for one minor release, so a host can migrate
 * without breaking.
 */
export function buildMcpServer(options: { compatV1?: boolean } = {}): McpServer {
  if (!getWorkspaceRoots()) setWorkspaceRoots(serverRoots());
  const compat = options.compatV1 ?? (process.argv.includes("--compat-v1") || process.env.SLIDE_AGENT_COMPAT_V1 === "1");
  return buildV2McpServer(compat ? { compatV1: registerV1 } : {});
}

// npm and npx expose bin entries through symlinks on macOS and Linux, so the
// executed argv path and this module's resolved URL differ; compare realpaths
// or the server would silently exit instead of serving stdio.
function executedDirectly(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (executedDirectly()) {
  await serveStdio(() => buildMcpServer());
}
