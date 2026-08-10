import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";

/**
 * Capabilities PowerPoint has and PptxGenJS does not expose.
 *
 * Text columns, source cropping, picture masks, and blip colour effects are all
 * ordinary OOXML. Leaving them out would mean the contract's answer to "can I
 * crop this photograph to a circle?" is "no", which is false about the medium
 * and only true about one JavaScript library. So they are applied to the
 * emitted package by name, after export, from what the author actually wrote.
 *
 * Every pass here is keyed on `objectName`, which `ElementWriter` already sets
 * on every shape it creates, so nothing has to guess which shape it is editing.
 */

/** Inches → English Metric Units, OOXML's integer length unit. */
const EMU_PER_INCH = 914_400;

/** OOXML expresses crop fractions in thousandths of a percent. */
function perMille(fraction: number): string {
  return String(Math.round(Math.max(0, Math.min(1, fraction)) * 100_000));
}

function hex(value: string): string {
  return value.replace(/^#/, "").toUpperCase();
}

export interface PictureTreatment {
  crop?: { left?: number; right?: number; top?: number; bottom?: number };
  maskShape?: string;
  duotone?: { shadow: string; highlight: string };
  grayscale?: boolean;
}

export interface ShapePostProcess {
  /** The element's `objectName`, which is its authored id. */
  name: string;
  /** Newspaper-style text columns inside one text box. */
  columns?: { count: number; gutterInches?: number };
  picture?: PictureTreatment;
}

/** True when the package needs no post-processing at all. */
export function isEmptyPostProcess(entries: ShapePostProcess[] | undefined): boolean {
  return !entries || entries.length === 0;
}

function directChildren(element: Element): Element[] {
  const children: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) children.push(node as Element);
  }
  return children;
}

function firstDescendant(root: Element, nodeName: string): Element | undefined {
  const found = root.getElementsByTagName(nodeName);
  return found.length > 0 ? (found[0] as Element) : undefined;
}

/** The `p:sp`/`p:pic`/`p:graphicFrame` a named non-visual property belongs to. */
function shapeFor(properties: Element): Element | undefined {
  const container = properties.parentNode as Element | null;
  const shape = container?.parentNode as Element | null;
  return shape?.nodeType === 1 ? shape : undefined;
}

function applyColumns(shape: Element, columns: { count: number; gutterInches?: number }): void {
  const body = firstDescendant(shape, "a:bodyPr");
  if (!body) return;
  body.setAttribute("numCol", String(Math.max(1, Math.round(columns.count))));
  body.setAttribute("spcCol", String(Math.round((columns.gutterInches ?? 0.25) * EMU_PER_INCH)));
}

function applyCrop(shape: Element, crop: NonNullable<PictureTreatment["crop"]>, document: Document): void {
  const fill = firstDescendant(shape, "a:blipFill");
  if (!fill) return;
  const existing = directChildren(fill).find((child) => child.nodeName === "a:srcRect");
  const rect = existing ?? document.createElementNS(fill.namespaceURI, "a:srcRect");
  if (crop.left) rect.setAttribute("l", perMille(crop.left));
  if (crop.top) rect.setAttribute("t", perMille(crop.top));
  if (crop.right) rect.setAttribute("r", perMille(crop.right));
  if (crop.bottom) rect.setAttribute("b", perMille(crop.bottom));
  if (existing) return;
  // CT_BlipFillProperties is blip?, srcRect?, then the fill mode.
  const mode = directChildren(fill).find((child) => child.nodeName === "a:stretch" || child.nodeName === "a:tile");
  if (mode) fill.insertBefore(rect, mode);
  else fill.appendChild(rect);
}

function applyMask(shape: Element, maskShape: string, document: Document): void {
  const properties = directChildren(shape).find((child) => child.nodeName === "p:spPr");
  if (!properties) return;
  const geometry = directChildren(properties).find((child) => child.nodeName === "a:prstGeom");
  if (geometry) {
    geometry.setAttribute("prst", maskShape);
    return;
  }
  const created = document.createElementNS(properties.namespaceURI, "a:prstGeom");
  created.setAttribute("prst", maskShape);
  created.appendChild(document.createElementNS(properties.namespaceURI, "a:avLst"));
  // CT_ShapeProperties is xfrm?, geometry?, fill?, ln?, effects…
  const transform = directChildren(properties).find((child) => child.nodeName === "a:xfrm");
  if (transform?.nextSibling) properties.insertBefore(created, transform.nextSibling);
  else properties.appendChild(created);
}

function colorElement(document: Document, namespace: string | null, value: string): Element {
  const color = document.createElementNS(namespace, "a:srgbClr");
  color.setAttribute("val", hex(value));
  return color;
}

function applyBlipEffects(shape: Element, treatment: PictureTreatment, document: Document): void {
  if (!treatment.duotone && !treatment.grayscale) return;
  const blip = firstDescendant(shape, "a:blip");
  if (!blip) return;
  const namespace = blip.namespaceURI;
  const extensions = directChildren(blip).find((child) => child.nodeName === "a:extLst");
  const insert = (element: Element) => {
    if (extensions) blip.insertBefore(element, extensions);
    else blip.appendChild(element);
  };
  if (treatment.grayscale && !directChildren(blip).some((child) => child.nodeName === "a:grayscl")) {
    insert(document.createElementNS(namespace, "a:grayscl"));
  }
  if (treatment.duotone && !directChildren(blip).some((child) => child.nodeName === "a:duotone")) {
    const duotone = document.createElementNS(namespace, "a:duotone");
    duotone.appendChild(colorElement(document, namespace, treatment.duotone.shadow));
    duotone.appendChild(colorElement(document, namespace, treatment.duotone.highlight));
    insert(duotone);
  }
}

/**
 * Applies every requested pass to one slide part, returning the XML unchanged
 * when nothing on that slide is targeted.
 */
export function postProcessSlideXml(xml: string, entries: ShapePostProcess[]): string {
  if (entries.length === 0) return xml;
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const document = new DOMParser().parseFromString(xml, "application/xml");
  let changed = false;

  for (const properties of Array.from(document.getElementsByTagName("p:cNvPr"))) {
    const entry = byName.get(properties.getAttribute("name") ?? "");
    if (!entry) continue;
    const shape = shapeFor(properties);
    if (!shape) continue;
    if (entry.columns) {
      applyColumns(shape, entry.columns);
      changed = true;
    }
    if (entry.picture) {
      if (entry.picture.crop) applyCrop(shape, entry.picture.crop, document);
      if (entry.picture.maskShape) applyMask(shape, entry.picture.maskShape, document);
      applyBlipEffects(shape, entry.picture, document);
      changed = true;
    }
  }

  if (!changed) return xml;
  const serialized = new XMLSerializer().serializeToString(document);
  return serialized.startsWith("<?xml")
    ? serialized
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${serialized}`;
}

/**
 * Turns a focal point into an explicit crop for a `cover` fit.
 *
 * `cover` fills the frame and throws away the overflow; without a focal point
 * it throws it away from the edges, which is how a person's head leaves the
 * picture. Given the frame's aspect ratio and the source's, this is the crop
 * that keeps the declared subject in view.
 */
export function cropForFocalPoint(
  focal: { x: number; y: number },
  sourceAspect: number,
  frameAspect: number,
): PictureTreatment["crop"] {
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(frameAspect) || sourceAspect <= 0 || frameAspect <= 0) return undefined;
  if (Math.abs(sourceAspect - frameAspect) < 1e-6) return undefined;
  if (sourceAspect > frameAspect) {
    // Source is wider than the frame: trim the sides around the focal x.
    const keep = frameAspect / sourceAspect;
    const trim = 1 - keep;
    const left = Math.max(0, Math.min(trim, focal.x - keep / 2));
    return { left, right: trim - left };
  }
  const keep = sourceAspect / frameAspect;
  const trim = 1 - keep;
  const top = Math.max(0, Math.min(trim, focal.y - keep / 2));
  return { top, bottom: trim - top };
}
