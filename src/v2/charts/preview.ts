import type { ChartElement } from "../ir/scene.js";
import { tint } from "../tokens/color.js";
import { esc } from "../ooxml/xml.js";

/**
 * A deterministic SVG drawing of a native chart, styled from the same element
 * the writer emits, for previews. It is a preview: PowerPoint draws the real
 * chart from the embedded data.
 */

const PPI = 72;

function niceStep(range: number, ticks = 5): number {
  if (range <= 0) return 1;
  const rough = range / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return nice * magnitude;
}

function label(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${+(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${+(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e4) return `${+(value / 1e3).toFixed(1)}k`;
  return `${+value.toFixed(abs < 10 && abs % 1 ? 1 : 0)}`;
}

export function chartSvg(element: ChartElement, groundHex = "FFFFFF"): string {
  const { frame, data, style } = element;
  const x0 = frame.x * PPI;
  const y0 = frame.y * PPI;
  const width = frame.w * PPI;
  const height = frame.h * PPI;
  const font = `font-family="${esc(style.font)}, sans-serif" font-size="${style.size}"`;
  const text = (x: number, y: number, value: string, anchor: string, fill: string, extra = "") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" ${font} fill="#${fill}"${extra}>${esc(value)}</text>`;
  const parts: string[] = [];
  let top = y0;
  if (element.title) {
    parts.push(text(x0, top + style.size, element.title, "start", style.text.hex, ' font-weight="700"'));
    top += style.size * 1.8;
  }
  const legendNeeded = style.legend !== "none" && data.series.length > 1 && element.chart !== "waterfall";
  if (legendNeeded && style.legend === "top") {
    let cursor = x0;
    data.series.forEach((series, index) => {
      const color = element.colors[index % element.colors.length]?.hex ?? style.text.hex;
      parts.push(`<rect x="${cursor}" y="${top + 2}" width="${style.size * 0.8}" height="${style.size * 0.8}" fill="#${color}"/>`);
      parts.push(text(cursor + style.size * 1.1, top + style.size * 0.8, series.name, "start", style.muted.hex));
      cursor += style.size * 1.6 + series.name.length * style.size * 0.55;
    });
    top += style.size * 1.8;
  }
  const bottomPad = style.size * 2;
  const plotHeight = Math.max(10, y0 + height - top - bottomPad);
  const count = data.categories.length;
  const kind = element.chart;

  if (kind === "pie" || kind === "doughnut") {
    const values = (data.series[0]?.values ?? []).map((value) => Math.max(0, value ?? 0));
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const radius = Math.min(width, plotHeight) / 2 * 0.9;
    const cx = x0 + width / 2;
    const cy = top + plotHeight / 2;
    let angle = -Math.PI / 2;
    values.forEach((value, index) => {
      const sweep = (value / total) * Math.PI * 2;
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const color = element.highlight.length
        ? element.highlight.includes(index) ? (style.highlight ?? element.colors[0]!).hex : tint((element.colors[0] ?? style.muted).hex, 40 + (index % 3) * 15)
        : element.colors[index % element.colors.length]!.hex;
      const path = `M${cx},${cy} L${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)} A${radius},${radius} 0 ${large} 1 ${cx + radius * Math.cos(end)},${cy + radius * Math.sin(end)} Z`;
      parts.push(`<path d="${path}" fill="#${color}" stroke="#FFFFFF" stroke-width="1"/>`);
      angle = end;
    });
    if (kind === "doughnut") parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius * 0.62}" fill="#${groundHex}"/>`);
    return `<g data-chart="${esc(element.id)}">${parts.join("")}</g>`;
  }

  // Cartesian charts.
  const horizontal = kind === "bar" || kind === "stacked-bar";
  const stacked = kind === "stacked-bar" || kind === "stacked-column";
  let series = data.series.map((entry) => entry.values.map((value) => value ?? 0));
  let waterfallBase: number[] | undefined;
  if (kind === "waterfall" && series[0]) {
    waterfallBase = [];
    let running = 0;
    const deltas = series[0];
    for (const delta of deltas) {
      waterfallBase.push(Math.min(running, running + delta));
      running += delta;
    }
    series = [deltas.map((delta) => Math.abs(delta))];
  }
  const totals = data.categories.map((_, index) => stacked ? series.reduce((sum, values) => sum + Math.max(0, values[index] ?? 0), 0) : Math.max(...series.map((values) => values[index] ?? 0)) + (waterfallBase?.[index] ?? 0));
  const minimum = Math.min(0, ...series.flat(), ...(waterfallBase ?? []));
  const maximum = Math.max(0, ...totals);
  const step = niceStep(maximum - minimum);
  const low = Math.floor(minimum / step) * step;
  const high = Math.ceil(maximum / step) * step || step;
  const labelWidth = style.size * 2.8;
  const plotX = horizontal ? x0 + Math.min(width * 0.3, Math.max(...data.categories.map((category) => String(category).length)) * style.size * 0.55 + 6) : x0 + labelWidth;
  const plotW = x0 + width - plotX;
  const scale = (value: number) => (value - low) / (high - low);

  for (let tick = low; tick <= high + step / 2; tick += step) {
    if (horizontal) {
      const x = plotX + scale(tick) * plotW;
      if (style.gridlines !== "none") parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + plotHeight}" stroke="#${style.rule.hex}" stroke-width="0.5" opacity="${style.gridlines === "subtle" ? 0.6 : 1}"/>`);
      parts.push(text(x, top + plotHeight + style.size * 1.3, label(tick), "middle", style.muted.hex));
    } else {
      const y = top + plotHeight - scale(tick) * plotHeight;
      if (style.gridlines !== "none") parts.push(`<line x1="${plotX}" y1="${y}" x2="${plotX + plotW}" y2="${y}" stroke="#${style.rule.hex}" stroke-width="0.5" opacity="${style.gridlines === "subtle" ? 0.6 : 1}"/>`);
      parts.push(text(plotX - 6, y + style.size * 0.35, label(tick), "end", style.muted.hex));
    }
  }

  const band = (horizontal ? plotHeight : plotW) / Math.max(1, count);
  const groupWidth = band * 0.64;
  const barWidth = stacked || waterfallBase ? groupWidth : groupWidth / Math.max(1, series.length);
  if (kind === "line" || kind === "area" || kind === "scatter") {
    series.forEach((values, seriesIndex) => {
      const color = element.colors[seriesIndex % element.colors.length]?.hex ?? style.text.hex;
      const points = values.map((value, index) => [plotX + band * (index + 0.5), top + plotHeight - scale(value) * plotHeight] as const);
      if (kind === "scatter") {
        for (const [x, y] of points) parts.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="#${color}"/>`);
        return;
      }
      const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      if (kind === "area") parts.push(`<path d="${path} L${points.at(-1)![0]},${top + plotHeight - scale(0) * plotHeight} L${points[0]![0]},${top + plotHeight - scale(0) * plotHeight} Z" fill="#${color}" opacity="0.35"/>`);
      parts.push(`<path d="${path}" fill="none" stroke="#${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`);
      for (const index of element.highlight) {
        const point = points[index];
        if (point) parts.push(`<circle cx="${point[0]}" cy="${point[1]}" r="4" fill="#${(style.highlight ?? element.colors[0]!).hex}"/>`);
      }
    });
  } else {
    data.categories.forEach((_, index) => {
      let stack = waterfallBase?.[index] ?? 0;
      series.forEach((values, seriesIndex) => {
        const value = values[index] ?? 0;
        const base = element.colors[seriesIndex % element.colors.length]?.hex ?? style.text.hex;
        const highlighted = element.highlight.includes(index);
        const fill = waterfallBase
          ? (data.series[0]!.values[index] ?? 0) < 0 ? style.muted.hex : base
          : element.highlight.length && series.length === 1 ? (highlighted ? (style.highlight ?? element.colors[0]!).hex : tint(base, 55)) : base;
        const start = stacked || waterfallBase ? stack : 0;
        const end = start + value;
        stack = end;
        const offset = stacked || waterfallBase ? 0 : seriesIndex * barWidth;
        const bandStart = band * index + (band - groupWidth) / 2 + offset;
        if (horizontal) {
          const x1 = plotX + scale(Math.min(start, end)) * plotW;
          const x2 = plotX + scale(Math.max(start, end)) * plotW;
          parts.push(`<rect x="${x1.toFixed(1)}" y="${(top + bandStart).toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="${barWidth.toFixed(1)}" fill="#${fill}"/>`);
        } else {
          const y1 = top + plotHeight - scale(Math.max(start, end)) * plotHeight;
          const y2 = top + plotHeight - scale(Math.min(start, end)) * plotHeight;
          parts.push(`<rect x="${(plotX + bandStart).toFixed(1)}" y="${y1.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(y2 - y1).toFixed(1)}" fill="#${fill}"/>`);
          if (style.labels !== "none") parts.push(text(plotX + bandStart + barWidth / 2, y1 - 4, label(value), "middle", style.text.hex));
        }
      });
    });
  }
  data.categories.forEach((category, index) => {
    if (horizontal) parts.push(text(plotX - 6, top + band * (index + 0.5) + style.size * 0.35, String(category), "end", style.muted.hex));
    else parts.push(text(plotX + band * (index + 0.5), top + plotHeight + style.size * 1.3, String(category), "middle", style.muted.hex));
  });
  if (style.axis !== "none") {
    const weight = style.axis === "regular" ? 1 : 0.5;
    parts.push(horizontal
      ? `<line x1="${plotX}" y1="${top}" x2="${plotX}" y2="${top + plotHeight}" stroke="#${style.rule.hex}" stroke-width="${weight}"/>`
      : `<line x1="${plotX}" y1="${top + plotHeight - scale(0) * plotHeight}" x2="${plotX + plotW}" y2="${top + plotHeight - scale(0) * plotHeight}" stroke="#${style.rule.hex}" stroke-width="${weight}"/>`);
  }
  return `<g data-chart="${esc(element.id)}">${parts.join("")}</g>`;
}
