import { readFile } from "node:fs/promises";

import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import JSZip from "jszip";

import type { ValidationIssue } from "../types/index.js";
import { CHART_TYPE_SCHEMAS, sequenceViolations } from "../utils/chart-schema.js";
import { relationshipOwnerPath, resolvePackageTarget } from "../utils/ooxml.js";

function issue(code: string, message: string, details?: Record<string, unknown>): ValidationIssue {
  return { code, severity: "error", message, fixable: false, ...(details ? { details } : {}) };
}

interface ParsedXml {
  document?: Document;
  errors: string[];
}

function parseXml(xml: string): ParsedXml {
  const errors: string[] = [];
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") errors.push(message);
    },
  }).parseFromString(xml, "application/xml");
  if (!document.documentElement || document.documentElement.nodeName === "parsererror") errors.push(document.documentElement?.textContent ?? "parse error");
  return { document: errors.length === 0 ? document : undefined, errors };
}

function elements(document: Document, name: string): Element[] {
  return Array.from(document.getElementsByTagName(name)) as Element[];
}

function childElementNames(element: Element): string[] {
  const names: string[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) names.push(node.nodeName);
  }
  return names;
}

function childElements(element: Element, name: string): Element[] {
  const children: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && node.nodeName === name) children.push(node as Element);
  }
  return children;
}

function packagePartExists(zip: JSZip, partName: string): boolean {
  const entry = zip.file(partName.replace(/^\/+/, ""));
  return Boolean(entry && !entry.dir);
}

function normalizeRelationshipTarget(ownerPath: string, target: string): string {
  const withoutFragment = target.split("#", 1)[0] ?? target;
  try {
    return resolvePackageTarget(ownerPath, decodeURI(withoutFragment));
  } catch {
    return resolvePackageTarget(ownerPath, withoutFragment);
  }
}

function validateRelationshipReferences(
  document: Document,
  relationshipIds: Set<string>,
  ownerPath: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const element of elements(document, "*")) {
    for (const attributeName of ["r:id", "r:embed", "r:link"]) {
      const relationshipId = element.getAttribute(attributeName);
      if (relationshipId && !relationshipIds.has(relationshipId)) {
        issues.push(issue("missing-relationship-id", `${ownerPath} references undeclared relationship ${relationshipId}.`, {
          ownerPath,
          relationshipId,
          attributeName,
        }));
      }
    }
  }
  return issues;
}

export class PackageValidator {
  public async validate(inputPath: string): Promise<{ issues: ValidationIssue[]; slideCount: number }> {
    const issues: ValidationIssue[] = [];
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(await readFile(inputPath), { checkCRC32: true });
    } catch (error) {
      return {
        issues: [issue("corrupt-pptx", `PowerPoint file is corrupt or unreadable: ${error instanceof Error ? error.message : String(error)}`)],
        slideCount: 0,
      };
    }

    const required = ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"];
    for (const entry of required) {
      if (!packagePartExists(zip, entry)) issues.push(issue("missing-package-part", `Required PowerPoint package part is missing: ${entry}`));
    }

    const partNames = Object.keys(zip.files).filter((entry) => !zip.files[entry]!.dir);
    const slides = partNames.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry));
    if (slides.length === 0) issues.push(issue("no-slide-parts", "PowerPoint package contains no slide XML parts."));

    const parsedParts = new Map<string, Document>();
    for (const partName of partNames.filter((entry) => entry.endsWith(".xml") || entry.endsWith(".rels"))) {
      const parsed = parseXml(await zip.file(partName)!.async("string"));
      if (!parsed.document) {
        issues.push(issue("malformed-xml", `Package part is not well-formed XML: ${partName}`, {
          partName,
          parserErrors: parsed.errors,
        }));
      } else {
        parsedParts.set(partName, parsed.document);
      }
    }

    const contentTypes = parsedParts.get("[Content_Types].xml");
    if (contentTypes) {
      const defaults = new Set(elements(contentTypes, "Default").map((entry) => (entry.getAttribute("Extension") ?? "").toLowerCase()));
      const overrides = new Set<string>();
      for (const override of elements(contentTypes, "Override")) {
        const partName = override.getAttribute("PartName") ?? "";
        if (overrides.has(partName)) issues.push(issue("duplicate-content-type", `Content type Override is duplicated: ${partName}`, { partName }));
        overrides.add(partName);
        if (!packagePartExists(zip, partName)) {
          issues.push(issue("content-type-missing-part", `Content type Override points to a missing package part: ${partName}`, { partName }));
        }
      }
      for (const partName of partNames.filter((entry) => entry !== "[Content_Types].xml")) {
        const extension = partName.includes(".") ? partName.slice(partName.lastIndexOf(".") + 1).toLowerCase() : "";
        if (!overrides.has(`/${partName}`) && !defaults.has(extension)) {
          issues.push(issue("part-without-content-type", `Package part has no matching content type: ${partName}`, { partName, extension }));
        }
      }
    }

    for (const relPath of partNames.filter((entry) => entry.endsWith(".rels"))) {
      const relationshipDocument = parsedParts.get(relPath);
      if (!relationshipDocument) continue;
      const ownerPath = relationshipOwnerPath(relPath);
      const relationshipIds = new Set<string>();
      for (const relationship of elements(relationshipDocument, "Relationship")) {
        const id = relationship.getAttribute("Id") ?? "";
        const target = relationship.getAttribute("Target") ?? "";
        if (!id) issues.push(issue("relationship-without-id", `Relationship in ${relPath} has no Id.`, { relPath, target }));
        if (relationshipIds.has(id)) issues.push(issue("duplicate-relationship-id", `${relPath} contains duplicate relationship Id ${id}.`, { relPath, id }));
        relationshipIds.add(id);
        if ((relationship.getAttribute("TargetMode") ?? "") !== "External") {
          const resolved = normalizeRelationshipTarget(ownerPath, target);
          if (!packagePartExists(zip, resolved)) {
            issues.push(issue("broken-relationship-target", `${relPath} points to missing package part ${resolved}.`, {
              relPath,
              ownerPath,
              target,
              resolved,
            }));
          }
        }
      }
      const ownerDocument = parsedParts.get(ownerPath);
      if (ownerDocument) issues.push(...validateRelationshipReferences(ownerDocument, relationshipIds, ownerPath));
    }

    const presentation = parsedParts.get("ppt/presentation.xml");
    if (presentation?.documentElement) {
      const slideIds = elements(presentation, "p:sldId").map((entry) => entry.getAttribute("id") ?? "");
      const seen = new Set<string>();
      for (const id of slideIds) {
        if (seen.has(id)) issues.push(issue("duplicate-slide-id", `Presentation contains duplicate slide id ${id}.`, { id }));
        seen.add(id);
        if (!/^\d+$/.test(id) || Number(id) < 256) issues.push(issue("invalid-slide-id", `Presentation slide id must be an integer of at least 256: ${id}`, { id }));
      }
      const rootChildren = Array.from(presentation.documentElement.childNodes).filter((node) => node.nodeType === 1) as Element[];
      const notesIndex = rootChildren.findIndex((entry) => entry.nodeName === "p:notesMasterIdLst");
      const slidesIndex = rootChildren.findIndex((entry) => entry.nodeName === "p:sldIdLst");
      if (notesIndex >= 0 && slidesIndex >= 0 && notesIndex > slidesIndex) {
        issues.push(issue("invalid-presentation-element-order", "notesMasterIdLst must appear before sldIdLst in presentation.xml."));
      }
    }

    for (const slidePath of slides) {
      const slideDocument = parsedParts.get(slidePath);
      if (!slideDocument) continue;
      const ids = elements(slideDocument, "p:cNvPr").map((entry) => entry.getAttribute("id") ?? "");
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) issues.push(issue("duplicate-shape-id", `${slidePath} contains duplicate non-visual shape id ${id}.`, { slidePath, id }));
        seen.add(id);
        if (!/^\d+$/.test(id) || Number(id) < 1) issues.push(issue("invalid-shape-id", `${slidePath} contains invalid non-visual shape id ${id}.`, { slidePath, id }));
      }
    }

    for (const [partName, document] of parsedParts) {
      if (!partName.endsWith(".xml")) continue;
      for (const geometry of elements(document, "a:prstGeom")) {
        const preset = geometry.getAttribute("prst") ?? "";
        if (preset === "oval" || preset === "roundedRectangle") {
          issues.push(issue("invalid-shape-preset", `${partName} uses non-OOXML shape preset ${preset}.`, { partName, preset }));
        }
      }
      for (const extent of elements(document, "a:ext")) {
        const cx = Number(extent.getAttribute("cx"));
        const cy = Number(extent.getAttribute("cy"));
        if ((Number.isFinite(cx) && cx < 0) || (Number.isFinite(cy) && cy < 0)) {
          issues.push(issue("negative-shape-extent", `${partName} contains an invalid negative shape extent.`, {
            partName,
            cx: extent.getAttribute("cx"),
            cy: extent.getAttribute("cy"),
          }));
        }
      }
    }

    for (const [partName, document] of parsedParts) {
      if (!partName.endsWith(".xml")) continue;
      for (const paragraph of elements(document, "a:p")) {
        const names = childElementNames(paragraph);
        const propertyCount = names.filter((name) => name === "a:pPr").length;
        const misplaced = propertyCount > 0 && names[0] !== "a:pPr";
        const endIndex = names.indexOf("a:endParaRPr");
        if (propertyCount > 1 || misplaced || (endIndex >= 0 && endIndex !== names.length - 1)) {
          issues.push(issue("invalid-paragraph-order", `${partName} contains a paragraph whose pPr/endParaRPr placement violates CT_TextParagraph.`, {
            partName,
            children: names,
          }));
        }
      }
    }

    for (const chartPath of partNames.filter((entry) => /^ppt\/charts\/chart\d+\.xml$/.test(entry))) {
      const chartDocument = parsedParts.get(chartPath);
      if (!chartDocument) continue;
      for (const [containerName, schema] of Object.entries(CHART_TYPE_SCHEMAS)) {
        for (const container of elements(chartDocument, containerName)) {
          if (schema.requiredGrouping && childElements(container, "c:grouping").length === 0) {
            issues.push(issue("missing-chart-grouping", `${chartPath} contains a ${containerName} without the mandatory c:grouping element.`, { chartPath, containerName }));
          }
          const containerViolations = sequenceViolations(childElementNames(container), schema.containerOrder);
          if (containerViolations.length > 0) {
            issues.push(issue("invalid-chart-sequence", `${chartPath} orders ${containerName} children against the ECMA-376 chart schema.`, {
              chartPath,
              containerName,
              violations: containerViolations,
            }));
          }
          const allowedSeriesElements = new Set(schema.seriesOrder);
          for (const series of childElements(container, "c:ser")) {
            const seriesViolations = sequenceViolations(childElementNames(series), schema.seriesOrder, allowedSeriesElements);
            if (seriesViolations.length > 0) {
              issues.push(issue("invalid-chart-series", `${chartPath} contains a ${containerName} series with misplaced or disallowed elements.`, {
                chartPath,
                containerName,
                violations: seriesViolations,
              }));
            }
          }
        }
      }
      const axisContainerNames = new Set(["c:catAx", "c:dateAx", "c:serAx", "c:valAx"]);
      const definedAxisIds = new Set(
        elements(chartDocument, "c:axId")
          .filter((entry) => entry.parentNode && axisContainerNames.has(entry.parentNode.nodeName))
          .map((entry) => entry.getAttribute("val") ?? "")
          .filter(Boolean),
      );
      for (const axisId of elements(chartDocument, "c:axId").filter((entry) => !entry.parentNode || !axisContainerNames.has(entry.parentNode.nodeName))) {
        const value = axisId.getAttribute("val") ?? "";
        if (!definedAxisIds.has(value)) {
          issues.push(issue("undefined-chart-axis", `${chartPath} references undefined chart axis ${value}.`, { chartPath, value }));
        }
      }
      for (const crossAxis of elements(chartDocument, "c:crossAx")) {
        const value = crossAxis.getAttribute("val") ?? "";
        if (!definedAxisIds.has(value)) {
          issues.push(issue("undefined-cross-axis", `${chartPath} crosses undefined chart axis ${value}.`, { chartPath, value }));
        }
      }
    }

    const notesRels = parsedParts.get("ppt/notesMasters/_rels/notesMaster1.xml.rels");
    if (notesRels) {
      const themeRelationships = elements(notesRels, "Relationship").filter((entry) => (entry.getAttribute("Type") ?? "").endsWith("/theme"));
      for (const relationship of themeRelationships) {
        if (relationship.getAttribute("Target") !== "../theme/theme2.xml" || !packagePartExists(zip, "ppt/theme/theme2.xml")) {
          issues.push(issue("invalid-notes-master-theme", "The notes master must reference its own ppt/theme/theme2.xml part."));
        }
      }
    }

    return { issues, slideCount: slides.length };
  }
}
