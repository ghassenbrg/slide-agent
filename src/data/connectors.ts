import path from "node:path";

import type { ChartSpec, SourceCitation, TableSpec } from "../types/index.js";
import { SlideAgentError } from "../utils/errors.js";
import { exists, readUtf8 } from "../utils/files.js";

/**
 * Turns a data file into a chart or table spec.
 *
 * The point is not convenience — a model can transcribe numbers into a chart
 * spec on its own. The point is provenance: numbers that came from a file can
 * say so, in the speaker notes, with a row count and a source path. Transcribed
 * numbers cannot, and transcription is exactly where a model silently
 * introduces errors.
 */

export interface DataTable {
  headers: string[];
  rows: Array<Array<string | number>>;
  /** Where the data came from, for the deck's source block. */
  source: SourceCitation;
}

/** Splits one CSV line, honouring quoted fields and escaped quotes. */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

function coerce(value: string): string | number {
  if (value === "") return value;
  // Tolerate thousands separators and a trailing percent sign, which are
  // common in exported data and would otherwise read as text.
  const normalized = value.replace(/,/g, "").replace(/%$/, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && /^-?\d*\.?\d+$/.test(normalized) ? parsed : value;
}

export function parseDelimited(text: string, options: { delimiter?: string; source: SourceCitation }): DataTable {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new SlideAgentError("DATA_EMPTY", "The data file contains no rows.");
  const delimiter = options.delimiter ?? (lines[0]!.includes("\t") ? "\t" : ",");
  const [headerLine, ...rest] = lines;
  const headers = parseDelimitedLine(headerLine!, delimiter);
  const rows = rest.map((line) => parseDelimitedLine(line, delimiter).map(coerce));
  const ragged = rows.findIndex((row) => row.length !== headers.length);
  if (ragged >= 0) {
    throw new SlideAgentError(
      "DATA_RAGGED",
      `Row ${ragged + 2} has ${rows[ragged]!.length} fields but the header has ${headers.length}.`,
      { row: ragged + 2 },
    );
  }
  return { headers, rows, source: options.source };
}

export function parseJsonRows(text: string, source: SourceCitation): DataTable {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SlideAgentError("DATA_INVALID", `Data file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new SlideAgentError("DATA_EMPTY", "Expected a non-empty array of row objects, or an object with a `rows` array.");
  }
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row as Record<string, unknown>)))];
  return {
    headers,
    rows: rows.map((row) => headers.map((header) => {
      const value = (row as Record<string, unknown>)[header];
      if (typeof value === "number" || typeof value === "string") return value;
      return value === null || value === undefined ? "" : JSON.stringify(value);
    })),
    source,
  };
}

export async function loadDataTable(filePath: string, options: { label?: string } = {}): Promise<DataTable> {
  const resolved = path.resolve(filePath);
  if (!(await exists(resolved))) {
    throw new SlideAgentError("DATA_NOT_FOUND", `Data file not found: ${resolved}`, { path: resolved });
  }
  const source: SourceCitation = {
    label: options.label ?? path.basename(resolved),
    note: `Loaded from ${resolved}`,
  };
  const text = await readUtf8(resolved);
  const extension = path.extname(resolved).toLowerCase();
  if (extension === ".json") return parseJsonRows(text, source);
  if (extension === ".csv" || extension === ".tsv" || extension === ".txt") {
    return parseDelimited(text, { ...(extension === ".tsv" ? { delimiter: "\t" } : {}), source });
  }
  throw new SlideAgentError(
    "DATA_UNSUPPORTED",
    `Unsupported data format: ${extension || "(none)"}. Supported: .csv, .tsv, .json.`,
    { path: resolved },
  );
}

export interface ChartFromDataOptions {
  kind?: ChartSpec["kind"];
  /** Column holding the category labels. Defaults to the first column. */
  labelColumn?: string;
  /** Columns to plot. Defaults to every numeric column. */
  valueColumns?: string[];
  unit?: string;
}

/**
 * Builds a chart spec from a table, refusing rather than guessing when the
 * data cannot support one. A chart built from misread columns is worse than
 * no chart, because it looks authoritative.
 */
export function chartFromData(table: DataTable, options: ChartFromDataOptions = {}): ChartSpec {
  const labelColumn = options.labelColumn ?? table.headers[0]!;
  const labelIndex = table.headers.indexOf(labelColumn);
  if (labelIndex < 0) {
    throw new SlideAgentError("DATA_COLUMN_MISSING", `No column named "${labelColumn}". Available: ${table.headers.join(", ")}.`);
  }

  const numericColumns = table.headers.filter((header, index) =>
    index !== labelIndex && table.rows.every((row) => typeof row[index] === "number"),
  );
  const valueColumns = options.valueColumns ?? numericColumns;
  const missing = valueColumns.filter((column) => !table.headers.includes(column));
  if (missing.length > 0) {
    throw new SlideAgentError("DATA_COLUMN_MISSING", `No column named ${missing.map((name) => `"${name}"`).join(", ")}. Available: ${table.headers.join(", ")}.`);
  }
  if (valueColumns.length === 0) {
    throw new SlideAgentError(
      "DATA_NOT_NUMERIC",
      `No numeric columns found beside "${labelColumn}". Use a table instead, or name the value columns explicitly.`,
      { headers: table.headers },
    );
  }

  const nonNumeric = valueColumns.filter((column) => !numericColumns.includes(column));
  if (nonNumeric.length > 0) {
    throw new SlideAgentError(
      "DATA_NOT_NUMERIC",
      `Column(s) ${nonNumeric.map((name) => `"${name}"`).join(", ")} contain non-numeric values and cannot be plotted.`,
    );
  }

  return {
    kind: options.kind ?? "bar",
    labels: table.rows.map((row) => String(row[labelIndex])),
    series: valueColumns.map((column) => ({
      name: column,
      values: table.rows.map((row) => row[table.headers.indexOf(column)] as number),
    })),
    ...(options.unit ? { unit: options.unit } : {}),
  };
}

export function tableFromData(table: DataTable, options: { maximumRows?: number } = {}): TableSpec {
  const limit = options.maximumRows ?? 12;
  return {
    headers: table.headers,
    rows: table.rows.slice(0, limit),
  };
}

/** The speaker-note line that records where a slide's numbers came from. */
export function provenanceNote(table: DataTable): string {
  return `Data: ${table.rows.length} row(s) from ${table.source.label ?? "an unnamed source"}.`
    + (table.source.note ? ` ${table.source.note}.` : "");
}
