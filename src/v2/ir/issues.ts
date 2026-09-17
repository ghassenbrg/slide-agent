/**
 * Findings, in one shape, from schema validation to rendering.
 *
 * Every finding names where it is (a JSON pointer into the intent, and the
 * slide id when there is one), how serious it is, and — when the engine should
 * not resolve it on its own — a machine-applicable suggested edit.
 */
export type Severity = "blocking" | "major" | "minor";

export type Tier = "T0" | "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

export interface Finding {
  code: string;
  severity: Severity;
  tier: Tier;
  message: string;
  /** JSON pointer into the intent, e.g. `/slides/3/compose/items/1/at`. */
  path?: string;
  slide?: string;
  element?: string;
  /** Short, actionable. ≤ 140 characters when surfaced in a verdict. */
  hint?: string;
  suggestedEdit?: string;
}

export function pointer(...segments: Array<string | number>): string {
  return segments.map((segment) => `/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

export function joinPointer(base: string, ...segments: Array<string | number>): string {
  return `${base}${pointer(...segments)}`;
}

export function parsePointer(value: string): string[] {
  if (value === "" || value === "/") return [];
  if (!value.startsWith("/")) throw new Error(`Not a JSON pointer: ${value}`);
  return value.slice(1).split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/** Levenshtein distance, bounded; enough to say "did you mean". */
export function editDistance(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

/** Up to `limit` candidates closest to `value`, closest first. */
export function closest(value: string, candidates: Iterable<string>, limit = 3): string[] {
  const scored = [...new Set(candidates)]
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .filter(({ candidate, distance }) => distance <= Math.max(2, Math.ceil(candidate.length / 2)) || candidate.includes(value) || value.includes(candidate));
  return scored.sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function didYouMean(value: string, candidates: Iterable<string>): string {
  const matches = closest(value, candidates);
  return matches.length > 0 ? ` Did you mean ${matches.map((match) => `"${match}"`).join(" or ")}?` : "";
}

export class IntentError extends Error {
  public constructor(public readonly findings: Finding[]) {
    super(findings.map((finding) => `${finding.path ?? ""}: ${finding.message}`).join("\n"));
    this.name = "IntentError";
  }
}
