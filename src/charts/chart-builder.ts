import type { ChartSpec, SlideAgentConfig } from "../types/index.js";
import type { Frame } from "../components/element-writer.js";
import { ElementWriter } from "../components/element-writer.js";
import { ChartTypes, Shapes } from "../components/pptx-values.js";

const CHART_TYPES: Record<Exclude<ChartSpec["kind"], "waterfall">, string> = {
  bar: ChartTypes.bar,
  line: ChartTypes.line,
  pie: ChartTypes.pie,
  area: ChartTypes.area,
};

export class ChartBuilder {
  public constructor(private readonly config: SlideAgentConfig) {}

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
    const colors = style.colors ?? [this.config.colors.accent, this.config.colors.accentAlt, this.config.colors.muted];
    const data: Array<Record<string, unknown>> = chart.series.map((series) => ({
      name: series.name,
      labels: chart.labels,
      values: series.values,
    }));
    const options: Record<string, unknown> = {
      showTitle: false,
      showLegend: chart.showLegend ?? chart.series.length > 1,
      legendPos: "b",
      chartColors: colors,
      ...(chart.kind === "area" ? { chartColorsOpacity: 58 } : {}),
      catAxisLabelFontFace: this.config.fonts.body,
      catAxisLabelFontSize: 12,
      catAxisLabelColor: this.config.colors.ink,
      valAxisLabelFontFace: this.config.fonts.body,
      valAxisLabelFontSize: 11,
      valAxisLabelColor: this.config.colors.ink,
      legendColor: this.config.colors.ink,
      valGridLine: { color: this.config.colors.rule, width: 1 },
      showPercent: chart.kind === "pie",
      showValue: chart.showValues ?? ["bar", "pie"].includes(chart.kind),
      dataLabelPosition: chart.kind === "bar" ? "outEnd" : chart.kind === "pie" ? "bestFit" : "t",
      showLeaderLines: chart.kind === "pie",
      ...(style.options ?? {}),
      ...frame,
      objectName: name,
      altText: `${chart.kind} chart: ${chart.series.map((series) => series.name).join(", ")}`,
    };
    writer.slide.addChart(CHART_TYPES[chart.kind], data, options);
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
    const baseline = frame.y + frame.h - 0.58;
    const plotHeight = frame.h - 1.0;
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
        x: x - 0.08,
        y: Math.max(frame.y, y - 0.35),
        w: w + 0.16,
        h: 0.3,
      }, { fontSize: 12, bold: true, align: "center", role: "chart-label" });
      writer.addText(`${name}-label-${index + 1}`, chart.labels[index] ?? "", {
        x: frame.x + slot * index,
        y: baseline + 0.08,
        w: slot,
        h: 0.42,
      }, { fontSize: 11, align: "center", color: this.config.colors.muted, role: "chart-label" });
    });
    writer.recordChart(name, chart, frame);
  }
}
