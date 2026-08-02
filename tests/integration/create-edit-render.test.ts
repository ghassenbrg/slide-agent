import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";

import { PptxEditor } from "../../src/editing/pptx-editor.js";
import { PptxInspector } from "../../src/editing/pptx-inspector.js";
import { SlideAgent } from "../../src/pipeline.js";
import { PresentationRenderer } from "../../src/rendering/renderer.js";
import { readSceneNdjson } from "../../src/serialization/scene-ndjson.js";
import { silentLogger } from "../../src/logging/logger.js";
import type { PresentationOutline } from "../../src/types/index.js";
import { findExecutable } from "../../src/utils/process.js";
import { PackageValidator } from "../../src/validation/package-validator.js";
import { outputLayout } from "../../src/output/output-layout.js";

let workspace: string;
const root = path.resolve(import.meta.dirname, "../..");
const source = () => path.join(workspace, "source.pptx");
const rendererAvailable = Boolean(
  await findExecutable(["soffice", "libreoffice"], process.env.SLIDE_AGENT_SOFFICE)
  && await findExecutable(["pdftoppm"], process.env.SLIDE_AGENT_PDFTOPPM),
);

const outline: PresentationOutline = {
  brief: {
    title: "Integration test deck",
    audience: "Reviewers",
    objective: "Verify the complete generation workflow",
    presentationType: "technical",
    tone: "precise",
    visualDirection: "editorial",
    slideCount: 6,
    language: "English",
    outputRequirements: ["editable PowerPoint"],
    keyTopics: ["workflow"],
    sourcePrompt: "integration test",
  },
  narrative: "Create, inspect, edit, render.",
  slides: [
    { id: "title", kind: "title", title: "Integration test deck", subtitle: "Editable and verifiable", sectionLabel: "TEST" },
    { id: "compare", kind: "comparison", title: "Native elements remain editable", comparison: [{ heading: "Before", points: ["No deck"] }, { heading: "After", points: ["Editable PPTX"], emphasis: true }], speakerNotes: ["Preserve this note when cloning the slide."] },
    { id: "image", kind: "text-image", title: "Images stay replaceable", body: "The picture is a native image relationship.", visual: { path: "", alt: "Integration fixture", position: "right" } },
    { id: "chart", kind: "chart", title: "Chart data is stored as native PowerPoint data", body: "The test creates a real bar chart.", chart: { kind: "bar", labels: ["A", "B", "C"], series: [{ name: "Value", values: [2, 5, 8] }], showValues: true } },
    { id: "table", kind: "table", title: "Table cells remain editable", table: { headers: ["Metric", "Value"], rows: [["ARR", "$12M"], ["NRR", "112%"]] } },
    { id: "closing", kind: "closing", title: "The workflow is ready for extension integration", subtitle: "All outputs are structured.", bullets: ["Inspect", "Validate", "Return artifacts"] },
  ],
};

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-test-"));
  const imagePath = path.join(workspace, "source.png");
  await writeFile(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  outline.slides[2]!.visual!.path = imagePath;
});
afterAll(async () => { await rm(workspace, { recursive: true, force: true }); });

describe("create, edit, and render integration", () => {
  it("creates a valid editable PPTX", async () => {
    const result = await new SlideAgent(silentLogger).create({
      command: "create",
      outline,
      output: source(),
      configDir: path.join(root, "config"),
      validate: true,
      autoFix: true,
    });
    expect(result.status).not.toBe("error");
    expect(result.validation?.render?.status).toBe("skipped");
    expect(result.slideCount).toBe(6);
    expect((await stat(source())).size).toBeGreaterThan(20_000);
    const blueprint = await readSceneNdjson(outputLayout(source()).inspect);
    expect(blueprint.slides).toHaveLength(6);
    expect(blueprint.creativeDirection?.palette).toBeTruthy();
    const inspection = await new PptxInspector().inspect(source());
    expect(inspection.manifest.slides).toHaveLength(6);
    expect(inspection.manifest.slides[0]!.title).toContain("Integration test deck");

    const zip = await JSZip.loadAsync(await readFile(source()));
    expect(Object.values(zip.files).filter((entry) => entry.dir)).toHaveLength(0);
    expect(zip.file("ppt/theme/theme2.xml")).toBeTruthy();
    expect(await zip.file("ppt/notesMasters/_rels/notesMaster1.xml.rels")!.async("string")).toContain("../theme/theme2.xml");
    expect(await zip.file("ppt/notesMasters/notesMaster1.xml")!.async("string")).not.toContain("Header Placeholder");
    const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
    expect(contentTypes).not.toContain("slideMaster2.xml");
    expect(contentTypes).toContain("/ppt/theme/theme2.xml");
    expect((await new PackageValidator().validate(source())).issues).toEqual([]);
    expect(result.primaryOutput).toBe(path.resolve(source()));
    expect(result.artifacts).toContain(outputLayout(source()).inspect);
  });

  it("rejects missing content-type parts instead of relying on ZIP integrity", async () => {
    const corruptPath = path.join(workspace, "phantom-part.pptx");
    const zip = await JSZip.loadAsync(await readFile(source()));
    const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
    zip.file("[Content_Types].xml", contentTypes.replace(
      "</Types>",
      '<Override PartName="/ppt/slideMasters/slideMaster999.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/></Types>',
    ));
    await writeFile(corruptPath, await zip.generateAsync({ type: "nodebuffer" }));
    const result = await new PackageValidator().validate(corruptPath);
    expect(result.issues.some((entry) => entry.code === "content-type-missing-part")).toBe(true);
  });

  it("preserves the source while editing text and slide order", async () => {
    const output = path.join(workspace, "edited.pptx");
    const edited = await new PptxEditor().edit(source(), output, [
      { type: "replace-text", find: "Integration", replace: "Extension", replaceAll: true },
      { type: "duplicate-slide", slide: 2, insertAt: 3, replacements: [{ find: "Before", replace: "Original" }] },
    ]);
    expect(edited.slideCount).toBe(7);
    expect((await stat(source())).size).toBeGreaterThan(20_000);
    const inspection = await new PptxInspector().inspect(output);
    expect(inspection.manifest.slides).toHaveLength(7);
    expect(inspection.manifest.slides[0]!.title).toContain("Extension");
    expect(inspection.manifest.slides[2]!.notes.join(" ")).toContain("Preserve this note");
    expect(inspection.manifest.slides[2]!.elements.find((element) => element.name === "slide-number")?.text).toBe("03");
    expect(inspection.manifest.slides[6]!.elements.find((element) => element.name === "slide-number")?.text).toBeUndefined();
  });

  it("updates native images, tables, chart caches, and the embedded chart workbook", async () => {
    const replacement = path.join(workspace, "replacement.png");
    await writeFile(replacement, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8zwAAAgEBAScY42YAAAAASUVORK5CYII=", "base64"));
    const output = path.join(workspace, "data-edited.pptx");
    await new PptxEditor().edit(source(), output, [
      { type: "replace-image", slide: 3, imagePath: replacement },
      { type: "update-chart", slide: 4, labels: ["North", "South", "West", "East"], series: [{ name: "Updated", values: [21, 34, 55, 89] }] },
      { type: "update-table", slide: 5, rows: [["Metric", "Value"], ["ARR", "$18M"], ["NRR", "118%"]] },
    ]);

    const inspection = await new PptxInspector().inspect(output);
    const chart = inspection.manifest.slides[3]!.elements.find((element) => element.type === "chart")?.metadata?.chart as { labels: string[]; series: Array<{ values: number[] }> };
    expect(chart.labels).toEqual(["North", "South", "West", "East"]);
    expect(chart.series[0]!.values).toEqual([21, 34, 55, 89]);

    const zip = await JSZip.loadAsync(await readFile(output));
    expect(Object.keys(zip.files).filter((name) => /^ppt\/media\/[^/]+$/.test(name)).length).toBeGreaterThanOrEqual(2);
    expect(await zip.file("ppt/slides/slide5.xml")!.async("string")).toContain("$18M");
    const workbookPath = Object.keys(zip.files).find((name) => /^ppt\/embeddings\/.*\.xlsx$/i.test(name));
    expect(workbookPath).toBeTruthy();
    const workbook = await JSZip.loadAsync(await zip.file(workbookPath!)!.async("nodebuffer"));
    const worksheetPath = Object.keys(workbook.files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    expect(await workbook.file(worksheetPath!)!.async("string")).toContain("<v>89</v>");
  });

  it("validates through the structured API without rendering", async () => {
    const report = path.join(workspace, "source.validation.json");
    const result = await new SlideAgent(silentLogger).validate({
      command: "validate",
      input: source(),
      report,
      configDir: path.join(root, "config"),
      render: false,
    });
    expect(result.status).not.toBe("error");
    expect(result.generatedFiles).toContain(path.resolve(report));
    expect(result.validation?.render?.status).toBe("skipped");
  });

  it.runIf(rendererAvailable)("renders every slide to a non-empty PNG", async () => {
    const rendered = await new PresentationRenderer(silentLogger).render(source(), path.join(workspace, "previews"), { width: 800, height: 450 });
    expect(rendered.previewFiles).toHaveLength(6);
    expect((await stat(rendered.previewFiles[0]!)).size).toBeGreaterThan(1_000);
  });
});
