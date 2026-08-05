import { createServer, type Server } from "node:http";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ImageManager, detectImageExtension, isPrivateAddress, readCappedStream, remoteAssetPolicy } from "../../src/images/image-manager.js";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let cacheDir: string;
let server: Server;
let port: number;

beforeAll(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "slide-agent-image-test-"));
  // Serves only to give the loopback-blocking tests a real, listening port,
  // proving the guard refuses before any request is made.
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "image/png" });
    response.end(Buffer.concat([PNG_HEADER, Buffer.alloc(64)]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(cacheDir, { recursive: true, force: true });
});

describe("isPrivateAddress", () => {
  it.for([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.for(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1", "2606:4700::1111"])("allows %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("ImageManager remote policy", () => {
  it("refuses remote URLs by default", async () => {
    const manager = new ImageManager(cacheDir);
    await expect(manager.resolve(`http://127.0.0.1:${port}/a.png`)).rejects.toMatchObject({ code: "REMOTE_ASSETS_DISABLED" });
  });

  it("blocks loopback even when remote assets are enabled", async () => {
    const manager = new ImageManager(cacheDir, { allow: true });
    await expect(manager.resolve(`http://127.0.0.1:${port}/a.png`)).rejects.toMatchObject({ code: "REMOTE_ASSET_BLOCKED" });
  });

  it("blocks the cloud metadata endpoint", async () => {
    const manager = new ImageManager(cacheDir, { allow: true });
    await expect(manager.resolve("http://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({ code: "REMOTE_ASSET_BLOCKED" });
  });

  it("blocks localhost by name", async () => {
    const manager = new ImageManager(cacheDir, { allow: true });
    await expect(manager.resolve(`http://localhost:${port}/a.png`)).rejects.toMatchObject({ code: "REMOTE_ASSET_BLOCKED" });
  });

  it("enforces the host allowlist before any network call", async () => {
    const manager = new ImageManager(cacheDir, { allow: true, allowedHosts: ["images.example.com"] });
    await expect(manager.resolve("http://cdn.other.test/a.png")).rejects.toMatchObject({ code: "REMOTE_ASSET_BLOCKED" });
  });

  it("aborts a body that exceeds the cap while it streams", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(256)); },
      cancel() { cancelled = true; },
    });
    await expect(readCappedStream(body, 512, "http://example.test/big.png"))
      .rejects.toMatchObject({ code: "REMOTE_ASSET_TOO_LARGE" });
    expect(cancelled).toBe(true);
  });

  it("returns the whole body when it stays inside the cap", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG_HEADER);
        controller.enqueue(new Uint8Array(32));
        controller.close();
      },
    });
    const bytes = await readCappedStream(body, 1024, "http://example.test/ok.png");
    expect(bytes.length).toBe(PNG_HEADER.length + 32);
    expect(detectImageExtension(bytes)).toBe(".png");
  });

  it("rejects a non-image payload by magic bytes, not content-type", () => {
    expect(detectImageExtension(Buffer.from("<!doctype html>"))).toBeUndefined();
    expect(detectImageExtension(PNG_HEADER)).toBe(".png");
    expect(detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(".jpg");
  });

  it("rejects non-http schemes", async () => {
    const manager = new ImageManager(cacheDir);
    await expect(manager.resolve("file:///etc/passwd")).rejects.toMatchObject({ code: "UNSUPPORTED_ASSET_SCHEME" });
    await expect(manager.resolve("data:image/png;base64,AAAA")).rejects.toMatchObject({ code: "UNSUPPORTED_ASSET_SCHEME" });
  });

  it("still resolves ordinary local files", async () => {
    const manager = new ImageManager(cacheDir);
    const resolved = await manager.resolve(path.resolve("package.json"));
    expect((await stat(resolved)).isFile()).toBe(true);
  });

  it("reads the policy from the environment", () => {
    const previous = process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES;
    try {
      process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES = "1";
      expect(remoteAssetPolicy().allow).toBe(true);
      // An explicit request value always wins over the environment.
      expect(remoteAssetPolicy(false).allow).toBe(false);
      delete process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES;
      expect(remoteAssetPolicy().allow).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES;
      else process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES = previous;
    }
  });
});
