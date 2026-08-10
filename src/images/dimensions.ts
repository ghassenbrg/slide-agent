import { readFile } from "node:fs/promises";

/**
 * How large a picture actually is.
 *
 * Needed for one thing: `fit: "cover"` cannot crop without knowing the source's
 * aspect ratio, and without a crop "cover" is just a stretch — which silently
 * distorts every photograph whose proportions differ from its frame. Reading
 * four headers is cheaper than carrying an image library to find that out.
 */

export interface ImageSize {
  width: number;
  height: number;
}

function png(bytes: Uint8Array): ImageSize | undefined {
  // IHDR is always the first chunk: 8-byte signature, 4-byte length, "IHDR".
  if (bytes.length < 24) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gif(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length < 10) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/**
 * JPEG carries its dimensions in a start-of-frame marker, which sits after an
 * arbitrary number of other segments, so the segment chain has to be walked.
 */
function jpeg(bytes: Uint8Array): ImageSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // SOF0–SOF15, excluding the DHT/JPG/DAC markers interleaved in that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return undefined;
}

function webp(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length < 30) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (format === "VP8 ") {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    const read24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  return undefined;
}

/** The intrinsic size of a supported raster image, or nothing. */
export function imageSizeOf(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length < 12) return undefined;
  const size = bytes[0] === 0x89 && bytes[1] === 0x50 ? png(bytes)
    : bytes[0] === 0xff && bytes[1] === 0xd8 ? jpeg(bytes)
      : bytes[0] === 0x47 && bytes[1] === 0x49 ? gif(bytes)
        : bytes[0] === 0x52 && bytes[1] === 0x49 ? webp(bytes)
          : undefined;
  return size && size.width > 0 && size.height > 0 ? size : undefined;
}

/** Reads a file's intrinsic size, returning nothing rather than throwing. */
export async function readImageSize(filePath: string): Promise<ImageSize | undefined> {
  const bytes = await readFile(filePath).catch(() => undefined);
  return bytes ? imageSizeOf(bytes) : undefined;
}
