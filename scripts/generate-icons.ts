/**
 * Builds assets/icons/lucide.json from the lucide-static dev dependency:
 * every icon as SVG path data in a 24×24 box, with its tags for search.
 *
 * Shapes (circle, rect, line, polyline, polygon, ellipse) become paths so the
 * writer has one geometry type to convert into DrawingML custom geometry.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Attrs = Record<string, string | number>;
const root = path.resolve(import.meta.dirname, "..");
const nodes = JSON.parse(await readFile(path.join(root, "node_modules/lucide-static/icon-nodes.json"), "utf8")) as Record<string, Array<[string, Attrs]>>;
const tags = JSON.parse(await readFile(path.join(root, "node_modules/lucide-static/tags.json"), "utf8")) as Record<string, string[]>;
const version = JSON.parse(await readFile(path.join(root, "node_modules/lucide-static/package.json"), "utf8")).version as string;

const n = (value: string | number | undefined) => Number(value ?? 0);
const fmt = (value: number) => Number(value.toFixed(3)).toString();

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(rx * 2)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-rx * 2)} 0z`;
}

function toPath([tag, attrs]: [string, Attrs]): string | undefined {
  switch (tag) {
    case "path": return String(attrs.d);
    case "circle": return ellipsePath(n(attrs.cx), n(attrs.cy), n(attrs.r), n(attrs.r));
    case "ellipse": return ellipsePath(n(attrs.cx), n(attrs.cy), n(attrs.rx), n(attrs.ry));
    case "line": return `M${fmt(n(attrs.x1))} ${fmt(n(attrs.y1))}L${fmt(n(attrs.x2))} ${fmt(n(attrs.y2))}`;
    case "polyline":
    case "polygon": {
      const points = String(attrs.points).trim().split(/[\s,]+/).map(Number);
      let d = "";
      for (let index = 0; index + 1 < points.length; index += 2) d += `${index === 0 ? "M" : "L"}${fmt(points[index]!)} ${fmt(points[index + 1]!)}`;
      return tag === "polygon" ? `${d}z` : d;
    }
    case "rect": {
      const x = n(attrs.x), y = n(attrs.y), w = n(attrs.width), h = n(attrs.height);
      const r = Math.min(n(attrs.rx ?? attrs.ry), w / 2, h / 2);
      if (!r) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
      return `M${fmt(x + r)} ${fmt(y)}h${fmt(w - 2 * r)}a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} ${fmt(r)}v${fmt(h - 2 * r)}a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(-r)} ${fmt(r)}h${fmt(-(w - 2 * r))}a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(-r)} ${fmt(-r)}v${fmt(-(h - 2 * r))}a${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} ${fmt(-r)}z`;
    }
    default: return undefined;
  }
}

const icons: Record<string, { d: string[]; t: string[] }> = {};
for (const name of Object.keys(nodes).sort()) {
  const d = nodes[name]!.map(toPath).filter((value): value is string => Boolean(value));
  if (d.length) icons[name] = { d, t: tags[name] ?? [] };
}
await writeFile(path.join(root, "assets/icons/lucide.json"), `${JSON.stringify({ set: "lucide", version, license: "ISC", viewBox: 24, stroke: 2, icons })}\n`);
process.stdout.write(`Wrote ${Object.keys(icons).length} icons.\n`);
