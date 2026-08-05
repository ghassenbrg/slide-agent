import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { exists } from "../utils/files.js";
import { SlideAgentError } from "../utils/errors.js";

export interface ImageResolver {
  resolve(source: string): Promise<string>;
}

export interface RemoteAssetPolicy {
  /** Remote fetches are refused unless this is explicitly enabled. */
  allow: boolean;
  /** Hostname allowlist. Empty means "any public host". */
  allowedHosts?: string[];
  maximumBytes?: number;
  timeoutMs?: number;
  maximumRedirects?: number;
}

export const DEFAULT_REMOTE_ASSET_POLICY: Required<RemoteAssetPolicy> = {
  allow: false,
  allowedHosts: [],
  maximumBytes: 10 * 1024 * 1024,
  timeoutMs: 10_000,
  maximumRedirects: 2,
};

/** Magic-byte signatures for the raster formats PowerPoint embeds natively. */
const IMAGE_SIGNATURES: Array<{ extension: string; test: (bytes: Uint8Array) => boolean }> = [
  { extension: ".png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { extension: ".jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { extension: ".gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  {
    extension: ".webp",
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export function detectImageExtension(bytes: Uint8Array): string | undefined {
  return IMAGE_SIGNATURES.find((signature) => signature.test(bytes))?.extension;
}

/**
 * True for addresses that only exist inside the host's own network boundary.
 * A deck's image list is model-authored and frequently derived from untrusted
 * input, so it must never become a probe for loopback, private, or
 * cloud-metadata services.
 */
export function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, including cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateAddress(mapped) : false;
  }
  return false;
}

export class ImageManager implements ImageResolver {
  private readonly policy: Required<RemoteAssetPolicy>;

  public constructor(private readonly cacheDir: string, policy: RemoteAssetPolicy = { allow: false }) {
    this.policy = { ...DEFAULT_REMOTE_ASSET_POLICY, ...policy };
  }

  public async resolve(source: string): Promise<string> {
    if (/^https?:\/\//i.test(source)) return this.download(source);
    if (/^[a-z][a-z0-9+.-]+:/i.test(source) && !path.isAbsolute(source) && !/^[a-z]:[\\/]/i.test(source)) {
      throw new SlideAgentError("UNSUPPORTED_ASSET_SCHEME", `Only local paths and http(s) URLs are supported: ${source}`, { source });
    }
    const resolved = path.resolve(source);
    if (!(await exists(resolved))) {
      throw new SlideAgentError("IMAGE_NOT_FOUND", `Image does not exist: ${resolved}`, { source });
    }
    return resolved;
  }

  private async assertHostAllowed(url: URL): Promise<void> {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (this.policy.allowedHosts.length > 0) {
      const permitted = this.policy.allowedHosts.some((entry) => {
        const candidate = entry.toLowerCase();
        return hostname === candidate || hostname.endsWith(`.${candidate}`);
      });
      if (!permitted) {
        throw new SlideAgentError("REMOTE_ASSET_BLOCKED", `Host is not in the configured allowlist: ${hostname}`, {
          hostname,
          allowedHosts: this.policy.allowedHosts,
        });
      }
    }
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
      throw new SlideAgentError("REMOTE_ASSET_BLOCKED", `Refusing to fetch a local-network address: ${hostname}`, { hostname });
    }
    const addresses = net.isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true }).catch(() => {
        throw new SlideAgentError("REMOTE_ASSET_UNRESOLVABLE", `Could not resolve image host: ${hostname}`, { hostname });
      });
    for (const entry of addresses) {
      if (isPrivateAddress(entry.address)) {
        throw new SlideAgentError("REMOTE_ASSET_BLOCKED", `Refusing to fetch a private or link-local address: ${entry.address}`, {
          hostname,
          address: entry.address,
        });
      }
    }
  }

  private async download(rawUrl: string): Promise<string> {
    if (!this.policy.allow) {
      throw new SlideAgentError(
        "REMOTE_ASSETS_DISABLED",
        "Remote image fetching is disabled. Supply a local file, or opt in with allowRemoteAssets on the request or SLIDE_AGENT_ALLOW_REMOTE_IMAGES=1.",
        { url: rawUrl },
      );
    }

    let url = new URL(rawUrl);
    let response: Response | undefined;
    // Follow redirects manually so every hop is re-checked against the policy.
    // An allowed host must not be able to bounce the fetch onto a private one.
    for (let hop = 0; hop <= this.policy.maximumRedirects; hop += 1) {
      await this.assertHostAllowed(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.policy.timeoutMs);
      try {
        response = await fetch(url, { redirect: "manual", signal: controller.signal });
      } catch (error) {
        throw new SlideAgentError("IMAGE_DOWNLOAD_FAILED", `Image request failed: ${error instanceof Error ? error.message : String(error)}`, { url: url.href });
      } finally {
        clearTimeout(timer);
      }
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      if (hop === this.policy.maximumRedirects) {
        throw new SlideAgentError("REMOTE_ASSET_TOO_MANY_REDIRECTS", `Image request exceeded ${this.policy.maximumRedirects} redirects.`, { url: rawUrl });
      }
      url = new URL(location, url);
    }

    if (!response || !response.ok) {
      throw new SlideAgentError("IMAGE_DOWNLOAD_FAILED", `Image request failed with HTTP ${response?.status ?? "unknown"}`, { url: url.href });
    }

    const declaredLength = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declaredLength) && declaredLength > this.policy.maximumBytes) {
      throw new SlideAgentError("REMOTE_ASSET_TOO_LARGE", `Image exceeds the ${this.policy.maximumBytes}-byte limit.`, { url: url.href, bytes: declaredLength });
    }

    const bytes = await this.readCapped(response, url.href);
    const extension = detectImageExtension(bytes);
    if (!extension) {
      throw new SlideAgentError(
        "REMOTE_ASSET_NOT_AN_IMAGE",
        `The response is not a PNG, JPEG, GIF, or WebP image: ${url.href}`,
        { url: url.href, contentType: response.headers.get("content-type") },
      );
    }

    // Content-addressed name in a private cache. The previous predictable,
    // world-readable path was a poisoning target on shared hosts.
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
    const output = path.join(this.cacheDir, `${digest}${extension}`);
    if (!(await exists(output))) await writeFile(output, bytes, { mode: 0o600 });
    return output;
  }

  private async readCapped(response: Response, url: string): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array(await response.arrayBuffer());
    return readCappedStream(response.body, this.policy.maximumBytes, url);
  }
}

/**
 * Reads a stream, aborting as soon as it exceeds `maximumBytes`. A declared
 * Content-Length is a claim, not a guarantee, so the cap has to hold while the
 * body arrives.
 */
export async function readCappedStream(body: ReadableStream<Uint8Array>, maximumBytes: number, url: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new SlideAgentError("REMOTE_ASSET_TOO_LARGE", `Image exceeds the ${maximumBytes}-byte limit.`, { url, bytes: total });
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/** Resolves the effective policy from the request and the environment. */
export function remoteAssetPolicy(requested?: boolean): RemoteAssetPolicy {
  const allowedHosts = (process.env.SLIDE_AGENT_ALLOWED_IMAGE_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return {
    allow: requested ?? process.env.SLIDE_AGENT_ALLOW_REMOTE_IMAGES === "1",
    ...(allowedHosts.length ? { allowedHosts } : {}),
  };
}
