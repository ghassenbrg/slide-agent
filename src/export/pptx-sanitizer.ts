import { readFile, writeFile } from "node:fs/promises";

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";

const CONTENT_TYPES = "[Content_Types].xml";
const NOTES_MASTER = "ppt/notesMasters/notesMaster1.xml";
const NOTES_MASTER_RELS = "ppt/notesMasters/_rels/notesMaster1.xml.rels";
const PRESENTATION = "ppt/presentation.xml";
const THEME_ONE = "ppt/theme/theme1.xml";
const THEME_TWO = "ppt/theme/theme2.xml";
const THEME_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.theme+xml";

function parseXml(xml: string, partName: string): Document {
  const errors: string[] = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(xml, "application/xml");
  if (errors.length > 0 || document.documentElement.nodeName === "parsererror") {
    throw new Error(`Cannot sanitize malformed XML part ${partName}: ${errors.join("; ") || "parse error"}`);
  }
  return document;
}

function serializeXml(document: Document): string {
  const serialized = new XMLSerializer().serializeToString(document);
  return serialized.startsWith("<?xml")
    ? serialized
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${serialized}`;
}

function directChildren(element: Element): Element[] {
  const children: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) children.push(node as Element);
  }
  return children;
}

async function repairNotesMaster(zip: JSZip): Promise<void> {
  const notesMaster = zip.file(NOTES_MASTER);
  const notesMasterRels = zip.file(NOTES_MASTER_RELS);
  const themeOne = zip.file(THEME_ONE);
  if (!notesMaster || !notesMasterRels || !themeOne) return;

  // PptxGenJS 4.0.1 gives the notes master slide-master placeholders that
  // PowerPoint considers malformed. Keep the valid group root and notes style;
  // speaker-note content lives in notesSlides and is not removed here.
  const notesDocument = parseXml(await notesMaster.async("string"), NOTES_MASTER);
  const shapeTrees = notesDocument.getElementsByTagName("p:spTree");
  if (shapeTrees.length > 0) {
    const shapeTree = shapeTrees[0] as Element;
    for (const child of directChildren(shapeTree)) {
      if (child.nodeName === "p:sp") shapeTree.removeChild(child);
    }
  }
  zip.file(NOTES_MASTER, serializeXml(notesDocument));

  // A notes master must have its own theme part. Sharing theme1 with the slide
  // master triggers a repair in desktop PowerPoint.
  zip.file(THEME_TWO, await themeOne.async("uint8array"));
  const relsDocument = parseXml(await notesMasterRels.async("string"), NOTES_MASTER_RELS);
  for (const relationship of Array.from(relsDocument.getElementsByTagName("Relationship"))) {
    if ((relationship.getAttribute("Type") ?? "").endsWith("/theme")) {
      relationship.setAttribute("Target", "../theme/theme2.xml");
    }
  }
  zip.file(NOTES_MASTER_RELS, serializeXml(relsDocument));

  // ECMA-376 sequence order places notesMasterIdLst before sldIdLst.
  const presentation = zip.file(PRESENTATION);
  if (presentation) {
    const presentationDocument = parseXml(await presentation.async("string"), PRESENTATION);
    const roots = presentationDocument.getElementsByTagName("p:presentation");
    if (roots.length > 0) {
      const root = roots[0] as Element;
      const notesList = directChildren(root).find((child) => child.nodeName === "p:notesMasterIdLst");
      const slideList = directChildren(root).find((child) => child.nodeName === "p:sldIdLst");
      if (notesList && slideList) root.insertBefore(notesList, slideList);
    }
    zip.file(PRESENTATION, serializeXml(presentationDocument));
  }
}

async function repairContentTypes(zip: JSZip): Promise<void> {
  const part = zip.file(CONTENT_TYPES);
  if (!part) return;
  const document = parseXml(await part.async("string"), CONTENT_TYPES);
  const root = document.documentElement;
  const seenOverrides = new Set<string>();

  for (const override of Array.from(document.getElementsByTagName("Override"))) {
    const partName = override.getAttribute("PartName") ?? "";
    const zipPath = partName.replace(/^\/+/, "");
    if (!zipPath || !zip.file(zipPath) || seenOverrides.has(partName)) {
      root.removeChild(override);
    } else {
      seenOverrides.add(partName);
    }
  }

  for (const defaultType of Array.from(document.getElementsByTagName("Default"))) {
    if ((defaultType.getAttribute("Extension") ?? "").toLowerCase() === "jpg") {
      defaultType.setAttribute("ContentType", "image/jpeg");
    }
  }

  if (zip.file(THEME_TWO) && !seenOverrides.has(`/${THEME_TWO}`)) {
    const override = document.createElementNS(root.namespaceURI, "Override");
    override.setAttribute("PartName", `/${THEME_TWO}`);
    override.setAttribute("ContentType", THEME_CONTENT_TYPE);
    root.appendChild(override);
  }
  zip.file(CONTENT_TYPES, serializeXml(document));
}

function normalizeKnownShapeAliases(xml: string): string {
  return xml
    .replace(/(<a:prstGeom\b[^>]*\bprst=")oval("[^>]*>)/g, "$1ellipse$2")
    .replace(/(<a:prstGeom\b[^>]*\bprst=")roundedRectangle("[^>]*>)/g, "$1roundRect$2");
}

function repairNegativeExtents(xml: string, partName: string): string {
  const document = parseXml(xml, partName);
  for (const transform of Array.from(document.getElementsByTagName("a:xfrm"))) {
    const children = directChildren(transform);
    const offset = children.find((child) => child.nodeName === "a:off");
    const extent = children.find((child) => child.nodeName === "a:ext");
    if (!offset || !extent) continue;
    const cx = Number(extent.getAttribute("cx"));
    const cy = Number(extent.getAttribute("cy"));
    if (Number.isFinite(cx) && cx < 0) {
      const x = Number(offset.getAttribute("x"));
      if (Number.isFinite(x)) offset.setAttribute("x", String(x + cx));
      extent.setAttribute("cx", String(Math.abs(cx)));
      transform.setAttribute("flipH", transform.getAttribute("flipH") === "1" ? "0" : "1");
    }
    if (Number.isFinite(cy) && cy < 0) {
      const y = Number(offset.getAttribute("y"));
      if (Number.isFinite(y)) offset.setAttribute("y", String(y + cy));
      extent.setAttribute("cy", String(Math.abs(cy)));
      transform.setAttribute("flipV", transform.getAttribute("flipV") === "1" ? "0" : "1");
    }
  }

  // PptxGenJS can reuse the graphic-frame id for the next text shape after a
  // native table. IDs are scoped to a slide but must still be unique inside
  // that shape tree or PowerPoint repairs the package when opening it.
  const nonVisualProperties = Array.from(document.getElementsByTagName("*"))
    .filter((element) => element.localName === "cNvPr" && /^\d+$/.test(element.getAttribute("id") ?? ""));
  let nextId = Math.max(0, ...nonVisualProperties.map((element) => Number(element.getAttribute("id")))) + 1;
  const seen = new Set<number>();
  for (const properties of nonVisualProperties) {
    const id = Number(properties.getAttribute("id"));
    if (seen.has(id)) {
      properties.setAttribute("id", String(nextId));
      seen.add(nextId);
      nextId += 1;
    } else {
      seen.add(id);
    }
  }
  return serializeXml(document);
}

function repairChartAxes(xml: string, partName: string): string {
  const document = parseXml(xml, partName);
  const axisContainerNames = new Set(["c:catAx", "c:dateAx", "c:serAx", "c:valAx"]);
  const definedAxisIds = new Set<string>();
  for (const axisId of Array.from(document.getElementsByTagName("c:axId"))) {
    if (axisId.parentNode && axisContainerNames.has(axisId.parentNode.nodeName)) {
      const value = axisId.getAttribute("val");
      if (value) definedAxisIds.add(value);
    }
  }
  for (const axisId of Array.from(document.getElementsByTagName("c:axId"))) {
    if (!axisId.parentNode || axisContainerNames.has(axisId.parentNode.nodeName)) continue;
    const value = axisId.getAttribute("val") ?? "";
    if (!definedAxisIds.has(value)) axisId.parentNode.removeChild(axisId);
  }

  // PptxGenJS serializes even a single category column as multi-level data.
  // PowerPoint rewrites that construct on repair; emit the native single-level
  // representation directly while preserving true multi-level categories.
  for (const multiLevelRef of Array.from(document.getElementsByTagName("c:multiLvlStrRef"))) {
    const caches = Array.from(multiLevelRef.getElementsByTagName("c:multiLvlStrCache"));
    const levels = Array.from(multiLevelRef.getElementsByTagName("c:lvl"));
    if (caches.length !== 1 || levels.length !== 1 || !multiLevelRef.parentNode) continue;
    const stringRef = document.createElementNS(multiLevelRef.namespaceURI, "c:strRef");
    const formula = Array.from(multiLevelRef.childNodes).find((node) => node.nodeType === 1 && node.nodeName === "c:f");
    if (formula) stringRef.appendChild(formula.cloneNode(true));
    const stringCache = document.createElementNS(multiLevelRef.namespaceURI, "c:strCache");
    const pointCount = Array.from(caches[0]!.childNodes).find((node) => node.nodeType === 1 && node.nodeName === "c:ptCount");
    if (pointCount) stringCache.appendChild(pointCount.cloneNode(true));
    for (const child of Array.from(levels[0]!.childNodes)) {
      if (child.nodeType === 1 && child.nodeName === "c:pt") stringCache.appendChild(child.cloneNode(true));
    }
    stringRef.appendChild(stringCache);
    multiLevelRef.parentNode.replaceChild(stringRef, multiLevelRef);
  }
  return serializeXml(document);
}

/**
 * Repairs known OOXML defects in the current published PptxGenJS package and
 * removes declarations for parts that do not exist. This intentionally works
 * at the OPC layer so all deck-generation paths receive the same compatibility
 * treatment without constraining model-authored design choices.
 */
export class PptxSanitizer {
  public async sanitizeFile(inputPath: string): Promise<void> {
    const zip = await JSZip.loadAsync(await readFile(inputPath), { checkCRC32: true });
    await repairNotesMaster(zip);

    for (const [name, entry] of Object.entries(zip.files)) {
      if (!entry.dir && name.endsWith(".xml")) {
        let xml = normalizeKnownShapeAliases(await entry.async("string"));
        if (name.startsWith("ppt/") && !name.startsWith("ppt/charts/")) xml = repairNegativeExtents(xml, name);
        if (/^ppt\/charts\/chart\d+\.xml$/.test(name)) xml = repairChartAxes(xml, name);
        zip.file(name, xml);
      }
    }
    await repairContentTypes(zip);
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) {
        // JSZip.remove("folder/") recursively removes all descendants. Delete
        // only the explicit directory record; OPC packages do not need it.
        delete zip.files[name];
      }
    }

    const output = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      platform: "DOS",
    });
    await writeFile(inputPath, output);
  }
}
