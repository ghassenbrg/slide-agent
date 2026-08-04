import { loadConfig } from "../config/load-config.js";
import type { PresentationBrief, PresentationOutline } from "../types/index.js";
import { OutlinePlanner } from "./outline-planner.js";
import { RequestAnalyzer } from "./request-analyzer.js";

export { RequestAnalyzer } from "./request-analyzer.js";
export { OutlinePlanner } from "./outline-planner.js";

/**
 * Turns a prompt into a structural draft outline. The result is scaffolding
 * with visible placeholders — a starting point for a model that will replace
 * the content and add its own art direction, not a finished deck.
 */
export async function planOutline(
  prompt: string,
  overrides: Partial<PresentationBrief> = {},
  configDir?: string,
): Promise<PresentationOutline> {
  const config = await loadConfig(configDir);
  return new OutlinePlanner().plan(new RequestAnalyzer(config).analyze(prompt, overrides));
}
