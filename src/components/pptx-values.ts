import * as PptxModule from "pptxgenjs";

export interface NativeSlide {
  background: { color: string };
  addText(text: string | Array<Record<string, unknown>>, options?: Record<string, unknown>): NativeSlide;
  addShape(shape: string, options?: Record<string, unknown>): NativeSlide;
  addImage(options: Record<string, unknown>): NativeSlide;
  addTable(rows: unknown[][], options?: Record<string, unknown>): NativeSlide;
  addChart(type: string, data: Array<Record<string, unknown>>, options?: Record<string, unknown>): NativeSlide;
  addNotes(notes: string): NativeSlide;
}

export interface NativePresentation {
  layout: string;
  author: string;
  company: string;
  revision: string;
  subject: string;
  title: string;
  theme: { headFontFace?: string; bodyFontFace?: string };
  defineLayout(layout: { name: string; width: number; height: number }): void;
  addSlide(options?: Record<string, unknown>): NativeSlide;
  writeFile(options?: { fileName?: string; compression?: boolean }): Promise<string>;
}

interface NativePresentationConstructor {
  new (): NativePresentation;
}

function resolveConstructor(moduleValue: unknown): NativePresentationConstructor {
  let current = moduleValue;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === "function") return current as NativePresentationConstructor;
    if (!current || typeof current !== "object" || !("default" in current)) break;
    current = (current as { default: unknown }).default;
  }
  throw new TypeError("Unable to resolve the PptxGenJS constructor from the installed module.");
}

export const PptxGenJS = resolveConstructor(PptxModule);

export const Shapes = {
  rect: "rect",
  roundRect: "roundRect",
  ellipse: "ellipse",
  line: "line",
  chevron: "chevron",
} as const;

export type ShapeValue = (typeof Shapes)[keyof typeof Shapes];

export const ChartTypes = {
  bar: "bar",
  line: "line",
  pie: "pie",
  area: "area",
} as const;
