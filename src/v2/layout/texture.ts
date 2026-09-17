import { TEXTURE_PRIMITIVES, type TexturePrimitive } from "../ir/design.js";
import type { TextureNode } from "../ir/compose.js";
import type { ColorRef, Rect, SceneElement, ShapeElement, TextElement } from "../ir/scene.js";
import { resolveColor, roleColor, type ThemeSpec } from "../tokens/compile.js";
import type { TextEngine } from "../text/measure.js";
import { PT, rect } from "./geometry.js";
import type { Ground } from "./style.js";

/**
 * Texture primitives: decorative marks drawn from the model's tokens.
 *
 * The model decides the idea ("a 0.5 pt signal rule in the left margin of
 * every evidence slide") as a rule in its design language; this module only
 * draws it. Every element is marked decorative, so it stays out of reading
 * order and alt-text checks.
 */

export interface TextureContext {
  theme: ThemeSpec;
  text: TextEngine;
  ground: Ground;
  page: Rect;
  slide: { index: number; count: number };
  idFor: (suffix: string) => string;
  provenance: SceneElement["provenance"];
}

type Params = Record<string, unknown>;

const number = (params: Params, key: string, fallback: number): number => typeof params[key] === "number" ? params[key] as number : fallback;
const string = (params: Params, key: string, fallback: string): string => typeof params[key] === "string" ? params[key] as string : fallback;

export function buildTexture(node: TextureNode, frame: Rect, context: TextureContext): { elements: SceneElement[]; error?: string } {
  const theme = context.theme;
  const rule = theme.texture.find((candidate) => candidate.id === node.rule);
  const primitive = (rule?.primitive ?? node.rule) as TexturePrimitive;
  if (!(TEXTURE_PRIMITIVES as readonly string[]).includes(primitive)) {
    return { elements: [], error: `No texture rule or primitive "${node.rule}". Primitives: ${TEXTURE_PRIMITIVES.join(", ")}.` };
  }
  const params: Params = { ...(rule?.params ?? {}), ...(node.params ?? {}) };
  const color = (key: string, fallback: ColorRef): ColorRef => {
    const reference = params[key];
    return typeof reference === "string" ? resolveColor(reference, theme) ?? fallback : fallback;
  };
  const ruleColor = roleColor(theme.roleNames.rule ? "rule" : "muted", theme);
  const accent = roleColor("accent", theme);
  const elements: SceneElement[] = [];
  let counter = 0;
  const shape = (frameRect: Rect, style: ShapeElement["style"]): void => {
    counter += 1;
    elements.push({ kind: "shape", id: context.idFor(`${primitive}-${counter}`), role: "decorative", decorative: true, frame: frameRect, z: 0, style, provenance: context.provenance });
  };
  const weight = number(params, "weight", 0.75) * PT;
  const margin = theme.space.margin;

  switch (primitive) {
    case "hairline": {
      const position = string(params, "position", "top");
      const y = position === "bottom" ? frame.y + frame.h - weight : position === "center" ? frame.y + frame.h / 2 : frame.y;
      shape(rect(frame.x, y, frame.w, weight), { preset: "rect", fill: color("tone", ruleColor) });
      break;
    }
    case "margin-rule": {
      const side = string(params, "side", "left");
      const x = side === "right" ? context.page.w - margin / 2 : margin / 2;
      const inset = number(params, "inset", 0) * PT;
      shape(rect(x - weight / 2, margin + inset, weight, context.page.h - margin * 2 - inset * 2), { preset: "rect", fill: color("tone", accent) });
      break;
    }
    case "underline": {
      const width = number(params, "width", 36) * PT;
      const thickness = number(params, "weight", 3) * PT;
      shape(rect(frame.x, frame.y + frame.h - thickness, Math.min(width, frame.w), thickness), { preset: "rect", fill: color("tone", accent) });
      break;
    }
    case "corner-ticks": {
      const size = number(params, "size", 14) * PT;
      const tone = color("tone", ruleColor);
      for (const [x, y] of [[frame.x, frame.y], [frame.x + frame.w, frame.y], [frame.x, frame.y + frame.h], [frame.x + frame.w, frame.y + frame.h]] as const) {
        const left = x > frame.x ? x - size : x;
        const top = y > frame.y ? y - size : y;
        shape(rect(left, y > frame.y ? y - weight : y, size, weight), { preset: "rect", fill: tone });
        shape(rect(x > frame.x ? x - weight : x, top, weight, size), { preset: "rect", fill: tone });
      }
      break;
    }
    case "band": {
      const position = string(params, "position", "top");
      const height = number(params, "height", 8) * PT;
      const target = position === "left" || position === "right"
        ? rect(position === "left" ? frame.x : frame.x + frame.w - height, frame.y, height, frame.h)
        : rect(frame.x, position === "bottom" ? frame.y + frame.h - height : frame.y, frame.w, height);
      shape(target, { preset: "rect", fill: color("tone", accent) });
      break;
    }
    case "dot-grid":
    case "line-grid": {
      const spacing = Math.max(8, number(params, "spacing", 24)) * PT;
      const tone = color("tone", ruleColor);
      const opacity = number(params, "opacity", 0.5);
      const columns = Math.min(80, Math.floor(frame.w / spacing));
      const rows = Math.min(60, Math.floor(frame.h / spacing));
      if (primitive === "dot-grid") {
        const size = number(params, "size", 1.5) * PT;
        for (let row = 0; row <= rows && elements.length < 900; row += 1) {
          for (let column = 0; column <= columns && elements.length < 900; column += 1) {
            shape(rect(frame.x + column * spacing - size / 2, frame.y + row * spacing - size / 2, size, size), { preset: "ellipse", fill: tone, opacity });
          }
        }
      } else {
        for (let column = 0; column <= columns; column += 1) shape(rect(frame.x + column * spacing, frame.y, weight, frame.h), { preset: "rect", fill: tone, opacity });
        for (let row = 0; row <= rows; row += 1) shape(rect(frame.x, frame.y + row * spacing, frame.w, weight), { preset: "rect", fill: tone, opacity });
      }
      break;
    }
    case "bracket-frame": {
      const arm = number(params, "arm", 18) * PT;
      const tone = color("tone", ruleColor);
      const thick = Math.max(weight, 1.5 * PT);
      shape(rect(frame.x, frame.y, thick, frame.h), { preset: "rect", fill: tone });
      shape(rect(frame.x, frame.y, arm, thick), { preset: "rect", fill: tone });
      shape(rect(frame.x, frame.y + frame.h - thick, arm, thick), { preset: "rect", fill: tone });
      shape(rect(frame.x + frame.w - thick, frame.y, thick, frame.h), { preset: "rect", fill: tone });
      shape(rect(frame.x + frame.w - arm, frame.y, arm, thick), { preset: "rect", fill: tone });
      shape(rect(frame.x + frame.w - arm, frame.y + frame.h - thick, arm, thick), { preset: "rect", fill: tone });
      break;
    }
    case "frame": {
      const inset = number(params, "inset", 12) * PT;
      shape(rect(frame.x + inset, frame.y + inset, frame.w - inset * 2, frame.h - inset * 2), { preset: "rect", stroke: color("tone", ruleColor), strokeWidth: Math.max(0.5, number(params, "weight", 0.75)) });
      break;
    }
    case "numbered-margin":
    case "large-numeral": {
      const value = typeof params.text === "string" ? params.text : String(context.slide.index + 1).padStart(primitive === "numbered-margin" ? 2 : 1, "0");
      const size = number(params, "size", primitive === "numbered-margin" ? theme.sizes.label : 160);
      const tone = color("tone", primitive === "numbered-margin" ? roleColor("muted", theme) : roleColor("surface", theme));
      const face = theme.fonts.display.regular;
      const width = context.text.width(value, face, size) + 0.05;
      const height = (size * 1.05) / 72;
      const anchor = string(params, "anchor", primitive === "numbered-margin" ? "top-left" : "bottom-right");
      const area = primitive === "numbered-margin" ? rect(margin * 0.25, margin, Math.max(width, margin * 0.7), height) : frame;
      const x = /right/.test(anchor) ? area.x + area.w - width : area.x;
      const y = /bottom/.test(anchor) ? area.y + area.h - height : area.y;
      counter += 1;
      const element: TextElement = {
        kind: "text",
        id: context.idFor(`${primitive}-${counter}`),
        role: "decorative",
        decorative: true,
        typeRole: "display",
        frame: rect(x, y, width, height),
        z: 0,
        paragraphs: [{ runs: [{ text: value }] }],
        style: { font: face.typeface, fontRole: "display", size, bold: face.bold, italic: false, color: tone, align: "left", valign: "top", leading: 1, inset: [0, 0, 0, 0] },
        provenance: context.provenance,
        fit: { status: "fit", steps: ["measure"] },
      };
      elements.push(element);
      break;
    }
    case "path-marks": {
      const count = Math.max(2, Math.min(40, number(params, "count", 7)));
      const size = number(params, "size", 6) * PT;
      const preset = string(params, "shape", "ellipse");
      const vertical = string(params, "direction", "horizontal") === "vertical";
      for (let index = 0; index < count; index += 1) {
        const t = count === 1 ? 0.5 : index / (count - 1);
        const cx = vertical ? frame.x + frame.w / 2 : frame.x + t * frame.w;
        const cy = vertical ? frame.y + t * frame.h : frame.y + frame.h / 2;
        shape(rect(cx - size / 2, cy - size / 2, size, size), { preset, fill: color("tone", accent) });
      }
      break;
    }
    case "gradient-wash": {
      const from = color("from", roleColor("background", theme));
      const to = color("to", accent);
      shape(frame, { preset: "rect", gradient: { from, to, angle: number(params, "angle", 90), toAlpha: number(params, "opacity", 0.35) } });
      break;
    }
    case "paper-tone": {
      shape(context.page, { preset: "rect", fill: color("tone", roleColor("surface", theme)) });
      break;
    }
    case "image-mask": {
      // An image clipped to a shape is authored as an image node with a radius or
      // a shape layer; as a texture it draws the mask outline the image sits in.
      shape(frame, { preset: string(params, "shape", "ellipse"), stroke: color("tone", ruleColor), strokeWidth: 0.75 });
      break;
    }
  }
  return { elements };
}
