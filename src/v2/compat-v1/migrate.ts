import type { PresentationOutline, SlideSpec } from "../../types/index.js";
import type { DesignLanguage } from "../ir/design.js";
import { INTENT_SCHEMA_ID, type DeckIntentInput } from "../ir/intent.js";
import { normalizeHex } from "../tokens/color.js";

/**
 * V1 outlines and scenes → DeckIntent.
 *
 * `canvas` slides carry over with their geometry; `kind` slides map onto the
 * recipe that does the same job, which the author can expand into a
 * composition; creative direction becomes a design language. Everything that
 * does not map is listed in the report, never dropped silently.
 */

export interface MigrationReport {
  slides: Array<{ id: string; from: string; to: string; note?: string }>;
  design: string;
  unmapped: string[];
}

function slug(value: string, index: number): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
  return base ? `${base}` : `slide-${index + 1}`;
}

function languageFrom(outline: PresentationOutline, unmapped: string[]): DesignLanguage | undefined {
  const direction = outline.creativeDirection;
  const palette = direction?.palette;
  if (!palette) return undefined;
  const colors: Record<string, string> = {};
  const take = (name: string, value: unknown) => {
    const hex = typeof value === "string" ? normalizeHex(value) : undefined;
    if (hex) colors[name] = `#${hex}`;
  };
  for (const key of ["background", "surface", "ink", "muted", "accent", "accentAlt", "rule", "positive", "negative", "warning"] as const) take(key, palette[key]);
  for (const [name, value] of Object.entries(palette.custom ?? {})) take(name.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "custom", value);
  if (!colors.background || !colors.ink || !colors.accent) {
    unmapped.push("creativeDirection.palette lacks background, ink, or accent; a preset was used instead");
    return undefined;
  }
  colors.surface ??= colors.background;
  colors.muted ??= colors.ink;
  const typography = direction.typography;
  return {
    ...(direction.concept ? { concept: String(direction.concept).slice(0, 400) } : {}),
    color: {
      palette: colors,
      roles: { background: "background", surface: "surface", text: "ink", muted: "muted", accent: "accent", ...(colors.accentAlt ? { accentAlt: "accentAlt" } : {}), ...(colors.rule ? { rule: "rule" } : {}) },
    },
    type: {
      display: { family: typography?.display ?? typography?.heading ?? "Aptos Display" },
      body: { family: typography?.body ?? "Aptos" },
      ...(typography?.mono ? { mono: { family: typography.mono } } : {}),
      scale: { base: 18, ratio: 1.25 },
    },
    space: { unit: 8, margin: 40, gutter: 20 },
    grid: { columns: 12, rows: 6 },
    shape: { radius: direction.geometry === "sharp" ? 0 : 6, stroke: 0 },
    surfaces: { card: { fill: "surface", radius: 6, pad: "space.3" }, band: { fill: "accent" } },
  };
}

function recipeFor(slide: SlideSpec): { recipe: string; content: Record<string, unknown> } | undefined {
  const title = slide.title;
  switch (slide.kind) {
    case "title": return { recipe: "title/left-anchored", content: { title, ...(slide.subtitle ? { subtitle: slide.subtitle } : {}) } };
    case "section": return { recipe: "section/number-led", content: { title, ...(slide.subtitle ? { lead: slide.subtitle } : {}) } };
    case "executive-summary": return { recipe: "bullets/one-column", content: { title, points: slide.bullets ?? (slide.body ? [slide.body] : []) } };
    case "comparison": return slide.comparison ? { recipe: "comparison/columns", content: { title, groups: slide.comparison.map((column) => ({ name: column.heading, points: column.points })) } } : undefined;
    case "timeline": return slide.timeline ? { recipe: "timeline/horizontal", content: { title, events: slide.timeline.map((item) => ({ date: item.label, label: item.title, ...(item.detail ? { detail: item.detail } : {}) })) } } : undefined;
    case "process": return slide.process ? { recipe: "process/chevrons", content: { title, steps: slide.process.map((step) => ({ label: step.title, ...(step.detail ? { detail: step.detail } : {}) })) } } : undefined;
    case "kpi": return slide.kpis ? { recipe: "metrics/row", content: { title, metrics: slide.kpis.map((kpi) => ({ value: kpi.value, label: kpi.label, ...(kpi.detail ? { note: kpi.detail } : {}) })) } } : undefined;
    case "quote": return slide.quote ? { recipe: "quote/pull", content: { quote: slide.quote.text, ...(slide.quote.attribution ? { attribution: slide.quote.attribution } : {}) } } : undefined;
    case "table": return slide.table ? { recipe: "table/standard", content: { title, table: { columns: slide.table.headers, rows: slide.table.rows } } } : undefined;
    case "chart": return slide.chart ? { recipe: "chart/full", content: { title, chart: { categories: slide.chart.labels, series: slide.chart.series } } } : undefined;
    case "closing": return { recipe: "closing/call-to-action", content: { title, actions: slide.bullets ?? [] } };
    default: return undefined;
  }
}

export function migrateOutline(outline: PresentationOutline): { intent: DeckIntentInput; report: MigrationReport } {
  const unmapped: string[] = [];
  const report: MigrationReport = { slides: [], design: "", unmapped };
  const language = languageFrom(outline, unmapped);
  report.design = language ? "creativeDirection → design language" : "preset draft/confident (no usable palette)";
  const ids = new Set<string>();
  const slides = outline.slides.map((slide, index) => {
    let id = slug(slide.id || slide.title || "", index);
    while (ids.has(id)) id = `${id.slice(0, 36)}-${index + 1}`;
    ids.add(id);
    const base = {
      id,
      message: (slide.communication as { takeaway?: string } | undefined)?.takeaway ?? slide.title ?? id,
      ...(slide.speakerNotes?.length ? { notes: slide.speakerNotes.join("\n").slice(0, 3000) } : {}),
    };
    if (slide.canvas?.length) {
      report.slides.push({ id, from: "canvas", to: "canvas", note: "geometry kept; consider rewriting as a composition" });
      return { ...base, canvas: slide.canvas as unknown as Array<Record<string, unknown>> };
    }
    const mapped = recipeFor(slide);
    if (mapped) {
      report.slides.push({ id, from: `kind ${slide.kind}`, to: `recipe ${mapped.recipe}` });
      return { ...base, recipe: mapped.recipe, content: mapped.content };
    }
    report.slides.push({ id, from: `kind ${slide.kind}`, to: "statement/big-claim", note: "no recipe for this kind; content reduced to the title" });
    unmapped.push(`${id}: kind ${slide.kind}`);
    return { ...base, recipe: "statement/big-claim", content: { statement: slide.title || id } };
  });
  const intent: DeckIntentInput = {
    schema: INTENT_SCHEMA_ID,
    brief: {
      title: outline.brief.title.slice(0, 120),
      audience: (outline.brief.audience ?? "").slice(0, 160),
      goal: (outline.brief.objective ?? "").slice(0, 240),
    },
    direction: { concept: String(outline.creativeDirection?.concept ?? outline.brief.visualDirection ?? "").slice(0, 600), fit: "ask" },
    design: language ? { language } : { preset: "draft/confident" },
    slides: slides as DeckIntentInput["slides"],
  };
  return { intent, report };
}
