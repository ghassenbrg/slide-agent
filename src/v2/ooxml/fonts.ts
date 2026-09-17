import { parseFaces, GlyphMetrics, type FontFace } from "../text/sfnt.js";

/**
 * Embedding the faces a deck was designed with.
 *
 * PowerPoint stores embedded fonts as `.fntdata` parts in Embedded OpenType
 * (EOT) form. This writes an uncompressed EOT around a subset of the TrueType
 * font: glyph ids are kept, and the outlines of glyphs the deck never uses are
 * emptied, which keeps cmap, hmtx, and kerning valid while dropping most of the
 * file. Composite glyphs keep their components.
 */

function checksum(bytes: Uint8Array): number {
  let sum = 0;
  const padded = bytes.length % 4 === 0 ? bytes : Uint8Array.from([...bytes, ...new Array(4 - (bytes.length % 4)).fill(0)]);
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  for (let offset = 0; offset < padded.length; offset += 4) sum = (sum + view.getUint32(offset)) >>> 0;
  return sum;
}

function tableBytes(bytes: Uint8Array, face: FontFace, tag: string): Uint8Array | undefined {
  const table = face.tables.get(tag);
  return table ? bytes.subarray(table.offset, table.offset + table.length) : undefined;
}

/** Glyph ids a composite glyph references. */
function compositeComponents(glyph: Uint8Array): number[] {
  const view = new DataView(glyph.buffer, glyph.byteOffset, glyph.byteLength);
  if (glyph.length < 10 || view.getInt16(0) >= 0) return [];
  const components: number[] = [];
  let offset = 10;
  for (let guard = 0; guard < 256 && offset + 4 <= glyph.length; guard += 1) {
    const flags = view.getUint16(offset);
    components.push(view.getUint16(offset + 2));
    offset += 4;
    offset += flags & 0x0001 ? 4 : 2;
    if (flags & 0x0008) offset += 2;
    else if (flags & 0x0040) offset += 4;
    else if (flags & 0x0080) offset += 8;
    if (!(flags & 0x0020)) break;
  }
  return components;
}

/**
 * A TrueType file with every glyph outside `codePoints` emptied (plus .notdef
 * and composite dependencies). Returns the original when the font has no
 * glyf/loca tables.
 */
export function subsetTrueType(bytes: Uint8Array, codePoints: Iterable<number>, faceIndex = 0): Uint8Array {
  const faces = parseFaces(bytes);
  const face = faces[faceIndex] ?? faces[0]!;
  const glyf = face.tables.get("glyf");
  const loca = face.tables.get("loca");
  const head = face.tables.get("head");
  if (!glyf || !loca || !head) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const longLoca = view.getInt16(head.offset + 50) === 1;
  const glyphCount = face.numGlyphs;
  const offsets: number[] = [];
  for (let glyph = 0; glyph <= glyphCount; glyph += 1) {
    offsets.push(longLoca ? view.getUint32(loca.offset + glyph * 4) : view.getUint16(loca.offset + glyph * 2) * 2);
  }
  const metrics = new GlyphMetrics(bytes, face);
  const keep = new Set<number>([0]);
  for (const code of codePoints) {
    const glyph = metrics.glyphFor(code);
    if (glyph) keep.add(glyph);
  }
  // Always keep basic Latin, digits and punctuation so edits in PowerPoint still render.
  for (let code = 0x20; code <= 0x7e; code += 1) {
    const glyph = metrics.glyphFor(code);
    if (glyph) keep.add(glyph);
  }
  const queue = [...keep];
  while (queue.length) {
    const glyph = queue.pop()!;
    const start = offsets[glyph] ?? 0;
    const end = offsets[glyph + 1] ?? start;
    if (end <= start) continue;
    for (const component of compositeComponents(bytes.subarray(glyf.offset + start, glyf.offset + end))) {
      if (component < glyphCount && !keep.has(component)) {
        keep.add(component);
        queue.push(component);
      }
    }
  }

  const glyphParts: Uint8Array[] = [];
  const newOffsets: number[] = [0];
  let total = 0;
  for (let glyph = 0; glyph < glyphCount; glyph += 1) {
    if (keep.has(glyph)) {
      const start = offsets[glyph] ?? 0;
      const end = offsets[glyph + 1] ?? start;
      let data = bytes.subarray(glyf.offset + start, glyf.offset + Math.max(start, end));
      if (data.length % 2) data = Uint8Array.from([...data, 0]);
      glyphParts.push(data);
      total += data.length;
    }
    newOffsets.push(total);
  }
  const newGlyf = new Uint8Array(total);
  let cursor = 0;
  for (const part of glyphParts) {
    newGlyf.set(part, cursor);
    cursor += part.length;
  }
  const newLoca = new Uint8Array((glyphCount + 1) * 4);
  const locaView = new DataView(newLoca.buffer);
  newOffsets.forEach((offset, index) => locaView.setUint32(index * 4, offset));

  // Rebuild the table directory with the new glyf and loca (long format).
  const tags = [...face.tables.keys()].sort();
  const tables = new Map<string, Uint8Array>();
  for (const tag of tags) {
    if (tag === "glyf") tables.set(tag, newGlyf);
    else if (tag === "loca") tables.set(tag, newLoca);
    else if (tag === "DSIG") continue;
    else tables.set(tag, Uint8Array.from(tableBytes(bytes, face, tag)!));
  }
  const headTable = tables.get("head")!;
  const headView = new DataView(headTable.buffer, headTable.byteOffset, headTable.byteLength);
  headView.setInt16(50, 1);
  headView.setUint32(8, 0);

  const kept = [...tables.keys()].sort();
  const count = kept.length;
  const headerSize = 12 + count * 16;
  let size = headerSize;
  for (const tag of kept) size += Math.ceil(tables.get(tag)!.length / 4) * 4;
  const output = new Uint8Array(size);
  const out = new DataView(output.buffer);
  out.setUint32(0, 0x00010000);
  out.setUint16(4, count);
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * 16;
  out.setUint16(6, searchRange);
  out.setUint16(8, entrySelector);
  out.setUint16(10, count * 16 - searchRange);
  let dataOffset = headerSize;
  let headOffset = 0;
  kept.forEach((tag, index) => {
    const data = tables.get(tag)!;
    const record = 12 + index * 16;
    for (let character = 0; character < 4; character += 1) out.setUint8(record + character, tag.charCodeAt(character));
    out.setUint32(record + 4, checksum(data));
    out.setUint32(record + 8, dataOffset);
    out.setUint32(record + 12, data.length);
    output.set(data, dataOffset);
    if (tag === "head") headOffset = dataOffset;
    dataOffset += Math.ceil(data.length / 4) * 4;
  });
  out.setUint32(headOffset + 8, (0xb1b0afba - checksum(output)) >>> 0);
  return output;
}

function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index * 2] = text.charCodeAt(index) & 0xff;
    bytes[index * 2 + 1] = text.charCodeAt(index) >> 8;
  }
  return bytes;
}

/** Wrap TrueType data in an uncompressed Embedded OpenType (version 0x00020001) header. */
export function toEot(fontData: Uint8Array): Uint8Array {
  const face = parseFaces(fontData)[0]!;
  const view = new DataView(fontData.buffer, fontData.byteOffset, fontData.byteLength);
  const os2 = face.tables.get("OS/2");
  const head = face.tables.get("head")!;
  const strings = [face.family, face.subfamily, "Version 1.0", face.fullName].map(utf16le);
  let size = 82;
  for (const string of strings) size += 2 + 2 + string.length;
  size += 2 + 2; // Padding5 + RootStringSize
  const header = new Uint8Array(size);
  const out = new DataView(header.buffer);
  out.setUint32(0, size + fontData.length, true);
  out.setUint32(4, fontData.length, true);
  out.setUint32(8, 0x00020001, true);
  out.setUint32(12, 0, true);
  face.panose.slice(0, 10).forEach((value, index) => out.setUint8(16 + index, value));
  out.setUint8(26, 1);
  out.setUint8(27, face.italic ? 1 : 0);
  out.setUint32(28, face.weight, true);
  out.setUint16(32, face.fsType, true);
  out.setUint16(34, 0x504c, true);
  if (os2 && os2.length >= 62) {
    for (let index = 0; index < 4; index += 1) out.setUint32(36 + index * 4, view.getUint32(os2.offset + 42 + index * 4), true);
  }
  if (os2 && os2.length >= 86) {
    out.setUint32(52, view.getUint32(os2.offset + 78), true);
    out.setUint32(56, view.getUint32(os2.offset + 82), true);
  }
  out.setUint32(60, view.getUint32(head.offset + 8), true);
  let offset = 80;
  strings.forEach((string, index) => {
    out.setUint16(offset, 0, true); // padding
    out.setUint16(offset + 2, string.length, true);
    header.set(string, offset + 4);
    offset += 4 + string.length;
    void index;
  });
  out.setUint16(offset, 0, true);
  out.setUint16(offset + 2, 0, true);
  // The fixed part is 80 bytes; strings start with Padding1 at 80.
  const result = new Uint8Array(header.length + fontData.length);
  result.set(header, 0);
  result.set(fontData, header.length);
  new DataView(result.buffer).setUint32(0, result.length, true);
  return result;
}
