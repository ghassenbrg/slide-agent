import { describe, expect, it } from "vitest";

import { cropForFocalPoint, postProcessSlideXml, type ShapePostProcess } from "../../src/export/pptx-postprocess.js";
import { imageSizeOf } from "../../src/images/dimensions.js";

/**
 * These passes write raw OOXML into an already-exported package, which makes
 * them the easiest code in the repository to get silently wrong: a mistyped
 * element name produces a deck that opens perfectly and ignores everything the
 * author asked for. Both bugs these tests were written for were exactly that.
 */

/** The shape of what PptxGenJS actually emits, not an idealised version of it. */
const SLIDE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="plate" descr="A horizon"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:srcRect l="0" r="0" t="0" b="0"/><a:stretch/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12198096" cy="5577840"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic><p:sp><p:nvSpPr><p:cNvPr id="3" name="spec"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

function attributes(xml: string, element: string): Record<string, string> {
  const found = new RegExp(`<${element}([^/>]*)/?>`).exec(xml);
  const result: Record<string, string> = {};
  for (const match of (found?.[1] ?? "").matchAll(/([a-zA-Z:]+)="([^"]*)"/g)) result[match[1]!] = match[2]!;
  return result;
}

describe("slide post-processing", () => {
  it("crops the picture PptxGenJS actually emits", () => {
    // The fill is `p:blipFill` inside a `p:pic`, not `a:blipFill`. Looking for
    // the wrong one applied every authored crop to nothing at all.
    const out = postProcessSlideXml(SLIDE, [
      { slide: 1, name: "plate", picture: { crop: { left: 0.1, right: 0.05 } } },
    ], 1);
    expect(attributes(out, "a:srcRect")).toEqual({ l: "10000", r: "5000", t: "0", b: "0" });
  });

  it("only touches the slide the element is on", () => {
    // Element ids are unique within a slide, not across the deck. Two plates
    // called `plate` must not inherit each other's crop.
    const untouched = postProcessSlideXml(SLIDE, [
      { slide: 4, name: "plate", picture: { crop: { top: 0.25 } } },
    ], 1);
    expect(untouched).toBe(SLIDE);
    expect(attributes(untouched, "a:srcRect")).toEqual({ l: "0", r: "0", t: "0", b: "0" });
  });

  it("returns the XML untouched when nothing on the slide is targeted", () => {
    expect(postProcessSlideXml(SLIDE, [], 1)).toBe(SLIDE);
    expect(postProcessSlideXml(SLIDE, [{ slide: 1, name: "absent", columns: { count: 2 } }], 1)).toBe(SLIDE);
  });

  it("sets text columns on the body properties, with a gutter", () => {
    const out = postProcessSlideXml(SLIDE, [
      { slide: 1, name: "spec", columns: { count: 3, gutterInches: 0.5 } },
    ], 1);
    const body = attributes(out, "a:bodyPr");
    expect(body.numCol).toBe("3");
    expect(body.spcCol).toBe(String(0.5 * 914_400));
  });

  it("masks a picture by rewriting its preset geometry", () => {
    const out = postProcessSlideXml(SLIDE, [
      { slide: 1, name: "plate", picture: { maskShape: "ellipse" } },
    ], 1);
    expect(out).toContain('<a:prstGeom prst="ellipse">');
    // The text shape's own geometry is untouched.
    expect(out.match(/prstGeom prst="rect"/g)).toHaveLength(1);
  });

  it("adds grayscale and duotone effects inside the blip", () => {
    const out = postProcessSlideXml(SLIDE, [
      { slide: 1, name: "plate", picture: { grayscale: true, duotone: { shadow: "#241C15", highlight: "f1ebdd" } } },
    ], 1);
    expect(out).toContain("<a:grayscl");
    expect(out).toContain('<a:srgbClr val="241C15"/>');
    expect(out).toContain('<a:srgbClr val="F1EBDD"/>');
    // Shadow first, highlight second: the order is the mapping.
    expect(out.indexOf("241C15")).toBeLessThan(out.indexOf("F1EBDD"));
  });

  it("is idempotent, so a second pass does not duplicate effects", () => {
    const entry: ShapePostProcess = { slide: 1, name: "plate", picture: { grayscale: true, crop: { top: 0.2 } } };
    const once = postProcessSlideXml(SLIDE, [entry], 1);
    const twice = postProcessSlideXml(once, [entry], 1);
    expect(twice.match(/<a:grayscl/g)).toHaveLength(1);
    expect(twice.match(/<a:srcRect/g)).toHaveLength(1);
    expect(attributes(twice, "a:srcRect").t).toBe("20000");
  });

  it("clamps a crop fraction into the range OOXML accepts", () => {
    const out = postProcessSlideXml(SLIDE, [
      { slide: 1, name: "plate", picture: { crop: { left: 3, right: -1 } } },
    ], 1);
    // A negative crop is dropped rather than written as a negative per-mille.
    expect(attributes(out, "a:srcRect").l).toBe("100000");
  });
});

describe("focal-point cropping", () => {
  it("trims the sides when the source is wider than the frame", () => {
    // 2:1 source in a 1:1 frame keeps half its width.
    const crop = cropForFocalPoint({ x: 0.5, y: 0.5 }, 2, 1);
    expect(crop!.left).toBeCloseTo(0.25, 6);
    expect(crop!.right).toBeCloseTo(0.25, 6);
  });

  it("trims the top and bottom when the source is taller than the frame", () => {
    const crop = cropForFocalPoint({ x: 0.5, y: 0.5 }, 1, 2);
    expect(crop!.top).toBeCloseTo(0.25, 6);
    expect(crop!.bottom).toBeCloseTo(0.25, 6);
  });

  it("keeps the declared subject inside the crop", () => {
    // A 16:9 source in a 2.19:1 frame, subject high in the picture.
    const crop = cropForFocalPoint({ x: 0.5, y: 0.42 }, 1600 / 900, 13.333333 / 6.1);
    expect(crop!.top).toBeCloseTo(0.0135, 3);
    expect(crop!.bottom).toBeCloseTo(0.1735, 3);
    // The two trims always sum to the overflow, whatever the focal point.
    expect(crop!.top! + crop!.bottom!).toBeCloseTo(1 - (1600 / 900) / (13.333333 / 6.1), 6);
  });

  it("never trims past an edge when the subject sits on one", () => {
    const atTop = cropForFocalPoint({ x: 0.5, y: 0 }, 1, 2);
    expect(atTop!.top).toBe(0);
    expect(atTop!.bottom).toBeCloseTo(0.5, 6);
    const atLeft = cropForFocalPoint({ x: 0, y: 0.5 }, 2, 1);
    expect(atLeft!.left).toBe(0);
    expect(atLeft!.right).toBeCloseTo(0.5, 6);
  });

  it("crops nothing when the proportions already match", () => {
    expect(cropForFocalPoint({ x: 0.5, y: 0.5 }, 1.5, 1.5)).toBeUndefined();
    expect(cropForFocalPoint({ x: 0.5, y: 0.5 }, 0, 1.5)).toBeUndefined();
    expect(cropForFocalPoint({ x: 0.5, y: 0.5 }, Number.NaN, 1.5)).toBeUndefined();
  });
});

describe("intrinsic image size", () => {
  function png(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(32);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return bytes;
  }

  it("reads a PNG header", () => {
    expect(imageSizeOf(png(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it("reads a GIF header", () => {
    const bytes = new Uint8Array(16);
    bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
    new DataView(bytes.buffer).setUint16(6, 320, true);
    new DataView(bytes.buffer).setUint16(8, 240, true);
    expect(imageSizeOf(bytes)).toEqual({ width: 320, height: 240 });
  });

  it("walks JPEG segments to the start-of-frame marker", () => {
    // SOI, an APP0 segment to skip, then SOF0 carrying the real dimensions.
    const bytes = new Uint8Array(40);
    bytes.set([0xff, 0xd8], 0);
    bytes.set([0xff, 0xe0, 0x00, 0x10], 2);
    const sof = 20;
    bytes.set([0xff, 0xc0, 0x00, 0x11, 0x08], sof);
    new DataView(bytes.buffer).setUint16(sof + 5, 768);
    new DataView(bytes.buffer).setUint16(sof + 7, 1024);
    expect(imageSizeOf(bytes)).toEqual({ width: 1024, height: 768 });
  });

  function webp(format: string, fill: (bytes: Uint8Array, view: DataView) => void): Uint8Array {
    const bytes = new Uint8Array(40);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    for (const [index, character] of [...format].entries()) bytes[12 + index] = character.charCodeAt(0);
    fill(bytes, new DataView(bytes.buffer));
    return bytes;
  }

  it("reads all three WebP sub-formats, whose fields are bit-packed", () => {
    // Lossy: 14-bit width and height, with the top two bits as scale.
    expect(imageSizeOf(webp("VP8 ", (_bytes, view) => {
      view.setUint16(26, 640 | 0xc000, true);
      view.setUint16(28, 480 | 0xc000, true);
    }))).toEqual({ width: 640, height: 480 });

    // Lossless: 14 bits each, stored minus one, packed into one 32-bit word.
    expect(imageSizeOf(webp("VP8L", (_bytes, view) => {
      view.setUint32(21, (640 - 1) | ((480 - 1) << 14), true);
    }))).toEqual({ width: 640, height: 480 });

    // Extended: two 24-bit little-endian values, also stored minus one.
    expect(imageSizeOf(webp("VP8X", (bytes) => {
      const write24 = (at: number, value: number) => {
        bytes[at] = value & 0xff;
        bytes[at + 1] = (value >> 8) & 0xff;
        bytes[at + 2] = (value >> 16) & 0xff;
      };
      write24(24, 640 - 1);
      write24(27, 480 - 1);
    }))).toEqual({ width: 640, height: 480 });

    expect(imageSizeOf(webp("XXXX", () => {}))).toBeUndefined();
  });

  it("skips JPEG padding and standalone markers on the way to the frame", () => {
    const bytes = new Uint8Array(48);
    bytes.set([0xff, 0xd8], 0);
    // Fill bytes, a standalone marker with no length, then a real segment.
    bytes.set([0x00, 0xff, 0x01, 0xff, 0xd0], 2);
    bytes.set([0xff, 0xe0, 0x00, 0x08], 7);
    const sof = 24;
    bytes.set([0xff, 0xc2, 0x00, 0x11, 0x08], sof);
    new DataView(bytes.buffer).setUint16(sof + 5, 200);
    new DataView(bytes.buffer).setUint16(sof + 7, 300);
    expect(imageSizeOf(bytes)).toEqual({ width: 300, height: 200 });
  });

  it("returns nothing rather than guessing at an unknown format", () => {
    expect(imageSizeOf(new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(imageSizeOf(new Uint8Array(32))).toBeUndefined();
    expect(imageSizeOf(png(0, 0))).toBeUndefined();
    // A JPEG whose segment chain never reaches a frame marker.
    const truncated = new Uint8Array(24);
    truncated.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0);
    expect(imageSizeOf(truncated)).toBeUndefined();
  });
});
