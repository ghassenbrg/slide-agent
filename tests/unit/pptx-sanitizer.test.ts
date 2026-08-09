import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PptxSanitizer } from "../../src/export/pptx-sanitizer.js";
import { PackageValidator } from "../../src/validation/package-validator.js";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
<Override PartName="/ppt/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`;

// A paragraph whose pPr is re-emitted between runs, as PptxGenJS does for
// continued runs, plus an endParaRPr that is not the final child.
const SLIDE_WITH_BROKEN_PARAGRAPH = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>
<p:txBody><a:bodyPr/><a:lstStyle/>
<a:p><a:pPr algn="l"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>+18%</a:t></a:r><a:pPr algn="l"><a:buNone/></a:pPr><a:endParaRPr lang="en-US"/><a:r><a:rPr lang="en-US"/><a:t> ARR</a:t></a:r></a:p>
</p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

// A line chart missing its mandatory grouping, with container-level dLbls
// before the series, and a series carrying bar-only invertIfNegative plus a
// marker after dLbls.
const CHART_WITH_BROKEN_SEQUENCES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:plotArea><c:layout/>
<c:lineChart><c:varyColors val="0"/><c:dLbls><c:showVal val="0"/></c:dLbls>
<c:ser><c:idx val="0"/><c:order val="0"/><c:invertIfNegative val="0"/><c:dLbls><c:showVal val="0"/></c:dLbls><c:marker><c:symbol val="circle"/></c:marker><c:cat/><c:val/><c:smooth val="0"/></c:ser>
<c:axId val="1"/><c:axId val="2"/></c:lineChart>
<c:catAx><c:axId val="1"/></c:catAx><c:valAx><c:axId val="2"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:crossBetween val="between"/></c:valAx>
</c:plotArea></c:chart></c:chartSpace>`;

async function writeFixture(directory: string): Promise<string> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.file("ppt/slides/slide1.xml", SLIDE_WITH_BROKEN_PARAGRAPH);
  zip.file("ppt/charts/chart1.xml", CHART_WITH_BROKEN_SEQUENCES);
  const fixture = path.join(directory, "broken.pptx");
  await writeFile(fixture, await zip.generateAsync({ type: "nodebuffer" }));
  return fixture;
}

describe("PptxSanitizer schema-sequence repairs", () => {
  let directory: string;
  let slideXml: string;
  let chartXml: string;

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "slide-agent-sanitizer-"));
    const fixture = await writeFixture(directory);
    await new PptxSanitizer().sanitizeFile(fixture);
    const zip = await JSZip.loadAsync(await readFile(fixture));
    slideXml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    chartXml = await zip.file("ppt/charts/chart1.xml")!.async("string");
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps a single paragraph pPr as the first child and endParaRPr last", () => {
    const paragraph = /<a:p>(.*)<\/a:p>/s.exec(slideXml)![1]!;
    expect(paragraph.startsWith("<a:pPr")).toBe(true);
    expect(paragraph.match(/<a:pPr[ >]/g)).toHaveLength(1);
    expect(/<a:endParaRPr[^>]*\/>$/.test(paragraph)).toBe(true);
    expect(paragraph.match(/<a:t>/g)).toHaveLength(2);
  });

  it("inserts the mandatory line-chart grouping before varyColors", () => {
    expect(chartXml).toMatch(/<c:lineChart>\s*<c:grouping val="standard"\/><c:varyColors val="0"\/>/);
  });

  it("removes bar-only invertIfNegative from line series and moves marker before dLbls", () => {
    expect(chartXml).not.toContain("invertIfNegative");
    const series = /<c:ser>(.*)<\/c:ser>/s.exec(chartXml)![1]!;
    const order = [...series.matchAll(/<c:(idx|order|marker|dLbls|cat|val|smooth)[ >/]/g)].map((match) => match[1]);
    expect(order).toEqual(["idx", "order", "marker", "dLbls", "cat", "val", "smooth"]);
  });

  it("removes category-axis children from a value axis, as a scatter chart emits", () => {
    // A scatter chart has value axes on both sides, but PptxGenJS writes the x
    // axis with c:auto and c:lblAlgn, which CT_ValAx does not allow.
    const valueAxis = /<c:valAx>(.*?)<\/c:valAx>/s.exec(chartXml)![1]!;
    expect(valueAxis).not.toContain("<c:auto");
    expect(valueAxis).not.toContain("<c:lblAlgn");
    expect(valueAxis).toContain("<c:crossBetween");
  });

  it("is reported by PackageValidator before repair and clean after repair", async () => {
    const unrepaired = await writeFixture(path.join(directory));
    const zip = await JSZip.loadAsync(await readFile(unrepaired));
    zip.file("ppt/slides/slide1.xml", SLIDE_WITH_BROKEN_PARAGRAPH);
    const before = path.join(directory, "before.pptx");
    await writeFile(before, await zip.generateAsync({ type: "nodebuffer" }));
    const beforeIssues = (await new PackageValidator().validate(before)).issues.map((entry) => entry.code);
    expect(beforeIssues).toContain("invalid-paragraph-order");
    expect(beforeIssues).toContain("missing-chart-grouping");
    expect(beforeIssues).toContain("invalid-chart-sequence");
    expect(beforeIssues).toContain("invalid-chart-series");

    const repaired = await writeFixture(directory);
    await new PptxSanitizer().sanitizeFile(repaired);
    const afterIssues = (await new PackageValidator().validate(repaired)).issues.map((entry) => entry.code);
    for (const code of ["invalid-paragraph-order", "missing-chart-grouping", "invalid-chart-sequence", "invalid-chart-series"]) {
      expect(afterIssues).not.toContain(code);
    }
  });
});
