import { layoutGraph } from "../../design/graph-layout.js";
import { flatten, pathCrossings, routeConnector } from "../../design/routing.js";
import type { DiagramNode } from "../ir/compose.js";
import type { Finding } from "../ir/issues.js";
import type { ConnectorElement, Rect, SceneElement, ShapeElement, TextElement } from "../ir/scene.js";
import { roleColor, type ThemeSpec } from "../tokens/compile.js";
import type { TextEngine } from "../text/measure.js";
import { parseRichText } from "../text/rich.js";
import { rect } from "./geometry.js";
import type { Ground } from "./style.js";

/**
 * Diagrams: the model chooses the grammar, the nodes, the edges, and what to
 * emphasise; this module places nodes (V1's layered layout), routes edges
 * around them, and draws each node in the deck's own tokens.
 */

export interface DiagramContext {
  theme: ThemeSpec;
  text: TextEngine;
  ground: Ground;
  idFor: (suffix: string) => string;
  provenance: SceneElement["provenance"];
  page: Rect;
}

export function buildDiagram(node: DiagramNode, frame: Rect, context: DiagramContext): { elements: SceneElement[]; findings: Finding[] } {
  const { theme } = context;
  const findings: Finding[] = [];
  const elements: SceneElement[] = [];
  const nodes = (node.nodes ?? []).filter((item) => item && typeof item.id === "string");
  if (nodes.length === 0) return { elements, findings: [{ code: "diagram-empty", severity: "blocking", tier: "T0", message: "A diagram needs at least one node.", path: node.ptr }] };
  const ids = new Set(nodes.map((item) => item.id));
  const edges = (node.edges ?? []).filter((edge) => {
    const known = ids.has(edge.from) && ids.has(edge.to);
    if (!known) findings.push({ code: "diagram-edge-unknown", severity: "blocking", tier: "T0", message: `Edge ${edge.from} → ${edge.to} names a node that does not exist.`, path: node.ptr });
    return known;
  });

  const direction = node.direction ?? (node.grammar === "hierarchy" ? "down" : "right");
  const labelSize = Math.max(theme.floors.h3, Math.min(theme.sizes.h3, 20));
  const detailSize = Math.max(theme.floors.small, theme.sizes.small);
  const pad = theme.space.unit / 72;
  const face = theme.fonts.body.bold;
  const detailFace = theme.fonts.body.regular;

  let placed: Array<{ id: string; x: number; y: number; w: number; h: number }>;
  if (node.grammar === "cycle") {
    const radiusX = frame.w / 2 - frame.w * 0.12;
    const radiusY = frame.h / 2 - frame.h * 0.14;
    const w = Math.min(2.2, frame.w * 0.22);
    const h = Math.min(1.1, frame.h * 0.22);
    placed = nodes.map((item, index) => {
      const angle = -Math.PI / 2 + (index / nodes.length) * Math.PI * 2;
      return { id: item.id, x: frame.x + frame.w / 2 + Math.cos(angle) * radiusX - w / 2, y: frame.y + frame.h / 2 + Math.sin(angle) * radiusY - h / 2, w, h };
    });
  } else if (node.grammar === "swimlane") {
    const lanes = [...new Set(nodes.map((item) => item.lane ?? item.group ?? "default"))];
    const laneHeight = frame.h / lanes.length;
    const graph = layoutGraph({ nodes: nodes.map((item) => ({ id: item.id })), edges, direction: "right", frame, nodeHeight: Math.min(0.9, laneHeight * 0.7) });
    placed = graph.nodes.map((item) => {
      const source = nodes.find((candidate) => candidate.id === item.id)!;
      const lane = lanes.indexOf(source.lane ?? source.group ?? "default");
      return { id: item.id, x: item.x, y: frame.y + lane * laneHeight + (laneHeight - item.h) / 2, w: item.w, h: item.h };
    });
    lanes.forEach((lane, index) => {
      if (lanes.length > 1) {
        elements.push({ kind: "shape", id: context.idFor(`lane-${index + 1}`), role: "decorative", decorative: true, frame: rect(frame.x, frame.y + index * laneHeight, frame.w, laneHeight), z: 0, style: { preset: "rect", ...(index % 2 === 0 ? { fill: roleColor("surface", theme) } : {}) }, provenance: context.provenance });
        elements.push(textElement(context, `lane-label-${index + 1}`, lane, rect(frame.x + pad, frame.y + index * laneHeight + pad / 2, 1.6, (detailSize * 1.3) / 72), detailSize, detailFace, "muted"));
      }
    });
  } else {
    const count = nodes.length;
    const maxRanks = direction === "right" ? Math.max(1, Math.ceil(Math.sqrt(count))) : count;
    const nodeWidth = direction === "right" ? Math.min(2.4, (frame.w / Math.max(2, Math.min(count, maxRanks + 2))) * 0.8) : Math.min(2.4, frame.w / Math.max(2, count) * 0.85);
    const graph = layoutGraph({
      nodes: nodes.map((item) => ({ id: item.id })),
      edges,
      direction,
      frame,
      nodeWidth,
      nodeHeight: Math.min(1.1, frame.h * 0.3),
    });
    placed = graph.nodes.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h }));
  }

  const boxes = new Map(placed.map((item) => [item.id, item]));
  const radius = theme.shape.radius;
  for (const item of nodes) {
    const box = boxes.get(item.id);
    if (!box) continue;
    const emphasised = Boolean(item.emphasis);
    const fill = emphasised ? roleColor("accent", theme) : roleColor("surface", theme);
    const shape: ShapeElement = {
      kind: "shape",
      id: context.idFor(`node-${item.id}`),
      role: "container",
      frame: rect(box.x, box.y, box.w, box.h),
      z: 0,
      style: { preset: radius > 0 ? "roundRect" : "rect", fill, ...(radius ? { radius } : {}), ...(theme.shape.stroke > 0 ? { stroke: roleColor(theme.roleNames.rule ? "rule" : "muted", theme), strokeWidth: theme.shape.stroke } : {}) },
      provenance: context.provenance,
    };
    elements.push(shape);
    const textTone = emphasised ? "background" : "text";
    const labelHeight = context.text.layout({ paragraphs: parseRichText(item.label), size: labelSize, leading: 1.1, width: box.w - pad * 2, faceFor: () => face }).height;
    const detailHeight = item.detail ? context.text.layout({ paragraphs: parseRichText(item.detail), size: detailSize, leading: 1.2, width: box.w - pad * 2, faceFor: () => detailFace }).height : 0;
    const total = labelHeight + (item.detail ? detailHeight + pad / 2 : 0);
    if (total > box.h - pad) {
      findings.push({ code: "text-overflow", severity: "blocking", tier: "T1", message: `Diagram node "${item.id}" label does not fit its box.`, path: node.ptr, element: shape.id, hint: "Shorten the label or give the diagram more room." });
    }
    const top = box.y + Math.max(pad / 2, (box.h - total) / 2);
    elements.push(textElement(context, `node-${item.id}-label`, item.label, rect(box.x + pad, top, box.w - pad * 2, labelHeight), labelSize, face, textTone, "center"));
    if (item.detail) elements.push(textElement(context, `node-${item.id}-detail`, item.detail, rect(box.x + pad, top + labelHeight + pad / 2, box.w - pad * 2, detailHeight), detailSize, detailFace, emphasised ? "background" : "muted", "center"));
  }

  const obstacles = placed.map((item) => ({ id: item.id, box: { x: item.x, y: item.y, w: item.w, h: item.h } }));
  edges.forEach((edge, index) => {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (!from || !to) return;
    const routed = routeConnector({
      from,
      to,
      kind: node.grammar === "cycle" ? "straight" : "elbow",
      obstacles: obstacles.filter((obstacle) => obstacle.id !== edge.from && obstacle.id !== edge.to),
      bounds: context.page,
    });
    const points = flatten(routed.segments, 8);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const connector: ConnectorElement = {
      kind: "connector",
      id: context.idFor(`edge-${index + 1}`),
      role: "connector",
      frame: rect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
      z: 0,
      points,
      style: { preset: "line", stroke: roleColor("muted", theme), strokeWidth: 1.25, arrowEnd: true },
      from: edge.from,
      to: edge.to,
      provenance: context.provenance,
      decorative: true,
    };
    elements.push(connector);
    const crossed = pathCrossings(points, obstacles.filter((obstacle) => obstacle.id !== edge.from && obstacle.id !== edge.to));
    if (crossed.length > 0) findings.push({ code: "connector-through-node", severity: "minor", tier: "T3", message: `Edge ${edge.from} → ${edge.to} passes through ${crossed.join(", ")}.`, path: node.ptr, element: connector.id });
    if (edge.label) {
      const middle = points[Math.floor(points.length / 2)]!;
      elements.push(textElement(context, `edge-${index + 1}-label`, edge.label, rect(middle.x - 0.8, middle.y - 0.28, 1.6, (detailSize * 1.25) / 72), detailSize, detailFace, "muted", "center"));
    }
  });
  return { elements, findings };
}

function textElement(
  context: DiagramContext,
  suffix: string,
  text: string,
  frame: Rect,
  size: number,
  face: { typeface: string; bold: boolean },
  tone: "text" | "muted" | "background",
  align: "left" | "center" = "left",
): TextElement {
  return {
    kind: "text",
    id: context.idFor(suffix),
    role: "label",
    typeRole: "label",
    frame,
    z: 0,
    paragraphs: parseRichText(text).map((paragraph) => ({ runs: paragraph.runs.map((run) => ({ text: run.text, ...(run.bold ? { bold: true } : {}) })) })),
    style: { font: face.typeface, fontRole: "body", size, bold: face.bold, italic: false, color: roleColor(tone, context.theme), align, valign: "top", leading: 1.15, inset: [0, 0, 0, 0] },
    provenance: context.provenance,
    fit: { status: "fit", steps: ["measure"] },
  };
}
