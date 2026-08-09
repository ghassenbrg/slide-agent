import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { exists } from "../utils/files.js";
import { SlideAgentError } from "../utils/errors.js";

export interface ImageResolver {
  /** Named so `capabilities()` can say which provider is installed. */
  id?: string;
  /**
   * Turn whatever a model wrote in `path` into a local file.
   *
   * This is the seam for image sourcing. Slide Agent deliberately does not
   * search for pictures or generate them: choosing imagery is the model's
   * job, and a stock API or a generation service inside this package would
   * mean credentials, licence terms, and outbound network policy in a tool
   * whose whole posture is that it does not fetch things. A host that *can*
   * do those things plugs in here, and whatever it returns is recorded with
   * the provenance the caller supplied.
   */
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

/** What a slide can embed, in the order a model should prefer them. */
export const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".gif", ".webp"] as const;

/**
 * WebP is legal in OOXML and PowerPoint 2019 and later display it, but Office
 * 2016 and several viewers show an empty frame instead. Worth saying once,
 * rather than letting someone find out in the room.
 */
export const WEBP_COMPATIBILITY_NOTE =
  "WebP renders in PowerPoint 2019 and later; older Office builds and some viewers show an empty frame. Use PNG or JPEG if the audience's version is unknown.";

/**
 * SVG cannot be embedded on its own. OOXML stores vector artwork as a raster
 * blip carrying the SVG as an enhancement, so a PNG or JPEG has to exist for
 * the SVG to hang off — there is no rasteriser in this package to make one.
 * Saying that is more use than a generic "unsupported format".
 */
export const SVG_GUIDANCE =
  "PowerPoint stores an SVG as an enhancement to a raster image, so an SVG alone cannot be embedded. Export the artwork to PNG (a logo at 2–3× its placed size stays crisp) and use that path.";

function isSvg(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.slice(0, 512)).toString("utf8").trimStart();
  return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"));
}

/**
 * Confirm bytes are something a slide can actually show, by content rather
 * than by file extension.
 *
 * The remote path has always done this. Local files did not, and local is the
 * route every generated image takes — so a model that wrote a PNG that is
 * really a WebP, or handed over an SVG logo, produced a package that failed
 * silently in PowerPoint rather than an error anyone could act on.
 */
export function assertEmbeddable(bytes: Uint8Array, source: string): { extension: string; warning?: string } {
  const extension = detectImageExtension(bytes);
  if (extension) {
    return { extension, ...(extension === ".webp" ? { warning: `${source}: ${WEBP_COMPATIBILITY_NOTE}` } : {}) };
  }
  if (isSvg(bytes)) {
    throw new SlideAgentError("IMAGE_FORMAT_UNSUPPORTED", `${source} is an SVG. ${SVG_GUIDANCE}`, { source, format: "svg" });
  }
  throw new SlideAgentError(
    "IMAGE_FORMAT_UNSUPPORTED",
    `${source} is not a format PowerPoint can embed. Supported: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}.`,
    { source, supported: [...SUPPORTED_IMAGE_EXTENSIONS] },
  );
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
  public readonly id = "built-in";
  private readonly policy: Required<RemoteAssetPolicy>;
  /** Compatibility notes raised while resolving, for the caller to surface. */
  public readonly warnings: string[] = [];

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
    // A local file gets the same scrutiny a downloaded one does. It used to get
    // none, and local is the route every generated image and every logo takes,
    // so the checks were absent exactly where they were most needed.
    const head = await readFile(resolved).catch(() => undefined);
    if (!head) throw new SlideAgentError("IMAGE_NOT_READABLE", `Image cannot be read: ${resolved}`, { source });
    if (head.byteLength > this.policy.maximumBytes) {
      throw new SlideAgentError(
        "IMAGE_TOO_LARGE",
        `${resolved} is ${Math.round(head.byteLength / 1024 / 1024)} MB, over the ${Math.round(this.policy.maximumBytes / 1024 / 1024)} MB limit. Downscale it: a full-bleed image needs about 2000px on its long edge.`,
        { source, bytes: head.byteLength },
      );
    }
    const { warning } = assertEmbeddable(head, resolved);
    if (warning && !this.warnings.includes(warning)) this.warnings.push(warning);
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
    if (extension === ".webp") {
      const warning = `${url.href}: ${WEBP_COMPATIBILITY_NOTE}`;
      if (!this.warnings.includes(warning)) this.warnings.push(warning);
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
