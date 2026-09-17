/**
 * SVG path data → DrawingML custom geometry (`a:custGeom`).
 *
 * Supports every SVG path command. Arcs become cubic Béziers; smooth curves get
 * their reflected control points. The result is native, recolourable, editable
 * geometry — the way icons stay part of the deck instead of pictures of it.
 */

export interface PathPoint {
  x: number;
  y: number;
}

export type PathCommand =
  | { op: "M"; to: PathPoint }
  | { op: "L"; to: PathPoint }
  | { op: "C"; c1: PathPoint; c2: PathPoint; to: PathPoint }
  | { op: "Q"; c: PathPoint; to: PathPoint }
  | { op: "Z" };

/**
 * Commands and numbers in order. Inside an arc, the two flag arguments are
 * single characters and may be written without separators ("a1 1 0 01 2 2").
 */
function tokenize(d: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const number = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/;
  let position = 0;
  let arc = false;
  let argument = 0;
  while (position < d.length) {
    const character = d[position]!;
    if (/[\s,]/.test(character)) {
      position += 1;
      continue;
    }
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(character)) {
      tokens.push(character);
      arc = character === "A" || character === "a";
      argument = 0;
      position += 1;
      continue;
    }
    if (arc && (argument % 7 === 3 || argument % 7 === 4) && (character === "0" || character === "1")) {
      tokens.push(Number(character));
      argument += 1;
      position += 1;
      continue;
    }
    const match = number.exec(d.slice(position));
    if (!match) {
      position += 1;
      continue;
    }
    tokens.push(Number(match[0]));
    argument += 1;
    position += match[0].length;
  }
  return tokens;
}

export function parsePath(d: string): PathCommand[] {
  const tokens = tokenize(d);
  const commands: PathCommand[] = [];
  let index = 0;
  let current: PathPoint = { x: 0, y: 0 };
  let start: PathPoint = { x: 0, y: 0 };
  let lastCubic: PathPoint | undefined;
  let lastQuad: PathPoint | undefined;
  let command = "";
  const next = (): number => {
    const value = tokens[index];
    index += 1;
    return typeof value === "number" ? value : 0;
  };
  const hasNumber = () => typeof tokens[index] === "number";

  while (index < tokens.length) {
    if (typeof tokens[index] === "string") {
      command = tokens[index] as string;
      index += 1;
    } else if (!command) {
      index += 1;
      continue;
    }
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    const point = (x: number, y: number): PathPoint => relative ? { x: current.x + x, y: current.y + y } : { x, y };
    switch (upper) {
      case "M": {
        const to = point(next(), next());
        commands.push({ op: "M", to });
        current = to;
        start = to;
        command = relative ? "l" : "L";
        lastCubic = lastQuad = undefined;
        break;
      }
      case "L": {
        const to = point(next(), next());
        commands.push({ op: "L", to });
        current = to;
        lastCubic = lastQuad = undefined;
        break;
      }
      case "H": {
        const value = next();
        const to = { x: relative ? current.x + value : value, y: current.y };
        commands.push({ op: "L", to });
        current = to;
        lastCubic = lastQuad = undefined;
        break;
      }
      case "V": {
        const value = next();
        const to = { x: current.x, y: relative ? current.y + value : value };
        commands.push({ op: "L", to });
        current = to;
        lastCubic = lastQuad = undefined;
        break;
      }
      case "C": {
        const c1 = point(next(), next());
        const c2 = point(next(), next());
        const to = point(next(), next());
        commands.push({ op: "C", c1, c2, to });
        lastCubic = c2;
        lastQuad = undefined;
        current = to;
        break;
      }
      case "S": {
        const c1 = lastCubic ? { x: 2 * current.x - lastCubic.x, y: 2 * current.y - lastCubic.y } : current;
        const c2 = point(next(), next());
        const to = point(next(), next());
        commands.push({ op: "C", c1, c2, to });
        lastCubic = c2;
        lastQuad = undefined;
        current = to;
        break;
      }
      case "Q": {
        const c = point(next(), next());
        const to = point(next(), next());
        commands.push({ op: "Q", c, to });
        lastQuad = c;
        lastCubic = undefined;
        current = to;
        break;
      }
      case "T": {
        const c = lastQuad ? { x: 2 * current.x - lastQuad.x, y: 2 * current.y - lastQuad.y } : current;
        const to = point(next(), next());
        commands.push({ op: "Q", c, to });
        lastQuad = c;
        lastCubic = undefined;
        current = to;
        break;
      }
      case "A": {
        const rx = Math.abs(next());
        const ry = Math.abs(next());
        const rotation = next();
        const large = next() !== 0;
        const sweep = next() !== 0;
        const to = point(next(), next());
        commands.push(...arcToCubics(current, to, rx, ry, rotation, large, sweep));
        current = to;
        lastCubic = lastQuad = undefined;
        break;
      }
      case "Z":
        commands.push({ op: "Z" });
        current = start;
        lastCubic = lastQuad = undefined;
        break;
      default:
        index += 1;
    }
    if (upper === "Z" && hasNumber()) command = relative ? "l" : "L";
  }
  return commands;
}

function arcToCubics(from: PathPoint, to: PathPoint, rxIn: number, ryIn: number, rotationDegrees: number, large: boolean, sweep: boolean): PathCommand[] {
  if ((from.x === to.x && from.y === to.y)) return [];
  if (rxIn === 0 || ryIn === 0) return [{ op: "L", to }];
  const phi = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let rx = rxIn;
  let ry = ryIn;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (coefficient * rx * y1) / ry;
  const cy1 = (-coefficient * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const length = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    const value = Math.acos(Math.max(-1, Math.min(1, dot / length)));
    return ux * vy - uy * vx < 0 ? -value : value;
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const commands: PathCommand[] = [];
  let theta = theta1;
  const pointAt = (t: number) => ({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos });
  const derivative = (t: number) => ({ x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos });
  for (let segment = 0; segment < segments; segment += 1) {
    const start = pointAt(theta);
    const end = segment === segments - 1 ? to : pointAt(theta + step);
    const d1 = derivative(theta);
    const d2 = derivative(theta + step);
    commands.push({ op: "C", c1: { x: start.x + k * d1.x, y: start.y + k * d1.y }, c2: { x: end.x - k * d2.x, y: end.y - k * d2.y }, to: end });
    theta += step;
  }
  return commands;
}

/**
 * `a:path` XML for paths in a `box`-sized coordinate space, scaled to integer
 * path units. `fill` false emits `fill="none"` for stroked icons.
 */
export function pathsToCustGeom(paths: Array<{ d: string; fill: boolean; stroke: boolean }>, box: { w: number; h: number }): string {
  const scale = 1000;
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));
  const pt = (point: PathPoint) => `<a:pt x="${Math.round(point.x * scale)}" y="${Math.round(point.y * scale)}"/>`;
  const body = paths.map((path) => {
    const commands = parsePath(path.d);
    const inner = commands.map((command) => {
      switch (command.op) {
        case "M": return `<a:moveTo>${pt(command.to)}</a:moveTo>`;
        case "L": return `<a:lnTo>${pt(command.to)}</a:lnTo>`;
        case "C": return `<a:cubicBezTo>${pt(command.c1)}${pt(command.c2)}${pt(command.to)}</a:cubicBezTo>`;
        case "Q": return `<a:quadBezTo>${pt(command.c)}${pt(command.to)}</a:quadBezTo>`;
        case "Z": return "<a:close/>";
      }
    }).join("");
    return `<a:path w="${w}" h="${h}"${path.fill ? "" : ' fill="none"'}${path.stroke ? "" : ' stroke="0"'}>${inner}</a:path>`;
  }).join("");
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>${body}</a:pathLst></a:custGeom>`;
}

/** Bounding box of a set of paths (control points included), for sizing. */
export function pathBoundsOf(d: string): { x: number; y: number; w: number; h: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const command of parsePath(d)) {
    if (command.op === "Z") continue;
    const points = command.op === "C" ? [command.c1, command.c2, command.to] : command.op === "Q" ? [command.c, command.to] : [command.to];
    for (const point of points) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
