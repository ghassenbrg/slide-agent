import { readFile, readdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  contactSheet,
  decodePng,
  encodePng,
  fitWithin,
  pngSize,
  resize,
  type RasterImage,
} from "../../src/rendering/png.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const showcase = path.join(root, "examples/showcase/output/board-decision/artifacts/board-decision/previews");

/**
 * A deliberately naive decoder: one branch per byte, straight from the spec.
 *
 * Exists only to check the fast path against something slow enough to be
 * obviously right.
 */
function decodeSlowly(bytes: Uint8Array): Uint8Array {
  const buffer = Buffer.from(bytes);
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body.readUInt8(9);
    } else if (type === "IDAT") idat.push(Buffer.from(body));
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const raw = Buffer.from(inflateSync(Buffer.concat(idat)));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  const paethOf = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let source = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[source]!;
    source += 1;
    for (let index = 0; index < stride; index += 1) {
      const value = raw[source + index]!;
      const left = index >= channels ? out[row * stride + index - channels]! : 0;
      const up = row > 0 ? out[(row - 1) * stride + index]! : 0;
      const upLeft = row > 0 && index >= channels ? out[(row - 1) * stride + index - channels]! : 0;
      const restored = filter === 0 ? value
        : filter === 1 ? value + left
          : filter === 2 ? value + up
            : filter === 3 ? value + ((left + up) >> 1)
              : value + paethOf(left, up, upLeft);
      out[row * stride + index] = restored & 0xff;
    }
    source += stride;
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const from = index * channels;
    const to = index * 4;
    if (channels >= 3) {
      pixels[to] = out[from]!; pixels[to + 1] = out[from + 1]!; pixels[to + 2] = out[from + 2]!;
    } else {
      pixels[to] = out[from]!; pixels[to + 1] = out[from]!; pixels[to + 2] = out[from]!;
    }
    pixels[to + 3] = colorType === 4 || colorType === 6 ? out[from + channels - 1]! : 255;
  }
  return pixels;
}

function gradient(width: number, height: number): RasterImage {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = (x * 255 / Math.max(1, width - 1)) | 0;
      pixels[index + 1] = (y * 255 / Math.max(1, height - 1)) | 0;
      pixels[index + 2] = 128;
      pixels[index + 3] = 255;
    }
  }
  return { width, height, pixels };
}

describe("PNG encoding", () => {
  it("round-trips pixels exactly", () => {
    const original = gradient(37, 23);
    const decoded = decodePng(encodePng(original));
    expect(decoded.width).toBe(37);
    expect(decoded.height).toBe(23);
    expect(Buffer.from(decoded.pixels)).toEqual(Buffer.from(original.pixels));
  });

  it("reads its own dimensions without decoding", () => {
    expect(pngSize(encodePng(gradient(11, 5)))).toEqual({ width: 11, height: 5 });
    expect(pngSize(new Uint8Array(4))).toBeUndefined();
  });

  it("decodes the PNGs Poppler actually writes", async () => {
    const files = (await readdir(showcase)).filter((file) => file.endsWith(".png")).sort();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const image = decodePng(await readFile(path.join(showcase, file)));
      expect(image.width, file).toBe(1600);
      expect(image.height, file).toBe(900);
      expect(image.pixels.length, file).toBe(1600 * 900 * 4);
    }
  });

  it("undoes every scanline filter Poppler emits", async () => {
    // The filter type is dispatched once per row rather than per byte, which
    // is a real rewrite of the inner loop — so the decoded pixels are checked
    // against an independent, obviously-correct implementation rather than
    // against the round trip, which only ever exercises filter 0.
    const bytes = await readFile(path.join(showcase, "slide-3.png"));
    expect(Buffer.from(decodePng(bytes).pixels)).toEqual(Buffer.from(decodeSlowly(bytes)));
  });

  it("refuses a format it cannot read rather than returning wrong pixels", () => {
    const png = Buffer.from(encodePng(gradient(4, 4)));
    png.writeUInt8(16, 24);  // bit depth 16, in the IHDR
    expect(() => decodePng(png)).toThrow(/bit depth/);
  });
});

describe("downscaling", () => {
  it("averages rather than sampling, so a hairline survives", () => {
    // One dark row in a light field. Nearest-neighbour would either drop it
    // entirely or keep it at full strength; averaging leaves a trace, which is
    // what makes a smaller preview honest about the composition.
    const width = 80;
    const height = 80;
    const pixels = new Uint8Array(width * height * 4).fill(255);
    for (let x = 0; x < width; x += 1) {
      const index = (40 * width + x) * 4;
      pixels[index] = 0; pixels[index + 1] = 0; pixels[index + 2] = 0;
    }
    const small = resize({ width, height, pixels }, 20, 20);
    const column: number[] = [];
    for (let y = 0; y < 20; y += 1) column.push(small.pixels[(y * 20 + 5) * 4]!);
    const darkest = Math.min(...column);
    expect(darkest).toBeLessThan(255);
    expect(darkest).toBeGreaterThan(0);
  });

  it("never enlarges, and leaves an already-small image alone", () => {
    const original = gradient(200, 100);
    const same = fitWithin(original, 400);
    expect(same).toBe(original);
    expect(fitWithin(original, 100)).toMatchObject({ width: 100, height: 50 });
  });

  it("keeps the aspect ratio of a portrait image", () => {
    expect(fitWithin(gradient(600, 1200), 600)).toMatchObject({ width: 300, height: 600 });
  });
});

describe("contact sheet", () => {
  it("tiles every slide inside the requested edge", () => {
    for (const count of [1, 3, 12, 40]) {
      const images = Array.from({ length: count }, () => gradient(160, 90));
      const sheet = contactSheet(images, { longestEdge: 1568 });
      expect(Math.max(sheet.width, sheet.height), `${count} slides`).toBeLessThanOrEqual(1568);
      expect(sheet.width).toBeGreaterThan(0);
      expect(sheet.height).toBeGreaterThan(0);
    }
  });

  it("does not distort a portrait deck into a landscape frame", () => {
    const portrait = contactSheet(Array.from({ length: 6 }, () => gradient(90, 160)), { longestEdge: 800 });
    const landscape = contactSheet(Array.from({ length: 6 }, () => gradient(160, 90)), { longestEdge: 800 });
    // A portrait deck's sheet is taller relative to its width than a landscape
    // deck's, which is only true if the cells kept their own aspect.
    expect(portrait.height / portrait.width).toBeGreaterThan(landscape.height / landscape.width);
  });

  it("refuses an empty deck instead of producing a blank sheet", () => {
    expect(() => contactSheet([])).toThrow(/at least one/);
  });

  it("costs far less than the same slides sent separately", async () => {
    const files = (await readdir(showcase)).filter((file) => file.endsWith(".png")).sort();
    const images = await Promise.all(files.map(async (file) => decodePng(await readFile(path.join(showcase, file)))));
    const sheet = contactSheet(images, { longestEdge: 1568 });
    const sheetPixels = sheet.width * sheet.height;
    const separatePixels = images
      .map((image) => fitWithin(image, 1024))
      .reduce((sum, image) => sum + image.width * image.height, 0);
    expect(sheetPixels).toBeLessThan(separatePixels / 2);
  });
});
