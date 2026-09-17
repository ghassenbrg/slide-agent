import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { remoteAssetPolicy } from "../../../src/images/image-manager.js";
import { assertScriptAllowed, confineRequestPaths, resolveConfined } from "../../../src/security/policy.js";
import { loadZipSafely, readZipDirectory, verifyZip } from "../../../src/utils/safe-zip.js";
import { executableSearchDirectories, minimalEnvironment, runProcess } from "../../../src/utils/process.js";

let workspace: string;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "slide-agent-hardening-"));
});

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true });
});

/** A zip whose one entry lies about its size: declares 10 bytes, inflates to `real`. */
function lyingZip(name: string, content: Buffer, declared: number): Buffer {
  const compressed = deflateRawSync(content);
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(declared, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(declared, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const localPart = Buffer.concat([local, nameBytes, compressed]);
  const centralPart = Buffer.concat([central, nameBytes]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}

describe("archive limits", () => {
  it("opens an ordinary package", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const loaded = await loadZipSafely(bytes);
    expect(Object.keys(loaded.files)).toContain("ppt/presentation.xml");
    expect(readZipDirectory(bytes).filter((entry) => !entry.name.endsWith("/"))).toHaveLength(2);
  });

  it("refuses an entry that inflates past its limit even when its header lies", () => {
    const bomb = lyingZip("ppt/media/image1.png", Buffer.alloc(3 * 1024 * 1024), 10);
    expect(() => verifyZip(bomb, { maxEntries: 10, maxTotalBytes: 1024 * 1024, maxPartBytes: 1024 * 1024, maxCompressionRatio: 200 }))
      .toThrow(/limit|inflates/);
  });

  it("refuses extreme compression ratios", () => {
    const bomb = lyingZip("ppt/media/image1.bin", Buffer.alloc(8 * 1024 * 1024), 8 * 1024 * 1024);
    expect(() => verifyZip(bomb)).toThrow(/compression ratio/);
  });

  it("refuses too many entries before reading them", async () => {
    const zip = new JSZip();
    for (let index = 0; index < 60; index += 1) zip.file(`part${index}.xml`, "<a/>");
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    expect(() => readZipDirectory(bytes, { maxEntries: 50, maxTotalBytes: 1e9, maxPartBytes: 1e9, maxCompressionRatio: 200 }))
      .toThrow(/60 entries/);
  });

  it("refuses XML parts that declare a DTD", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", '<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY a "a">]><p:sld/>');
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await expect(loadZipSafely(bytes)).rejects.toThrow(/DTD/);
  });

  it("refuses something that is not a zip", async () => {
    await expect(loadZipSafely(Buffer.from("definitely not a zip archive at all"))).rejects.toThrow(/zip/i);
  });
});

describe("workspace confinement", () => {
  it("resolves relative paths against the root", () => {
    expect(resolveConfined("out/deck.pptx", [workspace])).toMatch(/out[\\/]deck\.pptx$/);
  });

  it("refuses traversal and absolute escapes", () => {
    expect(() => resolveConfined("../escape.pptx", [workspace])).toThrow(/outside the workspace/);
    expect(() => resolveConfined(path.join(tmpdir(), "elsewhere.pptx"), [path.join(workspace, "inner")])).toThrow(/outside the workspace/);
  });

  it("refuses symlink escapes, including for files that do not exist yet", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "slide-agent-outside-"));
    try {
      const link = path.join(workspace, "link");
      await symlink(outside, link);
      expect(() => resolveConfined("link/new.pptx", [workspace])).toThrow(/outside the workspace/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("confines only path-valued request fields and leaves inline content alone", () => {
    const confined = confineRequestPaths({
      command: "create",
      output: "deck.pptx",
      sceneNdjson: "{\"path\":\"../../etc/passwd\"}",
      operations: [{ type: "replace-image", imagePath: "img.png" }],
    }, [workspace]);
    expect(path.isAbsolute(confined.output)).toBe(true);
    expect(confined.sceneNdjson).toContain("../../etc/passwd");
    expect(path.isAbsolute(confined.operations[0]!.imagePath)).toBe(true);
    expect(() => confineRequestPaths({ reportPath: "/etc/report.json" }, [workspace])).toThrow(/outside/);
  });
});

describe("script and network policy", () => {
  it("refuses scripts from requests unless the operator allows them", () => {
    const previous = process.env.SLIDE_AGENT_ALLOW_SCRIPTS;
    try {
      delete process.env.SLIDE_AGENT_ALLOW_SCRIPTS;
      expect(() => assertScriptAllowed({ script: "evil.mjs" })).toThrow(/cannot run build scripts/);
      expect(() => assertScriptAllowed({})).not.toThrow();
      process.env.SLIDE_AGENT_ALLOW_SCRIPTS = "1";
      expect(() => assertScriptAllowed({ script: "deck.mjs" })).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env.SLIDE_AGENT_ALLOW_SCRIPTS;
      else process.env.SLIDE_AGENT_ALLOW_SCRIPTS = previous;
    }
  });

  it("lets a request narrow remote fetching but never enable it", () => {
    const previous = process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES;
    try {
      delete process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES;
      expect(remoteAssetPolicy(true).allow).toBe(false);
      process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES = "1";
      expect(remoteAssetPolicy(true).allow).toBe(true);
      expect(remoteAssetPolicy(false).allow).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES;
      else process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES = previous;
    }
  });
});

describe("subprocess limits", () => {
  it.skipIf(process.platform === "win32")("kills a process that outlives its timeout", async () => {
    const script = path.join(workspace, "hang.sh");
    await writeFile(script, "#!/bin/sh\nsleep 30\n");
    await chmod(script, 0o755);
    const started = Date.now();
    await expect(runProcess(script, [], { timeoutMs: 300, killGraceMs: 200 })).rejects.toThrow(/did not finish/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it.skipIf(process.platform === "win32")("caps captured output", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(100000))"], { maxOutputBytes: 1000 });
    expect(result.stdout.length).toBe(1000);
  });

  it("passes a minimal environment", () => {
    const previous = process.env.SLIDE_AGENT_TEST_SECRET;
    process.env.SLIDE_AGENT_TEST_SECRET = "secret";
    try {
      const environment = minimalEnvironment({ EXTRA: "1" });
      expect(environment.SLIDE_AGENT_TEST_SECRET).toBeUndefined();
      expect(environment.EXTRA).toBe("1");
    } finally {
      if (previous === undefined) delete process.env.SLIDE_AGENT_TEST_SECRET;
      else process.env.SLIDE_AGENT_TEST_SECRET = previous;
    }
  });

  it("ignores relative PATH entries", async () => {
    await mkdir(path.join(workspace, "bin"), { recursive: true });
    const directories = executableSearchDirectories({ envPath: ["bin", "./tools", "/usr/bin"].join(path.delimiter) });
    expect(directories).not.toContain("bin");
    expect(directories).not.toContain("./tools");
    expect(directories).toContain("/usr/bin");
  });
});
