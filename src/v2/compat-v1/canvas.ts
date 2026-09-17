import type { ChartKind } from "../ir/compose.js";
import { joinPointer, type Finding } from "../ir/issues.js";
import type { ColorRef, SceneElement, TextParagraph } from "../ir/scene.js";
import { normalizeHex } from "../tokens/color.js";
import { roleColor, type ThemeSpec } from "../tokens/compile.js";
import type { AssetInfo } from "../layout/solve.js";

/**
 * `canvas` slides: V1 canvas elements, with their authored geometry, carried
 * into the V2 scene graph. Geometry stays literal (these slides are pinned by
 * construction); they get the same T0–T4 checks as composed slides.
 */

type Raw = Record<string, unknown>;

const V1_CHART_KINDS: Record<string, ChartKind> = {
  bar: "column", "bar-stacked": "stacked-column", "bar-horizontal": "bar", line: "line", pie: "pie", doughnut: "doughnut", area: "area", scatter: "scatter", waterfall: "waterfall", radar: "line",
};

function hexRef(value: unknown, fallback: ColorRef): ColorRef {
  const hex = typeof value === "string" ? normalizeHex(value) : undefined;
  return hex ? { hex } : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function canvasToElements(canvas: Raw[], context: { theme: ThemeSpec; slideId: string; path: string; assets: Map<string, AssetInfo> }): { elements: SceneElement[]; findings: Finding[] } {
  const elements: SceneElement[] = [];
  const findings: Finding[] = [];
  const { theme } = context;
  const byId = new Map<string, { x: number; y: number; w: number; h: number }>();

  const visit = (element: Raw, path: string) => {
    const type = element.type;
    const id = `${context.slideId}/${typeof element.id === "string" ? element.id : `el${elements.length + 1}`}`;
    const frame = { x: num(element.x), y: num(element.y), w: num(element.w), h: num(element.h) };
    const style = (element.style ?? {}) as Raw;
    const provenance = { source: "canvas" as const, path };
    const z = num(element.zIndex, elements.length);
    if (typeof element.id === "string") byId.set(element.id, frame);
    const decorative = element.role === "decorative";
    switch (type) {
      case "text": {
        const runs = Array.isArray(element.runs)
          ? (element.runs as Raw[]).map((run) => ({ text: String(run.text ?? ""), ...((run.options as Raw | undefined)?.bold ? { bold: true } : {}), ...((run.options as Raw | undefined)?.italic ? { italic: true } : {}) }))
          : [{ text: String(element.text ?? "") }];
        const paragraphs: TextParagraph[] = [];
        let current: TextParagraph = { runs: [] };
        for (const run of runs) {
          const parts = run.text.split("\n");
          parts.forEach((part, index) => {
            if (index > 0) {
              paragraphs.push(current);
              current = { runs: [] };
            }
            current.runs.push({ ...run, text: part });
          });
        }
        paragraphs.push(current);
        const size = num(style.fontSize, theme.sizes.body);
        const role = element.role === "title" ? "title" : decorative ? "decorative" : "body";
        elements.push({
          kind: "text", id, role, typeRole: role === "title" ? "title" : "body", frame, z, paragraphs,
          style: {
            font: typeof style.fontFace === "string" ? style.fontFace : theme.fonts.body.regular.typeface,
            size, bold: Boolean(style.bold), italic: Boolean(style.italic),
            color: hexRef(style.color, roleColor("text", theme)),
            align: (style.align as "left") ?? "left", valign: (style.valign as "top") ?? "top",
            leading: num(style.lineSpacingMultiple, 1.2), inset: [0, 0, 0, 0],
          },
          provenance, ...(decorative ? { decorative: true } : {}),
          ...(role === "title" ? { placeholder: { type: "title" as const } } : {}),
        });
        break;
      }
      case "shape":
        elements.push({
          kind: "shape", id, role: decorative ? "decorative" : "container", frame, z,
          style: {
            preset: typeof element.shape === "string" ? element.shape : "rect",
            ...(style.fill ? { fill: hexRef(style.fill, roleColor("surface", theme)) } : {}),
            ...(style.lineColor ? { stroke: hexRef(style.lineColor, roleColor("muted", theme)), strokeWidth: num(style.lineWidth, 1) } : {}),
            ...(style.transparency !== undefined ? { opacity: 1 - num(style.transparency) / 100 } : {}),
          },
          provenance, decorative: true,
        });
        break;
      case "image": {
        const asset = String(element.path ?? "");
        const info = context.assets.get(asset);
        if (!info?.file) {
          findings.push({ code: "image-unavailable", severity: "blocking", tier: "T0", message: `Image ${asset} cannot be used: ${info?.error ?? "not found"}.`, path: joinPointer(path, "path"), slide: context.slideId });
          break;
        }
        elements.push({ kind: "image", id, role: "media", frame, z, asset: info.file, ...(info.width ? { pixelWidth: info.width } : {}), ...(info.height ? { pixelHeight: info.height } : {}), ...(typeof element.alt === "string" ? { alt: element.alt } : {}), provenance });
        break;
      }
      case "connector": {
        const from = typeof element.from === "string" ? element.from : (element.from as Raw | undefined)?.id as string | undefined;
        const to = typeof element.to === "string" ? element.to : (element.to as Raw | undefined)?.id as string | undefined;
        const a = from ? byId.get(from) : undefined;
        const b = to ? byId.get(to) : undefined;
        const points = a && b
          ? [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }]
          : [{ x: frame.x, y: frame.y }, { x: frame.x + frame.w, y: frame.y + frame.h }];
        elements.push({ kind: "connector", id, role: "connector", frame, z, points, style: { preset: "line", stroke: hexRef(style.lineColor ?? style.color, roleColor("muted", theme)), strokeWidth: num(style.lineWidth, 1.25), arrowEnd: true }, provenance, decorative: true });
        break;
      }
      case "table": {
        const table = element.table as Raw;
        const columns = (table.headers as unknown[] ?? []).map(String);
        const rows = ((table.rows as unknown[][]) ?? []).map((row) => row.map((cell) => String(cell ?? "")));
        const rowHeight = frame.h / Math.max(1, rows.length + 1);
        elements.push({
          kind: "table", id, role: "data", frame, z, columns, rows,
          columnWidths: columns.map(() => frame.w / Math.max(1, columns.length)), rowHeights: [rowHeight, ...rows.map(() => rowHeight)], header: true,
          style: { font: theme.fonts.body.regular.typeface, size: theme.sizes.small, text: roleColor("text", theme), headerText: roleColor("text", theme), headerFill: roleColor("surface", theme), rule: roleColor("muted", theme), highlightFill: roleColor("surface", theme), align: columns.map(() => "left" as const) },
          provenance,
        });
        break;
      }
      case "chart": {
        const chart = element.chart as Raw;
        const series = ((chart.series as Raw[]) ?? []).map((entry) => ({ name: String(entry.name), values: (entry.values as number[]) ?? [] }));
        elements.push({
          kind: "chart", id, role: "data", frame, z,
          chart: V1_CHART_KINDS[String(chart.kind)] ?? "column",
          data: { categories: ((chart.labels as unknown[]) ?? []).map(String), series, ...(typeof chart.unit === "string" ? { unit: chart.unit } : {}) },
          colors: series.map((_, index) => ({ hex: theme.data[index % Math.max(1, theme.data.length)] ?? theme.roles.accent })),
          highlight: [],
          style: { font: theme.fonts.body.regular.typeface, size: theme.sizes.small, text: roleColor("text", theme), muted: roleColor("muted", theme), rule: roleColor("muted", theme), axis: "hairline", gridlines: "subtle", labels: chart.showValues ? "end" : "none", legend: chart.showLegend ? "top" : "none" },
          ...(typeof element.alt === "string" ? { alt: element.alt } : {}),
          provenance,
        });
        break;
      }
      case "group":
        ((element.children as Raw[]) ?? []).forEach((child, index) => visit(child, joinPointer(path, "children", index)));
        break;
      default:
        findings.push({ code: "canvas-unsupported", severity: "major", tier: "T0", message: `Canvas element type "${String(type)}" is not carried into V2; rewrite it as a composition.`, path, slide: context.slideId });
    }
  };
  canvas.forEach((element, index) => visit(element, joinPointer(context.path, "canvas", index)));
  return { elements, findings };
}
