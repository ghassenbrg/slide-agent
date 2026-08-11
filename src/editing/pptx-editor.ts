import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

import type {
  ApplyThemeOperation,
  ChartSeries,
  EditOperation,
  ImportSlideOperation,
  ReplaceImageOperation,
  UpdateChartOperation,
  UpdateTableOperation,
} from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";
import { checkLink } from "../utils/links.js";
import { writeBinary } from "../utils/files.js";
import { PptxSanitizer } from "../export/pptx-sanitizer.js";
import { resolvePackageTarget } from "../utils/ooxml.js";
import { decodeXml, escapeXml } from "../utils/text.js";
import { PptxInspector } from "./pptx-inspector.js";

interface SlideEntry {
  block: string;
  relationshipId: string;
  path: string;
}

interface PackageState {
  zip: JSZip;
  presentationXml: string;
  presentationRels: string;
  contentTypes: string;
  slides: SlideEntry[];
}

export interface PptxEditResult {
  output: string;
  slideCount: number;
  warnings: string[];
  unsupportedFeatures: string[];
}

function relationMap(xml: string): Map<string, string> {
  return new Map(relationships(xml).flatMap((relationship) => relationship.id && relationship.target
    ? [[relationship.id, decodeXml(relationship.target)] as const]
    : []));
}

function relationshipAttribute(block: string, attribute: string): string | undefined {
  return block.match(new RegExp(`\\b${attribute}="([^"]*)"`))?.[1];
}

function relationships(xml: string): Array<{ block: string; id?: string; target?: string; type?: string }> {
  return [...xml.matchAll(/<Relationship\b[^>]*>/g)].map((match) => ({
    block: match[0],
    id: relationshipAttribute(match[0], "Id"),
    target: relationshipAttribute(match[0], "Target"),
    type: relationshipAttribute(match[0], "Type"),
  }));
}

function loadSlides(presentationXml: string, relationshipsXml: string): SlideEntry[] {
  const relationships = relationMap(relationshipsXml);
  return [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)].map((match) => {
    const relationshipId = match[1]!;
    const target = relationships.get(relationshipId);
    if (!target) throw new SlideAgentError("BROKEN_SLIDE_RELATIONSHIP", `Slide relationship ${relationshipId} has no target.`);
    return { block: match[0], relationshipId, path: resolvePackageTarget("ppt/presentation.xml", target) };
  });
}

async function loadPackage(input: string): Promise<PackageState> {
  const zip = await JSZip.loadAsync(await readFile(input));
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
  const presentationRels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  if (!presentationXml || !presentationRels || !contentTypes) throw new SlideAgentError("INVALID_PPTX", "Presentation package is missing required parts.");
  return { zip, presentationXml, presentationRels, contentTypes, slides: loadSlides(presentationXml, presentationRels) };
}

function relsPath(slidePath: string): string {
  return path.posix.join(path.posix.dirname(slidePath), "_rels", `${path.posix.basename(slidePath)}.rels`);
}

function replaceTextNodes(xml: string, find: string, replacement: string, replaceAll: boolean): { xml: string; count: number } {
  let count = 0;
  const output = xml.replace(/<a:t(\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (block, attributes: string | undefined, encoded: string) => {
    const value = decodeXml(encoded);
    if (!value.includes(find) || (!replaceAll && count > 0)) return block;
    const next = replaceAll ? value.replaceAll(find, replacement) : value.replace(find, replacement);
    count += replaceAll ? value.split(find).length - 1 : 1;
    return `<a:t${attributes ?? ""}>${escapeXml(next)}</a:t>`;
  });
  return { xml: output, count };
}

function maxNumber(names: string[], pattern: RegExp): number {
  return Math.max(0, ...names.map((name) => Number(name.match(pattern)?.[1] ?? 0)));
}

function appendBeforeClosing(xml: string, closingTag: string, value: string): string {
  const index = xml.lastIndexOf(closingTag);
  if (index < 0) throw new Error(`Closing tag not found: ${closingTag}`);
  return `${xml.slice(0, index)}${value}${xml.slice(index)}`;
}

function updateSlideList(presentationXml: string, slides: SlideEntry[]): string {
  return presentationXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${slides.map((slide) => slide.block).join("")}</p:sldIdLst>`);
}

function extensionContentType(extension: string): string {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "gif") return "image/gif";
  return "image/png";
}

function ensureDefaultContentType(xml: string, extension: string): string {
  if (new RegExp(`<Default\\b[^>]*Extension="${extension}"`, "i").test(xml)) return xml;
  return appendBeforeClosing(xml, "</Types>", `<Default Extension="${extension}" ContentType="${extensionContentType(extension)}"/>`);
}

function replaceRelationshipTarget(xml: string, relationshipId: string, target: string): string {
  let found = false;
  const updated = xml.replace(/<Relationship\b[^>]*>/g, (block) => {
    if (relationshipAttribute(block, "Id") !== relationshipId) return block;
    found = true;
    return block.replace(/\bTarget="[^"]*"/, `Target="${escapeXml(target)}"`);
  });
  if (!found) throw new SlideAgentError("RELATIONSHIP_NOT_FOUND", `Relationship ${relationshipId} was not found.`);
  return updated;
}

function relationshipIdForImage(slideXml: string, operation: ReplaceImageOperation): string | undefined {
  if (operation.relationshipId) return operation.relationshipId;
  const pictures = [...slideXml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)];
  const imageName = operation.name;
  const selected = imageName
    ? pictures.find((match) => new RegExp(`<p:cNvPr\\b[^>]*\\bname="${imageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(match[0]))
    : pictures[0];
  return selected?.[0].match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1];
}

function replaceTagCache(block: string, tag: "cat" | "val", values: Array<string | number>): string {
  const tagExpression = new RegExp(`<c:${tag}>[\\s\\S]*?<\\/c:${tag}>`);
  const original = block.match(tagExpression)?.[0];
  if (!original) return block;
  const stringValues = tag === "cat";
  const usesMultiLevelCache = stringValues && original.includes("<c:multiLvlStrCache>");
  const cacheTag = usesMultiLevelCache ? "multiLvlStrCache" : stringValues ? "strCache" : "numCache";
  const points = values.map((value, index) => `<c:pt idx="${index}"><c:v>${escapeXml(String(value))}</c:v></c:pt>`).join("");
  const cache = usesMultiLevelCache
    ? `<c:${cacheTag}><c:ptCount val="${values.length}"/><c:lvl>${points}</c:lvl></c:${cacheTag}>`
    : `<c:${cacheTag}><c:ptCount val="${values.length}"/>${points}</c:${cacheTag}>`;
  const updated = original.replace(new RegExp(`<c:${cacheTag}>[\\s\\S]*?<\\/c:${cacheTag}>`), cache);
  return block.replace(original, updated);
}

function replaceSeriesName(block: string, name: string): string {
  const tx = block.match(/<c:tx>[\s\S]*?<\/c:tx>/)?.[0];
  if (!tx) return block;
  const cache = `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${escapeXml(name)}</c:v></c:pt></c:strCache>`;
  const updated = tx.replace(/<c:strCache>[\s\S]*?<\/c:strCache>/, cache);
  return block.replace(tx, updated);
}

function replaceTagFormula(block: string, tag: "cat" | "val", finalRow: number): string {
  const tagExpression = new RegExp(`<c:${tag}>[\\s\\S]*?<\\/c:${tag}>`);
  const original = block.match(tagExpression)?.[0];
  if (!original) return block;
  const updated = original.replace(/<c:f>([\s\S]*?)<\/c:f>/, (formulaBlock, encodedFormula: string) => {
    const formula = decodeXml(encodedFormula);
    const resized = formula.replace(/(\$[A-Z]+\$)\d+$/, `$1${finalRow}`);
    return resized === formula ? formulaBlock : `<c:f>${escapeXml(resized)}</c:f>`;
  });
  return block.replace(original, updated);
}

async function updateEmbeddedWorkbook(state: PackageState, chartPath: string, labels: string[], series: ChartSeries[]): Promise<boolean> {
  const chartRelsPath = path.posix.join(path.posix.dirname(chartPath), "_rels", `${path.posix.basename(chartPath)}.rels`);
  const chartRels = await state.zip.file(chartRelsPath)?.async("string");
  if (!chartRels) return false;
  const workbookTarget = relationships(chartRels).find((relationship) => relationship.type?.endsWith("/package"))?.target;
  if (!workbookTarget) return false;
  const workbookPath = resolvePackageTarget(chartPath, decodeXml(workbookTarget));
  const workbookBytes = await state.zip.file(workbookPath)?.async("nodebuffer");
  if (!workbookBytes) return false;
  const workbook = await JSZip.loadAsync(workbookBytes);
  const workbookXml = await workbook.file("xl/workbook.xml")?.async("string");
  const workbookRels = await workbook.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !workbookRels) return false;
  const firstSheetId = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const sheetTarget = relationships(workbookRels).find((relationship) => relationship.id === firstSheetId)?.target;
  if (!sheetTarget) return false;
  const worksheetPath = sheetTarget.startsWith("/")
    ? sheetTarget.slice(1)
    : path.posix.normalize(path.posix.join("xl", decodeXml(sheetTarget)));
  let worksheetXml = await workbook.file(worksheetPath)?.async("string");
  if (!worksheetXml) return false;

  const columnName = (index: number): string => {
    let value = index;
    let output = "";
    while (value > 0) {
      value -= 1;
      output = String.fromCharCode(65 + value % 26) + output;
      value = Math.floor(value / 26);
    }
    return output;
  };
  const stringCell = (reference: string, value: string): string =>
    `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  const numberCell = (reference: string, value: number): string =>
    `<c r="${reference}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
  const header = [stringCell("A1", "Category"), ...series.map((item, index) => stringCell(`${columnName(index + 2)}1`, item.name))];
  const rows = [`<row r="1">${header.join("")}</row>`, ...labels.map((label, rowIndex) => {
    const row = rowIndex + 2;
    const cells = [stringCell(`A${row}`, label), ...series.map((item, seriesIndex) =>
      numberCell(`${columnName(seriesIndex + 2)}${row}`, item.values[rowIndex] ?? 0))];
    return `<row r="${row}">${cells.join("")}</row>`;
  })];
  const sheetData = `<sheetData>${rows.join("")}</sheetData>`;
  if (!/<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/.test(worksheetXml)) return false;
  worksheetXml = worksheetXml.replace(/<sheetData\b[^>]*(?:\/>|>[\s\S]*?<\/sheetData>)/, sheetData);
  const lastCell = `${columnName(series.length + 1)}${labels.length + 1}`;
  worksheetXml = worksheetXml.replace(/<dimension\b[^>]*\bref="[^"]*"[^>]*\/>/, `<dimension ref="A1:${lastCell}"/>`);
  workbook.file(worksheetPath, worksheetXml);
  state.zip.file(workbookPath, await workbook.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return true;
}

/**
 * The slides an edit altered, or `undefined` when it cannot be known.
 *
 * Only the in-place operations qualify, and only when every operation in the
 * batch is one of them. `remove-slide`, `reorder-slides`, `duplicate-slide`,
 * `import-slide`, and `apply-theme` either renumber the deck or touch all of
 * it, so any of them present makes the whole answer unknowable — and a wrong
 * subset here would mean showing the model the wrong renders, which is worse
 * than showing it all of them.
 */
export function editedSlides(operations: readonly EditOperation[]): number[] | undefined {
  const slides = new Set<number>();
  for (const operation of operations) {
    switch (operation.type) {
      case "replace-image":
      case "update-table":
      case "update-chart":
        slides.add(operation.slide);
        break;
      case "replace-text":
        if (operation.slide === undefined) return undefined;
        slides.add(operation.slide);
        break;
      default:
        return undefined;
    }
  }
  return slides.size > 0 ? [...slides].sort((left, right) => left - right) : undefined;
}

export class PptxEditor {
  public async edit(inputPath: string, outputPath: string, operations: EditOperation[]): Promise<PptxEditResult> {
    const input = path.resolve(inputPath);
    const output = path.resolve(outputPath);
    if (input === output) throw new SlideAgentError("IN_PLACE_EDIT_FORBIDDEN", "Write edits to a new file so the source presentation remains recoverable.");
    const inspection = await new PptxInspector().inspect(input);
    const state = await loadPackage(input);
    const warnings = [...inspection.warnings];
    for (const operation of operations) await this.apply(state, operation, warnings);
    await this.updateExplicitSlideNumbers(state);
    state.presentationXml = updateSlideList(state.presentationXml, state.slides);
    state.zip.file("ppt/presentation.xml", state.presentationXml);
    state.zip.file("ppt/_rels/presentation.xml.rels", state.presentationRels);
    state.zip.file("[Content_Types].xml", state.contentTypes);
    const bytes = await state.zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await writeBinary(output, bytes);
    await new PptxSanitizer().sanitizeFile(output);
    return { output, slideCount: state.slides.length, warnings, unsupportedFeatures: inspection.unsupportedFeatures };
  }

  private async apply(state: PackageState, operation: EditOperation, warnings: string[]): Promise<void> {
    switch (operation.type) {
      case "replace-text": {
        const indexes = operation.slide ? [operation.slide - 1] : state.slides.map((_, index) => index);
        let total = 0;
        for (const index of indexes) {
          const entry = state.slides[index];
          if (!entry) throw new SlideAgentError("SLIDE_NOT_FOUND", `Slide ${index + 1} does not exist.`);
          const xml = await state.zip.file(entry.path)?.async("string");
          if (!xml) continue;
          const result = replaceTextNodes(xml, operation.find, operation.replace, operation.replaceAll ?? true);
          total += result.count;
          state.zip.file(entry.path, result.xml);
        }
        if (total === 0) warnings.push(`Text not found: ${operation.find}`);
        break;
      }
      case "remove-slide":
        this.removeSlide(state, operation.slide);
        break;
      case "duplicate-slide":
      case "add-slide":
        await this.duplicateSlide(state, operation.slide, operation.insertAt, operation.replacements ?? []);
        break;
      case "import-slide":
        await this.importSlide(state, operation, warnings);
        break;
      case "reorder-slides":
        this.reorderSlides(state, operation.order);
        break;
      case "apply-theme":
        await this.applyTheme(state, operation);
        break;
      case "replace-image":
        await this.replaceImage(state, operation);
        break;
      case "update-table":
        await this.updateTable(state, operation);
        break;
      case "update-chart":
        await this.updateChart(state, operation, warnings);
        break;
    }
  }

  private async updateExplicitSlideNumbers(state: PackageState): Promise<void> {
    for (let index = 0; index < state.slides.length; index += 1) {
      const entry = state.slides[index]!;
      let xml = await state.zip.file(entry.path)?.async("string");
      if (!xml) continue;
      const blocks = [...xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)];
      for (const match of blocks) {
        const block = match[0];
        if (!/<p:cNvPr\b[^>]*\bname="slide-number"/.test(block)) continue;
        let replaced = false;
        const updated = block.replace(/<a:t(\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (textBlock, attributes: string | undefined) => {
          if (replaced) return textBlock;
          replaced = true;
          return `<a:t${attributes ?? ""}>${String(index + 1).padStart(2, "0")}</a:t>`;
        });
        xml = xml.replace(block, updated);
      }
      state.zip.file(entry.path, xml);
    }
  }

  private removeSlide(state: PackageState, slideNumber: number): void {
    const entry = state.slides[slideNumber - 1];
    if (!entry) throw new SlideAgentError("SLIDE_NOT_FOUND", `Slide ${slideNumber} does not exist.`);
    state.slides.splice(slideNumber - 1, 1);
    state.presentationRels = state.presentationRels.replace(/<Relationship\b[^>]*>/g, (block) =>
      relationshipAttribute(block, "Id") === entry.relationshipId ? "" : block);
    state.zip.remove(entry.path);
    state.zip.remove(relsPath(entry.path));
    state.contentTypes = state.contentTypes.replace(new RegExp(`<Override\\b[^>]*PartName="/${entry.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`), "");
  }

  private async duplicateSlide(state: PackageState, slideNumber: number, insertAt?: number, replacements: Array<{ find: string; replace: string }> = []): Promise<void> {
    const source = state.slides[slideNumber - 1];
    if (!source) throw new SlideAgentError("SLIDE_NOT_FOUND", `Slide ${slideNumber} does not exist.`);
    const names = Object.keys(state.zip.files);
    const newPartNumber = maxNumber(names, /^ppt\/slides\/slide(\d+)\.xml$/) + 1;
    const newPath = `ppt/slides/slide${newPartNumber}.xml`;
    let slideXml = await state.zip.file(source.path)?.async("string");
    if (!slideXml) throw new SlideAgentError("SLIDE_PART_MISSING", `Missing ${source.path}.`);
    for (const replacement of replacements) slideXml = replaceTextNodes(slideXml, replacement.find, replacement.replace, true).xml;
    state.zip.file(newPath, slideXml);
    const sourceRelsPath = relsPath(source.path);
    let slideRels = await state.zip.file(sourceRelsPath)?.async("string");
    if (slideRels) {
      const notesRelationship = relationships(slideRels).find((relationship) => relationship.type?.endsWith("/notesSlide"));
      if (notesRelationship?.target) {
        const sourceNotesPath = resolvePackageTarget(source.path, decodeXml(notesRelationship.target));
        const sourceNotesXml = await state.zip.file(sourceNotesPath)?.async("string");
        if (sourceNotesXml) {
          const notesNumber = maxNumber(names, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/) + 1;
          const newNotesPath = `ppt/notesSlides/notesSlide${notesNumber}.xml`;
          state.zip.file(newNotesPath, sourceNotesXml);
          const sourceNotesRels = await state.zip.file(relsPath(sourceNotesPath))?.async("string");
          if (sourceNotesRels) {
            const updatedNotesRels = sourceNotesRels.replace(/<Relationship\b[^>]*>/g, (block) => {
              if (!relationshipAttribute(block, "Type")?.endsWith("/slide")) return block;
              return block.replace(/\bTarget="[^"]*"/, `Target="../slides/${path.posix.basename(newPath)}"`);
            });
            state.zip.file(relsPath(newNotesPath), updatedNotesRels);
          }
          slideRels = slideRels.replace(notesRelationship.block, notesRelationship.block.replace(
            /\bTarget="[^"]*"/,
            `Target="../notesSlides/${path.posix.basename(newNotesPath)}"`,
          ));
          const sourceNotesOverride = state.contentTypes.match(new RegExp(`<Override\\b[^>]*PartName="/${sourceNotesPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`))?.[0];
          const notesOverride = sourceNotesOverride?.replace(`/${sourceNotesPath}`, `/${newNotesPath}`)
            ?? `<Override PartName="/${newNotesPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
          state.contentTypes = appendBeforeClosing(state.contentTypes, "</Types>", notesOverride);
        } else {
          slideRels = slideRels.replace(notesRelationship.block, "");
        }
      }
      state.zip.file(relsPath(newPath), slideRels);
    }
    const relationshipNumber = maxNumber([...state.presentationRels.matchAll(/\bId="rId(\d+)"/g)].map((match) => `rId${match[1]}`), /rId(\d+)/) + 1;
    const relationshipId = `rId${relationshipNumber}`;
    state.presentationRels = appendBeforeClosing(state.presentationRels, "</Relationships>", `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${newPartNumber}.xml"/>`);
    const slideId = Math.max(255, ...state.slides.map((slide) => Number(slide.block.match(/\bid="(\d+)"/)?.[1] ?? 255))) + 1;
    const entry: SlideEntry = { block: `<p:sldId id="${slideId}" r:id="${relationshipId}"/>`, relationshipId, path: newPath };
    const index = Math.max(0, Math.min((insertAt ?? state.slides.length + 1) - 1, state.slides.length));
    state.slides.splice(index, 0, entry);
    const sourceOverride = state.contentTypes.match(new RegExp(`<Override\\b[^>]*PartName="/${source.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`))?.[0];
    const override = sourceOverride?.replace(`/${source.path}`, `/${newPath}`)
      ?? `<Override PartName="/${newPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    state.contentTypes = appendBeforeClosing(state.contentTypes, "</Types>", override);
  }

  /**
   * Copy a slide out of another presentation.
   *
   * Everything the slide points at travels with it — images, charts and their
   * embedded workbooks, speaker notes — renamed so it cannot collide with a
   * part already in the destination. The one thing that does not travel is the
   * slide layout: importing it would drag in its master and theme, and the
   * deck would end up carrying two design systems. The slide is remapped onto
   * the destination layout of the same type instead, which is PowerPoint's
   * "use destination theme", and the substitution is reported.
   *
   * Links inside an imported slide are held to the same allowlist as links a
   * model authors: the source deck is a file the caller has been handed, and
   * it is not more trustworthy than a canvas.
   */
  private async importSlide(state: PackageState, operation: ImportSlideOperation, warnings: string[]): Promise<void> {
    const sourcePath = path.resolve(operation.source);
    const sourceZip = await JSZip.loadAsync(await readFile(sourcePath)).catch(() => {
      throw new SlideAgentError("SOURCE_NOT_READABLE", `Cannot read ${sourcePath} as a PowerPoint package.`);
    });
    const sourcePresentation = await sourceZip.file("ppt/presentation.xml")?.async("string");
    const sourceRels = await sourceZip.file("ppt/_rels/presentation.xml.rels")?.async("string");
    if (!sourcePresentation || !sourceRels) {
      throw new SlideAgentError("INVALID_PPTX", `${sourcePath} is missing required presentation parts.`);
    }
    const sourceSlides = loadSlides(sourcePresentation, sourceRels);
    const source = sourceSlides[operation.slide - 1];
    if (!source) {
      throw new SlideAgentError("SLIDE_NOT_FOUND", `${sourcePath} has ${sourceSlides.length} slides; slide ${operation.slide} does not exist.`);
    }

    let slideXml = await sourceZip.file(source.path)?.async("string");
    if (!slideXml) throw new SlideAgentError("SLIDE_PART_MISSING", `Missing ${source.path} in ${sourcePath}.`);
    for (const replacement of operation.replacements ?? []) {
      slideXml = replaceTextNodes(slideXml, replacement.find, replacement.replace, true).xml;
    }

    const names = Object.keys(state.zip.files);
    const newPartNumber = maxNumber(names, /^ppt\/slides\/slide(\d+)\.xml$/) + 1;
    const newPath = `ppt/slides/slide${newPartNumber}.xml`;

    const sourceSlideRels = await sourceZip.file(relsPath(source.path))?.async("string");
    const rewritten = sourceSlideRels
      ? await this.importSlideRelationships(state, sourceZip, sourcePath, source.path, newPath, sourceSlideRels, warnings)
      : undefined;

    state.zip.file(newPath, slideXml);
    if (rewritten) state.zip.file(relsPath(newPath), rewritten);

    const relationshipNumber = maxNumber([...state.presentationRels.matchAll(/\bId="rId(\d+)"/g)].map((match) => `rId${match[1]}`), /rId(\d+)/) + 1;
    const relationshipId = `rId${relationshipNumber}`;
    state.presentationRels = appendBeforeClosing(
      state.presentationRels,
      "</Relationships>",
      `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${newPartNumber}.xml"/>`,
    );
    const slideId = Math.max(255, ...state.slides.map((slide) => Number(slide.block.match(/\bid="(\d+)"/)?.[1] ?? 255))) + 1;
    const entry: SlideEntry = { block: `<p:sldId id="${slideId}" r:id="${relationshipId}"/>`, relationshipId, path: newPath };
    const index = Math.max(0, Math.min((operation.insertAt ?? state.slides.length + 1) - 1, state.slides.length));
    state.slides.splice(index, 0, entry);
    state.contentTypes = appendBeforeClosing(
      state.contentTypes,
      "</Types>",
      `<Override PartName="/${newPath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    );
  }

  /** Copy everything an imported slide points at, and rewrite its rels. */
  private async importSlideRelationships(
    state: PackageState,
    sourceZip: JSZip,
    sourceFile: string,
    sourceSlidePath: string,
    newSlidePath: string,
    relsXml: string,
    warnings: string[],
  ): Promise<string> {
    let output = relsXml;

    for (const relationship of relationships(relsXml)) {
      if (!relationship.target || !relationship.type) continue;
      const kind = relationship.type.split("/").pop() ?? "";

      if (relationshipAttribute(relationship.block, "TargetMode") === "External") {
        const { link, rejected } = checkLink(decodeXml(relationship.target));
        if (link?.url) continue;
        warnings.push(`Slide imported from ${path.basename(sourceFile)}: ${rejected ?? "refused an external link"}`);
        output = output.replace(relationship.block, relationship.block.replace(/\bTarget="[^"]*"/, 'Target="https://example.invalid/removed"'));
        continue;
      }

      const partPath = resolvePackageTarget(sourceSlidePath, decodeXml(relationship.target));

      if (kind === "slideLayout") {
        const remapped = await this.matchLayout(state, sourceZip, partPath);
        output = output.replace(relationship.block, relationship.block.replace(/\bTarget="[^"]*"/, `Target="../slideLayouts/${path.posix.basename(remapped.path)}"`));
        if (remapped.substituted) {
          warnings.push(`Imported slide was laid out on "${remapped.sourceType ?? "unknown"}" in ${path.basename(sourceFile)} and now uses this deck's "${remapped.targetType ?? "first"}" layout. Check its placeholders.`);
        }
        continue;
      }

      const copied = await this.copyPart(state, sourceZip, partPath, kind, newSlidePath, warnings);
      if (!copied) {
        warnings.push(`Imported slide referenced ${partPath}, which is missing from ${path.basename(sourceFile)}. The reference was dropped.`);
        output = output.replace(relationship.block, "");
        continue;
      }
      output = output.replace(
        relationship.block,
        relationship.block.replace(/\bTarget="[^"]*"/, `Target="${escapeXml(path.posix.relative(path.posix.dirname(newSlidePath), copied))}"`),
      );
    }

    return output;
  }

  /**
   * Copy one part and everything below it into the destination package under a
   * name that cannot collide. Returns the new package path.
   */
  private async copyPart(
    state: PackageState,
    sourceZip: JSZip,
    partPath: string,
    kind: string,
    newSlidePath: string,
    warnings: string[],
  ): Promise<string | undefined> {
    const file = sourceZip.file(partPath);
    if (!file) return undefined;

    const directory = path.posix.dirname(partPath);
    const extension = path.posix.extname(partPath);
    const stem = path.posix.basename(partPath, extension).replace(/\d+$/, "");
    const existing = Object.keys(state.zip.files);
    const next = maxNumber(existing, new RegExp(`^${directory}/${stem}(\\d+)\\${extension}$`)) + 1;
    const targetPath = `${directory}/${stem}${next}${extension}`;

    state.zip.file(targetPath, await file.async("nodebuffer"));

    if (extension) state.contentTypes = ensureDefaultContentType(state.contentTypes, extension.slice(1).toLowerCase());
    const sourceOverride = await sourceZip.file("[Content_Types].xml")?.async("string");
    const override = sourceOverride?.match(new RegExp(`<Override\\b[^>]*PartName="/${partPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`))?.[0];
    if (override) {
      state.contentTypes = appendBeforeClosing(state.contentTypes, "</Types>", override.replace(`/${partPath}`, `/${targetPath}`));
    }

    // A chart or a notes slide has relationships of its own — an embedded
    // workbook, a colour style, the slide it belongs to. Follow them, or the
    // imported chart opens with no data behind it.
    const childRels = await sourceZip.file(relsPath(partPath))?.async("string");
    if (childRels) {
      let rewritten = childRels;
      for (const child of relationships(childRels)) {
        if (!child.target || relationshipAttribute(child.block, "TargetMode") === "External") continue;
        const childKind = child.type?.split("/").pop() ?? "";
        if (childKind === "slide") {
          rewritten = rewritten.replace(child.block, child.block.replace(/\bTarget="[^"]*"/, `Target="../slides/${path.posix.basename(newSlidePath)}"`));
          continue;
        }
        const childPath = resolvePackageTarget(partPath, decodeXml(child.target));
        const copied = await this.copyPart(state, sourceZip, childPath, childKind, newSlidePath, warnings);
        if (!copied) {
          rewritten = rewritten.replace(child.block, "");
          continue;
        }
        rewritten = rewritten.replace(
          child.block,
          child.block.replace(/\bTarget="[^"]*"/, `Target="${escapeXml(path.posix.relative(directory, copied))}"`),
        );
      }
      state.zip.file(relsPath(targetPath), rewritten);
    }

    if (kind === "diagramData") warnings.push("The imported slide contains SmartArt. It is copied as-is and cannot be edited by Slide Agent.");
    return targetPath;
  }

  /** The destination layout that best matches the one the source slide used. */
  private async matchLayout(
    state: PackageState,
    sourceZip: JSZip,
    sourceLayoutPath: string,
  ): Promise<{ path: string; substituted: boolean; sourceType?: string; targetType?: string }> {
    // `type` is the ECMA-376 layout kind (`title`, `obj`, `blank`). Decks that
    // do not set one — PptxGenJS writes a single unnamed layout — still carry a
    // `cSld` name, which is enough to tell "the same layout in both decks"
    // from a genuine substitution worth reporting.
    const describe = async (zip: JSZip, layoutPath: string): Promise<{ type?: string; name?: string }> => {
      const xml = await zip.file(layoutPath)?.async("string") ?? "";
      return {
        ...(xml.match(/<p:sldLayout\b[^>]*\btype="([^"]+)"/)?.[1] ? { type: xml.match(/<p:sldLayout\b[^>]*\btype="([^"]+)"/)![1]! } : {}),
        ...(xml.match(/<p:cSld\b[^>]*\bname="([^"]*)"/)?.[1] ? { name: xml.match(/<p:cSld\b[^>]*\bname="([^"]*)"/)![1]! } : {}),
      };
    };

    const source = await describe(sourceZip, sourceLayoutPath);
    const targets = Object.keys(state.zip.files).filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)).sort();
    if (targets.length === 0) {
      throw new SlideAgentError("NO_SLIDE_LAYOUTS", "The destination presentation has no slide layouts to map the imported slide onto.");
    }

    const label = source.type ?? source.name;
    for (const candidate of targets) {
      const target = await describe(state.zip, candidate);
      const matches = (source.type && target.type === source.type) || (source.name && target.name === source.name);
      if (matches) return { path: candidate, substituted: false, ...(label ? { sourceType: label } : {}), targetType: target.type ?? target.name };
    }
    const fallback = await describe(state.zip, targets[0]!);
    return {
      path: targets[0]!,
      substituted: true,
      ...(label ? { sourceType: label } : {}),
      targetType: fallback.type ?? fallback.name,
    };
  }

  private reorderSlides(state: PackageState, order: number[]): void {
    if (order.length !== state.slides.length || new Set(order).size !== order.length || order.some((value) => value < 1 || value > state.slides.length)) {
      throw new SlideAgentError("INVALID_SLIDE_ORDER", "Reorder operation must contain every current slide number exactly once.", { order, slideCount: state.slides.length });
    }
    state.slides = order.map((slideNumber) => state.slides[slideNumber - 1]!);
  }

  private async applyTheme(state: PackageState, operation: ApplyThemeOperation): Promise<void> {
    const colorMap: Record<string, string | undefined> = {
      dk1: operation.colors?.ink,
      lt1: operation.colors?.background,
      accent1: operation.colors?.accent,
      accent2: operation.colors?.accentAlt,
      accent3: operation.colors?.positive,
      accent4: operation.colors?.warning,
      accent5: operation.colors?.negative,
      accent6: operation.colors?.muted,
    };
    for (const themePath of Object.keys(state.zip.files).filter((name) => /^ppt\/theme\/theme\d+\.xml$/.test(name))) {
      let xml = await state.zip.file(themePath)!.async("string");
      for (const [slot, color] of Object.entries(colorMap)) {
        if (!color) continue;
        xml = xml.replace(new RegExp(`(<a:${slot}>[\\s\\S]*?<a:srgbClr\\b[^>]*\\bval=")[0-9A-Fa-f]{6}("[^>]*/>[\\s\\S]*?</a:${slot}>)`), `$1${color}$2`);
      }
      if (operation.headingFont) xml = xml.replace(/(<a:majorFont>[\s\S]*?<a:latin\b[^>]*\btypeface=")[^"]*(")/, `$1${escapeXml(operation.headingFont)}$2`);
      if (operation.bodyFont) xml = xml.replace(/(<a:minorFont>[\s\S]*?<a:latin\b[^>]*\btypeface=")[^"]*(")/, `$1${escapeXml(operation.bodyFont)}$2`);
      state.zip.file(themePath, xml);
    }
  }

  private async replaceImage(state: PackageState, operation: ReplaceImageOperation): Promise<void> {
    const slide = state.slides[operation.slide - 1];
    if (!slide) throw new SlideAgentError("SLIDE_NOT_FOUND", `Slide ${operation.slide} does not exist.`);
    const slideXml = await state.zip.file(slide.path)?.async("string");
    const slideRelsPath = relsPath(slide.path);
    let slideRels = await state.zip.file(slideRelsPath)?.async("string");
    if (!slideXml || !slideRels) throw new SlideAgentError("SLIDE_RELATIONSHIPS_MISSING", `Slide ${operation.slide} has no editable image relationships.`);
    const relationshipId = relationshipIdForImage(slideXml, operation);
    if (!relationshipId) throw new SlideAgentError("IMAGE_NOT_FOUND", `Could not resolve an image on slide ${operation.slide}.`);
    const source = path.resolve(operation.imagePath);
    const extension = path.extname(source).replace(".", "").toLowerCase() || "png";
    const imageNumber = maxNumber(Object.keys(state.zip.files), /^ppt\/media\/image(\d+)\./) + 1;
    const mediaPath = `ppt/media/image${imageNumber}.${extension}`;
    state.zip.file(mediaPath, await readFile(source));
    slideRels = replaceRelationshipTarget(slideRels, relationshipId, `../media/${path.posix.basename(mediaPath)}`);
    state.zip.file(slideRelsPath, slideRels);
    state.contentTypes = ensureDefaultContentType(state.contentTypes, extension);
  }

  private async updateTable(state: PackageState, operation: UpdateTableOperation): Promise<void> {
    const slide = state.slides[operation.slide - 1];
    if (!slide) throw new SlideAgentError("SLIDE_NOT_FOUND", `Slide ${operation.slide} does not exist.`);
    let xml = await state.zip.file(slide.path)?.async("string");
    if (!xml) throw new SlideAgentError("SLIDE_PART_MISSING", `Missing ${slide.path}.`);
    const tables = [...xml.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)]
      .filter((match) => match[0].includes("<a:tbl>"));
    const selected = operation.name
      ? tables.find((match) => match[0].includes(`name="${operation.name}"`))
      : tables[operation.tableIndex ?? 0];
    if (!selected) throw new SlideAgentError("TABLE_NOT_FOUND", `Table was not found on slide ${operation.slide}.`);
    const rows = [...selected[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)];
    if (operation.rows.length > rows.length) throw new SlideAgentError("TABLE_SIZE_MISMATCH", "Updated table has more rows than the existing editable table.");
    let updatedTable = selected[0];
    operation.rows.forEach((values, rowIndex) => {
      const row = rows[rowIndex]?.[0];
      if (!row) return;
      const cells = [...row.matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)];
      if (values.length > cells.length) throw new SlideAgentError("TABLE_SIZE_MISMATCH", `Row ${rowIndex + 1} has more cells than the existing table.`);
      let updatedRow = row;
      values.forEach((value, cellIndex) => {
        const cell = cells[cellIndex]?.[0];
        if (!cell) return;
        let first = true;
        const updatedCell = cell.replace(/<a:t(\s[^>]*)?>([\s\S]*?)<\/a:t>/g, (_block, attributes: string | undefined) => {
          const next = first ? escapeXml(String(value)) : "";
          first = false;
          return `<a:t${attributes ?? ""}>${next}</a:t>`;
        });
        updatedRow = updatedRow.replace(cell, updatedCell);
      });
      updatedTable = updatedTable.replace(row, updatedRow);
    });
    xml = xml.replace(selected[0], updatedTable);
    state.zip.file(slide.path, xml);
  }

  private async updateChart(state: PackageState, operation: UpdateChartOperation, warnings: string[]): Promise<void> {
    const slide = state.slides[operation.slide - 1];
    if (!slide) throw new SlideAgentError("SLIDE_NOT_FOUND", `Slide ${operation.slide} does not exist.`);
    const slideRels = await state.zip.file(relsPath(slide.path))?.async("string") ?? "";
    const chartTargets = relationships(slideRels)
      .filter((relationship) => relationship.type?.endsWith("/chart"))
      .flatMap((relationship) => relationship.target ? [relationship.target] : []);
    const target = chartTargets[operation.chartIndex ?? 0];
    if (!target) throw new SlideAgentError("CHART_NOT_FOUND", `Chart was not found on slide ${operation.slide}.`);
    const chartPath = resolvePackageTarget(slide.path, decodeXml(target));
    let chartXml = await state.zip.file(chartPath)?.async("string");
    if (!chartXml) throw new SlideAgentError("CHART_PART_MISSING", `Missing ${chartPath}.`);
    const seriesBlocks = [...chartXml.matchAll(/<c:ser>[\s\S]*?<\/c:ser>/g)];
    if (operation.labels.length === 0 || operation.series.length === 0 || operation.series.some((series) => series.values.length !== operation.labels.length || series.values.some((value) => !Number.isFinite(value)))) {
      throw new SlideAgentError("INVALID_CHART_DATA", "Updated chart requires labels and finite, label-aligned values for every series.");
    }
    if (operation.series.length !== seriesBlocks.length) {
      throw new SlideAgentError("CHART_SERIES_MISMATCH", `Updated chart must preserve the existing ${seriesBlocks.length}-series shape.`);
    }
    operation.series.forEach((series, index) => {
      const original = seriesBlocks[index]?.[0];
      if (!original) return;
      let updated = replaceSeriesName(original, series.name);
      updated = replaceTagCache(updated, "cat", operation.labels);
      updated = replaceTagCache(updated, "val", series.values);
      updated = replaceTagFormula(updated, "cat", operation.labels.length + 1);
      updated = replaceTagFormula(updated, "val", operation.labels.length + 1);
      chartXml = chartXml!.replace(original, updated);
    });
    state.zip.file(chartPath, chartXml);
    if (!(await updateEmbeddedWorkbook(state, chartPath, operation.labels, operation.series))) {
      warnings.push(`Updated chart caches on slide ${operation.slide}, but no embedded workbook was available to update.`);
    }
  }
}
