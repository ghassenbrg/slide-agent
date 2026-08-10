import { readdir, readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { findExecutable, runProcess } from "../utils/process.js";
import { exists } from "../utils/files.js";

/**
 * Reading the words back off the render.
 *
 * A scene that validates says what the author intended. This says what the
 * renderer actually drew — the only source that can catch a clipped ending, a
 * word broken across a line, or a string that silently disappeared into an
 * autofit.
 *
 * PDF text extraction is preferred over image OCR wherever it is available:
 * it is exact rather than probabilistic, so it produces certainty instead of a
 * guess dressed as one. When only OCR is available the confidence is reported
 * honestly and the caller is expected to downgrade to `review` rather than
 * manufacture a verdict from it.
 */

export type ExtractionMethod = "pdf-text" | "ocr" | "none";
export type ExtractionConfidence = "high" | "medium" | "low";

export interface ExtractedPage {
  /** 1-based page/slide number. */
  page: number;
  /** Every text line found, in reading order where the tool provides one. */
  lines: string[];
}

export interface ExtractedText {
  method: ExtractionMethod;
  confidence: ExtractionConfidence;
  pages: ExtractedPage[];
  /** Why the method chosen was the best available, or why none was. */
  note?: string;
}

/** Splits `pdftotext -layout` output into its form-feed-delimited pages. */
function pagesFromPdfText(raw: string): ExtractedPage[] {
  return raw.split("\f").map((page, index) => ({
    page: index + 1,
    lines: page.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  })).filter((page, index, all) => index < all.length - 1 || page.lines.length > 0);
}

async function extractFromPdf(pdfPath: string): Promise<ExtractedText | undefined> {
  const pdftotext = await findExecutable(["pdftotext"], process.env.SLIDE_AGENT_PDFTOTEXT);
  if (!pdftotext || !(await exists(pdfPath))) return undefined;
  const result = await runProcess(pdftotext, ["-layout", "-enc", "UTF-8", pdfPath, "-"]);
  if (result.exitCode !== 0) return undefined;
  const pages = pagesFromPdfText(result.stdout);
  if (pages.length === 0) return undefined;
  return {
    method: "pdf-text",
    confidence: "high",
    pages,
    note: "Text read from the rendered PDF's own text layer, so it is exact rather than recognised.",
  };
}

/** Recognises text from the preview images, when a local OCR engine exists. */
async function extractFromImages(previewFiles: string[]): Promise<ExtractedText | undefined> {
  const tesseract = await findExecutable(["tesseract"], process.env.SLIDE_AGENT_TESSERACT);
  if (!tesseract || previewFiles.length === 0) return undefined;
  const temporary = await mkdtemp(path.join(tmpdir(), "slide-agent-ocr-"));
  try {
    const pages: ExtractedPage[] = [];
    for (const [index, preview] of previewFiles.entries()) {
      const base = path.join(temporary, `page-${index + 1}`);
      const result = await runProcess(tesseract, [preview, base, "--psm", "11"]);
      if (result.exitCode !== 0) continue;
      const text = await readFile(`${base}.txt`, "utf8").catch(() => "");
      pages.push({
        page: index + 1,
        lines: text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      });
    }
    if (pages.length === 0) return undefined;
    return {
      method: "ocr",
      confidence: "medium",
      pages,
      note: "Text recognised from the preview images. Recognition is probabilistic: treat a mismatch as something to look at, not as proof.",
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * The best available reading of what the render shows, or an honest `none`.
 *
 * `none` is a real answer. A machine without either tool cannot verify render
 * fidelity, and saying so is the only truthful option — inventing a pass from
 * an absent measurement is exactly the failure the roadmap set out to end.
 */
export async function extractRenderedText(options: {
  pdfPath?: string;
  previewFiles?: string[];
}): Promise<ExtractedText> {
  if (options.pdfPath) {
    const fromPdf = await extractFromPdf(options.pdfPath);
    if (fromPdf) return fromPdf;
  }
  const fromImages = await extractFromImages(options.previewFiles ?? []);
  if (fromImages) return fromImages;
  return {
    method: "none",
    confidence: "low",
    pages: [],
    note: "Neither Poppler's pdftotext nor Tesseract is installed, so nothing could read the render back. Install either one to verify that the deck shows the text it was authored with.",
  };
}

/** Every preview image in a directory, in slide order. */
export async function previewFilesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory).catch(() => []);
  return entries
    .filter((name) => /^slide-\d+\.png$/i.test(name))
    .sort((left, right) => Number(left.match(/\d+/)?.[0] ?? 0) - Number(right.match(/\d+/)?.[0] ?? 0))
    .map((name) => path.join(directory, name));
}
