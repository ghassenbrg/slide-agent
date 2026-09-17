import { realpathSync } from "node:fs";
import path from "node:path";

import { SlideAgentError } from "../utils/errors.js";

/**
 * Operator-owned policy.
 *
 * Everything in a request can be model-authored, and a model can be steered by
 * whatever it last read. So nothing a request says may widen what this process
 * is allowed to touch: the workspace roots, whether scripts run, and whether
 * the network is reachable are set by whoever started the process — flags,
 * environment, MCP roots — and a request can only narrow them.
 */

let workspaceRoots: string[] | undefined;

/** Confine every path a request names to these directories. `undefined` lifts confinement (CLI default). */
export function setWorkspaceRoots(roots: string[] | undefined): void {
  workspaceRoots = roots?.map((root) => realpathOrResolved(root));
}

export function getWorkspaceRoots(): string[] | undefined {
  return workspaceRoots ? [...workspaceRoots] : undefined;
}

function realpathOrResolved(target: string): string {
  const resolved = path.resolve(target);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * The real location of `target`, following symlinks as far as the path exists.
 * A path that does not exist yet (an output file) is resolved through its
 * deepest existing ancestor, so `root/link-to-etc/new.pptx` is still caught.
 */
export function realLocation(target: string): string {
  const resolved = path.resolve(target);
  const missing: string[] = [];
  let current = resolved;
  for (;;) {
    try {
      const real = realpathSync(current);
      return missing.length ? path.join(real, ...missing.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

function inside(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Resolve `target` against the first root and refuse anything that lands
 * outside every root — through `..`, an absolute path, or a symlink.
 */
export function resolveConfined(target: string, roots: string[], field = "path"): string {
  if (roots.length === 0) throw new SlideAgentError("NO_WORKSPACE_ROOT", "No workspace root is configured.");
  const realRoots = roots.map(realpathOrResolved);
  const candidate = path.isAbsolute(target) ? target : path.resolve(realRoots[0]!, target);
  const real = realLocation(candidate);
  if (!realRoots.some((root) => inside(real, root))) {
    throw new SlideAgentError(
      "PATH_OUTSIDE_WORKSPACE",
      `${field} resolves outside the workspace: ${target}. Allowed roots: ${realRoots.join(", ")}.`,
      { field, path: target, roots: realRoots },
    );
  }
  return real;
}

/** No-op unless the operator configured roots. */
export function assertInsideWorkspace(target: string, field = "path"): string {
  if (!workspaceRoots) return path.resolve(target);
  return resolveConfined(target, workspaceRoots, field);
}

/** Request keys that name files or directories. */
const PATH_KEYS = new Set([
  "input", "output", "previewsDir", "beforePreviewsDir", "reportPath", "metadataPath", "inspectPath",
  "scene", "brand", "configDir", "assetBaseDir", "pdfPath", "script", "source", "imagePath", "template", "data",
  "deck", "intentRef", "file", "out",
]);

/**
 * Returns a copy of `request` whose path-valued fields are confined absolute
 * paths. Only string values under known path keys are touched; `source` holding
 * a URL (provenance, not a file) is left alone.
 */
export function confineRequestPaths<T>(request: T, roots: string[]): T {
  const visit = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      if (!key || !PATH_KEYS.has(key)) return value;
      if (/^[a-z][a-z0-9+.-]+:\/\//i.test(value)) return value;
      return resolveConfined(value, roots, key);
    }
    if (Array.isArray(value)) return value.map((item) => visit(item, key === "operations" ? undefined : undefined));
    if (value && typeof value === "object") {
      const copy: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        // Inline content is data, not a location: never rewrite inside it.
        copy[childKey] = childKey === "sceneNdjson" || childKey === "outline" || childKey === "intent" ? child : visit(child, childKey);
      }
      return copy;
    }
    return value;
  };
  return visit(request) as T;
}

/** Scripts run with this process's privileges; only an operator can permit them from a request. */
export function scriptsAllowed(): boolean {
  return process.env.SLIDE_AGENT_ALLOW_SCRIPTS === "1";
}

export function assertScriptAllowed(request: { script?: unknown }): void {
  if (request.script !== undefined && !scriptsAllowed()) {
    throw new SlideAgentError(
      "SCRIPT_REFUSED",
      "Requests cannot run build scripts. A script is imported into this process with its privileges; run it yourself with `slide-agent build <script>`, or set SLIDE_AGENT_ALLOW_SCRIPTS=1 where you started this server.",
      { script: request.script },
    );
  }
}
