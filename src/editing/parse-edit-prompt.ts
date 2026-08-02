import type { EditOperation } from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";

function parseJson(value: string): EditOperation[] | undefined {
  try {
    const parsed = JSON.parse(value) as { operations?: EditOperation[] } | EditOperation[];
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.operations)) return parsed.operations;
  } catch {
    return undefined;
  }
  return undefined;
}

export function parseEditPrompt(prompt: string): EditOperation[] {
  const direct = parseJson(prompt);
  if (direct) return direct;
  const fenced = prompt.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const operations = parseJson(fenced);
    if (operations) return operations;
  }

  const operations: EditOperation[] = [];
  for (const match of prompt.matchAll(/replace\s+["“]([^"”]+)["”]\s+with\s+["“]([^"”]*)["”](?:\s+on\s+slide\s+(\d+))?/gi)) {
    operations.push({
      type: "replace-text",
      find: match[1]!,
      replace: match[2]!,
      ...(match[3] ? { slide: Number(match[3]) } : {}),
      replaceAll: true,
    });
  }
  for (const match of prompt.matchAll(/remove\s+slide\s+(\d+)/gi)) operations.push({ type: "remove-slide", slide: Number(match[1]) });
  for (const match of prompt.matchAll(/duplicate\s+slide\s+(\d+)(?:\s+(?:at|to|as)\s+(\d+))?/gi)) {
    operations.push({ type: "duplicate-slide", slide: Number(match[1]), ...(match[2] ? { insertAt: Number(match[2]) } : {}) });
  }
  const order = prompt.match(/reorder\s+slides?\s*(?:to|:)\s*([\d,\s]+)/i)?.[1];
  if (order) operations.push({ type: "reorder-slides", order: order.split(/[,\s]+/).filter(Boolean).map(Number) });

  if (operations.length === 0) {
    throw new SlideAgentError(
      "EDIT_PROMPT_NOT_STRUCTURED",
      "Could not translate the edit prompt safely. Provide JSON edit operations or use explicit forms such as replace \"old\" with \"new\", remove slide 3, or duplicate slide 2 at 5.",
    );
  }
  return operations;
}
