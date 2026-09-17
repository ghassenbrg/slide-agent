import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PptxInspector } from "../../editing/pptx-inspector.js";
import { assertInsideWorkspace } from "../../security/policy.js";
import { SlideAgentError } from "../../utils/errors.js";
import { findExecutable, runProcess } from "../../utils/process.js";
import { loadZipSafely } from "../../utils/safe-zip.js";

/**
 * Deterministic extraction of source material into a SourcePack. No model
 * reads a file here; the director gets a digest with stable span ids it can
 * cite, and numbers stay exactly as the source wrote them.
 */

export interface SourceSpan {
  id: string;
  text: string;
}

export interface SourceDocument {
  id: string;
  name: string;
  kind: "text" | "markdown" | "csv" | "json" | "docx" | "pdf" | "pptx";
  sha256: string;
  spans: SourceSpan[];
  tables?: Array<{ id: string; columns: string[]; rows: string[][] }>;
}

export interface SourcePack {
  documents: SourceDocument[];
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function splitSpans(documentId: string, text: string, maxChars = 900): SourceSpan[] {
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const spans: SourceSpan[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    spans.push({ id: `${documentId}#${spans.length + 1}`, text: buffer });
    buffer = "";
  };
  for (const paragraph of paragraphs) {
    if (buffer.length + paragraph.length > maxChars) flush();
    if (paragraph.length > maxChars) {
      for (let offset = 0; offset < paragraph.length; offset += maxChars) spans.push({ id: `${documentId}#${spans.length + 1}`, text: paragraph.slice(offset, offset + maxChars) });
      continue;
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  flush();
  return spans;
}

function parseCsv(text: string): { columns: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
  const delimiter = (lines[0] ?? "").includes("\t") ? "\t" : (lines[0] ?? "").split(";").length > (lines[0] ?? "").split(",").length ? ";" : ",";
  const split = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!;
      if (character === '"') {
        if (quoted && line[index + 1] === '"') { current += '"'; index += 1; } else quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        cells.push(current);
        current = "";
      } else current += character;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  };
  const [header = [], ...rows] = lines.map(split);
  return { columns: header, rows };
}

async function docxText(bytes: Buffer): Promise<string> {
  const zip = await loadZipSafely(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new SlideAgentError("INGEST_DOCX_INVALID", "The .docx has no document part.");
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n\n")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
}

async function pdfText(file: string): Promise<string> {
  const pdftotext = await findExecutable(["pdftotext"], process.env.SLIDE_AGENT_PDFTOTEXT);
  if (!pdftotext) throw new SlideAgentError("INGEST_PDF_TOOL_MISSING", "Reading PDFs needs Poppler's pdftotext on PATH.");
  const result = await runProcess(pdftotext, ["-layout", "-enc", "UTF-8", file, "-"], { timeoutMs: 30_000, maxOutputBytes: 8 * 1024 * 1024 });
  if (result.exitCode !== 0) throw new SlideAgentError("INGEST_PDF_FAILED", `pdftotext failed on ${path.basename(file)}.`);
  return result.stdout.replace(/\f/g, "\n\n");
}

export async function ingest(files: string[]): Promise<SourcePack> {
  const documents: SourceDocument[] = [];
  for (const [index, file] of files.entries()) {
    const resolved = assertInsideWorkspace(file, "sources");
    const bytes = await readFile(resolved);
    if (bytes.length > MAX_SOURCE_BYTES) throw new SlideAgentError("INGEST_TOO_LARGE", `${path.basename(resolved)} is over ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`);
    const id = `s${index + 1}`;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const extension = path.extname(resolved).toLowerCase();
    const name = path.basename(resolved);
    switch (extension) {
      case ".md":
      case ".markdown":
        documents.push({ id, name, kind: "markdown", sha256, spans: splitSpans(id, bytes.toString("utf8")) });
        break;
      case ".txt":
        documents.push({ id, name, kind: "text", sha256, spans: splitSpans(id, bytes.toString("utf8")) });
        break;
      case ".csv":
      case ".tsv": {
        const table = parseCsv(bytes.toString("utf8"));
        documents.push({ id, name, kind: "csv", sha256, spans: [], tables: [{ id: `${id}#t1`, ...table }] });
        break;
      }
      case ".json":
        documents.push({ id, name, kind: "json", sha256, spans: splitSpans(id, JSON.stringify(JSON.parse(bytes.toString("utf8")), null, 1), 1500) });
        break;
      case ".docx":
        documents.push({ id, name, kind: "docx", sha256, spans: splitSpans(id, await docxText(bytes)) });
        break;
      case ".pdf":
        documents.push({ id, name, kind: "pdf", sha256, spans: splitSpans(id, await pdfText(resolved)) });
        break;
      case ".pptx": {
        const temporary = await mkdtemp(path.join(tmpdir(), "slide-agent-ingest-"));
        try {
          const copy = path.join(temporary, "source.pptx");
          await writeFile(copy, bytes);
          const inspection = await new PptxInspector().inspect(copy);
          const text = inspection.manifest.slides.map((slide) => `Slide ${slide.number}: ${slide.title}\n${slide.elements.map((element) => element.text ?? "").filter(Boolean).join("\n")}`).join("\n\n");
          documents.push({ id, name, kind: "pptx", sha256, spans: splitSpans(id, text) });
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
        break;
      }
      default:
        throw new SlideAgentError("INGEST_UNSUPPORTED", `${name}: supported sources are .md, .txt, .csv, .tsv, .json, .docx, .pdf, and .pptx.`);
    }
  }
  return { documents };
}

/** A bounded digest for the director: spans with ids, tables in full up to a row cap. */
export function digest(pack: SourcePack, maxChars = 40_000): string {
  const parts: string[] = [];
  let used = 0;
  for (const document of pack.documents) {
    const header = `## ${document.id} · ${document.name}`;
    parts.push(header);
    used += header.length;
    for (const table of document.tables ?? []) {
      const rows = table.rows.slice(0, 60);
      const text = `[${table.id}] ${table.columns.join(" | ")}\n${rows.map((row) => row.join(" | ")).join("\n")}${table.rows.length > rows.length ? `\n… ${table.rows.length - rows.length} more rows` : ""}`;
      if (used + text.length > maxChars) break;
      parts.push(text);
      used += text.length;
    }
    for (const span of document.spans) {
      const text = `[${span.id}] ${span.text}`;
      if (used + text.length > maxChars) {
        parts.push(`… truncated at ${maxChars} characters`);
        return parts.join("\n\n");
      }
      parts.push(text);
      used += text.length;
    }
  }
  return parts.join("\n\n");
}
