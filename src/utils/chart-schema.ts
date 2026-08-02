// Canonical child sequences from the ECMA-376 transitional dml-chart schema
// (5th edition, OfficeOpenXML-XMLSchema-Transitional). The exporter's
// sanitizer repairs generated charts against these tables and the package
// validator reports violations in existing decks; both must agree, so the
// tables live here as the single source of truth.

const CHART_SERIES_SHARED = ["c:idx", "c:order", "c:tx", "c:spPr"];
const CHART_BAR_SERIES = [...CHART_SERIES_SHARED, "c:invertIfNegative", "c:pictureOptions", "c:dPt", "c:dLbls", "c:trendline", "c:errBars", "c:cat", "c:val", "c:shape", "c:extLst"];
const CHART_LINE_SERIES = [...CHART_SERIES_SHARED, "c:marker", "c:dPt", "c:dLbls", "c:trendline", "c:errBars", "c:cat", "c:val", "c:smooth", "c:extLst"];
const CHART_AREA_SERIES = [...CHART_SERIES_SHARED, "c:pictureOptions", "c:dPt", "c:dLbls", "c:trendline", "c:errBars", "c:cat", "c:val", "c:extLst"];
const CHART_PIE_SERIES = [...CHART_SERIES_SHARED, "c:explosion", "c:dPt", "c:dLbls", "c:cat", "c:val", "c:extLst"];
const CHART_SCATTER_SERIES = [...CHART_SERIES_SHARED, "c:marker", "c:dPt", "c:dLbls", "c:trendline", "c:errBars", "c:xVal", "c:yVal", "c:smooth", "c:extLst"];
const CHART_RADAR_SERIES = [...CHART_SERIES_SHARED, "c:marker", "c:dPt", "c:dLbls", "c:cat", "c:val", "c:extLst"];

export interface ChartTypeSchema {
  containerOrder: string[];
  seriesOrder: string[];
  /** CT_LineChart and CT_Line3DChart require c:grouping; this is the value to insert when it is missing. */
  requiredGrouping?: string;
}

export const CHART_TYPE_SCHEMAS: Record<string, ChartTypeSchema> = {
  "c:barChart": { containerOrder: ["c:barDir", "c:grouping", "c:varyColors", "c:ser", "c:dLbls", "c:gapWidth", "c:overlap", "c:serLines", "c:axId", "c:extLst"], seriesOrder: CHART_BAR_SERIES },
  "c:bar3DChart": { containerOrder: ["c:barDir", "c:grouping", "c:varyColors", "c:ser", "c:dLbls", "c:gapWidth", "c:gapDepth", "c:shape", "c:axId", "c:extLst"], seriesOrder: CHART_BAR_SERIES },
  "c:lineChart": { containerOrder: ["c:grouping", "c:varyColors", "c:ser", "c:dLbls", "c:dropLines", "c:hiLowLines", "c:upDownBars", "c:marker", "c:smooth", "c:axId", "c:extLst"], seriesOrder: CHART_LINE_SERIES, requiredGrouping: "standard" },
  "c:line3DChart": { containerOrder: ["c:grouping", "c:varyColors", "c:ser", "c:dLbls", "c:dropLines", "c:gapDepth", "c:axId", "c:extLst"], seriesOrder: CHART_LINE_SERIES, requiredGrouping: "standard" },
  "c:areaChart": { containerOrder: ["c:grouping", "c:varyColors", "c:ser", "c:dLbls", "c:dropLines", "c:axId", "c:extLst"], seriesOrder: CHART_AREA_SERIES },
  "c:area3DChart": { containerOrder: ["c:grouping", "c:varyColors", "c:ser", "c:dLbls", "c:dropLines", "c:gapDepth", "c:axId", "c:extLst"], seriesOrder: CHART_AREA_SERIES },
  "c:pieChart": { containerOrder: ["c:varyColors", "c:ser", "c:dLbls", "c:firstSliceAng", "c:extLst"], seriesOrder: CHART_PIE_SERIES },
  "c:pie3DChart": { containerOrder: ["c:varyColors", "c:ser", "c:dLbls", "c:extLst"], seriesOrder: CHART_PIE_SERIES },
  "c:doughnutChart": { containerOrder: ["c:varyColors", "c:ser", "c:dLbls", "c:firstSliceAng", "c:holeSize", "c:extLst"], seriesOrder: CHART_PIE_SERIES },
  "c:scatterChart": { containerOrder: ["c:scatterStyle", "c:varyColors", "c:ser", "c:dLbls", "c:axId", "c:extLst"], seriesOrder: CHART_SCATTER_SERIES },
  "c:radarChart": { containerOrder: ["c:radarStyle", "c:varyColors", "c:ser", "c:dLbls", "c:axId", "c:extLst"], seriesOrder: CHART_RADAR_SERIES },
};

/**
 * Every element name that is legal in at least one chart series type. A child
 * from this vocabulary that is not legal for the current series type (for
 * example invertIfNegative outside bar series) is invalid and must be removed
 * rather than reordered.
 */
export const ALL_SERIES_ELEMENTS = new Set(Object.values(CHART_TYPE_SCHEMAS).flatMap((schema) => schema.seriesOrder));

/**
 * Returns the child node names that violate the canonical sequence: names out
 * of relative order, or series-vocabulary names that are not allowed in this
 * container. Used by validation; repair lives in the exporter's sanitizer.
 */
export function sequenceViolations(childNames: string[], canonicalOrder: string[], allowed?: Set<string>): string[] {
  const violations: string[] = [];
  const rank = new Map(canonicalOrder.map((name, index) => [name, name === "c:extLst" ? canonicalOrder.length + 1 : index]));
  let highest = -1;
  for (const name of childNames) {
    if (allowed && ALL_SERIES_ELEMENTS.has(name) && !allowed.has(name)) {
      violations.push(name);
      continue;
    }
    const position = rank.get(name);
    if (position === undefined) continue;
    if (position < highest) violations.push(name);
    else highest = position;
  }
  return violations;
}
