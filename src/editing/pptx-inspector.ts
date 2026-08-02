import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

import type { ChartSpec, DeckManifest, ElementRecord, PptxInspection, SlideKind } from "../types/index.js";
import { resolvePackageTarget } from "../utils/ooxml.js";
import { decodeXml } from "../utils/text.js";

const EMU_PER_INCH = 914400;

interface SlideReference {
  relationshipId: string;
  path: string;
}

interface PackageRelationship {
  id: string;
  target: string;
  type: string;
}

function relationships(xml: string): PackageRelationship[] {
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].flatMap((match) => {
    const block = match[0];
    const id = xmlAttribute(block, "Id");
    const target = xmlAttribute(block, "Target");
    const type = xmlAttribute(block, "Type");
    return id && target && type ? [{ id, target: decodeXml(target), type }] : [];
  });
}

function relationshipMap(xml: string): Map<string, string> {
  return new Map(relationships(xml).map((relationship) => [relationship.id, relationship.target]));
}

function orderedSlides(presentationXml: string, relationshipsXml: string): SlideReference[] {
  const relationships = relationshipMap(relationshipsXml);
  return [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)]
    .map((match) => {
      const relationshipId = match[1]!;
      const target = relationships.get(relationshipId);
      return target ? { relationshipId, path: resolvePackageTarget("ppt/presentation.xml", target) } : undefined;
    })
    .filter((value): value is SlideReference => Boolean(value));
}

function slideSize(presentationXml: string): { width: number; height: number } {
  const match = presentationXml.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  return match ? { width: Number(match[1]) / EMU_PER_INCH, height: Number(match[2]) / EMU_PER_INCH } : { width: 13.333333, height: 7.5 };
}

function xmlAttribute(xml: string, attribute: string): string | undefined {
  return xml.match(new RegExp(`\\b${attribute}="([^"]*)"`))?.[1];
}

function frameOf(block: string): { x: number; y: number; w: number; h: number } {
  const offset = block.match(/<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
  const extent = block.match(/<a:ext\b[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/);
  return {
    x: Number(offset?.[1] ?? 0) / EMU_PER_INCH,
    y: Number(offset?.[2] ?? 0) / EMU_PER_INCH,
    w: Number(extent?.[1] ?? 0) / EMU_PER_INCH,
    h: Number(extent?.[2] ?? 0) / EMU_PER_INCH,
  };
}

function textOf(block: string): string {
  return [...block.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1] ?? "")).join(" ").trim();
}

function firstColor(block: string): string | undefined {
  return block.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase();
}

function textColor(block: string): string | undefined {
  return firstColor(block.match(/<p:txBody>[\s\S]*?<\/p:txBody>/)?.[0] ?? "");
}

function shapeFillColor(block: string): string | undefined {
  const properties = block.match(/<p:spPr(?:\s[^>]*)?>[\s\S]*?<\/p:spPr>/)?.[0] ?? "";
  return properties.includes("<a:noFill") ? undefined : firstColor(properties);
}

function roleFor(name: string, type: ElementRecord["type"]): string {
  const normalized = name.toLowerCase();
  if (/^(?:deck-|slide-|section-|closing-)?title(?:\s*\d+)?$/.test(normalized)) return "title";
  if (normalized.includes("subtitle")) return "subtitle";
  if (/footer|slide-number/.test(normalized)) return "footer";
  if (/caption/.test(normalized)) return "caption";
  if (/eyebrow|(?:^|-)index|(?:^|-)number|(?:^|-)label/.test(normalized)) return "index";
  if (/process-title|timeline-title|architecture-label|roadmap-text/.test(normalized)) return "diagram-label";
  return type === "text" ? "body" : type;
}

function elementBlocks(xml: string): Array<{ type: ElementRecord["type"]; block: string }> {
  const matches: Array<{ type: ElementRecord["type"]; block: string; index: number }> = [];
  const patterns: Array<[ElementRecord["type"], RegExp]> = [
    ["text", /<p:sp\b[\s\S]*?<\/p:sp>/g],
    ["image", /<p:pic\b[\s\S]*?<\/p:pic>/g],
    ["table", /<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g],
    ["connector", /<p:cxnSp\b[\s\S]*?<\/p:cxnSp>/g],
  ];
  for (const [type, pattern] of patterns) {
    for (const match of xml.matchAll(pattern)) {
      const block = match[0];
      matches.push({ type: type === "table" && (block.includes("<c:chart") || block.includes("/chart\"")) ? "chart" : type, block, index: match.index ?? 0 });
    }
  }
  return matches.sort((left, right) => left.index - right.index).map(({ type, block }) => ({ type, block }));
}

function sourceRelationship(block: string): string | undefined {
  return block.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1]
    ?? block.match(/<c:chart\b[^>]*\br:id="([^"]+)"/)?.[1];
}

function cacheValues(container: string, tag: "cat" | "val"): string[] {
  const tagged = container.match(new RegExp(`<c:${tag}>[\\s\\S]*?<\\/c:${tag}>`))?.[0];
  if (!tagged) return [];
  const cache = tagged.match(/<c:(?:strCache|numCache|multiLvlStrCache)>[\s\S]*?<\/c:(?:strCache|numCache|multiLvlStrCache)>/)?.[0];
  if (!cache) return [];
  return [...cache.matchAll(/<c:pt\b[^>]*\bidx="(\d+)"[^>]*>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>[\s\S]*?<\/c:pt>/g)]
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .map((match) => decodeXml(match[2] ?? ""));
}

function chartSpec(xml: string): ChartSpec | undefined {
  const kind = xml.includes("<c:barChart") ? "bar"
    : xml.includes("<c:lineChart") ? "line"
      : xml.includes("<c:pieChart") ? "pie"
        : xml.includes("<c:areaChart") ? "area"
          : undefined;
  if (!kind) return undefined;
  const seriesBlocks = [...xml.matchAll(/<c:ser>[\s\S]*?<\/c:ser>/g)].map((match) => match[0]);
  const labels = seriesBlocks.map((block) => cacheValues(block, "cat")).find((values) => values.length > 0) ?? [];
  const series = seriesBlocks.map((block, index) => {
    const nameBlock = block.match(/<c:tx>[\s\S]*?<\/c:tx>/)?.[0] ?? "";
    const name = [...nameBlock.matchAll(/<c:v>([\s\S]*?)<\/c:v>/g)].map((match) => decodeXml(match[1] ?? "")).find(Boolean)
      ?? `Series ${index + 1}`;
    return { name, values: cacheValues(block, "val").map(Number) };
  });
  return {
    kind,
    labels,
    series,
    showLegend: xml.includes("<c:legend"),
    showValues: /<c:showVal\b[^>]*\bval="1"/.test(xml),
  };
}

function inferSlideKind(elements: ElementRecord[]): SlideKind {
  if (elements.some((element) => element.type === "chart")) return "chart";
  if (elements.some((element) => element.type === "table")) return "table";
  if (elements.some((element) => element.type === "image")) return "text-image";
  return "custom";
}

function coreTitle(xml: string): string | undefined {
  return xml.match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/)?.[1];
}

export class PptxInspector {
  public async inspect(inputPath: string): Promise<PptxInspection> {
    const input = path.resolve(inputPath);
    const zip = await JSZip.loadAsync(await readFile(input));
    const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
    const presentationRels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
    if (!presentationXml || !presentationRels) throw new Error("Invalid PPTX: presentation parts are missing.");
    const size = slideSize(presentationXml);
    const references = orderedSlides(presentationXml, presentationRels);
    const warnings: string[] = [];
    const unsupportedFeatures: string[] = [];
    const names = Object.keys(zip.files);
    if (names.some((name) => /vbaProject\.bin$/i.test(name))) unsupportedFeatures.push("VBA macros");
    if (names.some((name) => /^ppt\/diagrams\//.test(name))) unsupportedFeatures.push("SmartArt diagrams");
    if (names.some((name) => /^ppt\/embeddings\//.test(name) && !name.endsWith("/") && !/\.xlsx$/i.test(name))) unsupportedFeatures.push("embedded OLE objects");
    if (names.some((name) => /model3d/i.test(name))) unsupportedFeatures.push("3D models");

    const slides = [];
    for (let index = 0; index < references.length; index += 1) {
      const reference = references[index]!;
      const xml = await zip.file(reference.path)?.async("string");
      if (!xml) {
        warnings.push(`Slide ${index + 1} points to missing package part ${reference.path}.`);
        continue;
      }
      if (xml.includes("<p:timing")) unsupportedFeatures.push("animations or timing");
      const relPath = path.posix.join(path.posix.dirname(reference.path), "_rels", `${path.posix.basename(reference.path)}.rels`);
      const relXml = await zip.file(relPath)?.async("string") ?? "";
      const relationshipTargets = relationshipMap(relXml);
      const elements: ElementRecord[] = elementBlocks(xml).map(({ type, block }, elementIndex) => {
        const cNvPr = block.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? "";
        const name = decodeXml(xmlAttribute(cNvPr, "name") ?? `${type}-${elementIndex + 1}`);
        const text = textOf(block);
        const detectedType: ElementRecord["type"] = type === "text" && !text ? "shape" : type;
        const fontSize = Number(block.match(/<(?:a:rPr|a:defRPr)\b[^>]*\bsz="(\d+)"/)?.[1] ?? 0) / 100 || undefined;
        const fontFace = block.match(/<a:latin\b[^>]*\btypeface="([^"]+)"/)?.[1];
        const relationshipId = sourceRelationship(block);
        const target = relationshipId ? relationshipTargets.get(relationshipId) : undefined;
        const packagePath = target ? resolvePackageTarget(reference.path, target) : undefined;
        const role = roleFor(name, detectedType);
        const detectedTextColor = textColor(block);
        const detectedFillColor = shapeFillColor(block);
        return {
          id: `s${index + 1}-e${elementIndex + 1}`,
          name,
          type: detectedType,
          role,
          ...frameOf(block),
          ...(text ? { text } : {}),
          ...(fontSize ? { fontSize } : {}),
          ...(fontFace ? { fontFace } : {}),
          ...(detectedTextColor ? { textColor: detectedTextColor } : {}),
          ...(detectedFillColor ? { fillColor: detectedFillColor } : {}),
          ...(detectedType === "image" && packagePath ? { imagePath: `${input}#${packagePath}` } : {}),
          intentionalOverlap: detectedType === "connector" || /motif|decorative/.test(name.toLowerCase()),
          ...(relationshipId ? { metadata: { relationshipId, packagePath } } : {}),
        };
      });
      for (const element of elements.filter((item) => item.type === "chart" && item.metadata?.packagePath)) {
        const packagePath = String(element.metadata?.packagePath);
        const chartXml = await zip.file(packagePath)?.async("string");
        const parsed = chartXml ? chartSpec(chartXml) : undefined;
        if (parsed) element.metadata = { ...element.metadata, chart: parsed };
      }
      const titleElement = elements.find((element) => element.role === "title" && element.text)
        ?? elements.filter((element) => element.type === "text" && element.text).sort((left, right) => left.y - right.y || (right.fontSize ?? 0) - (left.fontSize ?? 0))[0];
      const notesRelationship = relationships(relXml).find((relationship) => relationship.type.endsWith("/notesSlide"));
      const notesPath = notesRelationship
        ? resolvePackageTarget(reference.path, notesRelationship.target)
        : undefined;
      const notesXml = notesPath ? await zip.file(notesPath)?.async("string") : undefined;
      const notes = notesXml ? [textOf(notesXml)].filter(Boolean) : [];
      slides.push({
        number: index + 1,
        id: `slide-${index + 1}`,
        title: titleElement?.text ?? "",
        kind: inferSlideKind(elements),
        elements,
        notes,
      });
    }
    const properties = await zip.file("docProps/core.xml")?.async("string") ?? "";
    const presentationTitle = decodeXml(coreTitle(properties) ?? slides[0]?.title ?? "");
    return {
      manifest: {
        schemaVersion: "1.0",
        presentationTitle,
        width: size.width,
        height: size.height,
        createdAt: new Date().toISOString(),
        slides,
      },
      warnings,
      unsupportedFeatures: [...new Set(unsupportedFeatures)],
    };
  }
}
