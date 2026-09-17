import JSZip from "jszip";

import type { ChartElement, ColorRef } from "../ir/scene.js";
import { tint } from "../tokens/color.js";
import { NS, XML_HEADER, esc } from "./xml.js";

/**
 * Native charts: a `c:chartSpace` part styled from the deck's tokens, and an
 * embedded workbook holding the data so "Edit Data" works in PowerPoint.
 */

const EMU_PT = 12700;

function colorXml(color: ColorRef, alpha?: number): string {
  const inner = alpha !== undefined && alpha < 1 ? `<a:alpha val="${Math.round(alpha * 100000)}"/>` : "";
  return color.slot && !color.lumMod
    ? `<a:schemeClr val="${schemeAlias(color.slot)}">${inner}</a:schemeClr>`
    : `<a:srgbClr val="${color.hex}">${inner}</a:srgbClr>`;
}

/** Charts are not colour-mapped through the master; use the literal slot names. */
function schemeAlias(slot: string): string {
  return slot;
}

function solid(color: ColorRef, alpha?: number): string {
  return `<a:solidFill>${colorXml(color, alpha)}</a:solidFill>`;
}

function column(index: number): string {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function textProperties(element: ChartElement, color: ColorRef, size = element.style.size): string {
  return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round(size * 100)}">${solid(color)}<a:latin typeface="${esc(element.style.font)}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
}

function stringCache(values: string[]): string {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((value, index) => `<c:pt idx="${index}"><c:v>${esc(value)}</c:v></c:pt>`).join("")}</c:strCache>`;
}

function numberCache(values: Array<number | null>): string {
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((value, index) => value === null ? "" : `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`).join("")}</c:numCache>`;
}

export interface ChartPart {
  xml: string;
  workbook: Buffer;
}

export async function writeChart(element: ChartElement): Promise<ChartPart> {
  const { data, style } = element;
  let series = data.series;
  let categories = data.categories.map(String);
  const count = categories.length;
  let kind = element.chart;

  // Waterfall: a transparent base series plus the visible deltas, stacked.
  let waterfall: { base: number[]; up: Array<number | null>; down: Array<number | null> } | undefined;
  if (kind === "waterfall" && series[0]) {
    const base: number[] = [];
    const up: Array<number | null> = [];
    const down: Array<number | null> = [];
    let running = 0;
    for (const value of series[0].values) {
      const delta = value ?? 0;
      const next = running + delta;
      base.push(Math.min(running, next));
      up.push(delta >= 0 ? delta : null);
      down.push(delta < 0 ? -delta : null);
      running = next;
    }
    waterfall = { base, up, down };
    series = [{ name: "base", values: base }, { name: `${series[0].name} increase`, values: up }, { name: `${series[0].name} decrease`, values: down }];
    kind = "stacked-column";
  }

  const categoryRange = `Sheet1!$A$2:$A$${count + 1}`;
  const seriesXml = (includeCategories: boolean, forScatter = false) => series.map((entry, index) => {
    const col = column(index + 1);
    const baseColor = element.colors[index % Math.max(1, element.colors.length)] ?? style.text;
    const isHighlightMode = element.highlight.length > 0 && series.length === 1;
    const fill = waterfall
      ? index === 0 ? "<a:noFill/>" : solid(index === 1 ? (element.colors[0] ?? style.text) : style.muted)
      : isHighlightMode ? solid({ hex: tint(baseColor.hex, 55) }) : solid(baseColor);
    const line = kind === "line" || forScatter
      ? `<c:spPr><a:ln w="${Math.round(2.25 * EMU_PT)}" cap="rnd">${solid(baseColor)}<a:round/></a:ln></c:spPr>`
      : `<c:spPr>${fill}<a:ln><a:noFill/></a:ln></c:spPr>`;
    const points = isHighlightMode && !forScatter
      ? element.highlight.filter((point) => point < count).map((point) => `<c:dPt><c:idx val="${point}"/>${kind === "bar" || kind === "column" || kind === "stacked-bar" || kind === "stacked-column" ? '<c:invertIfNegative val="0"/>' : ""}${kind === "line" ? `<c:marker><c:symbol val="circle"/><c:size val="8"/><c:spPr>${solid(style.highlight ?? baseColor)}<a:ln><a:noFill/></a:ln></c:spPr></c:marker>` : ""}<c:bubble3D val="0"/><c:spPr>${solid(style.highlight ?? baseColor)}</c:spPr></c:dPt>`).join("")
      : "";
    const pieColors = (kind === "pie" || kind === "doughnut")
      ? categories.map((_, point) => `<c:dPt><c:idx val="${point}"/><c:bubble3D val="0"/><c:spPr>${solid(element.highlight.length ? (element.highlight.includes(point) ? (style.highlight ?? element.colors[0]!) : { hex: tint((element.colors[0] ?? style.muted).hex, 40 + (point % 3) * 15) }) : element.colors[point % element.colors.length]!)}<a:ln w="${EMU_PT}"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join("")
      : "";
    const labels = style.labels !== "none" && !(waterfall && index === 0)
      ? `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${textProperties(element, style.text)}${kind === "bar" || kind === "column" ? `<c:dLblPos val="${style.labels === "inside" ? "inEnd" : "outEnd"}"/>` : ""}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
      : "";
    const tx = `<c:tx><c:strRef><c:f>Sheet1!$${col}$1</c:f>${stringCache([entry.name])}</c:strRef></c:tx>`;
    const values = `<c:numRef><c:f>Sheet1!$${col}$2:$${col}$${count + 1}</c:f>${numberCache(entry.values)}</c:numRef>`;
    const cat = includeCategories ? `<c:cat><c:strRef><c:f>${categoryRange}</c:f>${stringCache(categories)}</c:strRef></c:cat>` : "";
    const head = `<c:idx val="${index}"/><c:order val="${index}"/>${tx}${line}`;
    if (forScatter) {
      const xs = categories.map((value) => Number(value));
      return `<c:ser>${head}<c:marker><c:symbol val="circle"/><c:size val="7"/></c:marker>${labels}<c:xVal><c:numRef><c:f>${categoryRange}</c:f>${numberCache(xs.map((value) => Number.isFinite(value) ? value : null))}</c:numRef></c:xVal><c:yVal>${values}</c:yVal><c:smooth val="0"/></c:ser>`;
    }
    if (kind === "line") return `<c:ser>${head}<c:marker><c:symbol val="none"/></c:marker>${points}${labels}${cat}<c:val>${values}</c:val><c:smooth val="0"/></c:ser>`;
    if (kind === "area") return `<c:ser>${head}${labels}${cat}<c:val>${values}</c:val></c:ser>`;
    if (kind === "pie" || kind === "doughnut") return `<c:ser>${head}${pieColors}${labels}${cat}<c:val>${values}</c:val></c:ser>`;
    return `<c:ser>${head}<c:invertIfNegative val="0"/>${points}${labels}${cat}<c:val>${values}</c:val></c:ser>`;
  }).join("");

  const axisLine = style.axis === "none" ? "<a:ln><a:noFill/></a:ln>" : `<a:ln w="${Math.round((style.axis === "regular" ? 1 : 0.5) * EMU_PT)}">${solid(style.rule)}</a:ln>`;
  const gridlines = style.gridlines === "none" ? "" : `<c:majorGridlines><c:spPr><a:ln w="${Math.round(0.5 * EMU_PT)}">${solid(style.rule, style.gridlines === "subtle" ? 0.6 : 1)}</a:ln></c:spPr></c:majorGridlines>`;
  const horizontalBars = kind === "bar" || kind === "stacked-bar";
  const categoryAxis = (id: number, cross: number) => `<c:catAx><c:axId val="${id}"/><c:scaling><c:orientation val="${horizontalBars ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontalBars ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr>${axisLine}</c:spPr>${textProperties(element, style.muted)}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valueAxis = (id: number, cross: number, position: string, grid: boolean, deleted = false) => `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${deleted ? 1 : 0}"/><c:axPos val="${position}"/>${grid ? gridlines : ""}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${textProperties(element, style.muted)}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;

  let plot: string;
  switch (kind) {
    case "line":
      plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${seriesXml(true)}<c:marker val="1"/><c:axId val="1001"/><c:axId val="1002"/></c:lineChart>${categoryAxis(1001, 1002)}${valueAxis(1002, 1001, "l", true)}`;
      break;
    case "area":
      plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${seriesXml(true)}<c:axId val="1001"/><c:axId val="1002"/></c:areaChart>${categoryAxis(1001, 1002)}${valueAxis(1002, 1001, "l", true)}`;
      break;
    case "pie":
      plot = `<c:pieChart><c:varyColors val="1"/>${seriesXml(true)}<c:firstSliceAng val="0"/></c:pieChart>`;
      break;
    case "doughnut":
      plot = `<c:doughnutChart><c:varyColors val="1"/>${seriesXml(true)}<c:firstSliceAng val="0"/><c:holeSize val="62"/></c:doughnutChart>`;
      break;
    case "scatter":
      plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${seriesXml(false, true)}<c:axId val="1001"/><c:axId val="1002"/></c:scatterChart>${valueAxis(1001, 1002, "b", false)}${valueAxis(1002, 1001, "l", true)}`;
      break;
    default: {
      const stacked = kind === "stacked-bar" || kind === "stacked-column";
      plot = `<c:barChart><c:barDir val="${horizontalBars ? "bar" : "col"}"/><c:grouping val="${stacked ? "stacked" : "clustered"}"/><c:varyColors val="0"/>${seriesXml(true)}<c:gapWidth val="${series.length > 1 && !stacked ? 80 : 55}"/>${stacked ? '<c:overlap val="100"/>' : ""}<c:axId val="1001"/><c:axId val="1002"/></c:barChart>${categoryAxis(1001, 1002)}${valueAxis(1002, 1001, horizontalBars ? "b" : "l", true)}`;
    }
  }

  const legend = style.legend === "none" || waterfall
    ? ""
    : `<c:legend><c:legendPos val="${style.legend === "bottom" ? "b" : style.legend === "right" ? "r" : "t"}"/><c:overlay val="0"/>${textProperties(element, style.muted)}</c:legend>`;
  const title = element.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${Math.round(style.size * 110)}" b="1">${solid(style.text)}<a:latin typeface="${esc(style.font)}"/></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="${Math.round(style.size * 110)}" b="1">${solid(style.text)}<a:latin typeface="${esc(style.font)}"/></a:rPr><a:t>${esc(element.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>';

  const xml = `${XML_HEADER}<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${textProperties(element, style.text)}<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
  if (!waterfall) categories = data.categories.map(String);
  return { xml, workbook: await writeWorkbook(categories, series) };
}

/** A minimal, valid .xlsx: one sheet, categories in column A, one column per series. */
async function writeWorkbook(categories: string[], series: Array<{ name: string; values: Array<number | null> }>): Promise<Buffer> {
  const zip = new JSZip();
  const date = new Date("2000-01-01T00:00:00Z");
  const cell = (reference: string, value: string | number | null) => value === null
    ? ""
    : typeof value === "number"
      ? `<c r="${reference}"><v>${value}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`;
  const rows = [
    `<row r="1">${cell("A1", " ")}${series.map((entry, index) => cell(`${column(index + 1)}1`, entry.name)).join("")}</row>`,
    ...categories.map((category, row) => `<row r="${row + 2}">${cell(`A${row + 2}`, category)}${series.map((entry, index) => cell(`${column(index + 1)}${row + 2}`, entry.values[row] ?? null)).join("")}</row>`),
  ];
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XML_HEADER}<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `${XML_HEADER}<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS.r}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `${XML_HEADER}<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join("")}</sheetData></worksheet>`,
  };
  for (const [name, content] of Object.entries(files)) zip.file(name, content, { date, createFolders: false });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
