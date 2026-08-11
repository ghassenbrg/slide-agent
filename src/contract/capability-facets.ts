import type { CapabilityReport } from "../extensions.js";

/**
 * Answering "what can this installation do?" at the size of the question.
 *
 * The full report is 13,568 characters, and a model asks for it before it has
 * decided anything — which means the answer it needs first is small: can this
 * machine put a picture on a slide, can it render at all, and how much canvas
 * is there. The `canvas` block alone is 6,252 characters and is worth every one
 * of them *once the model is designing*, which is a later question.
 *
 * So the report is served in facets. The default is the part that changes what
 * a model plans; the rest is one parameter away, and the summary says what the
 * parameter is.
 */

export const CAPABILITY_FACETS = [
  "canvas",
  "images",
  "fonts",
  "rendering",
  "diagrams",
  "charts",
  "layouts",
  "checks",
] as const;

export type CapabilityFacet = (typeof CAPABILITY_FACETS)[number];

export function isCapabilityFacet(value: string): value is CapabilityFacet {
  return (CAPABILITY_FACETS as readonly string[]).includes(value);
}

/**
 * The default answer: counts, plus the two findings that change a plan rather
 * than decorate it.
 *
 * `images` is kept whole. The comment on the capabilities resource is right
 * about why — a model that designs a photo-led deck and only then learns this
 * installation cannot fetch or generate a picture has wasted the design — and
 * a summary that made *that* answer require a second call would have missed the
 * point of summarising.
 */
export interface CapabilitySummary {
  contractVersion: string;
  version: string;
  /** Whether previews are true renders or schematic drawings, and what draws them. */
  rendering: { backend: string; mode: "render" | "schematic"; limitations: string[] };
  /** How, and whether, a picture can reach a slide here. Never summarised away. */
  images: CapabilityReport["images"];
  canvas: {
    elementTypes: string[];
    /** Reading the full canvas block is the next step, not a guess. */
    note: string;
  };
  counts: {
    diagramGrammars: number;
    chartRenderers: number;
    fallbackLayouts: number;
    checks: number;
    reviewers: number;
  };
  fonts: { configured: number; missing: string[] };
  facets: readonly CapabilityFacet[];
  note: string;
}

export function capabilitySummary(
  report: CapabilityReport,
  meta: { contractVersion: string; version: string },
): CapabilitySummary {
  return {
    contractVersion: meta.contractVersion,
    version: meta.version,
    rendering: { backend: report.rendering.backend, mode: report.rendering.mode, limitations: report.rendering.limitations },
    images: report.images,
    canvas: {
      elementTypes: report.canvas.elements.map((element) => element.type),
      note: 'Every property, treatment, and editability class is in the `canvas` facet. Ask for it before you simplify an idea into boxes: include: ["canvas"].',
    },
    counts: {
      diagramGrammars: report.diagrams.length,
      chartRenderers: report.charts.length,
      fallbackLayouts: report.layouts.length,
      checks: report.checks.length,
      reviewers: report.reviewers.length,
    },
    fonts: { configured: report.fonts.configured.length, missing: report.fonts.missing },
    facets: CAPABILITY_FACETS,
    note: "A summary. Name facets in `include` for the full block; `include: [\"all\"]` returns the whole report.",
  };
}

/** The named facets of a capability report, or the whole report for `all`. */
export function capabilityFacets(
  report: CapabilityReport,
  facets: readonly string[],
  meta: { contractVersion: string; version: string },
): Record<string, unknown> {
  if (facets.includes("all")) return { ...meta, ...report };
  const selected: Record<string, unknown> = { ...meta };
  for (const facet of facets) {
    if (!isCapabilityFacet(facet)) continue;
    selected[facet] = report[facet];
  }
  const unknown = facets.filter((facet) => facet !== "all" && !isCapabilityFacet(facet));
  if (unknown.length > 0) {
    selected.ignored = { facets: unknown, available: CAPABILITY_FACETS };
  }
  return selected;
}
