import type { ChartData, ChartKind } from "../ir/compose.js";

/**
 * Facts computed from chart data. A model may phrase these; it never produces
 * a number itself. Every fact carries an id a composition can annotate with,
 * e.g. `change:2025-10..2026-03` or `max:Revenue`.
 */

export interface ChartFact {
  id: string;
  kind: "max" | "min" | "change" | "cagr" | "share" | "total" | "mean" | "rank" | "outlier";
  series: string;
  value: number;
  text: string;
  categories?: Array<string | number>;
}

function formatNumber(value: number, unit?: string): string {
  const abs = Math.abs(value);
  const formatted = abs >= 1e9 ? `${(value / 1e9).toFixed(1)}B`
    : abs >= 1e6 ? `${(value / 1e6).toFixed(1)}M`
      : abs >= 1e4 ? `${(value / 1e3).toFixed(1)}k`
        : Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(abs < 10 ? 2 : 1);
  if (!unit) return formatted;
  if (unit === "%") return `${formatted}%`;
  if (unit === "$" || unit === "€" || unit === "£") return `${unit}${formatted}`;
  return `${formatted} ${unit}`;
}

function percent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded)}%`;
}

export function computeFacts(data: ChartData): ChartFact[] {
  const facts: ChartFact[] = [];
  const categories = data.categories;
  for (const series of data.series) {
    const unit = series.unit ?? data.unit;
    const points = series.values.map((value, index) => ({ value, index })).filter((point): point is { value: number; index: number } => typeof point.value === "number" && Number.isFinite(point.value));
    if (points.length === 0) continue;
    const max = points.reduce((best, point) => point.value > best.value ? point : best);
    const min = points.reduce((best, point) => point.value < best.value ? point : best);
    facts.push({ id: `max:${series.name}`, kind: "max", series: series.name, value: max.value, text: `Highest ${series.name}: ${formatNumber(max.value, unit)} (${categories[max.index]})`, categories: [categories[max.index]!] });
    facts.push({ id: `min:${series.name}`, kind: "min", series: series.name, value: min.value, text: `Lowest ${series.name}: ${formatNumber(min.value, unit)} (${categories[min.index]})`, categories: [categories[min.index]!] });
    const total = points.reduce((sum, point) => sum + point.value, 0);
    facts.push({ id: `total:${series.name}`, kind: "total", series: series.name, value: total, text: `Total ${series.name}: ${formatNumber(total, unit)}` });
    facts.push({ id: `mean:${series.name}`, kind: "mean", series: series.name, value: total / points.length, text: `Average ${series.name}: ${formatNumber(total / points.length, unit)}` });
    const first = points[0]!;
    const last = points.at(-1)!;
    if (points.length >= 2 && first.value !== 0) {
      const change = ((last.value - first.value) / Math.abs(first.value)) * 100;
      const id = `change:${categories[first.index]}..${categories[last.index]}`;
      facts.push({ id: data.series.length > 1 ? `${id}:${series.name}` : id, kind: "change", series: series.name, value: change, text: `${series.name} ${percent(change)} from ${categories[first.index]} to ${categories[last.index]}`, categories: [categories[first.index]!, categories[last.index]!] });
      const periods = last.index - first.index;
      if (periods >= 2 && first.value > 0 && last.value > 0) {
        const cagr = ((last.value / first.value) ** (1 / periods) - 1) * 100;
        facts.push({ id: `cagr:${series.name}`, kind: "cagr", series: series.name, value: cagr, text: `${series.name} compound growth ${percent(cagr)} per period` });
      }
    }
    if (total > 0 && points.every((point) => point.value >= 0)) {
      for (const point of points) {
        facts.push({ id: `share:${categories[point.index]}${data.series.length > 1 ? `:${series.name}` : ""}`, kind: "share", series: series.name, value: (point.value / total) * 100, text: `${categories[point.index]} is ${Math.round((point.value / total) * 1000) / 10}% of ${series.name}`, categories: [categories[point.index]!] });
      }
    }
    if (points.length >= 5) {
      const mean = total / points.length;
      const deviation = Math.sqrt(points.reduce((sum, point) => sum + (point.value - mean) ** 2, 0) / points.length);
      for (const point of points) {
        if (deviation > 0 && Math.abs(point.value - mean) > 2 * deviation) {
          facts.push({ id: `outlier:${categories[point.index]}`, kind: "outlier", series: series.name, value: point.value, text: `${categories[point.index]} is an outlier in ${series.name} (${formatNumber(point.value, unit)})`, categories: [categories[point.index]!] });
        }
      }
    }
  }
  return facts;
}

/**
 * Whether a chart form misrepresents its data — a finding for directed decks,
 * never a silent switch. Returns a reason and better forms, or undefined.
 */
export function chartFormProblem(kind: ChartKind, data: ChartData): { reason: string; alternatives: ChartKind[] } | undefined {
  const count = data.categories.length;
  const seriesCount = data.series.length;
  const negative = data.series.some((series) => series.values.some((value) => typeof value === "number" && value < 0));
  if ((kind === "pie" || kind === "doughnut") && (count > 6 || seriesCount > 1 || negative)) {
    return { reason: count > 6 ? `${count} slices are too many to compare as angles` : seriesCount > 1 ? "a pie shows one series" : "parts of a whole cannot be negative", alternatives: ["bar", "stacked-bar"] };
  }
  if ((kind === "line" || kind === "area") && count < 3) return { reason: "a line needs at least three points to show a trend", alternatives: ["column", "bar"] };
  if (kind === "scatter" && seriesCount < 1) return { reason: "a scatter needs numeric pairs", alternatives: ["column"] };
  if ((kind === "stacked-bar" || kind === "stacked-column") && seriesCount < 2) return { reason: "stacking one series adds nothing", alternatives: ["bar", "column"] };
  return undefined;
}

/** Normalise any supported inline or named dataset into ChartData. */
export function toChartData(raw: unknown): ChartData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (Array.isArray(value.categories) && Array.isArray(value.series)) {
    const series = (value.series as unknown[]).map((entry, index) => {
      const item = entry as Record<string, unknown>;
      return {
        name: typeof item.name === "string" ? item.name : `Series ${index + 1}`,
        values: Array.isArray(item.values) ? (item.values as unknown[]).map((number) => typeof number === "number" && Number.isFinite(number) ? number : null) : [],
        ...(typeof item.unit === "string" ? { unit: item.unit } : {}),
      };
    });
    return {
      categories: (value.categories as unknown[]).map((category) => typeof category === "number" ? category : String(category)),
      series,
      ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
      ...(typeof value.source === "string" ? { source: value.source } : {}),
    };
  }
  // A table: first column categories, the rest numeric series.
  if (Array.isArray(value.columns) && Array.isArray(value.rows)) {
    const columns = value.columns as string[];
    const rows = value.rows as unknown[][];
    return {
      categories: rows.map((row) => String(row[0] ?? "")),
      series: columns.slice(1).map((name, index) => ({ name, values: rows.map((row) => {
        const cell = row[index + 1];
        const number = typeof cell === "number" ? cell : Number(String(cell ?? "").replace(/[,%$€£\s]/g, ""));
        return Number.isFinite(number) ? number : null;
      }) })),
      ...(typeof value.unit === "string" ? { unit: value.unit } : {}),
    };
  }
  return undefined;
}

/** A form for data whose author did not name one — draft mode only. */
export function suggestChartKind(data: ChartData): ChartKind {
  const count = data.categories.length;
  const seriesCount = data.series.length;
  const timeLike = data.categories.every((category) => /^(\d{4}|q[1-4]|\d{4}[-/]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|h[12]|fy)/i.test(String(category)));
  if (timeLike && count >= 3) return "line";
  const allPositive = data.series.every((series) => series.values.every((value) => value === null || value >= 0));
  if (seriesCount === 1 && count <= 5 && allPositive && !timeLike) {
    const total = data.series[0]!.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (Math.abs(total - 100) < 1.5) return "doughnut";
  }
  if (seriesCount > 1 && count <= 6) return "column";
  return count > 7 ? "bar" : "column";
}
