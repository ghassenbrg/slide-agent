/**
 * Runs a build script and takes the outline it produced.
 *
 * The script is ordinary JavaScript the author wrote, imported into this
 * process. That is a real capability, and it is worth being plain about what it
 * is and is not: Slide Agent does not fetch, download, or discover scripts, and
 * it never runs one it was not pointed at. Executing `deck.mjs` is the same
 * trust decision as running `node deck.mjs`, made explicitly, on a file in the
 * author's own workspace. Nothing sandboxes it, because a sandbox that stopped
 * the script reading the CSV it is charting would be theatre.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { PresentationOutline } from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";
import { DeckBuilder } from "./index.js";

/** What a build script may export, in the order they are tried. */
type ScriptExport = unknown;

function outlineFrom(value: ScriptExport): PresentationOutline | undefined {
  if (!value) return undefined;
  if (value instanceof DeckBuilder) return value.toOutline();
  // A plain outline is equally valid: a script that assembles the structure by
  // hand should not have to adopt the builder to be runnable.
  if (typeof value === "object" && "slides" in value && "brief" in value) return value as PresentationOutline;
  return undefined;
}

async function resolveExport(value: ScriptExport): Promise<PresentationOutline | undefined> {
  const resolved = typeof value === "function" ? await (value as () => unknown)() : await value;
  return outlineFrom(resolved);
}

/**
 * Imports `scriptPath` and returns the outline it produced.
 *
 * A script may default-export the deck, export `deck`, or export a `build`
 * function — including an async one, so a script may read its own data files
 * before composing. The alternatives exist because guessing wrong about which
 * one an author chose costs them a confusing failure for no reason.
 */
export async function runBuildScript(scriptPath: string): Promise<PresentationOutline> {
  const absolute = path.resolve(scriptPath);
  let module: Record<string, unknown>;
  try {
    // A cache-busting query keeps a second run in the same process from
    // silently reusing the first version of an edited script.
    module = await import(`${pathToFileURL(absolute).href}?t=${Date.now()}`) as Record<string, unknown>;
  } catch (cause) {
    throw new SlideAgentError(
      "BUILD_SCRIPT_FAILED",
      `The build script at ${absolute} could not be loaded or threw while running: ${cause instanceof Error ? cause.message : String(cause)}`,
      { script: absolute },
    );
  }

  for (const key of ["default", "deck", "build", "outline"]) {
    const outline = await resolveExport(module[key]);
    if (outline) return outline;
  }

  throw new SlideAgentError(
    "BUILD_SCRIPT_EMPTY",
    `The build script at ${absolute} did not export a deck. Export the result of defineDeck(...) as the default export, or as \`deck\`, or export a \`build()\` function that returns one.`,
    { script: absolute, exported: Object.keys(module) },
  );
}
