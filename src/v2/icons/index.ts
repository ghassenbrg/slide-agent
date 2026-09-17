import { readFileSync } from "node:fs";

import { assetPath } from "../assets.js";
import { closest } from "../ir/issues.js";

/**
 * Icons as native geometry.
 *
 * Icons appear only where a composition places them. A node names one
 * (`"icon": "shield-check"`) or asks by concept (`"icon": "?security"`); an
 * ambiguous query resolves to its best match and reports the alternatives.
 */

export interface IconDefinition {
  name: string;
  set: string;
  /** SVG path data in a `viewBox`-sized square. */
  paths: string[];
  viewBox: number;
  stroke: number;
  tags: string[];
}

interface IconFile {
  set: string;
  version: string;
  license: string;
  viewBox: number;
  stroke: number;
  icons: Record<string, { d: string[]; t: string[] }>;
}

let data: IconFile | undefined;

function load(): IconFile {
  data ??= JSON.parse(readFileSync(assetPath("icons", "lucide.json"), "utf8")) as IconFile;
  return data;
}

export function iconSetInfo(): { set: string; version: string; license: string; count: number } {
  const file = load();
  return { set: file.set, version: file.version, license: file.license, count: Object.keys(file.icons).length };
}

export function getIcon(name: string): IconDefinition | undefined {
  const file = load();
  const entry = file.icons[name.replace(/^lucide[:/]/, "")];
  if (!entry) return undefined;
  return { name, set: file.set, paths: entry.d, viewBox: file.viewBox, stroke: file.stroke, tags: entry.t };
}

export interface IconMatch {
  name: string;
  score: number;
  tags: string[];
}

/** Concepts people ask for, mapped to the glyph names that usually carry them. */
const CONCEPTS: Record<string, string[]> = {
  security: ["shield", "lock"], safety: ["shield"], privacy: ["lock", "eye-off"], growth: ["trending-up", "sprout"],
  decline: ["trending-down"], money: ["banknote", "dollar-sign", "wallet"], revenue: ["banknote", "trending-up"], cost: ["receipt", "coins"],
  team: ["users"], people: ["users"], customer: ["user", "users"], time: ["clock"], deadline: ["calendar-clock", "clock"],
  idea: ["lightbulb"], goal: ["target"], risk: ["triangle-alert"], warning: ["triangle-alert"], success: ["circle-check"],
  data: ["database"], cloud: ["cloud"], ai: ["sparkles", "brain"], speed: ["zap", "gauge"], global: ["globe"], world: ["globe"],
  document: ["file-text"], email: ["mail"], chat: ["message-circle"], search: ["search"], settings: ["settings"], analytics: ["chart-line", "chart-column"],
  process: ["workflow"], integration: ["plug"], mobile: ["smartphone"], location: ["map-pin"], delivery: ["truck"], health: ["heart-pulse"],
};

export function searchIcons(query: string, limit = 8): IconMatch[] {
  const file = load();
  const terms = query.toLowerCase().replace(/^\?/, "").split(/[\s,/-]+/).filter(Boolean);
  const preferred = new Map<string, number>();
  for (const term of terms) (CONCEPTS[term] ?? []).forEach((name, index) => preferred.set(name, Math.max(preferred.get(name) ?? 0, 12 - index * 2)));
  if (terms.length === 0) return [];
  const matches: IconMatch[] = [];
  for (const [name, entry] of Object.entries(file.icons)) {
    const words = name.split("-");
    let score = 0;
    for (const term of terms) {
      if (name === term) score += 10;
      else if (words.includes(term)) score += 6;
      else if (name.includes(term)) score += 3;
      if (entry.t.includes(term)) score += 4;
      else if (entry.t.some((tag) => tag.includes(term))) score += 1;
    }
    score += preferred.get(name) ?? 0;
    // Shorter names are the canonical glyph for a concept ("shield" over "shield-half").
    if (score > 0) matches.push({ name, score: score - words.length * 0.1, tags: entry.t });
  }
  return matches.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)).slice(0, limit);
}

export function resolveIcon(reference: string): { icon?: IconDefinition; alternatives: string[]; query: boolean } {
  if (reference.startsWith("?")) {
    const matches = searchIcons(reference);
    const best = matches[0];
    return { ...(best ? { icon: getIcon(best.name)! } : {}), alternatives: matches.slice(1, 4).map((match) => match.name), query: true };
  }
  const icon = getIcon(reference);
  if (icon) return { icon, alternatives: [], query: false };
  return { alternatives: closest(reference, Object.keys(load().icons), 3), query: false };
}
