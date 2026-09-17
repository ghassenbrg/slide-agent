import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

import JSZip from "jszip";

import { SlideAgentError } from "./errors.js";

/**
 * Opening a package someone handed us, without trusting it.
 *
 * `JSZip.loadAsync` believes the archive: an entry that declares 1 KB and
 * inflates to 4 GB is discovered by running out of memory. Every PPTX this
 * toolkit reads — a template, a deck to edit, a slide to import, a package to
 * validate — can come from anywhere, so the central directory is read first,
 * every entry is inflated under a hard output cap, and only a package that
 * passes is handed to JSZip.
 */
export interface ZipLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxPartBytes: number;
  maxCompressionRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 10_000,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPartBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
};

export interface ZipEntryInfo {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const EOCD64_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function refuse(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new SlideAgentError(code, message, details);
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  // The record is 22 bytes plus a comment of at most 65,535 bytes.
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (bytes.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return refuse("ZIP_INVALID", "Not a zip archive: no end-of-central-directory record.");
}

/** Reads the central directory, applying the entry-count limit before anything is allocated per entry. */
export function readZipDirectory(bytes: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntryInfo[] {
  if (bytes.length < 22) refuse("ZIP_INVALID", "Not a zip archive: too short.");
  const eocd = findEndOfCentralDirectory(bytes);
  let count = bytes.readUInt16LE(eocd + 10);
  let directorySize = bytes.readUInt32LE(eocd + 12);
  let directoryOffset = bytes.readUInt32LE(eocd + 16);

  const locator = eocd - 20;
  if ((count === 0xffff || directoryOffset === 0xffffffff) && locator >= 0 && bytes.readUInt32LE(locator) === EOCD64_LOCATOR_SIGNATURE) {
    const record = Number(bytes.readBigUInt64LE(locator + 8));
    if (record + 56 > bytes.length || bytes.readUInt32LE(record) !== EOCD64_SIGNATURE) refuse("ZIP_INVALID", "Corrupt ZIP64 directory record.");
    count = Number(bytes.readBigUInt64LE(record + 32));
    directorySize = Number(bytes.readBigUInt64LE(record + 40));
    directoryOffset = Number(bytes.readBigUInt64LE(record + 48));
  }

  if (count > limits.maxEntries) {
    refuse("ZIP_TOO_MANY_ENTRIES", `The package has ${count} entries; the limit is ${limits.maxEntries}.`, { entries: count, limit: limits.maxEntries });
  }
  if (directoryOffset + directorySize > bytes.length) refuse("ZIP_INVALID", "The central directory lies outside the file.");

  const entries: ZipEntryInfo[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) refuse("ZIP_INVALID", "Corrupt central directory entry.", { index });
    const method = bytes.readUInt16LE(cursor + 10);
    let compressedSize = bytes.readUInt32LE(cursor + 20);
    let uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    let localHeaderOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    // ZIP64 extended information: only the fields that overflowed are present, in this order.
    let extra = cursor + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = bytes.readUInt16LE(extra);
      const size = bytes.readUInt16LE(extra + 2);
      if (id === 0x0001) {
        let field = extra + 4;
        if (uncompressedSize === 0xffffffff) { uncompressedSize = Number(bytes.readBigUInt64LE(field)); field += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = Number(bytes.readBigUInt64LE(field)); field += 8; }
        if (localHeaderOffset === 0xffffffff) { localHeaderOffset = Number(bytes.readBigUInt64LE(field)); }
      }
      extra += 4 + size;
    }

    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function compressedData(bytes: Buffer, entry: ZipEntryInfo): Buffer {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== LOCAL_SIGNATURE) {
    refuse("ZIP_INVALID", `Corrupt local header for ${entry.name}.`, { part: entry.name });
  }
  const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
  const end = start + entry.compressedSize;
  if (end > bytes.length) refuse("ZIP_INVALID", `Entry ${entry.name} runs past the end of the file.`, { part: entry.name });
  return bytes.subarray(start, end);
}

/**
 * Verifies an archive against `limits` by actually inflating each entry under
 * a cap, so a header that lies about its size cannot get past.
 * Returns the directory for callers that want it.
 */
export function verifyZip(bytes: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS, options: { refuseDtd?: boolean } = {}): ZipEntryInfo[] {
  const entries = readZipDirectory(bytes, limits);
  let declaredTotal = 0;
  for (const entry of entries) {
    declaredTotal += entry.uncompressedSize;
    if (entry.uncompressedSize > limits.maxPartBytes) {
      refuse("ZIP_PART_TOO_LARGE", `${entry.name} is ${entry.uncompressedSize} bytes uncompressed; the per-part limit is ${limits.maxPartBytes}.`, { part: entry.name });
    }
    if (declaredTotal > limits.maxTotalBytes) {
      refuse("ZIP_TOO_LARGE", `The package inflates to more than ${limits.maxTotalBytes} bytes.`, { limit: limits.maxTotalBytes });
    }
  }

  let actualTotal = 0;
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    const data = compressedData(bytes, entry);
    let inflated: Buffer;
    if (entry.method === 0) {
      inflated = data;
    } else if (entry.method === 8) {
      const cap = Math.min(limits.maxPartBytes, limits.maxTotalBytes - actualTotal);
      try {
        inflated = inflateRawSync(data, { maxOutputLength: Math.max(1, cap) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/maxOutputLength|buffer|Cannot create a Buffer/i.test(message) || (error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
          refuse("ZIP_PART_TOO_LARGE", `${entry.name} inflates past the limit.`, { part: entry.name });
        }
        refuse("ZIP_INVALID", `${entry.name} cannot be inflated: ${message}`, { part: entry.name });
      }
    } else {
      refuse("ZIP_UNSUPPORTED_METHOD", `${entry.name} uses compression method ${entry.method}.`, { part: entry.name, method: entry.method });
    }
    actualTotal += inflated.length;
    if (actualTotal > limits.maxTotalBytes) refuse("ZIP_TOO_LARGE", `The package inflates to more than ${limits.maxTotalBytes} bytes.`);
    if (entry.compressedSize > 0 && inflated.length / entry.compressedSize > limits.maxCompressionRatio && inflated.length > 1024 * 1024) {
      refuse("ZIP_COMPRESSION_RATIO", `${entry.name} has a compression ratio above ${limits.maxCompressionRatio}:1.`, { part: entry.name });
    }
    if (options.refuseDtd !== false && /\.(xml|rels|vml)$/i.test(entry.name)) {
      const head = inflated.subarray(0, Math.min(inflated.length, 4096)).toString("utf8");
      if (/<!DOCTYPE/i.test(head) || /<!ENTITY/i.test(head)) {
        refuse("XML_DTD_REFUSED", `${entry.name} declares a DTD; package XML parts must not.`, { part: entry.name });
      }
    }
  }
  return entries;
}

/** The only way a package from outside should be opened. */
export async function loadZipSafely(bytes: Buffer, options: { limits?: Partial<ZipLimits>; checkCRC32?: boolean } = {}): Promise<JSZip> {
  const limits = { ...DEFAULT_ZIP_LIMITS, ...options.limits };
  verifyZip(bytes, limits);
  return JSZip.loadAsync(bytes, options.checkCRC32 ? { checkCRC32: true } : {});
}

export async function openPackageSafely(filePath: string, options: { limits?: Partial<ZipLimits>; checkCRC32?: boolean } = {}): Promise<JSZip> {
  return loadZipSafely(await readFile(filePath), options);
}
