import type { ChartSpec, SlideAgentConfig } from "../types/index.js";
import type { Frame } from "../components/element-writer.js";
import { ElementWriter } from "../components/element-writer.js";
import { ChartTypes, Shapes } from "../components/pptx-values.js";
import { resolveTokens, type DeckTokens } from "../design/tokens.js";
import { ensureContrast, requiredContrast } from "../utils/color.js";

type NativeKind = Exclude<ChartSpec["kind"], "waterfall">;

const CHART_TYPES: Record<NativeKind, string> = {
  bar: ChartTypes.bar,
  "bar-stacked": ChartTypes.bar,
  "bar-horizontal": ChartTypes.bar,
  line: ChartTypes.line,
  pie: ChartTypes.pie,
  doughnut: ChartTypes.doughnut,
  area: ChartTypes.area,
  scatter: ChartTypes.scatter,
  radar: ChartTypes.radar,
};

const CIRCULAR: NativeKind[] = ["pie", "doughnut"];
const BAR_LIKE: NativeKind[] = ["bar", "bar-stacked", "bar-horizontal"];

/**
 * The options that make each kind read as itself. PptxGenJS expresses stacking
 * and orientation as options on one bar type rather than as separate types, so
 * they are named as distinct kinds here — a model asking for a stacked bar
 * should not have to know that.
 */
function kindOptions(kind: NativeKind): Record<string, unknown> {
  switch (kind) {
    case "bar-stacked":
      return { barGrouping: "stacked", barDir: "col" };
    case "bar-horizontal":
      return { barDir: "bar" };
    case "bar":
      return { barDir: "col" };
    case "doughnut":
      return { holeSize: 55 };
    case "area":
      return { chartColorsOpacity: 58 };
    case "scatter":
      return { lineSize: 0, lineDataSymbolSize: 8 };
    case "radar":
      return { radarStyle: "marker" };
    default:
      return {};
  }
}

export class ChartBuilder {
  private readonly tokens: DeckTokens;

  public constructor(private readonly config: SlideAgentConfig, tokens?: DeckTokens) {
    this.tokens = tokens ?? resolveTokens(config);
  }

  public add(
    writer: ElementWriter,
    name: string,
    chart: ChartSpec,
    frame: Frame,
    style: { colors?: string[]; options?: Record<string, unknown> } = {},
  ): void {
    if (chart.kind === "waterfall") {
      this.addWaterfall(writer, name, chart, frame);
      return;
    }
    const kind = chart.kind;
    const colors = style.colors ?? [this.config.colors.accent, this.config.colors.accentAlt, this.config.colors.muted];
    // A scatter chart plots pairs, so PptxGenJS reads the first series as the
    // shared x axis. The contract has already checked the labels are numeric.
    const data: Array<Record<string, unknown>> = kind === "scatter"
      ? [
        { name: "X-Axis", values: chart.labels.map(Number) },
        ...chart.series.map((series) => ({ name: series.name, values: series.values })),
      ]
      : chart.series.map((series) => ({
        name: series.name,
        labels: chart.labels,
        values: series.values,
      }));
    const options: Record<string, unknown> = {
      showTitle: false,
      showLegend: chart.showLegend ?? chart.series.length > 1,
      legendPos: "b",
      chartColors: colors,
      ...kindOptions(kind),
      catAxisLabelFontFace: this.config.fonts.body,
      catAxisLabelFontSize: this.tokens.type.caption,
      catAxisLabelColor: this.config.colors.ink,
      valAxisLabelFontFace: this.config.fonts.body,
      valAxisLabelFontSize: this.tokens.type.micro,
      valAxisLabelColor: this.config.colors.ink,
      legendColor: this.config.colors.ink,
      valGridLine: { color: this.config.colors.rule, width: this.tokens.stroke.hairline },
      showPercent: CIRCULAR.includes(kind),
      showValue: chart.showValues ?? (BAR_LIKE.includes(kind) || CIRCULAR.includes(kind)),
      // A stacked bar's label belongs inside its segment; an outside-end label
      // would sit on top of the segment above it.
      dataLabelPosition: kind === "bar-stacked" ? "ctr" : kind === "bar" ? "outEnd" : kind === "bar-horizontal" ? "outEnd" : CIRCULAR.includes(kind) ? "bestFit" : "t",
      showLeaderLines: CIRCULAR.includes(kind),
      ...(style.options ?? {}),
      ...frame,
      objectName: name,
      altText: `${kind} chart: ${chart.series.map((series) => series.name).join(", ")}`,
    };
    writer.slide.addChart(CHART_TYPES[kind], data, options);
    writer.recordChart(name, chart, frame);
  }

  private addWaterfall(writer: ElementWriter, name: string, chart: ChartSpec, frame: Frame): void {
    const values = chart.series[0]?.values ?? [];
    const totals: number[] = [];
    let running = 0;
    values.forEach((value, index) => {
      const isTotal = index === values.length - 1 && /(?:net|total|ending|final)/i.test(chart.labels[index] ?? "");
      running = isTotal ? value : running + value;
      totals.push(running);
    });
    const domain = Math.max(...totals.map(Math.abs), ...values.map(Math.abs), 1);
    const labelBand = this.tokens.type.caption / 72 * 2.2;
    const baseline = frame.y + frame.h - labelBand;
    const plotHeight = frame.h - labelBand - this.tokens.type.caption / 72 * 2.4;
    const slot = frame.w / Math.max(values.length, 1);

    values.forEach((value, index) => {
      const isTotal = index === values.length - 1 && /(?:net|total|ending|final)/i.test(chart.labels[index] ?? "");
      const previous = index === 0 || isTotal ? 0 : totals[index - 1] ?? 0;
      const current = totals[index] ?? 0;
      const topValue = Math.max(previous, current);
      const bottomValue = Math.min(previous, current);
      const y = baseline - (topValue / domain) * plotHeight;
      const h = Math.max(0.08, ((topValue - bottomValue) / domain) * plotHeight);
      const x = frame.x + slot * index + slot * 0.18;
      const w = slot * 0.64;
      writer.addShape(`${name}-bar-${index + 1}`, Shapes.rect, { x, y, w, h }, {
        fill: isTotal ? this.config.colors.accentAlt : value >= 0 ? this.config.colors.positive : this.config.colors.negative,
        lineWidth: 0,
        role: "chart-mark",
      });
      writer.addText(`${name}-value-${index + 1}`, `${!isTotal && value > 0 ? "+" : ""}${value}${chart.unit ?? ""}`, {
        x: x - this.tokens.space.xs,
        y: Math.max(frame.y, y - this.tokens.type.caption / 72 * 1.8),
        w: w + this.tokens.space.sm,
        h: this.tokens.type.caption / 72 * 1.7,
      }, {
        fontSize: this.tokens.type.caption,
        bold: true,
        align: "center",
        color: ensureContrast(this.config.colors.ink, this.config.colors.background, requiredContrast(this.tokens.type.caption, true)),
        role: "chart-label",
      });
      writer.addText(`${name}-label-${index + 1}`, chart.labels[index] ?? "", {
        x: frame.x + slot * index,
        y: baseline + this.tokens.space.xs,
        w: slot,
        h: labelBand - this.tokens.space.xs,
      }, {
        fontSize: this.tokens.type.micro,
        align: "center",
        color: ensureContrast(this.config.colors.muted, this.config.colors.background, requiredContrast(this.tokens.type.micro)),
        role: "chart-label",
      });
    });
    writer.recordChart(name, chart, frame);
  }
}
