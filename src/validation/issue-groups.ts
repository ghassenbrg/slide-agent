/**
 * One finding, said once, with its call sites listed.
 *
 * A validation report is read by a model inside a conversation, and repetition
 * is the thing it pays most for and learns least from. Measured on a sixteen
 * slide training deck: 111 of 157 issues were a single code, each carrying a
 * full sentence that differed from its neighbours only in an element name and
 * two integers. The prose alone was most of the payload, and the reader had
 * already understood it by the second occurrence.
 *
 * Grouping is not summarising. Every occurrence keeps its slide, its element,
 * and the numbers that distinguish it — what stops being repeated is the
 * explanation, which was the same every time it was sent. A reader can still
 * answer "is `hd` on slide 3 flagged, and at what size?"; it just no longer
 * costs a re-reading of the rule to find out.
 */
import type { ValidationIssue } from "../types/index.js";

/** One place a finding applies, carrying only what distinguishes it. */
export interface IssueOccurrence {
  slide?: number;
  /** The authored element name a patch would address. */
  element?: string;
  /** Further elements, when a finding names a pair or a set. */
  elements?: string[];
  /** The parts of `details` that vary across the group. */
  [key: string]: unknown;
}

export interface IssueGroup {
  code: string;
  severity: ValidationIssue["severity"];
  /** True only when every occurrence is fixable; a mixed group reports false. */
  fixable: boolean;
  count: number;
  /**
   * One occurrence's message, in full.
   *
   * Deliberately an example rather than a template with the specifics stripped
   * out. A reader needs to know what one of these actually says — including the
   * advice at the end, which is the part that tells them what to do — and a
   * de-specified sentence reads like a rule nobody wrote.
   */
  example: string;
  /** Details identical across every occurrence, lifted out of the rows. */
  shared?: Record<string, unknown>;
  /** Every occurrence, most significant first. */
  where: IssueOccurrence[];
}

/** How a written report carries its findings. */
export type IssuesFormat = "grouped" | "flat";

/**
 * Flat issues again, from the groups a written report carries.
 *
 * Every fact survives the round trip — code, severity, slide, elements, and the
 * details that varied — because those are what a reader acts on and what the
 * engine joins on. The one thing that does not is each occurrence's own
 * wording, since that is precisely the redundancy grouping exists to remove.
 * Reconstructed issues therefore carry the group's example message and say so
 * with `exemplar`, rather than quietly attributing one element's sentence to
 * another.
 *
 * This is what lets anything downstream of a written report — the review
 * packet, a host's own tooling — read a grouped report without needing the
 * flat form on disk.
 */
export function ungroupIssues(groups: IssueGroup[]): ValidationIssue[] {
  return groups.flatMap((group) => group.where.map((occurrence) => {
    const { slide, element, elements, ...varying } = occurrence;
    const names = elements ?? (element ? [element] : []);
    const details = { ...group.shared, ...varying };
    return {
      code: group.code,
      severity: group.severity,
      message: group.example,
      exemplar: group.count > 1,
      fixable: group.fixable,
      ...(slide !== undefined ? { slide } : {}),
      ...(names.length > 0 ? { elementIds: names } : {}),
      ...(Object.keys(details).length > 0 ? { details } : {}),
    } satisfies ValidationIssue;
  }));
}

/**
 * The report as it goes to disk.
 *
 * The in-memory report always carries both forms, because everything inside
 * the engine — the auto-fixer, the review packet, the readiness verdict —
 * joins on individual issues. What changes is only what a *reader* is handed,
 * and the reader is usually a model paying by the token for a hundred copies
 * of one sentence.
 *
 * `flat` is not deprecated and not lossy in the other direction: a tool that
 * parses `issues` today keeps working by asking for it.
 */
export function reportForDisk<T extends { issues: unknown[]; issueGroups?: unknown[] }>(
  report: T,
  format: IssuesFormat = "grouped",
): T | Omit<T, "issues"> {
  if (format === "flat") {
    const { issueGroups: _groups, ...flat } = report;
    return flat as T;
  }
  const { issues: _issues, ...grouped } = report;
  return grouped as Omit<T, "issues">;
}

/** The element name a patch would use, recovered from the OOXML shape name. */
function authoredName(elementId: string): string {
  // Validation cites `002-slide-title`; an author wrote `slide-title`. The
  // numeric prefix is the paint sequence and means nothing to a reader.
  return /^\d+-/.test(elementId) ? elementId.replace(/^\d+-/, "") : elementId;
}

function detailsOf(issue: ValidationIssue): Record<string, unknown> {
  const details = issue.details;
  return details && typeof details === "object" && !Array.isArray(details) ? details as Record<string, unknown> : {};
}

/**
 * Keys whose value is the same in every occurrence.
 *
 * These describe the finding, not the occurrence — the minimum size a scale
 * requires, the composition mode a slide was built in — so they belong once at
 * the group rather than once per row.
 */
function sharedDetails(issues: ValidationIssue[]): Record<string, unknown> {
  const first = detailsOf(issues[0]!);
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(first)) {
    const encoded = JSON.stringify(value);
    if (issues.every((issue) => JSON.stringify(detailsOf(issue)[key]) === encoded)) shared[key] = value;
  }
  return shared;
}

/**
 * Groups issues by code, preserving every occurrence.
 *
 * Order is by severity then by count, so the thing most likely to matter is
 * read first and the long tail of advice is read last — which is the opposite
 * of the flat array, where a hundred `info` entries could sit between two
 * errors.
 */
export function groupIssues(issues: ValidationIssue[]): IssueGroup[] {
  const byCode = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    byCode.set(issue.code, [...(byCode.get(issue.code) ?? []), issue]);
  }

  const rank: Record<ValidationIssue["severity"], number> = { error: 0, warning: 1, info: 2 };
  return [...byCode.entries()]
    .map(([code, members]) => {
      const shared = sharedDetails(members);
      const severity = members.reduce<ValidationIssue["severity"]>(
        (worst, issue) => rank[issue.severity] < rank[worst] ? issue.severity : worst,
        "info",
      );
      return {
        code,
        severity,
        fixable: members.every((issue) => issue.fixable === true),
        count: members.length,
        example: members[0]!.message,
        ...(Object.keys(shared).length > 0 ? { shared } : {}),
        where: members.map((issue) => {
          const varying: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(detailsOf(issue))) {
            if (!(key in shared)) varying[key] = value;
          }
          const names = (issue.elementIds ?? []).map(authoredName);
          return {
            ...(issue.slide !== undefined ? { slide: issue.slide } : {}),
            ...(names.length === 1 ? { element: names[0] } : {}),
            ...(names.length > 1 ? { elements: names } : {}),
            ...varying,
          } satisfies IssueOccurrence;
        }),
      } satisfies IssueGroup;
    })
    .sort((left, right) => rank[left.severity] - rank[right.severity] || right.count - left.count);
}
