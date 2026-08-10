#!/usr/bin/env node
/**
 * Deterministic artwork for the showcase decks.
 *
 * Two of the six briefs are image-led, and a repository cannot ship licensed
 * photographs. Rather than pretend — a grey box labelled "image here" is not a
 * design, and a stock photo without its credit line is somebody's licence
 * breached — these plates are generated here, committed, and declared in every
 * scene as `provenance.generated`. They are abstract fields, not depictions:
 * nothing in them claims to be a photograph of a real place.
 *
 * The generator is deterministic so the decks are byte-reproducible.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(root, "examples", "showcase", "assets");

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A cheap value-noise field: enough grain to read as material, not as gradient. */
function noise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return value - Math.floor(value);
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

const PLATES: Array<{ name: string; width: number; height: number; pixel: (x: number, y: number, w: number, h: number) => [number, number, number] }> = [
  {
    // A horizon band that darkens downward, with a bright line where sky meets water.
    name: "estuary-horizon.png",
    width: 1600,
    height: 900,
    pixel: (x, y, w, h) => {
      const horizon = 0.46;
      const t = y / h;
      const grain = (noise(x >> 2, y >> 2, 11) - 0.5) * 14;
      if (t < horizon) {
        const k = t / horizon;
        return [mix(214, 158, k) + grain, mix(224, 178, k) + grain, mix(226, 186, k) + grain] as [number, number, number];
      }
      const k = (t - horizon) / (1 - horizon);
      const shimmer = Math.sin((x / w) * 40 + k * 18) * 6 * (1 - k);
      return [
        mix(120, 24, k) + grain + shimmer,
        mix(138, 38, k) + grain + shimmer,
        mix(146, 52, k) + grain + shimmer,
      ] as [number, number, number];
    },
  },
  {
    // Vertical strata: the heritage deck's motif, usable as a plate or a mask.
    name: "strata-face.png",
    width: 1400,
    height: 1000,
    pixel: (x, y, w, h) => {
      const bands = [0, 0.17, 0.31, 0.52, 0.68, 0.83, 1];
      const colours: Array<[number, number, number]> = [
        [214, 198, 170], [176, 150, 116], [140, 106, 74],
        [104, 78, 56], [72, 56, 42], [46, 36, 28],
      ];
      const t = y / h + (noise(x >> 3, 0, 3) - 0.5) * 0.03;
      let index = 0;
      for (let band = 0; band < bands.length - 1; band += 1) {
        if (t >= bands[band]! && t < bands[band + 1]!) index = band;
      }
      const [r, g, b] = colours[Math.min(index, colours.length - 1)]!;
      const grain = (noise(x, y, 7) - 0.5) * 22;
      return [r + grain, g + grain, b + grain] as [number, number, number];
    },
  },
  {
    // A single high-contrast diagonal: the launch deck's plate.
    name: "cut-diagonal.png",
    width: 1200,
    height: 1500,
    pixel: (x, y, w, h) => {
      const edge = (x / w) * 1.35 - 0.2;
      const above = y / h < edge;
      const grain = (noise(x >> 1, y >> 1, 19) - 0.5) * 10;
      return above
        ? [242 + grain, 240 + grain, 234 + grain] as [number, number, number]
        : [18 + grain, 17 + grain, 20 + grain] as [number, number, number];
    },
  },
  {
    // A soft radial field for the travel deck's second plate.
    name: "harbour-glow.png",
    width: 1600,
    height: 1000,
    pixel: (x, y, w, h) => {
      const dx = (x / w - 0.68) * 1.6;
      const dy = (y / h - 0.35) * 1.2;
      const distance = Math.min(1, Math.hypot(dx, dy));
      const grain = (noise(x >> 2, y >> 2, 29) - 0.5) * 12;
      return [
        mix(244, 26, distance) + grain,
        mix(206, 36, distance) + grain,
        mix(140, 54, distance) + grain,
      ] as [number, number, number];
    },
  },
];

await mkdir(outputDirectory, { recursive: true });
for (const plate of PLATES) {
  const bytes = png(plate.width, plate.height, (x, y) => {
    const [r, g, b] = plate.pixel(x, y, plate.width, plate.height);
    return [
      Math.max(0, Math.min(255, Math.round(r))),
      Math.max(0, Math.min(255, Math.round(g))),
      Math.max(0, Math.min(255, Math.round(b))),
    ];
  });
  await writeFile(path.join(outputDirectory, plate.name), bytes);
  process.stdout.write(`${plate.name}  ${plate.width}×${plate.height}  ${Math.round(bytes.length / 1024)} KB\n`);
}
