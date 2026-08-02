import path from "node:path";

import { PptxGenJS, Shapes } from "../src/components/pptx-values.js";
import type { DeckManifest } from "../src/types/index.js";
import { writeJson } from "../src/utils/files.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "tests", "fixtures", "invalid-layout.pptx");
const presentation = new PptxGenJS();
presentation.defineLayout({ name: "SLIDE_AGENT_WIDE", width: 13.333333, height: 7.5 });
presentation.layout = "SLIDE_AGENT_WIDE";
presentation.title = "Intentional validation failures";
presentation.author = "Slide Agent";
presentation.company = "Slide Agent";
presentation.subject = "Test fixture";
presentation.revision = "1";
presentation.theme = { headFontFace: "Aptos Display", bodyFontFace: "Aptos" };
const slide = presentation.addSlide();
slide.background = { color: "FFFFFF" };
slide.addText("Crowded title", { x: 0.5, y: 0.3, w: 6, h: 0.3, fontSize: 12, objectName: "Title" });
slide.addText("This text intentionally overlaps another text box and extends outside the slide.", { x: 11.9, y: 7.05, w: 1.8, h: 0.28, fontSize: 10, objectName: "Overflowing text" });
slide.addText("Second overlapping box", { x: 12.05, y: 7.08, w: 1.5, h: 0.24, fontSize: 9, objectName: "Overlap" });
slide.addShape(Shapes.rect, { x: -0.4, y: 2, w: 1.2, h: 1, fill: { color: "EEEEEE" }, objectName: "Outside shape" });
slide.addShape(Shapes.rect, { x: 3, y: 4, w: 1, h: 0.5, fill: { color: "EEEEEE" }, objectName: "Align item 1" });
slide.addShape(Shapes.rect, { x: 5, y: 4, w: 1, h: 0.5, fill: { color: "EEEEEE" }, objectName: "Align item 2" });
slide.addShape(Shapes.rect, { x: 7, y: 4.22, w: 1, h: 0.5, fill: { color: "EEEEEE" }, objectName: "Align item 3" });
await presentation.writeFile({ fileName: output, compression: true });

const manifest: DeckManifest = {
  schemaVersion: "1.0",
  presentationTitle: "Intentional validation failures",
  width: 13.333333,
  height: 7.5,
  createdAt: new Date().toISOString(),
  slides: [{
    number: 1,
    id: "invalid-slide",
    title: "Crowded title",
    kind: "custom",
    notes: [],
    elements: [
      { id: "title", name: "Title", type: "text", role: "title", x: 0.5, y: 0.3, w: 6, h: 0.3, text: "Crowded title", fontSize: 12, fontFace: "Unsupported Sans", textColor: "CCCCCC", fillColor: "FFFFFF" },
      { id: "overflow", name: "Overflowing text", type: "text", role: "body", x: 11.9, y: 7.05, w: 1.8, h: 0.28, text: "This text intentionally overlaps another text box and extends outside the slide.", fontSize: 10, fontFace: "Aptos", textColor: "152231", fillColor: "FFFFFF" },
      { id: "overlap", name: "Overlap", type: "text", role: "body", x: 12.05, y: 7.08, w: 1.5, h: 0.24, text: "Second overlapping box", fontSize: 9, fontFace: "Aptos", textColor: "152231", fillColor: "FFFFFF" },
      { id: "outside", name: "Outside shape", type: "shape", role: "shape", x: -0.4, y: 2, w: 1.2, h: 1, fillColor: "EEEEEE" },
      { id: "missing", name: "Missing image", type: "image", role: "image", x: 2, y: 2, w: 2, h: 2, imagePath: path.join(root, "tests", "fixtures", "missing.png") },
      { id: "align-1", name: "Align item 1", type: "shape", role: "shape", x: 3, y: 4, w: 1, h: 0.5, fillColor: "EEEEEE" },
      { id: "align-2", name: "Align item 2", type: "shape", role: "shape", x: 5, y: 4, w: 1, h: 0.5, fillColor: "EEEEEE" },
      { id: "align-3", name: "Align item 3", type: "shape", role: "shape", x: 7, y: 4.22, w: 1, h: 0.5, fillColor: "EEEEEE" },
    ],
  }],
};
await writeJson(`${output}.manifest.json`, manifest);
process.stdout.write(`${output}\n`);
