import type { RhythmNote } from "../compose/rhythm.js";
import type { DeckIntent } from "../ir/intent.js";
import { slideMode } from "../ir/intent.js";
import type { Finding } from "../ir/issues.js";
import type { SceneGraph } from "../ir/scene.js";
import type { ReadinessState, SuggestedEdit, Verdict } from "../ir/verdict.js";
import type { ThemeSpec } from "../tokens/compile.js";

/**
 * The Verdict: what a caller reads inline, capped by its response budget.
 *
 * `state` answers "is the deck mechanically sound?" without any model.
 * `designReview` records who, if anyone, judged the design against the brief.
 * They are separate on purpose: ready says nothing about taste.
 */

const HINTS: Record<string, string> = {
  "text-overflow": "Answer the choice in suggestedEdits, or shorten to the character budget.",
  "word-broken": "Answer the choice in suggestedEdits: a smaller step, a wider region, or a shorter word.",
  "contrast-pinned": "Contrast is a hard constraint: drop the pin or choose a passing tone.",
  "font-unavailable": "Run `slide-agent fonts add <family>`, choose an available face, or allow downloads.",
  "out-of-bounds": "Keep it inside the grid, or declare bleed on the region.",
  collision: "Separate the regions, or use a layer if the overlap is intended.",
  "placeholder-text": "Replace the placeholder with the real content.",
};

export interface VerdictInput {
  run: string;
  deck?: string;
  intent: DeckIntent;
  theme: ThemeSpec;
  scene: SceneGraph;
  findings: Finding[];
  suggestedEdits: SuggestedEdit[];
  rhythm: RhythmNote[];
  changed?: string[];
  rendered: "none" | "preview" | "fidelity";
  fidelityPassed?: boolean;
  packageBroken?: boolean;
  views: Verdict["views"];
  engineMs: number;
  modelTokens?: { input: number; output: number; cached: number };
  usd?: number;
  designReview?: Verdict["designReview"];
}

export function readiness(findings: Finding[], options: { packageBroken?: boolean; rendered: VerdictInput["rendered"]; fidelityPassed?: boolean; pendingChoices: number }): ReadinessState {
  if (options.packageBroken || findings.some((finding) => finding.tier === "T2" && finding.severity === "blocking")) return "broken";
  if (findings.some((finding) => finding.severity === "blocking") || options.pendingChoices > 0) return "needs-attention";
  if (options.rendered === "fidelity" && options.fidelityPassed) return "ready";
  return "ready-unrendered";
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}|${finding.slide ?? ""}|${finding.element ?? ""}|${finding.path ?? ""}|${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildVerdict(input: VerdictInput): Verdict {
  const findings = dedupeFindings(input.findings);
  const severityRank = { blocking: 0, major: 1, minor: 2 } as const;
  const groups = new Map<string, { code: string; severity: Finding["severity"]; count: number; where: string[]; hint: string }>();
  for (const finding of findings) {
    const key = `${finding.code}|${finding.severity}`;
    const group = groups.get(key) ?? { code: finding.code, severity: finding.severity, count: 0, where: [], hint: (finding.hint ?? HINTS[finding.code] ?? finding.message).slice(0, 140) };
    group.count += 1;
    const where = finding.element ?? finding.slide ?? finding.path ?? "deck";
    if (!group.where.includes(where) && group.where.length < 8) group.where.push(where);
    groups.set(key, group);
  }
  const issues = [...groups.values()].sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || right.count - left.count).slice(0, 12);
  const hiddenIssues = groups.size - issues.length;

  const adjustmentGroups = new Map<string, { kind: string; count: number; where: string[] }>();
  for (const adjustment of input.theme.adjustments) {
    const group = adjustmentGroups.get(adjustment.kind) ?? { kind: adjustment.kind, count: 0, where: [] };
    group.count += 1;
    if (group.where.length < 8) group.where.push(adjustment.path ?? "design");
    adjustmentGroups.set(adjustment.kind, group);
  }
  for (const slide of input.scene.slides) {
    for (const element of slide.elements) {
      for (const adjustment of element.adjustments ?? []) {
        const group = adjustmentGroups.get(adjustment.kind) ?? { kind: adjustment.kind, count: 0, where: [] };
        group.count += 1;
        if (!group.where.includes(element.id) && group.where.length < 8) group.where.push(element.id);
        adjustmentGroups.set(adjustment.kind, group);
      }
    }
  }

  const authoring = { composed: 0, recipe: 0, draft: 0, canvas: 0 };
  for (const slide of input.intent.slides) {
    const mode = slideMode(slide);
    if (mode === "compose") authoring.composed += 1;
    else if (mode === "recipe") authoring.recipe += 1;
    else if (mode === "auto") authoring.draft += 1;
    else authoring.canvas += 1;
  }
  const design = input.theme.source === "authored" ? "authored" : input.theme.source;
  const pendingChoices = input.suggestedEdits.filter((edit) => edit.kind === "choose").length;
  const state = readiness(findings, { ...(input.packageBroken ? { packageBroken: true } : {}), rendered: input.rendered, ...(input.fidelityPassed !== undefined ? { fidelityPassed: input.fidelityPassed } : {}), pendingChoices });
  const designReview = input.designReview ?? (input.intent.reviewed ? (/critic/i.test(input.intent.reviewed.by) ? "critic" : "host") : "none");

  const minor = findings.filter((finding) => finding.severity === "minor").length;
  const more: string[] = [];
  if (hiddenIssues > 0) more.push(`${hiddenIssues} more issue groups`);
  if (input.suggestedEdits.length > 10) more.push(`${input.suggestedEdits.length - 10} more suggested edits`);
  if (minor > 0 && more.length === 0) more.push(`${minor} minor findings`);

  return {
    run: input.run,
    ...(input.deck ? { deck: input.deck } : {}),
    state,
    slides: input.scene.slides.length,
    ...(input.changed ? { changed: input.changed } : {}),
    authoring: { ...authoring, design },
    designReview,
    issues: issues.map((issue) => ({ code: issue.code, severity: issue.severity, count: issue.count, where: issue.where, hint: issue.hint })),
    adjustments: [...adjustmentGroups.values()].sort((left, right) => right.count - left.count).slice(0, 6),
    suggestedEdits: input.suggestedEdits.slice(0, 10),
    rhythm: input.rhythm.slice(0, 5),
    views: input.views,
    cost: {
      engineMs: Math.round(input.engineMs),
      ...(input.modelTokens ? { modelTokens: input.modelTokens } : {}),
      ...(input.usd !== undefined ? { usd: Math.round(input.usd * 10000) / 10000 } : {}),
    },
    ...(more.length ? { more: `${more.join("; ")}: slides_view report` } : {}),
  };
}
