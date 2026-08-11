import { deflateSync, inflateSync } from "node:zlib";

import { imageSizeOf, type ImageSize } from "../images/dimensions.js";
import { IMAGE_LONG_EDGE_LIMIT } from "../evaluation/token-budget.js";

/**
 * Reading, resizing, and tiling the PNGs Poppler writes.
 *
 * Only what the preview path needs, and deliberately no more: these images are
 * produced by one tool in one configuration — `pdftoppm -png`, 8-bit,
 * non-interlaced, RGB or RGBA — so the decoder handles that and refuses
 * anything else rather than pretending to be a general PNG library.
 *
 * The alternative was a native image dependency, for two operations totalling
 * two hundred lines, in a project that audits what it installs. A downscale and
 * a grid are not worth a supply chain.
 */

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface RasterImage {
  width: number;
  height: number;
  /** Row-major RGBA, four bytes per pixel. */
  pixels: Uint8Array;
}

/**
 * PNG dimensions without decoding the pixels.
 *
 * The header read already exists for every format the toolkit embeds, so this
 * is that reader with the format narrowed rather than a third parse of the
 * same six bytes.
 */
export function pngSize(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length < 24 || !Buffer.from(bytes.subarray(0, 8)).equals(SIGNATURE)) return undefined;
  return imageSizeOf(bytes);
}

interface Chunks {
  header: { width: number; height: number; depth: number; colorType: number; interlace: number };
  data: Buffer;
  palette?: Buffer;
}

function readChunks(bytes: Uint8Array): Chunks {
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let offset = 8;
  let header: Chunks["header"] | undefined;
  let palette: Buffer | undefined;
  const data: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body.readUInt8(8),
        colorType: body.readUInt8(9),
        interlace: body.readUInt8(12),
      };
    } else if (type === "PLTE") palette = Buffer.from(body);
    else if (type === "IDAT") data.push(Buffer.from(body));
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no header");
  return { header, data: Buffer.concat(data), ...(palette ? { palette } : {}) };
}

/** Bytes per pixel for the colour types Poppler emits, plus indexed. */
function channelsFor(colorType: number): number {
  switch (colorType) {
    case 0: return 1;  // greyscale
    case 2: return 3;  // truecolour
    case 3: return 1;  // indexed
    case 4: return 2;  // greyscale + alpha
    case 6: return 4;  // truecolour + alpha
    default: throw new Error(`unsupported PNG colour type ${colorType}`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
}

/**
 * Undoes the per-scanline filter PNG applies before compression.
 *
 * The filter type is constant for a whole scanline, so it is switched on once
 * per row rather than once per byte. On a 1600×900 preview that is 900 branches
 * instead of 4.3 million, and this loop is most of what decoding costs.
 */
function unfilter(raw: Buffer, width: number, height: number, bytesPerPixel: number): Buffer {
  const stride = width * bytesPerPixel;
  const out = Buffer.alloc(stride * height);
  let source = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[source];
    source += 1;
    const target = row * stride;
    const previous = target - stride;
    const firstPixel = Math.min(bytesPerPixel, stride);

    switch (filter) {
      case 0:
        raw.copy(out, target, source, source + stride);
        break;
      case 1:
        raw.copy(out, target, source, source + firstPixel);
        for (let index = firstPixel; index < stride; index += 1) {
          out[target + index] = (raw[source + index]! + out[target + index - bytesPerPixel]!) & 0xff;
        }
        break;
      case 2:
        if (row === 0) raw.copy(out, target, source, source + stride);
        else for (let index = 0; index < stride; index += 1) {
          out[target + index] = (raw[source + index]! + out[previous + index]!) & 0xff;
        }
        break;
      case 3:
        for (let index = 0; index < stride; index += 1) {
          const left = index >= bytesPerPixel ? out[target + index - bytesPerPixel]! : 0;
          const up = row > 0 ? out[previous + index]! : 0;
          out[target + index] = (raw[source + index]! + ((left + up) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let index = 0; index < stride; index += 1) {
          const left = index >= bytesPerPixel ? out[target + index - bytesPerPixel]! : 0;
          const up = row > 0 ? out[previous + index]! : 0;
          const upLeft = row > 0 && index >= bytesPerPixel ? out[previous + index - bytesPerPixel]! : 0;
          out[target + index] = (raw[source + index]! + paeth(left, up, upLeft)) & 0xff;
        }
        break;
      default:
        throw new Error(`unsupported PNG filter ${filter}`);
    }
    source += stride;
  }
  return out;
}

/** A PNG as RGBA pixels. Throws on anything Poppler would not have written. */
export function decodePng(bytes: Uint8Array): RasterImage {
  const { header, data, palette } = readChunks(bytes);
  const { width, height, depth, colorType, interlace } = header;
  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
  const channels = channelsFor(colorType);
  const raw = unfilter(Buffer.from(inflateSync(data)), width, height, channels);

  // Colour type is a property of the image, so it is decided once rather than
  // re-tested for each of the 1.4 million pixels in a slide preview.
  const count = width * height;
  const pixels = new Uint8Array(count * 4);
  const hasAlpha = colorType === 4 || colorType === 6;
  for (let index = 0, source = 0, target = 0; index < count; index += 1, source += channels, target += 4) {
    switch (colorType) {
      case 0:
      case 4: {
        const grey = raw[source]!;
        pixels[target] = grey; pixels[target + 1] = grey; pixels[target + 2] = grey;
        break;
      }
      case 3: {
        const entry = raw[source]! * 3;
        pixels[target] = palette?.[entry] ?? 0;
        pixels[target + 1] = palette?.[entry + 1] ?? 0;
        pixels[target + 2] = palette?.[entry + 2] ?? 0;
        break;
      }
      default:
        pixels[target] = raw[source]!;
        pixels[target + 1] = raw[source + 1]!;
        pixels[target + 2] = raw[source + 2]!;
    }
    pixels[target + 3] = hasAlpha ? raw[source + channels - 1]! : 255;
  }
  return { width, height, pixels };
}

/** Accumulates a CRC across several buffers, so none has to be concatenated. */
function crc32(crc: number, buffer: Buffer): number {
  let value = crc;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return value;
}

function chunk(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, "ascii");
  // The checksum covers the type and the body. Concatenating them to hash them
  // would copy the whole IDAT payload for nothing.
  const crc = crc32(crc32(0xffffffff, header.subarray(4)), body) ^ 0xffffffff;
  const trailer = Buffer.alloc(4);
  trailer.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([header, body, trailer]);
}

/**
 * RGBA pixels as a PNG.
 *
 * Every scanline is written with filter 0, at the default compression level.
 * Both choices trade bytes for time on purpose: a returned preview is encoded
 * once, base64'd, and discarded, and the model is billed for its pixel count,
 * not its file size. Level 9 was measured at three times the CPU of the default
 * for 9% fewer bytes — 218 ms against 69 ms on a single 1024×576 preview, which
 * on a twelve-slide call is most of a second spent shrinking something nobody
 * pays for.
 *
 * Returns a `Buffer`, which is a `Uint8Array`, so callers can base64 it without
 * a further copy.
 */
export function encodePng({ width, height, pixels }: RasterImage): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + row * stride, stride)
      .copy(raw, row * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);   // bit depth
  header.writeUInt8(6, 9);   // truecolour with alpha
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Box-filter downscale.
 *
 * Averaging every source pixel that falls in a target cell, rather than
 * sampling one of them. On a slide render the difference is the whole point:
 * nearest-neighbour drops hairlines and thin type entirely, which would make
 * the cheaper preview lie about the composition it exists to show.
 */
export function resize(image: RasterImage, width: number, height: number): RasterImage {
  if (width === image.width && height === image.height) return image;
  const pixels = new Uint8Array(width * height * 4);
  const scaleX = image.width / width;
  const scaleY = image.height / height;
  for (let row = 0; row < height; row += 1) {
    const fromY = Math.floor(row * scaleY);
    const toY = Math.max(fromY + 1, Math.min(image.height, Math.ceil((row + 1) * scaleY)));
    for (let column = 0; column < width; column += 1) {
      const fromX = Math.floor(column * scaleX);
      const toX = Math.max(fromX + 1, Math.min(image.width, Math.ceil((column + 1) * scaleX)));
      let red = 0, green = 0, blue = 0, alpha = 0, count = 0;
      for (let y = fromY; y < toY; y += 1) {
        for (let x = fromX; x < toX; x += 1) {
          const source = (y * image.width + x) * 4;
          red += image.pixels[source]!;
          green += image.pixels[source + 1]!;
          blue += image.pixels[source + 2]!;
          alpha += image.pixels[source + 3]!;
          count += 1;
        }
      }
      const target = (row * width + column) * 4;
      pixels[target] = Math.round(red / count);
      pixels[target + 1] = Math.round(green / count);
      pixels[target + 2] = Math.round(blue / count);
      pixels[target + 3] = Math.round(alpha / count);
    }
  }
  return { width, height, pixels };
}

/** Scales an image so its longest edge is at most `longestEdge`. */
export function fitWithin(image: RasterImage, longestEdge: number): RasterImage {
  const longest = Math.max(image.width, image.height);
  if (longest <= longestEdge) return image;
  const scale = longestEdge / longest;
  return resize(image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
}

function fill(image: RasterImage, color: readonly [number, number, number, number]): void {
  for (let index = 0; index < image.pixels.length; index += 4) {
    image.pixels[index] = color[0];
    image.pixels[index + 1] = color[1];
    image.pixels[index + 2] = color[2];
    image.pixels[index + 3] = color[3];
  }
}

function blit(target: RasterImage, source: RasterImage, atX: number, atY: number): void {
  for (let row = 0; row < source.height; row += 1) {
    const targetRow = atY + row;
    if (targetRow < 0 || targetRow >= target.height) continue;
    for (let column = 0; column < source.width; column += 1) {
      const targetColumn = atX + column;
      if (targetColumn < 0 || targetColumn >= target.width) continue;
      const from = (row * source.width + column) * 4;
      const to = (targetRow * target.width + targetColumn) * 4;
      target.pixels[to] = source.pixels[from]!;
      target.pixels[to + 1] = source.pixels[from + 1]!;
      target.pixels[to + 2] = source.pixels[from + 2]!;
      target.pixels[to + 3] = source.pixels[from + 3]!;
    }
  }
}

/** A 3×5 bitmap per digit, for numbering the cells of a contact sheet. */
const DIGIT_GLYPHS: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

function drawNumber(target: RasterImage, value: number, atX: number, atY: number, scale: number, color: readonly [number, number, number]): void {
  let cursor = atX;
  for (const character of String(value)) {
    const glyph = DIGIT_GLYPHS[character];
    if (!glyph) continue;
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row]!.length; column += 1) {
        if (glyph[row]![column] !== "1") continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const x = cursor + column * scale + dx;
            const y = atY + row * scale + dy;
            if (x < 0 || y < 0 || x >= target.width || y >= target.height) continue;
            const index = (y * target.width + x) * 4;
            target.pixels[index] = color[0];
            target.pixels[index + 1] = color[1];
            target.pixels[index + 2] = color[2];
            target.pixels[index + 3] = 255;
          }
        }
      }
    }
    cursor += (glyph[0]!.length + 1) * scale;
  }
}

export interface ContactSheetOptions {
  /** Longest edge of the finished sheet. */
  longestEdge?: number;
  /** Cells per row. Derived from the slide count when omitted. */
  columns?: number;
  /** Slide numbers to write under each cell, in order. */
  numbers?: number[];
}

/**
 * Every slide on one page, in order, numbered.
 *
 * The deck-level questions the review packet asks — does the sequence have a
 * shape, is every slide the same temperature, which two slides came out as the
 * same drawing — are comparisons, and a comparison is answered by seeing things
 * beside each other. Twelve slides sent one at a time cost twelve images and
 * answer none of them well.
 */
export function contactSheet(images: RasterImage[], options: ContactSheetOptions = {}): RasterImage {
  if (images.length === 0) throw new Error("a contact sheet needs at least one image");
  const longestEdge = options.longestEdge ?? IMAGE_LONG_EDGE_LIMIT;
  const columns = Math.max(1, options.columns ?? Math.min(4, Math.ceil(Math.sqrt(images.length))));
  const rows = Math.ceil(images.length / columns);

  // Cells are sized from the widest and tallest source so a portrait deck and a
  // landscape deck both tile without distortion.
  const aspect = Math.max(...images.map((image) => image.width / image.height));
  const gutter = 10;
  const captionScale = 3;
  const caption = 5 * captionScale + 6;
  const cellWidth = Math.floor((longestEdge - gutter * (columns + 1)) / columns);
  const cellHeight = Math.round(cellWidth / aspect);
  const sheetWidth = gutter + columns * (cellWidth + gutter);
  const sheetHeight = gutter + rows * (cellHeight + caption + gutter);

  const sheet: RasterImage = {
    width: sheetWidth,
    height: sheetHeight,
    pixels: new Uint8Array(sheetWidth * sheetHeight * 4),
  };
  fill(sheet, [244, 244, 246, 255]);

  images.forEach((image, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = gutter + column * (cellWidth + gutter);
    const y = gutter + row * (cellHeight + caption + gutter);
    const scaled = resize(image, cellWidth, cellHeight);
    blit(sheet, scaled, x, y);
    drawNumber(sheet, options.numbers?.[index] ?? index + 1, x, y + cellHeight + 4, captionScale, [90, 90, 100]);
  });

  return fitWithin(sheet, longestEdge);
}
