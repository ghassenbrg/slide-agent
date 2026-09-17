import type { Finding } from "../ir/issues.js";
import type { SceneElement, SceneGraph, SceneSlide } from "../ir/scene.js";
import { intersects } from "../layout/geometry.js";
import { similarity } from "../compose/rhythm.js";

/**
 * Deterministic checks on the built scene, cheapest first.
 *
 * T0 (schema) and T1 (construction invariants: contrast, bounds, floors, fit,
 * alt text) are raised while building. This module adds T3 geometry and T4
 * content checks over the whole scene. Heuristic checks are minor unless they
 * are the kind a person would call a defect on sight.
 */

function textOf(element: SceneElement): string {
  if (element.kind === "text") return element.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n");
  if (element.kind === "shape" && element.text) return element.text.paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n");
  if (element.kind === "table") return [...element.columns, ...element.rows.flat()].join(" ");
  return "";
}

/** T3: overlaps that nobody declared. Text on text, or content on content, from different regions. */
export function geometryChecks(slide: SceneSlide): Finding[] {
  const findings: Finding[] = [];
  const content = slide.elements.filter((element) => !element.decorative && element.role !== "container" && element.role !== "connector" && element.role !== "chrome");
  const reported = new Set<string>();
  for (let left = 0; left < content.length; left += 1) {
    for (let right = left + 1; right < content.length; right += 1) {
      const a = content[left]!;
      const b = content[right]!;
      if (!intersects(a.frame, b.frame, 0.02)) continue;
      // Anything placed in a layer or free container overlaps by declaration.
      if (a.overlapAllowed || b.overlapAllowed) continue;
      const key = [a.id, b.id].sort().join("|");
      if (reported.has(key)) continue;
      reported.add(key);
      const overlapW = Math.min(a.frame.x + a.frame.w, b.frame.x + b.frame.w) - Math.max(a.frame.x, b.frame.x);
      const overlapH = Math.min(a.frame.y + a.frame.h, b.frame.y + b.frame.h) - Math.max(a.frame.y, b.frame.y);
      const area = overlapW * overlapH;
      const smaller = Math.min(a.frame.w * a.frame.h, b.frame.w * b.frame.h) || 1;
      if (area / smaller < 0.04) continue;
      findings.push({
        code: "collision",
        severity: a.kind === "text" && b.kind === "text" ? "blocking" : "major",
        tier: "T3",
        message: `${a.id} and ${b.id} overlap (${Math.round((area / smaller) * 100)}% of the smaller) without a layer or free container declaring it.`,
        slide: slide.id,
        element: a.id,
        path: a.provenance.path,
        hint: "Place them in separate regions, or wrap them in a layer if the overlap is the design.",
      });
    }
  }
  return findings;
}

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /\blorem ipsum\b/i, what: "lorem ipsum" },
  { pattern: /\b(TODO|TBD|FIXME|XXX)\b/, what: "a to-do marker" },
  { pattern: /\[(insert|add|your|placeholder)[^\]]*\]/i, what: "a bracketed placeholder" },
  { pattern: /\{[a-zA-Z_][a-zA-Z0-9_.]*\}/, what: "an unfilled {parameter}" },
  { pattern: /\{\{[^}]+\}\}/, what: "an unfilled {{binding}}" },
];

/** T4: content a reader would notice. */
export function contentChecks(scene: SceneGraph): Finding[] {
  const findings: Finding[] = [];
  const metrics = new Map<string, Array<{ slide: string; value: string; element: string }>>();
  for (const slide of scene.slides) {
    for (const element of slide.elements) {
      if (element.role === "chrome") continue;
      const text = textOf(element);
      if (!text) continue;
      for (const { pattern, what } of PLACEHOLDER_PATTERNS) {
        if (pattern.test(text)) {
          findings.push({ code: "placeholder-text", severity: "blocking", tier: "T4", message: `${element.id} contains ${what}: "${text.match(pattern)?.[0]}".`, slide: slide.id, element: element.id, path: element.provenance.path, hint: "Replace it with the real content." });
        }
      }
      // "ARR $4.2M" and "ARR $4.1M" on different slides: the same metric with different values.
      for (const match of text.matchAll(/\b([A-Z]{2,6})\b[^\d$€£\n]{0,12}([$€£]?\d[\d.,]*\s?[%kKmMbB]?)/g)) {
        const list = metrics.get(match[1]!) ?? [];
        list.push({ slide: slide.id, value: match[2]!.replace(/\s/g, ""), element: element.id });
        metrics.set(match[1]!, list);
      }
    }
    if (slide.elements.filter((element) => element.role !== "chrome" && element.role !== "decorative").length === 0 && !slide.hidden) {
      findings.push({ code: "slide-empty", severity: "blocking", tier: "T4", message: "The slide has no content.", slide: slide.id });
    }
  }
  for (const [name, entries] of metrics) {
    const values = new Set(entries.map((entry) => entry.value));
    const slides = new Set(entries.map((entry) => entry.slide));
    if (values.size > 1 && slides.size > 1 && entries.length <= 6) {
      findings.push({
        code: "number-inconsistent",
        severity: "major",
        tier: "T4",
        message: `${name} appears as ${[...values].join(" and ")} on slides ${[...slides].join(", ")}.`,
        slide: entries[0]!.slide,
        element: entries[0]!.element,
        hint: "Reconcile the figures, or label them as different periods.",
      });
    }
  }
  for (let index = 1; index < scene.slides.length; index += 1) {
    const previous = scene.slides[index - 1]!;
    const current = scene.slides[index]!;
    const same = previous.elements.map(textOf).join("|") === current.elements.map(textOf).join("|") && previous.elements.length > 0;
    if (same && similarity(previous.signature, current.signature) > 0.99) {
      findings.push({ code: "slide-duplicate", severity: "major", tier: "T4", message: `Slides ${previous.id} and ${current.id} are identical.`, slide: current.id });
    }
    const titleOf = (slide: SceneSlide) => textOf(slide.elements.find((element) => element.placeholder?.type === "title") ?? { kind: "group", id: "", role: "title", frame: { x: 0, y: 0, w: 0, h: 0 }, z: 0, children: [], provenance: { source: "composed", path: "" } });
    const title = titleOf(current);
    if (title && /^[A-Z][a-z]+( [A-Za-z]+){0,2}$/.test(title) && !/\d/.test(title)) {
      findings.push({ code: "headline-is-topic", severity: "minor", tier: "T4", message: `"${title}" names a topic; a headline that states the takeaway reads faster.`, slide: current.id, hint: "Consider stating the claim, e.g. what changed and by how much." });
    }
  }
  return findings;
}
